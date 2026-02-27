/**
 * services/mirror-core/src/voice/tool-handler.ts
 *
 * Handles voice tool calls with policy enforcement.
 * Bridges voice commands to session/content APIs.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { TriadMode } from '@mirror/schemas';
import { checkPolicy, checkModeSwitch, type PolicyContext } from '../policy/engine.js';
import { buildDenialSpeech } from './system-prompts.js';
import {
    findSkillByKeyword,
    startLearningSession,
    getSessionHint,
    switchSessionMode,
    skipSessionQuestion,
    submitSessionAnswer,
    getSessionCurrentQuestion,
} from '../db/queries.js';
import type {
    VoiceToolName,
    StartSessionArgs,
    SwitchModeArgs,
    AnswerQuestionArgs,
} from './tool-definitions.js';

export interface ToolCallContext {
    tool_name: string;
    arguments: Record<string, unknown>;
    child_id: string;
    household_id: string;
    session_id: string | null;
    skill_id: string | null;
    mode: string | null;
    logger: FastifyBaseLogger;
}

export interface ToolCallResult {
    output: Record<string, unknown>;
    denied: boolean;
    newContext?: {
        session_id?: string;
        skill_id?: string;
        mode?: string;
    };
}

/**
 * Handle a voice tool call with policy enforcement.
 */
export async function handleVoiceToolCall(ctx: ToolCallContext): Promise<ToolCallResult> {
    const toolName = ctx.tool_name as VoiceToolName;

    switch (toolName) {
        case 'start_session':
            return handleStartSession(ctx, ctx.arguments as unknown as StartSessionArgs);

        case 'request_hint':
            return handleRequestHint(ctx);

        case 'switch_mode':
            return handleSwitchMode(ctx, ctx.arguments as unknown as SwitchModeArgs);

        case 'skip_question':
            return handleSkipQuestion(ctx);

        case 'answer_question':
            return handleAnswerQuestion(ctx, ctx.arguments as unknown as AnswerQuestionArgs);

        case 'repeat_question':
            return handleRepeatQuestion(ctx);

        default:
            ctx.logger.warn({ tool_name: toolName }, 'Unknown voice tool');
            return {
                output: { error: 'Unknown tool', message: 'I don\'t know how to do that.' },
                denied: false,
            };
    }
}

async function handleStartSession(
    ctx: ToolCallContext,
    args: StartSessionArgs,
): Promise<ToolCallResult> {
    const { child_id, household_id, logger } = ctx;

    // Find skill by keyword
    const skill = await findSkillByKeyword(args.skill_keyword);
    if (!skill) {
        return {
            output: {
                success: false,
                message: `I couldn't find "${args.skill_keyword}". Try saying "phonics", "spelling", or "numbers"!`,
            },
            denied: false,
        };
    }

    const mode: TriadMode = args.mode ?? 'practice';

    // Check policy
    const policyCtx: PolicyContext = { child_id, household_id };
    const policyResult = await checkPolicy(policyCtx, skill.skill_id, mode);

    if (!policyResult.allowed) {
        const alternatives = policyResult.denial.safe_alternatives
            .slice(0, 2)
            .map((a) => a.skill_id);

        return {
            output: {
                success: false,
                denied: true,
                denial_code: policyResult.denial.denial_reason_code,
                message: buildDenialSpeech(policyResult.denial.denial_reason_code, alternatives),
                approval_id: policyResult.denial.approval_id,
            },
            denied: true,
        };
    }

    // Start the session
    try {
        const session = await startLearningSession({
            child_id,
            skill_id: skill.skill_id,
            mode,
        });

        logger.info(
            { session_id: session.session_id, skill_id: skill.skill_id, mode },
            'Voice started session',
        );

        return {
            output: {
                success: true,
                message: `Great! Let's ${mode} ${skill.skill_name}! Here's your first question.`,
                session_id: session.session_id,
                skill_name: skill.skill_name,
                mode,
                first_prompt: session.prompt,
            },
            denied: false,
            newContext: {
                session_id: session.session_id,
                skill_id: skill.skill_id,
                mode,
            },
        };
    } catch (err) {
        logger.error({ err }, 'Failed to start voice session');
        return {
            output: {
                success: false,
                message: 'Oops! Something went wrong. Let\'s try again!',
            },
            denied: false,
        };
    }
}

async function handleRequestHint(ctx: ToolCallContext): Promise<ToolCallResult> {
    const { session_id, logger } = ctx;

    if (!session_id) {
        return {
            output: {
                success: false,
                message: 'We need to start learning first! What would you like to practice?',
            },
            denied: false,
        };
    }

    try {
        const hint = await getSessionHint(session_id);

        return {
            output: {
                success: true,
                hint_text: hint.hint_text,
                hint_level: hint.hint_level,
                message: hint.hint_text,
            },
            denied: false,
        };
    } catch (err) {
        logger.error({ err }, 'Failed to get hint');
        return {
            output: {
                success: false,
                message: 'Let me think... Try looking at the question again!',
            },
            denied: false,
        };
    }
}

async function handleSwitchMode(
    ctx: ToolCallContext,
    args: SwitchModeArgs,
): Promise<ToolCallResult> {
    const { child_id, household_id, session_id, mode: currentMode, logger } = ctx;

    if (!session_id || !currentMode) {
        return {
            output: {
                success: false,
                message: 'We need to start learning first! What would you like to practice?',
            },
            denied: false,
        };
    }

    const newMode = args.new_mode;

    // Check mode switch policy
    const policyCtx: PolicyContext = { child_id, household_id };
    const policyResult = await checkModeSwitch(
        policyCtx,
        currentMode as TriadMode,
        newMode as TriadMode,
    );

    if (!policyResult.allowed) {
        return {
            output: {
                success: false,
                denied: true,
                denial_code: policyResult.denial.denial_reason_code,
                message: buildDenialSpeech(policyResult.denial.denial_reason_code),
            },
            denied: true,
        };
    }

    try {
        await switchSessionMode(session_id, newMode);

        const modeNames: Record<string, string> = {
            practice: 'practicing',
            talk: 'learning together',
            play: 'playing games',
        };

        return {
            output: {
                success: true,
                new_mode: newMode,
                message: `Okay! Now we're ${modeNames[newMode] ?? newMode}!`,
            },
            denied: false,
            newContext: { mode: newMode },
        };
    } catch (err) {
        logger.error({ err }, 'Failed to switch mode');
        return {
            output: {
                success: false,
                message: 'Let\'s keep going with what we were doing!',
            },
            denied: false,
        };
    }
}

async function handleSkipQuestion(ctx: ToolCallContext): Promise<ToolCallResult> {
    const { session_id, logger } = ctx;

    if (!session_id) {
        return {
            output: {
                success: false,
                message: 'We need to start learning first!',
            },
            denied: false,
        };
    }

    try {
        const nextPrompt = await skipSessionQuestion(session_id);

        return {
            output: {
                success: true,
                message: 'No problem! Let\'s try a different one.',
                next_prompt: nextPrompt,
            },
            denied: false,
        };
    } catch (err) {
        logger.error({ err }, 'Failed to skip question');
        return {
            output: {
                success: false,
                message: 'Let\'s keep trying this one!',
            },
            denied: false,
        };
    }
}

async function handleAnswerQuestion(
    ctx: ToolCallContext,
    args: AnswerQuestionArgs,
): Promise<ToolCallResult> {
    const { session_id, logger } = ctx;

    if (!session_id) {
        return {
            output: {
                success: false,
                message: 'We need to start learning first!',
            },
            denied: false,
        };
    }

    try {
        const result = await submitSessionAnswer(session_id, args.answer);

        if (result.correct) {
            return {
                output: {
                    success: true,
                    correct: true,
                    message: result.feedback ?? 'Great job! That\'s right!',
                    stars_earned: result.stars_earned,
                    next_prompt: result.next_prompt,
                },
                denied: false,
            };
        } else {
            return {
                output: {
                    success: true,
                    correct: false,
                    message: result.feedback ?? 'Almost! Let\'s try again!',
                    attempts_remaining: result.attempts_remaining,
                },
                denied: false,
            };
        }
    } catch (err) {
        logger.error({ err }, 'Failed to submit answer');
        return {
            output: {
                success: false,
                message: 'Hmm, let me check that again!',
            },
            denied: false,
        };
    }
}

async function handleRepeatQuestion(ctx: ToolCallContext): Promise<ToolCallResult> {
    const { session_id, logger } = ctx;

    if (!session_id) {
        return {
            output: {
                success: false,
                message: 'We need to start learning first! What would you like to practice?',
            },
            denied: false,
        };
    }

    try {
        const question = await getSessionCurrentQuestion(session_id);

        return {
            output: {
                success: true,
                prompt: question,
                message: 'Here\'s the question again.',
            },
            denied: false,
        };
    } catch (err) {
        logger.error({ err }, 'Failed to get current question');
        return {
            output: {
                success: false,
                message: 'Let me think of another question for you!',
            },
            denied: false,
        };
    }
}
