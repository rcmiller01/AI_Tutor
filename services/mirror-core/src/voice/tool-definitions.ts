/**
 * services/mirror-core/src/voice/tool-definitions.ts
 *
 * Voice tool definitions for OpenAI Realtime API.
 * These tools allow voice interactions to trigger learning actions.
 */

export const VOICE_TOOLS = [
    {
        type: 'function',
        name: 'start_session',
        description: 'Start a new learning session with a specific skill. Use when the child says they want to practice something like "phonics", "spelling", "numbers", or "math".',
        parameters: {
            type: 'object',
            properties: {
                skill_keyword: {
                    type: 'string',
                    description: 'The skill or subject the child wants to learn (e.g., "phonics", "spelling", "numbers", "addition")',
                },
                mode: {
                    type: 'string',
                    enum: ['practice', 'talk', 'play'],
                    description: 'The learning mode. Default is "practice". Use "talk" if they say "teach me" or "explain". Use "play" for games or quizzes.',
                },
            },
            required: ['skill_keyword'],
        },
    },
    {
        type: 'function',
        name: 'request_hint',
        description: 'Give the child a hint for the current question. Use when they say "hint", "help", "I don\'t know", or "I\'m stuck".',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        type: 'function',
        name: 'switch_mode',
        description: 'Switch to a different learning mode. Use when the child asks to change how they\'re learning.',
        parameters: {
            type: 'object',
            properties: {
                new_mode: {
                    type: 'string',
                    enum: ['practice', 'talk', 'play'],
                    description: 'The mode to switch to',
                },
            },
            required: ['new_mode'],
        },
    },
    {
        type: 'function',
        name: 'skip_question',
        description: 'Skip the current question and move to the next one. Use when the child says "skip", "next", or "I give up".',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    {
        type: 'function',
        name: 'answer_question',
        description: 'Submit an answer to the current question. Use when the child provides an answer to the learning activity.',
        parameters: {
            type: 'object',
            properties: {
                answer: {
                    type: 'string',
                    description: 'The child\'s answer to the current question',
                },
            },
            required: ['answer'],
        },
    },
    {
        type: 'function',
        name: 'repeat_question',
        description: 'Read the current question again. Use when the child says "repeat", "again", "what?", or "say that again".',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
];

export type VoiceToolName =
    | 'start_session'
    | 'request_hint'
    | 'switch_mode'
    | 'skip_question'
    | 'answer_question'
    | 'repeat_question';

export interface StartSessionArgs {
    skill_keyword: string;
    mode?: 'practice' | 'talk' | 'play';
}

export interface SwitchModeArgs {
    new_mode: 'practice' | 'talk' | 'play';
}

export interface AnswerQuestionArgs {
    answer: string;
}
