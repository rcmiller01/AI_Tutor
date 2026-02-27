/**
 * services/mirror-core/src/routes/tts.ts
 *
 * HTTP endpoints for Text-to-Speech service.
 * Used for read-aloud story features.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateSpeech, generateSpeechStream, chunkTextForTTS, type TTSVoice } from '../services/tts-service.js';

interface TTSRequestBody {
    text: string;
    voice?: TTSVoice;
    speed?: number;
    stream?: boolean;
}

export async function ttsRoutes(app: FastifyInstance) {
    /**
     * POST /api/tts/generate
     * Generate speech audio from text.
     */
    app.post<{ Body: TTSRequestBody }>(
        '/tts/generate',
        async (request: FastifyRequest<{ Body: TTSRequestBody }>, reply: FastifyReply) => {
            const { text, voice, speed, stream } = request.body;

            if (!text || typeof text !== 'string') {
                return reply.status(400).send({
                    error: 'Bad Request',
                    message: 'Text is required',
                });
            }

            // Limit text length for safety
            if (text.length > 5000) {
                return reply.status(400).send({
                    error: 'Bad Request',
                    message: 'Text exceeds maximum length (5000 characters)',
                });
            }

            try {
                if (stream) {
                    // Stream the audio response
                    const audioStream = await generateSpeechStream(text, { voice, speed });
                    reply.header('Content-Type', 'audio/mpeg');
                    return reply.send(audioStream);
                }

                // Return base64-encoded audio
                const result = await generateSpeech(text, { voice, speed });
                return reply.send(result);
            } catch (err) {
                request.log.error({ err }, 'TTS generation failed');
                return reply.status(500).send({
                    error: 'Internal Server Error',
                    message: 'Failed to generate speech',
                });
            }
        },
    );

    /**
     * POST /api/tts/generate-chunks
     * Generate speech for long text, returning chunked audio.
     */
    app.post<{ Body: TTSRequestBody }>(
        '/tts/generate-chunks',
        async (request: FastifyRequest<{ Body: TTSRequestBody }>, reply: FastifyReply) => {
            const { text, voice, speed } = request.body;

            if (!text || typeof text !== 'string') {
                return reply.status(400).send({
                    error: 'Bad Request',
                    message: 'Text is required',
                });
            }

            try {
                const chunks = chunkTextForTTS(text);
                const audioChunks: { text: string; audio_base64: string }[] = [];

                for (const chunk of chunks) {
                    const result = await generateSpeech(chunk, { voice, speed });
                    audioChunks.push({
                        text: chunk,
                        audio_base64: result.audio_base64,
                    });
                }

                return reply.send({
                    total_chunks: audioChunks.length,
                    chunks: audioChunks,
                });
            } catch (err) {
                request.log.error({ err }, 'TTS chunk generation failed');
                return reply.status(500).send({
                    error: 'Internal Server Error',
                    message: 'Failed to generate speech chunks',
                });
            }
        },
    );
}
