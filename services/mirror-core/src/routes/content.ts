import type { FastifyInstance } from 'fastify';
import { generateContentBatch } from '../services/content-generator.js';
import { enqueueJob, getJobStats } from '../services/content-gen-worker.js';
import {
    getContentById,
    getValidatedContent,
    findSimilarContent,
} from '../db/embedding-queries.js';
import { generateEmbedding, buildEmbeddingText } from '../services/embedding-service.js';
import { requireParentAuth } from '../auth/middleware.js';
import type { TemplateId, EngineType } from '@mirror/schemas';

export async function contentRoutes(app: FastifyInstance) {
    // ── Public Content Retrieval ─────────────────────────────────────────────

    /**
     * GET /api/content/:id
     * Get a specific content item by ID.
     */
    app.get<{
        Params: { id: string };
    }>('/content/:id', async (request, reply) => {
        const { id } = request.params;

        const content = await getContentById(id);
        if (!content) {
            return reply.code(404).send({
                error: { code: 'NOT_FOUND', message: 'Content not found' },
            });
        }

        return reply.send({ content });
    });

    /**
     * GET /api/content/pool/:skillId
     * Get available validated content for a skill.
     */
    app.get<{
        Params: { skillId: string };
        Querystring: { difficulty?: string; limit?: string };
    }>('/content/pool/:skillId', async (request, reply) => {
        const { skillId } = request.params;
        const difficulty = request.query.difficulty
            ? parseInt(request.query.difficulty, 10)
            : undefined;
        const limit = request.query.limit
            ? parseInt(request.query.limit, 10)
            : 10;

        const content = await getValidatedContent(skillId, difficulty, limit);

        return reply.send({
            skill_id: skillId,
            difficulty_level: difficulty,
            count: content.length,
            items: content,
        });
    });

    /**
     * POST /api/content/similar
     * Find content similar to a given content item or embedding.
     */
    app.post<{
        Body: {
            content_id?: string;
            embedding?: number[];
            skill_id: string;
            limit?: number;
            exclude_ids?: string[];
        };
    }>('/content/similar', async (request, reply) => {
        const { content_id, embedding, skill_id, limit = 5, exclude_ids = [] } = request.body;

        if (!skill_id) {
            return reply.code(400).send({
                error: { code: 'INVALID_INPUT', message: 'skill_id is required' },
            });
        }

        let searchEmbedding = embedding;

        // If content_id provided, get its embedding
        if (content_id && !searchEmbedding) {
            const content = await getContentById(content_id);
            if (!content) {
                return reply.code(404).send({
                    error: { code: 'NOT_FOUND', message: 'Content not found' },
                });
            }

            const text = buildEmbeddingText(content.payload, skill_id);
            searchEmbedding = await generateEmbedding(text);
        }

        if (!searchEmbedding) {
            return reply.code(400).send({
                error: { code: 'INVALID_INPUT', message: 'Either content_id or embedding is required' },
            });
        }

        const similar = await findSimilarContent(
            searchEmbedding,
            skill_id,
            limit,
            exclude_ids
        );

        return reply.send({
            skill_id,
            count: similar.length,
            items: similar.map(item => ({
                content_id: item.content_id,
                similarity: item.similarity,
                payload: item.payload,
            })),
        });
    });

    // ── Admin Content Management ─────────────────────────────────────────────

    /**
     * POST /api/admin/content/generate
     * Trigger synchronous content generation (for testing).
     * Requires parent authentication.
     */
    app.post<{
        Body: {
            skill_id: string;
            template_id: TemplateId;
            difficulty_level: number;
            batch_size?: number;
            child_age?: number;
        };
    }>('/admin/content/generate', {
        preHandler: [requireParentAuth],
    }, async (request, reply) => {
        const {
            skill_id,
            template_id,
            difficulty_level,
            batch_size = 5,
            child_age = 7,
        } = request.body;

        if (!skill_id || !template_id || difficulty_level === undefined) {
            return reply.code(400).send({
                error: { code: 'INVALID_INPUT', message: 'Missing required fields' },
            });
        }

        try {
            const result = await generateContentBatch({
                skill_id,
                template_id,
                difficulty_level,
                batch_size,
                child_age,
            });

            return reply.send({
                success: true,
                message: `Generated ${result.content_ids.length} items`,
                content_ids: result.content_ids,
                fallback_used: result.fallback_used,
                validation_errors: result.validation_errors,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.code(500).send({
                error: { code: 'GENERATION_FAILED', message },
            });
        }
    });

    /**
     * POST /api/admin/content/enqueue
     * Enqueue content generation job for async processing.
     * Requires parent authentication.
     */
    app.post<{
        Body: {
            skill_id: string;
            template_id: TemplateId;
            engine_type?: EngineType;
            difficulty_level: number;
            batch_size?: number;
            child_age?: number;
            priority?: 'high' | 'normal' | 'low';
        };
    }>('/admin/content/enqueue', {
        preHandler: [requireParentAuth],
    }, async (request, reply) => {
        const {
            skill_id,
            template_id,
            engine_type = 'MICRO_SKILL_DRILL',
            difficulty_level,
            batch_size = 5,
            child_age = 7,
            priority = 'normal',
        } = request.body;

        if (!skill_id || !template_id || difficulty_level === undefined) {
            return reply.code(400).send({
                error: { code: 'INVALID_INPUT', message: 'Missing required fields' },
            });
        }

        const readingLevel = child_age <= 6 ? 'pre' : child_age <= 7 ? 'early' : 'fluent';

        const jobId = await enqueueJob({
            skill_id,
            template_id,
            engine_type,
            difficulty_level,
            child_age,
            reading_level: readingLevel,
            priority,
            batch_size,
            retry_count: 0,
        });

        return reply.code(201).send({
            success: true,
            job_id: jobId,
            message: 'Content generation job enqueued',
        });
    });

    /**
     * GET /api/admin/content/jobs/stats
     * Get content generation job statistics.
     * Requires parent authentication.
     */
    app.get('/admin/content/jobs/stats', {
        preHandler: [requireParentAuth],
    }, async (_request, reply) => {
        const stats = await getJobStats();

        return reply.send({
            stats,
            timestamp: new Date().toISOString(),
        });
    });

    // ── Legacy Route (backward compatibility) ────────────────────────────────

    /**
     * POST /api/content/generate
     * Legacy route for content generation.
     * @deprecated Use /api/admin/content/generate instead.
     */
    app.post<{
        Body: {
            skill_id: string;
            template_id: 'tap_choice';
            difficulty: number;
            batch_size?: number;
        };
    }>('/content/generate', async (request, reply) => {
        const { skill_id, template_id, difficulty, batch_size } = request.body;

        if (!skill_id || !template_id || difficulty === undefined) {
            return reply.code(400).send({
                error: { code: 'INVALID_INPUT', message: 'Missing required fields' },
            });
        }

        try {
            const result = await generateContentBatch({
                skill_id,
                template_id,
                difficulty_level: difficulty,
                batch_size: batch_size ?? 5,
            });

            return reply.send({
                success: true,
                message: `Generated ${result.content_ids.length} items`,
                content_ids: result.content_ids,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.code(500).send({
                error: { code: 'GENERATION_FAILED', message },
            });
        }
    });
}
