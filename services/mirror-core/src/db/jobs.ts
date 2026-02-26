import { randomUUID } from 'node:crypto';
import { query } from './pool.js';

export async function createContentGenJob(
    skillId: string,
    templateId: string,
    difficultyLevel: number,
    promptData: unknown,
    constraints: unknown,
): Promise<string> {
    const jobId = randomUUID();
    await query(
        `INSERT INTO content_gen_jobs 
      (job_id, skill_id, template_id, difficulty_level, prompt_data, constraints, output_schema_id, status, provider, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'openrouter', 'google/gemini-2.5-pro')`,
        [jobId, skillId, templateId, difficultyLevel, JSON.stringify(promptData), JSON.stringify(constraints), 'content_object']
    );
    return jobId;
}

export async function updateContentGenJob(
    jobId: string,
    updates: {
        status?: 'running' | 'succeeded' | 'failed' | 'rejected';
        result_content_id?: string;
        error_details?: unknown;
        total_tokens_used?: number;
    }
): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (updates.status) { sets.push(`status = $${i++}`); vals.push(updates.status); }
    if (updates.result_content_id) { sets.push(`result_content_id = $${i++}`); vals.push(updates.result_content_id); }
    if (updates.error_details) { sets.push(`error_details = $${i++}`); vals.push(JSON.stringify(updates.error_details)); }
    if (updates.total_tokens_used !== undefined) { sets.push(`total_tokens_used = $${i++}`); vals.push(updates.total_tokens_used); }

    // Also increment attempt_count if we're failing or succeeding
    if (updates.status && updates.status !== 'running') {
        sets.push(`attempt_count = attempt_count + 1`);
    }

    vals.push(jobId);
    const setSql = sets.join(', ');
    if (!setSql) return;

    await query(`UPDATE content_gen_jobs SET ${setSql} WHERE job_id = $${i}`, vals);
}
