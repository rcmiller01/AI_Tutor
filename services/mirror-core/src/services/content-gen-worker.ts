import { randomUUID } from 'node:crypto';
import { query, getOne, getMany } from '../db/pool.js';
import { generateContentBatch } from './content-generator.js';
import type { TemplateId, EngineType } from '@mirror/schemas';

// =============================================================================
// Types
// =============================================================================

export interface ContentGenJob {
    job_id: string;
    skill_id: string;
    template_id: TemplateId;
    engine_type: EngineType;
    difficulty_level: number;
    child_age: number;
    reading_level: 'pre' | 'early' | 'fluent';
    priority: 'high' | 'normal' | 'low';
    batch_size: number;
    retry_count: number;
    addendum?: string;
    created_at: string;
}

interface JobRow {
    job_id: string;
    skill_id: string;
    template_id: string;
    engine_type: string;
    difficulty_level: number;
    child_age: number;
    reading_level: string;
    priority: string;
    batch_size: number;
    retry_count: number;
    addendum: string | null;
    created_at: string;
}

// =============================================================================
// Job Queue Operations
// =============================================================================

/**
 * Enqueues a new content generation job.
 */
export async function enqueueJob(
    params: Omit<ContentGenJob, 'job_id' | 'created_at'>
): Promise<string> {
    const jobId = randomUUID();

    await query(
        `INSERT INTO content_gen_queue
         (job_id, skill_id, template_id, engine_type, difficulty_level,
          child_age, reading_level, priority, batch_size, retry_count, addendum, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')`,
        [
            jobId,
            params.skill_id,
            params.template_id,
            params.engine_type,
            params.difficulty_level,
            params.child_age,
            params.reading_level,
            params.priority,
            params.batch_size,
            params.retry_count,
            params.addendum ?? null,
        ]
    );

    console.log(`[ContentGenWorker] Enqueued job ${jobId} for ${params.skill_id}`);
    return jobId;
}

/**
 * Gets the next pending job, prioritized by priority then age.
 */
async function getNextJob(): Promise<ContentGenJob | null> {
    // Use FOR UPDATE SKIP LOCKED to prevent multiple workers from grabbing the same job
    const row = await getOne<JobRow>(
        `UPDATE content_gen_queue
         SET status = 'processing', started_at = NOW()
         WHERE job_id = (
             SELECT job_id FROM content_gen_queue
             WHERE status = 'pending'
             ORDER BY
                 CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                 created_at ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
         )
         RETURNING *`
    );

    if (!row) return null;

    return {
        job_id: row.job_id,
        skill_id: row.skill_id,
        template_id: row.template_id as TemplateId,
        engine_type: row.engine_type as EngineType,
        difficulty_level: row.difficulty_level,
        child_age: row.child_age,
        reading_level: row.reading_level as 'pre' | 'early' | 'fluent',
        priority: row.priority as 'high' | 'normal' | 'low',
        batch_size: row.batch_size,
        retry_count: row.retry_count,
        addendum: row.addendum ?? undefined,
        created_at: row.created_at,
    };
}

/**
 * Marks a job as completed.
 */
async function completeJob(
    jobId: string,
    contentIds: string[],
    fallbackUsed: boolean
): Promise<void> {
    await query(
        `UPDATE content_gen_queue
         SET status = 'completed',
             completed_at = NOW(),
             result_content_ids = $2,
             fallback_used = $3
         WHERE job_id = $1`,
        [jobId, contentIds, fallbackUsed]
    );
}

/**
 * Marks a job as failed.
 */
async function failJob(jobId: string, errorMessage: string): Promise<void> {
    await query(
        `UPDATE content_gen_queue
         SET status = 'failed',
             completed_at = NOW(),
             error_message = $2
         WHERE job_id = $1`,
        [jobId, errorMessage]
    );
}

// =============================================================================
// Worker Class
// =============================================================================

export class ContentGenWorker {
    private concurrency: number;
    private running: boolean = false;
    private activeJobs: number = 0;
    private pollInterval: number = 2000; // ms
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    constructor(concurrency: number = 2) {
        this.concurrency = concurrency;
    }

    /**
     * Starts the worker.
     */
    async start(): Promise<void> {
        if (this.running) {
            console.log('[ContentGenWorker] Already running');
            return;
        }

        console.log(`[ContentGenWorker] Starting with concurrency ${this.concurrency}`);
        this.running = true;

        // Ensure the queue table exists
        await this.ensureQueueTable();

        // Start polling for jobs
        this.pollTimer = setInterval(() => this.poll(), this.pollInterval);

        // Initial poll
        await this.poll();
    }

    /**
     * Stops the worker gracefully.
     */
    async stop(): Promise<void> {
        console.log('[ContentGenWorker] Stopping...');
        this.running = false;

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // Wait for active jobs to complete (with timeout)
        const maxWait = 30000; // 30 seconds
        const startTime = Date.now();

        while (this.activeJobs > 0 && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('[ContentGenWorker] Stopped');
    }

    /**
     * Polls for new jobs and processes them.
     */
    private async poll(): Promise<void> {
        if (!this.running) return;

        // Fill up to concurrency limit
        while (this.activeJobs < this.concurrency && this.running) {
            const hasJob = await this.processNext();
            if (!hasJob) break; // No more jobs available
        }
    }

    /**
     * Processes the next available job.
     * Returns true if a job was found and processed.
     */
    async processNext(): Promise<boolean> {
        if (!this.running) return false;

        const job = await getNextJob();
        if (!job) return false;

        this.activeJobs++;
        console.log(`[ContentGenWorker] Processing job ${job.job_id} for ${job.skill_id}`);

        try {
            const result = await generateContentBatch({
                skill_id: job.skill_id,
                template_id: job.template_id,
                difficulty_level: job.difficulty_level,
                batch_size: job.batch_size,
                child_age: job.child_age,
                reading_level: job.reading_level,
                engine_type: job.engine_type,
                addendum: job.addendum,
                retry_count: job.retry_count,
            });

            await completeJob(job.job_id, result.content_ids, result.fallback_used);
            console.log(`[ContentGenWorker] Completed job ${job.job_id}: ${result.content_ids.length} items`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            await failJob(job.job_id, errorMessage);
            console.error(`[ContentGenWorker] Job ${job.job_id} failed:`, errorMessage);
        } finally {
            this.activeJobs--;
        }

        return true;
    }

    /**
     * Ensures the queue table exists.
     */
    private async ensureQueueTable(): Promise<void> {
        await query(`
            CREATE TABLE IF NOT EXISTS content_gen_queue (
                job_id UUID PRIMARY KEY,
                skill_id VARCHAR(100) NOT NULL,
                template_id VARCHAR(30) NOT NULL,
                engine_type VARCHAR(30) NOT NULL DEFAULT 'MICRO_SKILL_DRILL',
                difficulty_level INTEGER NOT NULL DEFAULT 1,
                child_age INTEGER NOT NULL DEFAULT 7,
                reading_level VARCHAR(10) NOT NULL DEFAULT 'early',
                priority VARCHAR(10) NOT NULL DEFAULT 'normal',
                batch_size INTEGER NOT NULL DEFAULT 5,
                retry_count INTEGER NOT NULL DEFAULT 0,
                addendum TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                result_content_ids UUID[],
                fallback_used BOOLEAN DEFAULT FALSE,
                error_message TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ
            );

            CREATE INDEX IF NOT EXISTS idx_content_gen_queue_status
                ON content_gen_queue(status, priority, created_at);
        `);
    }

    /**
     * Gets the current worker status.
     */
    getStatus(): { running: boolean; activeJobs: number; concurrency: number } {
        return {
            running: this.running,
            activeJobs: this.activeJobs,
            concurrency: this.concurrency,
        };
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Enqueues content generation for a session.
 * Called when a new session starts.
 */
export async function enqueueForSession(
    skillId: string,
    difficultyLevel: number,
    childAge: number = 7
): Promise<string> {
    return enqueueJob({
        skill_id: skillId,
        template_id: 'tap_choice',
        engine_type: 'MICRO_SKILL_DRILL',
        difficulty_level: difficultyLevel,
        child_age: childAge,
        reading_level: childAge <= 6 ? 'pre' : childAge <= 7 ? 'early' : 'fluent',
        priority: 'high',
        batch_size: 5,
        retry_count: 0,
    });
}

/**
 * Gets pending job count.
 */
export async function getPendingJobCount(): Promise<number> {
    const row = await getOne<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM content_gen_queue WHERE status = 'pending'`
    );
    return parseInt(row?.count ?? '0', 10);
}

/**
 * Gets recent job statistics.
 */
export async function getJobStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
}> {
    const rows = await getMany<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text as count
         FROM content_gen_queue
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY status`
    );

    const stats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
    };

    for (const row of rows) {
        const status = row.status as keyof typeof stats;
        if (status in stats) {
            stats[status] = parseInt(row.count, 10);
        }
    }

    return stats;
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const contentGenWorker = new ContentGenWorker(
    parseInt(process.env.CONTENT_GEN_CONCURRENCY ?? '2', 10)
);
