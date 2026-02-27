import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { randomUUID } from 'node:crypto';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { skillRoutes } from './routes/skills.js';
import { contentRoutes } from './routes/content.js';
import { adminAuthRoutes } from './routes/admin-auth.js';
import { childAuthRoutes } from './routes/child-auth.js';
import { runAllSeeds } from './db/seed.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

async function main() {
    const app = Fastify({
        // Structured JSON logging in prod; pino-pretty for local dev.
        logger: {
            level: process.env.LOG_LEVEL ?? 'info',
            transport: !IS_PROD
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
            // Production: every log line is newline-delimited JSON with these base fields.
            base: IS_PROD ? { service: 'mirror-core', env: process.env.NODE_ENV } : undefined,
        },
        // Attach a unique request_id to every request for structured log correlation.
        genReqId: () => randomUUID(),
    });

    // ── Request ID propagation ───────────────────────────────────────────────
    // All log lines inside a request automatically include req.id (pino child logger).
    // Expose it as a response header so clients can correlate errors.
    app.addHook('onSend', async (request, reply) => {
        reply.header('X-Request-Id', request.id);
    });

    // ── Plugins ──────────────────────────────────────────────────────────────
    await app.register(cookie);
    await app.register(cors, {
        origin: [
            'http://localhost:5173', // child-ui dev
            'http://localhost:5174', // parent-portal dev
        ],
    });

    // ── Routes ───────────────────────────────────────────────────────────────
    await app.register(healthRoutes, { prefix: '/api' });
    await app.register(adminAuthRoutes, { prefix: '/api' });
    await app.register(childAuthRoutes, { prefix: '/api' });
    await app.register(skillRoutes, { prefix: '/api' });
    await app.register(sessionRoutes, { prefix: '/api' });
    await app.register(contentRoutes, { prefix: '/api' });

    // ── Start ─────────────────────────────────────────────────────────────────
    try {
        await app.listen({ port: PORT, host: HOST });
        app.log.info({ port: PORT }, 'Mirror Core running');

        // Run seeds after server is listening (skipped in production).
        if (!IS_PROD || process.env.SEED_ON_BOOT === 'true') {
            try {
                await runAllSeeds();
                app.log.info('Database seeded successfully.');
            } catch (seedErr) {
                app.log.warn(
                    { err: seedErr instanceof Error ? seedErr.message : seedErr },
                    'Seed failed (DB may not be running)',
                );
            }
        }
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
