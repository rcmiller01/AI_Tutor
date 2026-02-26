import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { skillRoutes } from './routes/skills.js';
import { contentRoutes } from './routes/content.js';
import { runAllSeeds } from './db/seed.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

console.log('[Startup] DATABASE_URL is:', process.env.DATABASE_URL);

async function main() {
    const app = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? 'info',
            transport:
                process.env.NODE_ENV !== 'production'
                    ? { target: 'pino-pretty', options: { colorize: true } }
                    : undefined,
        },
    });

    // Plugins
    await app.register(cors, {
        origin: [
            'http://localhost:5173', // child-ui dev
            'http://localhost:5174', // parent-portal dev
        ],
    });

    // Routes
    await app.register(healthRoutes, { prefix: '/api' });
    await app.register(skillRoutes, { prefix: '/api' });
    await app.register(sessionRoutes, { prefix: '/api' });
    await app.register(contentRoutes, { prefix: '/api' });

    // Start
    try {
        await app.listen({ port: PORT, host: HOST });
        app.log.info(`Mirror Core running at http://${HOST}:${PORT}`);

        // Run seeds after server is listening
        try {
            await runAllSeeds();
            app.log.info('Database seeded successfully.');
        } catch (seedErr) {
            app.log.warn('Seed failed (DB may not be running): %s', seedErr instanceof Error ? seedErr.message : seedErr);
        }
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
