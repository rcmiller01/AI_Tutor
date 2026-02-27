/**
 * services/mirror-core/src/services/tts-service.ts
 *
 * Text-to-Speech service using OpenAI Audio API.
 * Generates child-friendly audio for read-aloud features.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';

export interface TTSOptions {
    voice?: TTSVoice;
    model?: TTSModel;
    speed?: number; // 0.25 to 4.0
}

/**
 * Generate speech audio from text.
 * Returns audio as base64-encoded MP3.
 */
export async function generateSpeech(
    text: string,
    options: TTSOptions = {},
): Promise<{ audio_base64: string; content_type: string }> {
    const {
        voice = 'alloy', // Neutral, child-friendly voice
        model = 'tts-1',
        speed = 0.9, // Slightly slower for children
    } = options;

    const response = await openai.audio.speech.create({
        model,
        voice,
        input: text,
        speed,
        response_format: 'mp3',
    });

    // Convert response to base64
    const buffer = Buffer.from(await response.arrayBuffer());
    const audio_base64 = buffer.toString('base64');

    return {
        audio_base64,
        content_type: 'audio/mpeg',
    };
}

/**
 * Generate speech and return as a stream.
 * Useful for longer content where streaming is preferred.
 */
export async function generateSpeechStream(
    text: string,
    options: TTSOptions = {},
): Promise<NodeJS.ReadableStream> {
    const {
        voice = 'alloy',
        model = 'tts-1',
        speed = 0.9,
    } = options;

    const response = await openai.audio.speech.create({
        model,
        voice,
        input: text,
        speed,
        response_format: 'mp3',
    });

    // Return the response body as a stream
    return response.body as unknown as NodeJS.ReadableStream;
}

/**
 * Chunk text for TTS processing.
 * Splits long text into manageable chunks while preserving sentence boundaries.
 */
export function chunkTextForTTS(text: string, maxChunkLength = 4096): string[] {
    if (text.length <= maxChunkLength) {
        return [text];
    }

    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkLength) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
        } else {
            currentChunk += sentence;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}
