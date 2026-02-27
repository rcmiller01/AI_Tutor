/**
 * services/mirror-core/src/services/openai-realtime.ts
 *
 * OpenAI Realtime API connection manager.
 * Handles WebSocket connection, audio relay, and tool call interception.
 */

import WebSocket, { type RawData } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { buildVoiceSystemPrompt } from '../voice/system-prompts.js';
import { VOICE_TOOLS } from '../voice/tool-definitions.js';
import { handleVoiceToolCall } from '../voice/tool-handler.js';
import { filterResponseContent } from '../voice/content-safety.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';

export interface RealtimeManagerConfig {
    child_id: string;
    household_id: string;
    child_name: string;
    session_id: string | null;
    logger: FastifyBaseLogger;
}

interface SessionContext {
    session_id: string | null;
    skill_id: string | null;
    mode: string | null;
}

type MessageHandler = (msg: Record<string, unknown>) => void;

export class OpenAIRealtimeManager {
    private ws: WebSocket | null = null;
    private config: RealtimeManagerConfig;
    private sessionContext: SessionContext;
    private messageHandlers: MessageHandler[] = [];
    private pendingToolCalls: Map<string, { name: string; arguments: string }> = new Map();
    private audioBuffer: string[] = [];
    private isBufferingAudio = false;

    constructor(config: RealtimeManagerConfig) {
        this.config = config;
        this.sessionContext = {
            session_id: config.session_id,
            skill_id: null,
            mode: null,
        };
    }

    async connect(): Promise<void> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY not configured');
        }

        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(OPENAI_REALTIME_URL, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'OpenAI-Beta': 'realtime=v1',
                },
            });

            this.ws.on('open', () => {
                this.config.logger.info('Connected to OpenAI Realtime API');
                this.configureSession();
                resolve();
            });

            this.ws.on('message', (data: RawData) => {
                this.handleOpenAIMessage(data.toString());
            });

            this.ws.on('error', (err: Error) => {
                this.config.logger.error({ err }, 'OpenAI Realtime WebSocket error');
                reject(err);
            });

            this.ws.on('close', (code: number, reason: Buffer) => {
                this.config.logger.info(
                    { code, reason: reason.toString() },
                    'OpenAI Realtime WebSocket closed',
                );
                this.ws = null;
            });
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    onMessage(handler: MessageHandler): void {
        this.messageHandlers.push(handler);
    }

    appendAudio(base64Audio: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio,
        }));
    }

    commitAudio(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            type: 'input_audio_buffer.commit',
        }));

        // Also create a response
        this.ws.send(JSON.stringify({
            type: 'response.create',
        }));
    }

    cancelResponse(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            type: 'response.cancel',
        }));
    }

    bindSession(sessionId: string, skillId?: string, mode?: string): void {
        this.sessionContext = {
            session_id: sessionId,
            skill_id: skillId ?? null,
            mode: mode ?? null,
        };

        // Update the system prompt with new context
        this.updateSystemPrompt();
    }

    private configureSession(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const systemPrompt = buildVoiceSystemPrompt({
            childName: this.config.child_name,
            currentSkill: this.sessionContext.skill_id,
            currentMode: this.sessionContext.mode,
        });

        this.ws.send(JSON.stringify({
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                voice: 'alloy',
                instructions: systemPrompt,
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                    model: 'whisper-1',
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                },
                tools: VOICE_TOOLS,
                tool_choice: 'auto',
                max_response_output_tokens: 150,
            },
        }));
    }

    private updateSystemPrompt(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const systemPrompt = buildVoiceSystemPrompt({
            childName: this.config.child_name,
            currentSkill: this.sessionContext.skill_id,
            currentMode: this.sessionContext.mode,
        });

        this.ws.send(JSON.stringify({
            type: 'session.update',
            session: {
                instructions: systemPrompt,
            },
        }));
    }

    private async handleOpenAIMessage(data: string): Promise<void> {
        try {
            const event = JSON.parse(data);
            await this.processOpenAIEvent(event);
        } catch (err) {
            this.config.logger.error({ err }, 'Failed to parse OpenAI message');
        }
    }

    private async processOpenAIEvent(event: Record<string, unknown>): Promise<void> {
        const eventType = event.type as string;

        switch (eventType) {
            case 'session.created':
            case 'session.updated':
                // Session configured, relay to client
                this.emit({
                    type: `voice.${eventType}`,
                    session: event.session,
                });
                break;

            case 'input_audio_buffer.speech_started':
                this.emit({ type: 'voice.listening' });
                break;

            case 'input_audio_buffer.speech_stopped':
                this.emit({ type: 'voice.processing' });
                break;

            case 'conversation.item.input_audio_transcription.completed':
                // User speech transcribed
                this.emit({
                    type: 'voice.transcript.final',
                    transcript: event.transcript,
                });
                break;

            case 'response.audio_transcript.delta':
                // Partial AI response text
                this.emit({
                    type: 'voice.transcript.partial',
                    delta: event.delta,
                });
                break;

            case 'response.audio_transcript.done':
                // Complete AI response text - filter for safety
                const filteredText = filterResponseContent(event.transcript as string);
                this.emit({
                    type: 'voice.transcript.done',
                    transcript: filteredText,
                });
                break;

            case 'response.audio.delta':
                // Audio chunk from AI - buffer if we're validating
                if (this.isBufferingAudio) {
                    this.audioBuffer.push(event.delta as string);
                } else {
                    this.emit({
                        type: 'voice.audio.delta',
                        delta: event.delta,
                    });
                }
                break;

            case 'response.audio.done':
                // Audio complete - flush buffer if any
                if (this.isBufferingAudio) {
                    for (const chunk of this.audioBuffer) {
                        this.emit({
                            type: 'voice.audio.delta',
                            delta: chunk,
                        });
                    }
                    this.audioBuffer = [];
                    this.isBufferingAudio = false;
                }
                this.emit({ type: 'voice.audio.done' });
                break;

            case 'response.function_call_arguments.start':
                // Tool call starting
                this.pendingToolCalls.set(event.call_id as string, {
                    name: event.name as string,
                    arguments: '',
                });
                break;

            case 'response.function_call_arguments.delta':
                // Accumulate tool call arguments
                const pending = this.pendingToolCalls.get(event.call_id as string);
                if (pending) {
                    pending.arguments += event.delta as string;
                }
                break;

            case 'response.function_call_arguments.done':
                // Tool call complete - execute it
                await this.executeToolCall(event.call_id as string);
                break;

            case 'response.done':
                this.emit({ type: 'voice.response.done' });
                break;

            case 'error':
                this.config.logger.error({ event }, 'OpenAI Realtime error');
                this.emit({
                    type: 'voice.error',
                    code: (event.error as Record<string, unknown>)?.code ?? 'UNKNOWN',
                    message: (event.error as Record<string, unknown>)?.message ?? 'Unknown error',
                });
                break;

            default:
                // Pass through other events
                this.config.logger.debug({ eventType }, 'Unhandled OpenAI event');
        }
    }

    private async executeToolCall(callId: string): Promise<void> {
        const toolCall = this.pendingToolCalls.get(callId);
        if (!toolCall) return;

        this.pendingToolCalls.delete(callId);

        try {
            const args = JSON.parse(toolCall.arguments || '{}');

            // Execute tool with policy checks
            const result = await handleVoiceToolCall({
                tool_name: toolCall.name,
                arguments: args,
                child_id: this.config.child_id,
                household_id: this.config.household_id,
                session_id: this.sessionContext.session_id,
                skill_id: this.sessionContext.skill_id,
                mode: this.sessionContext.mode,
                logger: this.config.logger,
            });

            // Send result back to OpenAI
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify(result.output),
                    },
                }));

                // Create response to continue conversation
                this.ws.send(JSON.stringify({
                    type: 'response.create',
                }));
            }

            // Emit tool result to client
            this.emit({
                type: 'voice.tool.result',
                tool_name: toolCall.name,
                result: result.output,
                policy_denied: result.denied,
            });

            // Update session context if tool changed it
            if (result.newContext) {
                Object.assign(this.sessionContext, result.newContext);
            }

        } catch (err) {
            this.config.logger.error({ err, toolCall }, 'Tool call execution failed');

            // Send error result to OpenAI
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({ error: 'Tool execution failed' }),
                    },
                }));
            }
        }
    }

    private emit(msg: Record<string, unknown>): void {
        for (const handler of this.messageHandlers) {
            try {
                handler(msg);
            } catch (err) {
                this.config.logger.error({ err }, 'Message handler error');
            }
        }
    }
}
