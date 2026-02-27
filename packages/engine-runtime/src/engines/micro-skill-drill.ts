import type {
    SkillSpec,
    ContentObject,
    InteractionEvent,
    ScoreResult,
    HintPayload,
    PromptPayload,
    HintRung,
} from '@mirror/schemas';
import type { EnginePlugin, MasteryResult, ContentGenJob, SessionContext } from '../types/engine-plugin.js';
import type { MicroSkillDrillState } from '../types/engine-states.js';

export const HINT_LADDER_RUNGS: HintRung[] = [
    'nudge',
    'strategy',
    'worked_example',
    'partial_fill',
    'bottom_out',
];

export const MicroSkillDrillEngine = {
    engine_type: 'MICRO_SKILL_DRILL',

    init(ctx: SessionContext): MicroSkillDrillState {
        return {
            session_id: ctx.session_id,
            skill_id: ctx.skill_spec.skill_id,
            engine_type: 'MICRO_SKILL_DRILL',
            current_content_id: null,
            queue: [],
            items_attempted: 0,
            items_correct: 0,
            streak: 0,
            difficulty_level: 1,
            hint_level: 0,
            near_transfer_scheduled: false,
            near_transfer_content_id: null,
            misconception_pattern: null,
        };
    },

    load_item(state: MicroSkillDrillState, new_content_id: string): { state: MicroSkillDrillState } {
        return {
            state: {
                ...state,
                current_content_id: new_content_id,
                hint_level: 0,
                near_transfer_scheduled: false,
                near_transfer_content_id: null,
                misconception_pattern: null, // Reset misconception tracking for new item
            },
        };
    },

    next_prompt(state: MicroSkillDrillState, content: ContentObject[]): PromptPayload {
        if (state.queue.length === 0) {
            throw new Error('Queue is empty');
        }

        const nextContentId = state.queue[0];
        const contentObj = content.find(c => c.content_id === nextContentId);
        if (!contentObj) {
            throw new Error(`Content object not found in provided pool: ${nextContentId}`);
        }

        return {
            prompt_id: `prompt-${Date.now()}`,
            session_id: state.session_id,
            content_id: contentObj.content_id,
            template_id: contentObj.template_id,
            widget_type: contentObj.template_id, // Often 1:1 mapped for MVP
            content: contentObj.payload as unknown as Record<string, unknown>,
            allowed_interactions: ['tap', 'drag', 'type', 'voice_response', 'word_tap'], // Or derive from SkillSpec
            progress: {
                current_item: state.items_attempted + 1,
                total_items: 10, // Hardcoded for signature match, real logic uses MasteryThreshold
                current_difficulty: state.difficulty_level,
                stars_session_total: 0, // Should be computed outside or from state.stars?
                streak_current: state.streak,
            }
        };
    },

    score_interaction(
        state: MicroSkillDrillState,
        event: InteractionEvent,
        skill_spec: SkillSpec,
    ): { state: MicroSkillDrillState; result: ScoreResult } {
        const isCorrect = event.value.type === 'tap' && event.value.choice_id === 'A'; // Stub correct logic

        let newStreak = state.streak;
        let newCorrect = state.items_correct;

        if (isCorrect) {
            newStreak++;
            newCorrect++;
        } else {
            newStreak = 0;
        }

        const newState: MicroSkillDrillState = {
            ...state,
            items_attempted: state.items_attempted + 1,
            items_correct: newCorrect,
            streak: newStreak,
        };

        // Remove item from queue if correct or max hints exceeded (simplified)
        if (isCorrect) {
            newState.queue = newState.queue.slice(1);
        }

        const result: ScoreResult = {
            is_correct: isCorrect,
            stars_earned: isCorrect ? skill_spec.stars_per_correct || 1 : 0,
            streak: { current: newStreak, best: newStreak, multiplier: 1 },
            mastery_status: { state: 'in_progress' },
        };

        return { state: newState, result };
    },

    render_hints(
        state: MicroSkillDrillState,
        skill_spec: SkillSpec,
        ctx: Pick<SessionContext, 'accessibility_skip_hints' | 'hint_max_override'>,
        near_transfer_pool: ContentObject[],
    ): { state: MicroSkillDrillState; hint: HintPayload | null } {
        const maxHints = ctx.hint_max_override ?? skill_spec.hint_policy.max_hints_per_item;

        if (state.hint_level >= maxHints) {
            return { state, hint: null };
        }

        let newHintLevel = state.hint_level + 1;
        let rungName = HINT_LADDER_RUNGS[Math.min(newHintLevel - 1, HINT_LADDER_RUNGS.length - 1)];

        if (ctx.accessibility_skip_hints) {
            newHintLevel = HINT_LADDER_RUNGS.indexOf('bottom_out') + 1;
            rungName = 'bottom_out';
        }

        const newState = { ...state, hint_level: newHintLevel };

        if (rungName === 'bottom_out' && !newState.near_transfer_scheduled) {
            newState.near_transfer_scheduled = true;

            // Find a valid near-transfer item (different content word)
            const ntItem = near_transfer_pool.find(c => c.content_id !== state.current_content_id);
            if (ntItem) {
                newState.near_transfer_content_id = ntItem.content_id;
                // Insert directly after the current item
                newState.queue = [...newState.queue];
                newState.queue.splice(1, 0, ntItem.content_id);
            }
        }

        const hint: HintPayload = {
            rung_name: rungName,
            hint_text: `Hint: ${rungName}`,
            hint_style: 'text',
            hints_remaining: maxHints - newHintLevel,
        };

        return { state: newState, hint };
    },

    is_mastered(state: MicroSkillDrillState, skill_spec: SkillSpec): MasteryResult {
        const threshold = skill_spec.mastery_threshold;
        const accuracy = state.items_attempted > 0 ? state.items_correct / state.items_attempted : 0;

        const mastered =
            state.items_attempted >= threshold.min_items &&
            accuracy >= threshold.min_accuracy &&
            (threshold.min_streak === undefined || state.streak >= threshold.min_streak);

        return {
            mastered,
            accuracy,
            items_completed: state.items_attempted,
        };
    },

    maybe_generate_content(state: MicroSkillDrillState, skill_spec: SkillSpec): ContentGenJob | null {
        if (state.queue.length <= 3) {
            return {
                skill_id: state.skill_id,
                template_id: skill_spec.templates[0] as string,
                difficulty_level: state.difficulty_level,
                is_near_transfer: false,
                constraints_hash: 'placeholder_hash',
            };
        }
        return null;
    }
} satisfies EnginePlugin<MicroSkillDrillState> & {
    load_item: (state: MicroSkillDrillState, new_content_id: string) => { state: MicroSkillDrillState }
};
