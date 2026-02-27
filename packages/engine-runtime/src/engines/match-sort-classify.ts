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
import type { MatchSortClassifyState } from '../types/engine-states.js';
import { HINT_LADDER_RUNGS } from './micro-skill-drill.js';

export const MatchSortClassifyEngine = {
    engine_type: 'MATCH_SORT_CLASSIFY',

    init(ctx: SessionContext): MatchSortClassifyState {
        return {
            session_id: ctx.session_id,
            skill_id: ctx.skill_spec.skill_id,
            engine_type: 'MATCH_SORT_CLASSIFY',
            current_content_id: null,
            queue: [],
            item_hint_levels: {}, // Track hint levels per sub-item
            near_transfer_scheduled: false,
            near_transfer_content_id: null,
            sets_completed: 0,
            sets_correct: 0,
            difficulty_level: 1,
            streak: 0,
            misconception_patterns: {},
        };
    },

    load_set(state: MatchSortClassifyState, new_content_id: string): { state: MatchSortClassifyState } {
        return {
            state: {
                ...state,
                current_content_id: new_content_id,
                item_hint_levels: {},
                near_transfer_scheduled: false,
                near_transfer_content_id: null,
                misconception_patterns: {},
            },
        };
    },

    next_prompt(state: MatchSortClassifyState, content: ContentObject[]): PromptPayload {
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
            template_id: contentObj.template_id, // Usually 'drag_bins' or 'match_pairs'
            widget_type: contentObj.template_id,
            content: contentObj.payload as unknown as Record<string, unknown>,
            allowed_interactions: ['drag', 'tap'],
            progress: {
                current_item: state.sets_completed + 1,
                total_items: 5,
                current_difficulty: state.difficulty_level,
                stars_session_total: 0,
                streak_current: state.streak,
            }
        };
    },

    score_interaction(
        state: MatchSortClassifyState,
        event: InteractionEvent,
        skill_spec: SkillSpec,
    ): { state: MatchSortClassifyState; result: ScoreResult } {
        // MSC interactions score the specific sub-item target.
        // Assuming payload tracks per item correct logic for now (mocked).
        const isCorrect = true; // In Phase 2 stub, assume correct

        let newStreak = state.streak;

        if (isCorrect) {
            newStreak++;
        } else {
            newStreak = 0;
        }

        const newState: MatchSortClassifyState = { ...state, streak: newStreak };

        // For MSC, sets_completed might only increment when the whole set is finished.
        // Mocking completion here.
        newState.sets_completed++;
        if (isCorrect) newState.sets_correct++;

        newState.queue = newState.queue.slice(1);

        const result: ScoreResult = {
            is_correct: isCorrect,
            stars_earned: isCorrect ? skill_spec.stars_per_correct || 1 : 0,
            streak: { current: newStreak, best: newStreak, multiplier: 1 },
            mastery_status: { state: 'in_progress' },
        };

        return { state: newState, result };
    },

    /**
     * render_hints for MSC is complex because hints apply to *sub-items* (the thing being dragged).
     * For the MVP architecture, we map the generic render_hints signature's progression to
     * a generic "item_hint_levels" counter for the active sub-item. We determine the active item
     * implicitly by passing the `interaction.event_id` or similar via a broader state context in Phase 3.
     * Here we just progress a global hint level for the whole set for MVP simplicity.
     */
    render_hints(
        state: MatchSortClassifyState,
        skill_spec: SkillSpec,
        ctx: Pick<SessionContext, 'accessibility_skip_hints' | 'hint_max_override'>,
        near_transfer_pool: ContentObject[],
    ): { state: MatchSortClassifyState; hint: HintPayload | null } {
        const hintTarget = 'default_item';
        const currentLevel = state.item_hint_levels[hintTarget] || 0;
        const maxHints = ctx.hint_max_override ?? skill_spec.hint_policy.max_hints_per_item;

        if (currentLevel >= maxHints) {
            return { state, hint: null };
        }

        let newHintLevel = currentLevel + 1;
        let rungName = HINT_LADDER_RUNGS[Math.min(newHintLevel - 1, HINT_LADDER_RUNGS.length - 1)];

        if (ctx.accessibility_skip_hints) {
            newHintLevel = HINT_LADDER_RUNGS.indexOf('bottom_out') + 1;
            rungName = 'bottom_out';
        }

        const newState: MatchSortClassifyState = {
            ...state,
            item_hint_levels: { ...state.item_hint_levels, [hintTarget]: newHintLevel }
        };

        if (rungName === 'bottom_out' && !newState.near_transfer_scheduled) {
            newState.near_transfer_scheduled = true;
            const ntItem = near_transfer_pool.find(c => c.content_id !== state.current_content_id);
            if (ntItem) {
                newState.near_transfer_content_id = ntItem.content_id;
                newState.queue = [...newState.queue];
                newState.queue.splice(1, 0, ntItem.content_id);
            }
        }

        return {
            state: newState,
            hint: {
                rung_name: rungName,
                hint_text: `Set Hint: ${rungName}`,
                hint_style: 'highlight',
                hints_remaining: maxHints - newHintLevel,
            }
        };
    },

    is_mastered(state: MatchSortClassifyState, skill_spec: SkillSpec): MasteryResult {
        const threshold = skill_spec.mastery_threshold;
        const accuracy = state.sets_completed > 0 ? state.sets_correct / state.sets_completed : 0;

        const mastered =
            state.sets_completed >= threshold.min_items &&
            accuracy >= threshold.min_accuracy &&
            (threshold.min_streak === undefined || state.streak >= threshold.min_streak);

        return {
            mastered,
            accuracy,
            items_completed: state.sets_completed,
        };
    },

    maybe_generate_content(state: MatchSortClassifyState, skill_spec: SkillSpec): ContentGenJob | null {
        if (state.queue.length <= 2) {
            return {
                skill_id: state.skill_id,
                template_id: skill_spec.templates[0] as string,
                difficulty_level: state.difficulty_level,
                is_near_transfer: false,
                constraints_hash: 'ph_hash_msc',
            };
        }
        return null;
    }
} satisfies EnginePlugin<MatchSortClassifyState> & {
    load_set: (state: MatchSortClassifyState, new_content_id: string) => { state: MatchSortClassifyState }
};
