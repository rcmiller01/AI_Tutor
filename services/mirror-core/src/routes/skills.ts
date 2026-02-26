import type { FastifyInstance } from 'fastify';
import { listSkillSpecs, getSkillSpec } from '../db/queries.js';

export async function skillRoutes(app: FastifyInstance) {
    app.get('/skills', async (_request, _reply) => {
        return listSkillSpecs();
    });

    app.get<{ Params: { id: string } }>('/skills/:id', async (request, reply) => {
        const spec = await getSkillSpec(request.params.id);
        if (!spec) {
            reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Skill not found' } });
            return;
        }
        reply.send(spec);
    });
}
