import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

const SERVICE_VERSION = process.env.npm_package_version ?? '0.0.1';

export async function healthRoutes(app: FastifyInstance) {
    app.get('/health', async (_request, reply) => {
        // Check DB connectivity with a lightweight query.
        let db_status: 'ok' | 'error' = 'ok';
        let db_latency_ms: number | null = null;
        let db_error: string | null = null;

        const dbStart = Date.now();
        try {
            await pool.query('SELECT 1');
            db_latency_ms = Date.now() - dbStart;
        } catch (err) {
            db_status = 'error';
            db_error = err instanceof Error ? err.message : String(err);
        }

        const status = db_status === 'ok' ? 'ok' : 'degraded';

        reply.code(status === 'ok' ? 200 : 503).send({
            status,
            service: 'mirror-core',
            version: SERVICE_VERSION,
            timestamp: new Date().toISOString(),
            uptime_seconds: Math.floor(process.uptime()),
            db: {
                status: db_status,
                latency_ms: db_latency_ms,
                error: db_error,
            },
        });
    });
}
