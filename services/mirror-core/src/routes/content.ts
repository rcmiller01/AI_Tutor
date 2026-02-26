import type { FastifyInstance } from 'fastify';
import { generateContentBatch } from '../services/content-generator.js';

export async function contentRoutes(app: FastifyInstance) {
    // Manual trigger for generation testing
    app.post<{
        Body: { skill_id: string; template_id: 'tap_choice'; difficulty: number; batch_size?: number };
    }>('/content/generate', async (request, reply) => {
        const { skill_id, template_id, difficulty, batch_size } = request.body;

        if (!skill_id || !template_id || difficulty === undefined) {
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Missing required fields' } });
            return;
        }

        try {
            // Run it but don't await the whole LLM call unless we want to block the HTTP request
            // Let's await it so the test returns the generated IDs immediately
            const newIds = await generateContentBatch(skill_id, template_id, difficulty, batch_size ?? 5);

            reply.send({
                success: true,
                message: `Generated ${newIds.length} items`,
                content_ids: newIds
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            reply.code(500).send({ error: { code: 'GENERATION_FAILED', message } });
        }
    });
}
