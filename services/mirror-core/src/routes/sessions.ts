import type { FastifyInstance } from 'fastify';
import { startDrillSession, getNextItem, submitInteraction, requestHint } from '../engines/drill-engine.js';
import { getSession } from '../db/queries.js';

export async function sessionRoutes(app: FastifyInstance) {
    // Create session
    app.post<{
        Body: { skill_id: string; engine_type: string; mode: string };
    }>('/sessions', async (request, reply) => {
        const { skill_id } = request.body;
        try {
            const { sessionId } = await startDrillSession(skill_id);
            const session = await getSession(sessionId);
            reply.code(201).send(session);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });

    // Get session
    app.get<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
        const session = await getSession(request.params.id);
        if (!session) {
            reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
            return;
        }
        reply.send(session);
    });

    // Next item
    app.post<{ Params: { id: string } }>('/sessions/:id/next', async (request, reply) => {
        try {
            const prompt = await getNextItem(request.params.id);
            reply.send(prompt);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });

    // Submit interaction
    app.post<{
        Params: { id: string };
        Body: { choice_id: string; response_time_ms?: number };
    }>('/sessions/:id/interact', async (request, reply) => {
        try {
            const result = await submitInteraction(
                request.params.id,
                request.body.choice_id,
                request.body.response_time_ms,
            );
            reply.send(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });

    // Request hint
    app.post<{ Params: { id: string } }>('/sessions/:id/hint', async (request, reply) => {
        try {
            const hint = await requestHint(request.params.id);
            reply.send(hint);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });
}
