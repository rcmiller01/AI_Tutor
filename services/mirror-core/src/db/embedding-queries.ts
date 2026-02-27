import { randomUUID } from 'node:crypto';
import { query, getOne, getMany } from './pool.js';
import { formatForPgvector } from '../services/embedding-service.js';
import type { ContentPayload, ContentSource, EngineType, TemplateId } from '@mirror/schemas';

// =============================================================================
// Types
// =============================================================================

export interface ContentMetadata {
    skill_id: string;
    engine_type: EngineType;
    template_id: TemplateId;
    source: ContentSource;
    difficulty_level: number;
    validation_status: 'pending' | 'valid' | 'invalid' | 'fallback';
    retry_count: number;
    addendum?: string;
}

export interface GeneratedContent {
    content_id: string;
    skill_id: string;
    engine_type: EngineType;
    template_id: TemplateId;
    source: ContentSource;
    difficulty_level: number;
    payload: ContentPayload;
    validation_status: string;
    retry_count: number;
    created_at: string;
}

export interface ContentWithSimilarity extends GeneratedContent {
    similarity: number;
}

export interface NearTransferCandidate {
    content_id: string;
    skill_id: string;
    difficulty_level: number;
    payload: ContentPayload;
    similarity: number;
}

interface ContentRow {
    content_id: string;
    skill_id: string;
    engine_type: string;
    template_id: string;
    source: string;
    difficulty_level: number;
    payload: Record<string, unknown>;
    validation_status: string;
    retry_count: number;
    created_at: string;
    similarity?: number;
}

// =============================================================================
// Content with Embedding Operations
// =============================================================================

/**
 * Inserts a content object with its embedding vector.
 * Returns the generated content_id.
 */
export async function insertContentWithEmbedding(
    payload: ContentPayload,
    embedding: number[],
    metadata: ContentMetadata
): Promise<string> {
    const contentId = randomUUID();
    const embeddingStr = formatForPgvector(embedding);

    await query(
        `INSERT INTO content_objects
         (content_id, skill_id, engine_type, template_id, source, difficulty_level,
          payload, embedding, validation_status, retry_count, addendum)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10, $11)`,
        [
            contentId,
            metadata.skill_id,
            metadata.engine_type,
            metadata.template_id,
            metadata.source,
            metadata.difficulty_level,
            JSON.stringify(payload),
            embeddingStr,
            metadata.validation_status,
            metadata.retry_count,
            metadata.addendum ?? null,
        ]
    );

    return contentId;
}

/**
 * Updates an existing content object with a new embedding.
 */
export async function updateContentEmbedding(
    contentId: string,
    embedding: number[]
): Promise<void> {
    const embeddingStr = formatForPgvector(embedding);

    await query(
        `UPDATE content_objects SET embedding = $1::vector WHERE content_id = $2`,
        [embeddingStr, contentId]
    );
}

/**
 * Updates the validation status of a content object.
 */
export async function updateContentValidationStatus(
    contentId: string,
    status: 'pending' | 'valid' | 'invalid' | 'fallback',
    retryCount?: number,
    addendum?: string
): Promise<void> {
    const updates: string[] = ['validation_status = $2'];
    const params: unknown[] = [contentId, status];
    let paramIndex = 3;

    if (retryCount !== undefined) {
        updates.push(`retry_count = $${paramIndex++}`);
        params.push(retryCount);
    }
    if (addendum !== undefined) {
        updates.push(`addendum = $${paramIndex++}`);
        params.push(addendum);
    }

    await query(
        `UPDATE content_objects SET ${updates.join(', ')} WHERE content_id = $1`,
        params
    );
}

// =============================================================================
// Similarity Search Operations
// =============================================================================

/**
 * Finds content similar to the given embedding using pgvector cosine distance.
 * Returns content sorted by similarity (highest first).
 */
export async function findSimilarContent(
    embedding: number[],
    skillId: string,
    limit: number,
    excludeIds: string[] = []
): Promise<ContentWithSimilarity[]> {
    const embeddingStr = formatForPgvector(embedding);

    // Use cosine distance operator <=> for similarity search
    // 1 - distance = similarity (cosine similarity)
    const sql = `
        SELECT
            content_id, skill_id, engine_type, template_id, source,
            difficulty_level, payload, validation_status, retry_count, created_at,
            1 - (embedding <=> $1::vector) AS similarity
        FROM content_objects
        WHERE skill_id = $2
          AND validation_status = 'valid'
          AND embedding IS NOT NULL
          ${excludeIds.length > 0 ? `AND content_id != ALL($4::uuid[])` : ''}
        ORDER BY embedding <=> $1::vector
        LIMIT $3
    `;

    const params = excludeIds.length > 0
        ? [embeddingStr, skillId, limit, excludeIds]
        : [embeddingStr, skillId, limit];

    const rows = await getMany<ContentRow>(sql, params);

    return rows.map(mapContentRowWithSimilarity);
}

/**
 * Finds near-transfer content from adjacent skills.
 * Looks for conceptually similar content in related skills.
 */
export async function findNearTransferContent(
    skillId: string,
    conceptEmbedding: number[],
    limit: number,
    worldId?: string
): Promise<NearTransferCandidate[]> {
    const embeddingStr = formatForPgvector(conceptEmbedding);

    // Find content from different skills but similar concept
    // Optionally filter by world if provided
    let sql = `
        SELECT
            c.content_id, c.skill_id, c.difficulty_level, c.payload,
            1 - (c.embedding <=> $1::vector) AS similarity
        FROM content_objects c
        WHERE c.skill_id != $2
          AND c.validation_status = 'valid'
          AND c.embedding IS NOT NULL
    `;

    const params: unknown[] = [embeddingStr, skillId];
    let paramIndex = 3;

    if (worldId) {
        sql += `
          AND EXISTS (
            SELECT 1 FROM worlds w
            WHERE w.world_id = $${paramIndex}
              AND c.skill_id = ANY(w.skill_ids)
          )
        `;
        params.push(worldId);
        paramIndex++;
    }

    sql += `
        ORDER BY c.embedding <=> $1::vector
        LIMIT $${paramIndex}
    `;
    params.push(limit);

    const rows = await getMany<{
        content_id: string;
        skill_id: string;
        difficulty_level: number;
        payload: Record<string, unknown>;
        similarity: number;
    }>(sql, params);

    return rows.map(r => ({
        content_id: r.content_id,
        skill_id: r.skill_id,
        difficulty_level: r.difficulty_level,
        payload: r.payload as unknown as ContentPayload,
        similarity: r.similarity,
    }));
}

// =============================================================================
// Content Retrieval Operations
// =============================================================================

/**
 * Gets a content object by ID.
 */
export async function getContentById(contentId: string): Promise<GeneratedContent | null> {
    const row = await getOne<ContentRow>(
        `SELECT content_id, skill_id, engine_type, template_id, source,
                difficulty_level, payload, validation_status, retry_count, created_at
         FROM content_objects WHERE content_id = $1`,
        [contentId]
    );

    if (!row) return null;
    return mapContentRow(row);
}

/**
 * Gets validated content for a skill, optionally at a specific difficulty.
 */
export async function getValidatedContent(
    skillId: string,
    difficultyLevel?: number,
    limit: number = 10
): Promise<GeneratedContent[]> {
    let sql = `
        SELECT content_id, skill_id, engine_type, template_id, source,
               difficulty_level, payload, validation_status, retry_count, created_at
        FROM content_objects
        WHERE skill_id = $1 AND validation_status = 'valid'
    `;
    const params: unknown[] = [skillId];
    let paramIndex = 2;

    if (difficultyLevel !== undefined) {
        sql += ` AND difficulty_level = $${paramIndex++}`;
        params.push(difficultyLevel);
    }

    sql += ` ORDER BY RANDOM() LIMIT $${paramIndex}`;
    params.push(limit);

    const rows = await getMany<ContentRow>(sql, params);
    return rows.map(mapContentRow);
}

/**
 * Gets curated (fallback) content for a skill.
 */
export async function getCuratedContent(
    skillId: string,
    difficultyLevel: number,
    limit: number = 5
): Promise<GeneratedContent[]> {
    const rows = await getMany<ContentRow>(
        `SELECT content_id, skill_id, engine_type, template_id, source,
                difficulty_level, payload, validation_status, retry_count, created_at
         FROM content_objects
         WHERE skill_id = $1
           AND difficulty_level = $2
           AND source = 'CURATED'
         ORDER BY RANDOM()
         LIMIT $3`,
        [skillId, difficultyLevel, limit]
    );

    return rows.map(mapContentRow);
}

// =============================================================================
// Content Usage Tracking
// =============================================================================

/**
 * Records that content was used in a session.
 * Useful for excluding already-seen content and analytics.
 */
export async function markContentUsed(
    contentId: string,
    sessionId: string,
    childId: string
): Promise<void> {
    await query(
        `INSERT INTO content_usage (content_id, session_id, child_id, used_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (content_id, session_id) DO NOTHING`,
        [contentId, sessionId, childId]
    );
}

/**
 * Gets content IDs that a child has already seen.
 */
export async function getSeenContentIds(
    childId: string,
    skillId?: string,
    limit: number = 100
): Promise<string[]> {
    let sql = `
        SELECT DISTINCT cu.content_id
        FROM content_usage cu
        JOIN content_objects co ON cu.content_id = co.content_id
        WHERE cu.child_id = $1
    `;
    const params: unknown[] = [childId];
    let paramIndex = 2;

    if (skillId) {
        sql += ` AND co.skill_id = $${paramIndex++}`;
        params.push(skillId);
    }

    sql += ` ORDER BY cu.content_id LIMIT $${paramIndex}`;
    params.push(limit);

    const rows = await getMany<{ content_id: string }>(sql, params);
    return rows.map(r => r.content_id);
}

// =============================================================================
// Near-Transfer Queue Operations
// =============================================================================

/**
 * Schedules near-transfer content to be delivered in a future session.
 */
export async function scheduleNearTransfer(
    originalProblemId: string,
    targetContentId: string,
    childId: string,
    sessionId: string
): Promise<string> {
    const id = randomUUID();

    await query(
        `INSERT INTO near_transfer_queue
         (id, original_problem_id, target_content_id, child_id, session_id, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [id, originalProblemId, targetContentId, childId, sessionId]
    );

    return id;
}

/**
 * Gets pending near-transfer content for a child.
 */
export async function getPendingNearTransfer(
    childId: string,
    limit: number = 3
): Promise<Array<{
    id: string;
    target_content_id: string;
    original_problem_id: string;
}>> {
    return getMany(
        `SELECT id, target_content_id, original_problem_id
         FROM near_transfer_queue
         WHERE child_id = $1 AND status = 'pending'
         ORDER BY scheduled_at ASC
         LIMIT $2`,
        [childId, limit]
    );
}

/**
 * Marks a near-transfer item as delivered.
 */
export async function markNearTransferDelivered(
    nearTransferId: string,
    _sessionId: string
): Promise<void> {
    await query(
        `UPDATE near_transfer_queue
         SET status = 'delivered', delivered_at = NOW()
         WHERE id = $1`,
        [nearTransferId]
    );
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapContentRowWithSimilarity(row: ContentRow): ContentWithSimilarity {
    return {
        content_id: row.content_id,
        skill_id: row.skill_id,
        engine_type: row.engine_type as EngineType,
        template_id: row.template_id as TemplateId,
        source: row.source as ContentSource,
        difficulty_level: row.difficulty_level,
        payload: row.payload as unknown as ContentPayload,
        validation_status: row.validation_status,
        retry_count: row.retry_count,
        created_at: row.created_at,
        similarity: row.similarity ?? 0,
    };
}

function mapContentRow(row: ContentRow): GeneratedContent {
    return {
        content_id: row.content_id,
        skill_id: row.skill_id,
        engine_type: row.engine_type as EngineType,
        template_id: row.template_id as TemplateId,
        source: row.source as ContentSource,
        difficulty_level: row.difficulty_level,
        payload: row.payload as unknown as ContentPayload,
        validation_status: row.validation_status,
        retry_count: row.retry_count,
        created_at: row.created_at,
    };
}
