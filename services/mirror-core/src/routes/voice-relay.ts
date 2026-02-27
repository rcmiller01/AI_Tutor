/**
 * services/mirror-core/src/routes/voice-relay.ts
 *
 * WebSocket route handler for voice relay.
 * Proxies audio between child-ui and OpenAI Realtime API,
 * intercepting tool calls for policy enforcement.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import { OpenAIRealtimeManager } from '../services/openai-realtime.js';
import { verifyChildSessionToken, type ChildSessionClaims } from '../auth/tokens.js';
import { getChildById } from '../db/auth-queries.js';

interface VoiceConnectQuery {
    token: string;
    session_id?: string;
}

export async function voiceRelayRoutes(app: FastifyInstance) {
    // Voice WebSocket endpoint
    app.get(
        '/ws/voice',
        { websocket: true },
        async (socket: WebSocket, req: FastifyRequest<{ Querystring: VoiceConnectQuery }>) => {
            const { token, session_id } = req.query;

            // Authenticate the child
            let childClaims: ChildSessionClaims;
            let childName: string;
            try {
                childClaims = await verifyChildSessionToken(token);
                // Get child name for personalization
                const child = await getChildById(childClaims.sub);
                childName = child?.display_name ?? 'Friend';
            } catch (err) {
                req.log.warn({ err }, 'Voice WebSocket auth failed');
                socket.send(JSON.stringify({
                    type: 'voice.error',
                    code: 'AUTH_FAILED',
                    message: 'Invalid or expired token',
                }));
                socket.close(4001, 'Unauthorized');
                return;
            }

            const childId = childClaims.sub;
            const householdId = childClaims.household_id;

            req.log.info(
                { child_id: childId, session_id },
                'Voice WebSocket connected',
            );

            // Create OpenAI Realtime manager for this connection
            const realtimeManager = new OpenAIRealtimeManager({
                child_id: childId,
                household_id: householdId,
                child_name: childName,
                session_id: session_id ?? null,
                logger: req.log,
            });

            // Handle messages from client
            socket.on('message', async (data: RawData) => {
                try {
                    const message = JSON.parse(data.toString());
                    await handleClientMessage(message, socket, realtimeManager, req);
                } catch (err) {
                    req.log.error({ err }, 'Failed to process voice message');
                    socket.send(JSON.stringify({
                        type: 'voice.error',
                        code: 'PARSE_ERROR',
                        message: 'Invalid message format',
                    }));
                }
            });

            // Handle client disconnect
            socket.on('close', () => {
                req.log.info({ child_id: childId }, 'Voice WebSocket disconnected');
                realtimeManager.disconnect();
            });

            // Handle errors
            socket.on('error', (err: Error) => {
                req.log.error({ err, child_id: childId }, 'Voice WebSocket error');
                realtimeManager.disconnect();
            });

            // Set up OpenAI → Client relay
            realtimeManager.onMessage((msg) => {
                if (socket.readyState === 1) { // OPEN
                    socket.send(JSON.stringify(msg));
                }
            });

            // Send ready signal
            socket.send(JSON.stringify({
                type: 'voice.connected',
                child_id: childId,
                session_id,
            }));
        },
    );
}

type ClientSocket = Pick<WebSocket, 'send' | 'readyState'>;

async function handleClientMessage(
    message: { type: string; [key: string]: unknown },
    socket: ClientSocket,
    manager: OpenAIRealtimeManager,
    req: FastifyRequest,
) {
    switch (message.type) {
        case 'voice.connect':
            // Connect to OpenAI Realtime API
            try {
                await manager.connect();
                socket.send(JSON.stringify({ type: 'voice.ready' }));
            } catch (err) {
                req.log.error({ err }, 'Failed to connect to OpenAI Realtime');
                socket.send(JSON.stringify({
                    type: 'voice.error',
                    code: 'OPENAI_CONNECT_FAILED',
                    message: 'Could not connect to voice service',
                }));
            }
            break;

        case 'voice.disconnect':
            manager.disconnect();
            socket.send(JSON.stringify({ type: 'voice.disconnected' }));
            break;

        case 'voice.audio.append':
            // Forward audio chunk to OpenAI
            if (typeof message.audio === 'string') {
                manager.appendAudio(message.audio);
            }
            break;

        case 'voice.audio.commit':
            // Signal end of audio input
            manager.commitAudio();
            break;

        case 'voice.session.bind':
            // Bind to a learning session
            if (typeof message.session_id === 'string') {
                manager.bindSession(
                    message.session_id,
                    message.skill_id as string | undefined,
                    message.mode as string | undefined,
                );
            }
            break;

        case 'voice.cancel':
            // Cancel current response
            manager.cancelResponse();
            break;

        default:
            req.log.warn({ type: message.type }, 'Unknown voice message type');
    }
}
