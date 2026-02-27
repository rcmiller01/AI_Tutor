// packages/engine-runtime/src/types/engine-plugin.ts
// Engine plugin interface — Phase 2 will implement concrete engines.

import type {
    SkillSpec,
    ContentObject,
    InteractionEvent,
    ScoreResult,
    HintPayload,
    PromptPayload,
} from '@mirror/schemas';

/** Returned by is_mastered() when skill is complete. */
export interface MasteryResult {
    mastered: boolean;
    accuracy: number;
    items_completed: number;
}

/** A queued content generation job reference. */
export interface ContentGenJob {
    skill_id: string;
    template_id: string;
    difficulty_level: number;
    is_near_transfer: boolean;
    original_content_id?: string;
    constraints_hash: string;
}

/**
 * Context provided to every engine method.
 * Carries the resolved skill spec and child-level policy overrides.
 */
export interface SessionContext {
    session_id: string;
    skill_spec: SkillSpec;
    child_id: string;
    /** If true, hint ladder skips all rungs and jumps to bottom_out. */
    accessibility_skip_hints: boolean;
    /** Override for max hints per item. Falls back to skill_spec.hint_policy.max_hints_per_item. */
    hint_max_override?: number;
}

/**
 * The engine plugin interface all three engines must implement.
 * Each method is pure: given state + inputs → new state + output.
 * No DB calls inside engines — IO is the caller's responsibility.
 */
export interface EnginePlugin<TState extends object = object> {
    /** Unique engine identifier matching EngineType enum. */
    readonly engine_type: string;

    /** Initialise fresh engine state for a new session. */
    init(ctx: SessionContext): TState;

    /** Select and return the next PromptPayload from the current queue. */
    next_prompt(state: TState, content: ContentObject[]): PromptPayload;

    /** Score an interaction; return updated state + ScoreResult. */
    score_interaction(
        state: TState,
        event: InteractionEvent,
        skill_spec: SkillSpec,
    ): { state: TState; result: ScoreResult };

    /**
     * Render the next hint for the current item.
     * Advances hint_level in the returned state.
     * Returns null if hints are exhausted.
     */
    render_hints(
        state: TState,
        skill_spec: SkillSpec,
        ctx: Pick<SessionContext, 'accessibility_skip_hints' | 'hint_max_override'>,
        near_transfer_pool: ContentObject[],
    ): { state: TState; hint: HintPayload | null };

    /** Check whether mastery threshold is met. */
    is_mastered(state: TState, skill_spec: SkillSpec): MasteryResult;

    /**
     * Optionally emit a ContentGenJob if the engine detects the content pool is low.
     * Returns null if no generation is needed.
     */
    maybe_generate_content(state: TState, skill_spec: SkillSpec): ContentGenJob | null;
}
