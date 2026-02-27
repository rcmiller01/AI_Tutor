// packages/engine-runtime/src/types/engine-states.ts
// TypeScript engine state shapes — matches the state machine docs (Phase 0.4).

/** Engine state for MICRO_SKILL_DRILL. */
export interface MicroSkillDrillState {
    session_id: string;
    skill_id: string;
    engine_type: 'MICRO_SKILL_DRILL';

    // Item tracking
    current_content_id: string | null;
    /** content_ids queue. Near-transfer item inserted at index 1 on bottom-out. */
    queue: string[];

    // Scoring
    items_attempted: number;
    items_correct: number;
    streak: number;
    difficulty_level: number;

    // Hint ladder (v1.1)
    /** 0-based index into HINT_RUNGS. Resets to 0 when current_content_id changes. */
    hint_level: number;
    near_transfer_scheduled: boolean;
    near_transfer_content_id: string | null;

    // Misconception tracking (for RUNG_NUDGE)
    misconception_pattern: string | null;
}

/** Engine state for MATCH_SORT_CLASSIFY. */
export interface MatchSortClassifyState {
    session_id: string;
    skill_id: string;
    engine_type: 'MATCH_SORT_CLASSIFY';

    // Set tracking
    current_content_id: string | null;
    queue: string[];

    // Per-item hint tracking within a set (key = item_id)
    item_hint_levels: Record<string, number>;

    // Near-transfer at set level
    near_transfer_scheduled: boolean;
    near_transfer_content_id: string | null;

    // Scoring
    sets_completed: number;
    sets_correct: number;
    difficulty_level: number;
    streak: number;

    misconception_patterns: Record<string, string | null>;
}

/** Engine state for STORY_MICROTASKS. */
export interface StoryMicroTasksState {
    session_id: string;
    skill_id: string;
    engine_type: 'STORY_MICROTASKS';

    // Story tracking
    current_story_id: string | null;
    story_queue: string[];
    current_page_index: number;
    pages_read_since_last_task: number;
    task_interval: number;

    // Task item tracking
    current_task_content_id: string | null;
    /** Comprehension question queue; near-transfer inserted here on bottom-out. */
    comprehension_queue: string[];

    // Hint ladder (per task item, not per story page)
    hint_level: number;
    near_transfer_scheduled: boolean;
    near_transfer_content_id: string | null;

    // Scoring
    tasks_attempted: number;
    tasks_correct: number;
    stories_completed: number;
    stories_mastered: number;
    difficulty_level: number;
    streak: number;

    misconception_pattern: string | null;
}

/** Union of all engine states. */
export type AnyEngineState =
    | MicroSkillDrillState
    | MatchSortClassifyState
    | StoryMicroTasksState;
