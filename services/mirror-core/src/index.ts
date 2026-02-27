import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { skillRoutes } from './routes/skills.js';
import { contentRoutes } from './routes/content.js';
import { adminAuthRoutes } from './routes/admin-auth.js';
import { childAuthRoutes } from './routes/child-auth.js';
import { approvalRoutes } from './routes/approvals.js';
import { worldsRoutes } from './routes/worlds.js';
import { parentDashboardRoutes } from './routes/parent-dashboard.js';
import { voiceRelayRoutes } from './routes/voice-relay.js';
import { ttsRoutes } from './routes/tts.js';
import { runAllSeeds } from './db/seed.js';
import { setupAutoTimeout } from './jobs/session-timeout.js';
import { contentGenWorker } from './services/content-gen-worker.js';

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
    // Phase 7: WebSocket support for voice relay
    await app.register(websocket, {
        options: { maxPayload: 1048576 }, // 1MB max for audio chunks
    });

    // ── Routes ───────────────────────────────────────────────────────────────
    await app.register(healthRoutes, { prefix: '/api' });
    await app.register(adminAuthRoutes, { prefix: '/api' });
    await app.register(childAuthRoutes, { prefix: '/api' });
    await app.register(skillRoutes, { prefix: '/api' });
    await app.register(sessionRoutes, { prefix: '/api' });
    await app.register(contentRoutes, { prefix: '/api' });
    // Phase 3: Approval workflow and Worlds API
    await app.register(approvalRoutes, { prefix: '/api' });
    await app.register(worldsRoutes, { prefix: '/api' });
    // Phase 5: Parent dashboard
    await app.register(parentDashboardRoutes, { prefix: '/api' });
    // Phase 7: Voice relay WebSocket and TTS
    await app.register(voiceRelayRoutes, { prefix: '/api' });
    await app.register(ttsRoutes, { prefix: '/api' });

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

        // Phase 3: Start session auto-timeout job
        if (!IS_PROD || process.env.ENABLE_CRON === 'true') {
            setupAutoTimeout(app);
        }

        // Phase 4: Start content generation worker
        if (!IS_PROD || process.env.ENABLE_CONTENT_GEN === 'true') {
            try {
                await contentGenWorker.start();
                app.log.info('Content generation worker started');
            } catch (workerErr) {
                app.log.warn(
                    { err: workerErr instanceof Error ? workerErr.message : workerErr },
                    'Content gen worker failed to start',
                );
            }
        }
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
