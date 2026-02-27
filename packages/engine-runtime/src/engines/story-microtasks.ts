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
import type { StoryMicroTasksState } from '../types/engine-states.js';
import { HINT_LADDER_RUNGS } from './micro-skill-drill.js';

export const StoryMicroTasksEngine = {
    engine_type: 'STORY_MICROTASKS',

    init(ctx: SessionContext): StoryMicroTasksState {
        return {
            session_id: ctx.session_id,
            skill_id: ctx.skill_spec.skill_id,
            engine_type: 'STORY_MICROTASKS',
            current_story_id: null,
            story_queue: [],
            current_page_index: 0,
            pages_read_since_last_task: 0,
            task_interval: 3, // Prompt after every 3 pages
            current_task_content_id: null,
            comprehension_queue: [],
            hint_level: 0,
            near_transfer_scheduled: false,
            near_transfer_content_id: null,
            tasks_attempted: 0,
            tasks_correct: 0,
            stories_completed: 0,
            stories_mastered: 0,
            difficulty_level: 1,
            streak: 0,
            misconception_pattern: null,
        };
    },

    load_story(state: StoryMicroTasksState, new_story_id: string): { state: StoryMicroTasksState } {
        return {
            state: {
                ...state,
                current_story_id: new_story_id,
                current_page_index: 0,
                pages_read_since_last_task: 0,
                current_task_content_id: null,
                comprehension_queue: [], // Should be filled during load
                hint_level: 0,
                near_transfer_scheduled: false,
                near_transfer_content_id: null,
                misconception_pattern: null,
            },
        };
    },

    next_prompt(state: StoryMicroTasksState, content: ContentObject[]): PromptPayload {
        // Evaluate if a task should intercept the story
        if (state.pages_read_since_last_task >= state.task_interval && state.comprehension_queue.length > 0) {
            const nextContentId = state.comprehension_queue[0];
            const contentObj = content.find(c => c.content_id === nextContentId);

            if (!contentObj) {
                throw new Error(`Content object not found: ${nextContentId}`);
            }

            return {
                prompt_id: `prompt-${Date.now()}`,
                session_id: state.session_id,
                content_id: contentObj.content_id,
                template_id: contentObj.template_id, // Usually 'comprehension_q'
                widget_type: contentObj.template_id,
                content: contentObj.payload as unknown as Record<string, unknown>,
                allowed_interactions: ['tap'], // Or derive from SkillSpec
                progress: {
                    current_item: state.tasks_attempted + 1,
                    total_items: 5,
                    current_difficulty: state.difficulty_level,
                    stars_session_total: 0,
                    streak_current: state.streak,
                }
            };
        }

        // Return the next story page
        return {
            prompt_id: `prompt-${Date.now()}`,
            session_id: state.session_id,
            content_id: state.current_story_id ?? 'unknown_story',
            template_id: 'story_page',
            widget_type: 'story_page',
            content: { page_index: state.current_page_index }, // Needs real story state payload in Phase 3
            allowed_interactions: ['drag', 'tap'],
            progress: {
                current_item: state.current_page_index + 1,
                total_items: 10,
                current_difficulty: state.difficulty_level,
                stars_session_total: 0,
                streak_current: state.streak,
            }
        };
    },

    score_interaction(
        state: StoryMicroTasksState,
        event: InteractionEvent,
        skill_spec: SkillSpec,
    ): { state: StoryMicroTasksState; result: ScoreResult } {
        const isCorrect = true; // In Phase 2 stub, assume correct
        let newStreak = state.streak;

        if (isCorrect) {
            newStreak++;
        } else {
            newStreak = 0;
        }

        // Determine if it was a task being scored. If so, decrement comprehension_queue and reset page counter.
        // If it was just advancing a page, increment page counter.
        let newState = { ...state, streak: newStreak };

        if (state.pages_read_since_last_task >= state.task_interval && state.comprehension_queue.length > 0) {
            // Task handled
            newState.tasks_attempted++;
            if (isCorrect) newState.tasks_correct++;

            newState.comprehension_queue = newState.comprehension_queue.slice(1);
            newState.pages_read_since_last_task = 0; // Reset
            newState.hint_level = 0;
        } else {
            // Advancing page
            newState.current_page_index++;
            newState.pages_read_since_last_task++;
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
        state: StoryMicroTasksState,
        skill_spec: SkillSpec,
        ctx: Pick<SessionContext, 'accessibility_skip_hints' | 'hint_max_override'>,
        near_transfer_pool: ContentObject[],
    ): { state: StoryMicroTasksState; hint: HintPayload | null } {
        // Hints only apply to comprehension tasks, not to story pages
        if (state.pages_read_since_last_task < state.task_interval || state.comprehension_queue.length === 0) {
            return { state, hint: null }; // No hints on pure reading interactions
        }

        const currentLevel = state.hint_level || 0;
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

        const newState: StoryMicroTasksState = { ...state, hint_level: newHintLevel };

        if (rungName === 'bottom_out' && !newState.near_transfer_scheduled) {
            newState.near_transfer_scheduled = true;
            const ntItem = near_transfer_pool.find(c => c.content_id !== state.current_task_content_id);
            if (ntItem) {
                newState.near_transfer_content_id = ntItem.content_id;
                newState.comprehension_queue = [...newState.comprehension_queue];
                newState.comprehension_queue.splice(1, 0, ntItem.content_id);
            }
        }

        return {
            state: newState,
            hint: {
                rung_name: rungName,
                hint_text: `Reading Hint: ${rungName}`,
                hint_style: 'highlight',
                hints_remaining: maxHints - newHintLevel,
            }
        };
    },

    is_mastered(state: StoryMicroTasksState, skill_spec: SkillSpec): MasteryResult {
        const threshold = skill_spec.mastery_threshold;
        const accuracy = state.tasks_attempted > 0 ? state.tasks_correct / state.tasks_attempted : 0;

        const mastered =
            state.tasks_attempted >= threshold.min_items &&
            accuracy >= threshold.min_accuracy &&
            (threshold.min_streak === undefined || state.streak >= threshold.min_streak);

        return {
            mastered,
            accuracy,
            items_completed: state.tasks_attempted,
        };
    },

    maybe_generate_content(state: StoryMicroTasksState, skill_spec: SkillSpec): ContentGenJob | null {
        if (state.story_queue.length <= 1) {
            return {
                skill_id: state.skill_id,
                template_id: 'story_page',
                difficulty_level: state.difficulty_level,
                is_near_transfer: false,
                constraints_hash: 'ph_hash_smt',
            };
        }
        return null;
    }
} satisfies EnginePlugin<StoryMicroTasksState> & {
    load_story: (state: StoryMicroTasksState, new_story_id: string) => { state: StoryMicroTasksState }
};
