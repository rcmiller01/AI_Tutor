import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

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

    // Start
    try {
        await app.listen({ port: PORT, host: HOST });
        app.log.info(`Mirror Core running at http://${HOST}:${PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
