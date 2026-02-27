// =============================================================================
// Magic Mirror Tutor: Shared TypeScript Types
// v1.1 — aligned with PRD v2.1 / Architecture v1.1
// =============================================================================

// --- Enums ---

export type EngineType = 'MICRO_SKILL_DRILL' | 'MATCH_SORT_CLASSIFY' | 'STORY_MICROTASKS';
export type TemplateId = 'tap_choice' | 'drag_bins' | 'type_in_blank' | 'match_pairs' | 'story_page' | 'comprehension_q';
export type InteractionType = 'tap' | 'drag' | 'type' | 'voice_response' | 'word_tap';
export type GradeBand = 'PK' | 'K' | '1' | '2' | '3';
export type ContentSource = 'CURATED' | 'LLM_GENERATED' | 'MIXED';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'timed_out';
export type SessionMode = 'learning' | 'game';
export type TriadMode = 'talk' | 'practice' | 'play';
export type DenialReasonCode =
    | 'SCOPE_NOT_ALLOWED'
    | 'TIME_BUDGET_EXCEEDED'
    | 'ENGINE_TYPE_NOT_ALLOWED'
    | 'WORLD_NOT_ENABLED'
    | 'QUIET_HOURS'
    | 'REQUIRES_APPROVAL';
export type HintRung = 'nudge' | 'strategy' | 'worked_example' | 'partial_fill' | 'bottom_out';
export type FlagType = 'misconception_loop' | 'out_of_scope' | 'safety_event';
export type MfaType = 'totp' | 'passkey';
export type ApprovalStatus = 'requested' | 'notified' | 'approved' | 'denied' | 'expired' | 'fulfilled';
export type ApprovalRequestType = 'scope_change' | 'skill_change' | 'time_extension' | 'game_mode';
export type HintStyle = 'text' | 'audio' | 'highlight' | 'eliminate_wrong' | 'show_example';
export type SoundEffect = 'correct' | 'incorrect' | 'streak_3' | 'streak_5' | 'streak_10' | 'mastery' | 'level_up';
export type MasteryState = 'in_progress' | 'mastery_gate' | 'mastered' | 'remediation';
export type AnswerMethod = 'exact_match' | 'set_match' | 'ordered_match' | 'fuzzy_match';
export type ScopeTag = 'reading' | 'phonics' | 'sight_words' | 'comprehension' | 'vocabulary' | 'spelling' | 'math' | 'science';
export type UnlockableCategory = 'theme' | 'character' | 'background' | 'sound_pack' | 'badge';
export type StarReason = 'correct_answer' | 'streak_bonus' | 'mastery_bonus' | 'level_up' | 'reward_redeemed' | 'unlockable_purchased' | 'admin_adjustment';
export type ContentGenProvider = 'openrouter' | 'openai' | 'fallback_curated';
export type ContentGenStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'rejected';

// --- Skill Spec ---

export interface SkillSpec {
    skill_id: string;
    version: number;
    grade_band: GradeBand;
    objective: string;
    allowed_engine_types: EngineType[];
    allowed_interactions: InteractionType[];
    templates: TemplateId[];
    item_generator_rules: ItemGeneratorRules;
    answer_key_logic: AnswerKeyLogic;
    misconceptions: Misconception[];
    difficulty_ladder: DifficultyLadder;
    mastery_threshold: MasteryThreshold;
    hint_policy: HintPolicy;
    scope_tags: ScopeTag[];
    stars_per_correct: number;
    stars_mastery_bonus: number;
}

export interface ItemGeneratorRules {
    phonics_patterns?: string[];
    allowed_vocab?: string[];
    disallowed_graphemes?: string[];
    max_word_length?: number;
    max_sentence_length?: number;
    reading_level_range?: { min: number; max: number };
}

export interface AnswerKeyLogic {
    method: AnswerMethod;
    case_sensitive?: boolean;
    tolerance?: number;
}

export interface Misconception {
    pattern: string;
    hint_text: string;
    hint_audio_key?: string;
}

export interface DifficultyLadder {
    levels: number;
    promotion_threshold: number;
    demotion_threshold: number;
    items_per_level: number;
}

export interface MasteryThreshold {
    min_accuracy: number;
    min_streak?: number;
    min_items: number;
    max_time_seconds?: number;
}

export interface HintPolicy {
    max_hints_per_item: number;
    allowed_hint_styles: HintStyle[];
    hint_penalty: number;
}

// --- Content Objects ---

export interface ContentObject {
    content_id: string;
    skill_id: string;
    engine_type: EngineType;
    template_id: TemplateId;
    version: number;
    source: ContentSource;
    created_at: string;
    constraints_hash?: string;
    difficulty_level: number;
    payload: ContentPayload;
}

export type ContentPayload =
    | TapChoiceItem
    | DragBinsSet
    | TypeInBlankItem
    | MatchPairsSet
    | StoryPage
    | ComprehensionQ;

export interface TapChoiceItem {
    type: 'tap_choice';
    prompt_text: string;
    prompt_audio_key?: string;
    choices: { choice_id: string; label: string; image_key?: string; audio_key?: string }[];
    correct_choice_id: string;
}

export interface DragBinsSet {
    type: 'drag_bins';
    instruction_text?: string;
    bins: { bin_id: string; label: string; image_key?: string }[];
    items: { item_id: string; label: string; image_key?: string; audio_key?: string }[];
    correct_bin_map: Record<string, string>;
}

export interface TypeInBlankItem {
    type: 'type_in_blank';
    prompt_text: string;
    prompt_audio_key?: string;
    correct_answer: string;
    accept_alternatives?: string[];
}

export interface MatchPairsSet {
    type: 'match_pairs';
    instruction_text?: string;
    pairs: {
        pair_id: string;
        left: { label: string; image_key?: string; audio_key?: string };
        right: { label: string; image_key?: string; audio_key?: string };
    }[];
}

export interface StoryPage {
    type: 'story_page';
    story_id?: string;
    page_number: number;
    page_text: string;
    read_aloud_ssml?: string;
    word_spans: WordSpan[];
    illustration_key?: string;
}

export interface WordSpan {
    word: string;
    start_index: number;
    end_index: number;
    is_tappable: boolean;
    definition?: string;
    sound_it_out?: string[];
}

export interface ComprehensionQ {
    type: 'comprehension_q';
    story_id?: string;
    question: string;
    question_type: 'literal' | 'inference' | 'vocabulary' | 'sequence';
    choices: { choice_id: string; label: string }[];
    correct_choice_id: string;
    rationale?: string;
}

// --- Interaction & Scoring ---

export interface InteractionEvent {
    event_id: string;
    session_id: string;
    content_id: string;
    interaction_type: InteractionType;
    timestamp: string;
    response_time_ms?: number;
    value: InteractionValue;
}

export type InteractionValue =
    | { type: 'tap'; choice_id: string }
    | { type: 'drag'; item_id: string; target_bin_id: string }
    | { type: 'type'; text: string }
    | { type: 'voice_response'; transcript: string; confidence?: number }
    | { type: 'word_tap'; word: string; word_index: number };

export interface ScoreResult {
    is_correct: boolean;
    stars_earned: number;
    streak: { current: number; best: number; multiplier: number };
    mastery_status: MasteryStatus;
    hint?: HintPayload;
    misconception_id?: string;
    sound_effect?: SoundEffect;
}

export interface MasteryStatus {
    state: MasteryState;
    accuracy?: number;
    items_completed?: number;
    items_remaining?: number;
    current_difficulty?: number;
    max_difficulty?: number;
}

export interface HintPayload {
    rung_name: HintRung;
    hint_text: string;
    hint_style: HintStyle;
    hint_audio_key?: string;
    hints_remaining: number;
}

// --- Session ---

export interface Session {
    session_id: string;
    child_id: string;
    skill_id: string;
    engine_type: EngineType;
    mode: SessionMode;
    status: SessionStatus;
    started_at: string;
    paused_at?: string;
    ended_at?: string;
    duration_seconds?: number;
    difficulty_level: number;
    random_seed?: number;
    stats: SessionStats;
    engine_state?: unknown;
    approval_id?: string;
}

export interface SessionStats {
    items_attempted: number;
    items_correct: number;
    accuracy: number;
    best_streak: number;
    hints_used: number;
    stars_earned: number;
    mastery_achieved: boolean;
}

// --- Prompt Payload ---

export interface PromptPayload {
    prompt_id: string;
    session_id: string;
    content_id: string;
    template_id: TemplateId;
    widget_type: string;
    content: Record<string, unknown>;
    allowed_interactions: InteractionType[];
    instruction_text?: string;
    instruction_audio_key?: string;
    time_limit_seconds?: number;
    progress?: SessionProgress;
}

export interface SessionProgress {
    current_item: number;
    total_items: number;
    current_difficulty: number;
    stars_session_total: number;
    streak_current: number;
}

// --- Rewards ---

export interface StarsLedgerEntry {
    entry_id: string;
    child_id: string;
    amount: number;
    reason: StarReason;
    session_id?: string;
    created_at: string;
    balance_after: number;
}

export interface StarReward {
    reward_id: string;
    child_id: string;
    name: string;
    description?: string;
    cost_stars: number;
    icon_key?: string;
    status: 'available' | 'redeemed' | 'archived';
    repeatable: boolean;
    created_at: string;
    redeemed_at?: string;
}

export interface Unlockable {
    unlockable_id: string;
    name: string;
    description?: string;
    category: UnlockableCategory;
    cost_stars: number;
    is_unlocked: boolean;
    unlock_condition: 'purchase' | 'milestone';
    asset_key?: string;
    preview_key?: string;
    unlocked_at?: string;
}

// --- Approvals ---

export interface ApprovalRequest {
    approval_id: string;
    child_id: string;
    request_type: ApprovalRequestType;
    status: ApprovalStatus;
    requested_at: string;
    resolved_at?: string;
    expires_at?: string;
    request_details?: {
        requested_skill_id?: string;
        requested_scope_tag?: string;
        requested_grade_band?: string;
        requested_minutes?: number;
        child_message?: string;
    };
    resolution?: {
        resolved_by?: string;
        parent_note?: string;
        resulting_session_id?: string;
    };
}

// --- Policy ---

export interface Policy {
    policy_id: string;
    child_id: string;
    policy_type: string;
    value: unknown;
    updated_at: string;
    updated_by?: string;
}

export interface CurriculumGoal {
    goal_id: string;
    child_id: string;
    scope_tag: string;
    description: string;
    target_skill_ids?: string[];
    priority: 'high' | 'medium' | 'low';
    status: 'active' | 'completed' | 'paused';
    created_at: string;
    completed_at?: string;
}

// =============================================================================
// v1.1 — Household Identity
// =============================================================================

export interface Parent {
    parent_id: string;
    email: string;
    password_hash: string;          // bcrypt; never sent to client
    mfa_enabled: boolean;
    passkey_enabled: boolean;
    created_at: string;
}

export interface Household {
    household_id: string;
    parent_id: string;
    settings_json: Record<string, unknown>;
}

/** Stored entity — child profile under a household. No password or PIN. */
export interface ChildProfile {
    child_id: string;
    household_id: string;
    display_name: string;
    avatar_id: string;
    preferred_mode: TriadMode | null;     // null until enough data to bias
    accessibility_skip_hints: boolean;    // if true, hint ladder jumps to bottom-out
    created_at: string;
}

/** Per-child, per-mode selection counters for preference learning. */
export interface ChildModeStats {
    child_id: string;
    mode: TriadMode;
    recent_count: number;    // rolling window (last N sessions)
    lifetime_count: number;
    updated_at: string;
}

// =============================================================================
// v1.1 — Worlds Layer
// =============================================================================

export interface World {
    world_id: string;
    name: string;            // e.g. "Spelling Kingdom"
    icon: string;            // asset reference key
    enabled: boolean;        // global enable (admin override)
    skill_ids: string[];     // skills accessible within this world
    scope_tags: ScopeTag[];  // policy scope tags for this world
}

export interface HouseholdEnabledWorld {
    household_id: string;
    world_id: string;
    enabled: boolean;        // per-household override
}

// =============================================================================
// v1.1 — LearningBundle (Triad Session Artifact)
// =============================================================================

export interface PlayConfig {
    engine_type: EngineType;
    template_id: TemplateId;
    params: {
        item_count: number;
        difficulty_level: number;
        [key: string]: unknown;
    };
}

/**
 * Binds Talk / Practice / Play around a single skill focus for a session.
 * Created once at session start; reused across all mode switches.
 * Must not require a live LLM call to construct.
 */
export interface LearningBundle {
    bundle_id: string;
    session_id: string;
    child_id: string;
    skill_id: string;
    world_id: string | null;
    talk_plan_id: string;        // opaque ref to scripted talk steps; schema deferred
    practice_set_ids: string[];  // content_ids selected for Practice mode
    play_config: PlayConfig;
    constraints_hash: string;    // SHA-256 of canonical item_generator_rules JSON
    created_at: string;
}

// =============================================================================
// v1.1 — Hint Ladder State
// =============================================================================

export const HINT_RUNGS: HintRung[] = [
    'nudge',
    'strategy',
    'worked_example',
    'partial_fill',
    'bottom_out',
];

/**
 * Tracked inside engine_state per content instance attempt.
 * Resets to 0 when current_content_id changes.
 */
export interface HintLadderState {
    hint_level: number;                       // 0-based index into HINT_RUNGS
    near_transfer_scheduled: boolean;
    near_transfer_content_id: string | null;  // content_id of queued follow-up item
}

// =============================================================================
// v1.1 — Out-of-scope Redirect
// =============================================================================

/** One entry in the safe alternatives list returned on policy denial. */
export interface SafeAlternative {
    skill_id: string;
    world_id: string | null;
    display_label: string;   // child-friendly e.g. "Spelling"
}

/**
 * Returned by the policy engine when a request is denied.
 * Computed deterministically from household_enabled_worlds + current policy.
 * Does NOT require an LLM call.
 */
export interface DenialResponse {
    denial_reason_code: DenialReasonCode;
    safe_alternatives: SafeAlternative[];  // always 2–3 entries
    approval_id: string | null;            // ApprovalRequest created in background
}

// =============================================================================
// v1.1 — Session v1.1 extension
// =============================================================================

/**
 * Extends the existing Session interface for v1.1.
 * Adds current_mode and bundle_id; replaces legacy SessionMode with TriadMode.
 */
export interface SessionV11 extends Omit<Session, 'mode'> {
    current_mode: TriadMode;
    bundle_id: string | null;
}

// =============================================================================
// v1.1 — Telemetry Event Catalog (typed discriminated union)
// =============================================================================

/** Base fields present on every telemetry event. */
export interface TelemetryEventBase {
    event_id: string;           // UUID
    occurred_at: string;        // ISO 8601
    session_id: string | null;  // null for auth events outside a session
    child_id: string | null;
    household_id: string;
}

// --- Auth Events ---
export interface EvtParentRegistered extends TelemetryEventBase {
    event_name: 'auth.parent_registered';
    payload: { household_id: string };
}
export interface EvtMfaEnrolled extends TelemetryEventBase {
    event_name: 'auth.mfa_enrolled';
    payload: { mfa_type: MfaType };
}
export interface EvtLoginSuccess extends TelemetryEventBase {
    event_name: 'auth.login_success';
    payload: { role: 'parent'; mfa_used: boolean };
}
export interface EvtLoginFailed extends TelemetryEventBase {
    event_name: 'auth.login_failed';
    payload: { reason: string };
}
export interface EvtParentSessionStarted extends TelemetryEventBase {
    event_name: 'auth.parent_session_started';
    payload: { token_expiry_at: string };
}
export interface EvtParentSessionExpired extends TelemetryEventBase {
    event_name: 'auth.parent_session_expired';
    payload: { idle_seconds: number };
}
export interface EvtParentSessionTimeout extends TelemetryEventBase {
    event_name: 'auth.parent_session_timeout';
    payload: Record<string, never>;
}

// --- Child / Profile Events ---
export interface EvtChildSessionStarted extends TelemetryEventBase {
    event_name: 'child.session_started';
    payload: { child_id: string; profile_avatar_id: string };
}
export interface EvtChildProfileSelected extends TelemetryEventBase {
    event_name: 'child.profile_selected';
    payload: { child_id: string };
}
export interface EvtPreferredModeUpdated extends TelemetryEventBase {
    event_name: 'child.preferred_mode_updated';
    payload: { child_id: string; new_mode: TriadMode; selection_count: number };
}
export interface EvtModeBiasApplied extends TelemetryEventBase {
    event_name: 'child.mode_bias_applied';
    payload: { child_id: string; biased_toward: TriadMode };
}

// --- Session / Triad Mode Events ---
export interface EvtModeOffered extends TelemetryEventBase {
    event_name: 'session.mode_offered';
    payload: { modes: TriadMode[] };
}
export interface EvtModeSelected extends TelemetryEventBase {
    event_name: 'session.mode_selected';
    payload: { mode: TriadMode; is_initial_selection: boolean };
}
export interface EvtModeSwitched extends TelemetryEventBase {
    event_name: 'session.mode_switched';
    payload: { from_mode: TriadMode; to_mode: TriadMode; bundle_id: string };
}
export interface EvtSummaryCreated extends TelemetryEventBase {
    event_name: 'session.summary_created';
    payload: {
        session_id: string;
        duration_seconds: number;
        accuracy: number;
        stars_earned: number;
        mastery_achieved: boolean;
    };
}

// --- Talk Events ---
export interface EvtTalkAnswerGiven extends TelemetryEventBase {
    event_name: 'talk.answer_given';
    payload: { skill_id: string; word_count: number; scope_valid: boolean };
}
export interface EvtTalkPracticeOffered extends TelemetryEventBase {
    event_name: 'talk.practice_offered';
    payload: { skill_id: string; drillable: true };
}
export interface EvtTalkOutOfScopeBlocked extends TelemetryEventBase {
    event_name: 'talk.out_of_scope_blocked';
    payload: { requested_scope_tag: ScopeTag | string };
}

// --- Hint Events ---
export interface EvtHintRequested extends TelemetryEventBase {
    event_name: 'hint.requested';
    payload: { content_id: string; hint_level_before: number };
}
export interface EvtHintRungServed extends TelemetryEventBase {
    event_name: 'hint.rung_served';
    payload: {
        content_id: string;
        rung: 1 | 2 | 3 | 4 | 5;
        rung_name: HintRung;
        hint_level_after: number;
    };
}
export interface EvtHintBottomOutReached extends TelemetryEventBase {
    event_name: 'hint.bottom_out_reached';
    payload: { content_id: string; skill_id: string };
}
export interface EvtHintNearTransferScheduled extends TelemetryEventBase {
    event_name: 'hint.near_transfer_scheduled';
    payload: {
        original_content_id: string;
        near_transfer_content_id: string;
        skill_id: string;
    };
}

// --- Bundle Events ---
export interface EvtBundleCreated extends TelemetryEventBase {
    event_name: 'bundle.created';
    payload: { bundle_id: string; skill_id: string; world_id: string | null };
}
export interface EvtBundleModeReused extends TelemetryEventBase {
    event_name: 'bundle.mode_reused';
    payload: { bundle_id: string; mode: TriadMode };
}

// --- Policy / Denial Events ---
export interface EvtPolicyRequestDenied extends TelemetryEventBase {
    event_name: 'policy.request_denied';
    payload: {
        denial_reason_code: DenialReasonCode;
        requested_scope_tag?: ScopeTag | string;
        requested_skill_id?: string;
    };
}
export interface EvtSafeAlternativesGenerated extends TelemetryEventBase {
    event_name: 'policy.safe_alternatives_generated';
    payload: { alternatives: Array<{ skill_id: string; world_id: string | null }> };
}
export interface EvtApprovalRequestCreated extends TelemetryEventBase {
    event_name: 'approval.request_created';
    payload: {
        approval_id: string;
        request_type: ApprovalRequestType;
        denial_reason_code: DenialReasonCode;
    };
}

// --- Reward Events ---
export interface EvtStarsEarned extends TelemetryEventBase {
    event_name: 'reward.stars_earned';
    payload: { amount: number; reason: StarReason; balance_after: number };
}
export interface EvtMasteryBonus extends TelemetryEventBase {
    event_name: 'reward.mastery_bonus';
    payload: { skill_id: string; amount: number };
}
export interface EvtUnlockableEarned extends TelemetryEventBase {
    event_name: 'reward.unlockable_earned';
    payload: { unlockable_id: string; category: UnlockableCategory };
}
export interface EvtBadgeEarned extends TelemetryEventBase {
    event_name: 'reward.badge_earned';
    payload: { badge_id: string; strip_slot_index: number };
}

// --- Flag Events ---
export interface EvtFlagMisconceptionLoop extends TelemetryEventBase {
    event_name: 'flag.misconception_loop';
    payload: {
        child_id: string;
        skill_id: string;
        pattern: string;
        consecutive_count: number;
    };
}
export interface EvtFlagOutOfScope extends TelemetryEventBase {
    event_name: 'flag.out_of_scope';
    payload: { child_id: string; requested_scope_tag: string; approval_id: string };
}
export interface EvtFlagSafetyEvent extends TelemetryEventBase {
    event_name: 'flag.safety_event';
    payload: { child_id: string; filter_type: string; content_id: string | null };
}

// --- Worlds Events ---
export interface EvtWorldsEnabledChanged extends TelemetryEventBase {
    event_name: 'worlds.enabled_changed';
    payload: { household_id: string; world_id: string; enabled: boolean };
}

/**
 * Master discriminated union of every telemetry event.
 * Use event_name as the discriminant for exhaustive switch handling.
 */
export type TelemetryEvent =
    | EvtParentRegistered
    | EvtMfaEnrolled
    | EvtLoginSuccess
    | EvtLoginFailed
    | EvtParentSessionStarted
    | EvtParentSessionExpired
    | EvtParentSessionTimeout
    | EvtChildSessionStarted
    | EvtChildProfileSelected
    | EvtPreferredModeUpdated
    | EvtModeBiasApplied
    | EvtModeOffered
    | EvtModeSelected
    | EvtModeSwitched
    | EvtSummaryCreated
    | EvtTalkAnswerGiven
    | EvtTalkPracticeOffered
    | EvtTalkOutOfScopeBlocked
    | EvtHintRequested
    | EvtHintRungServed
    | EvtHintBottomOutReached
    | EvtHintNearTransferScheduled
    | EvtBundleCreated
    | EvtBundleModeReused
    | EvtPolicyRequestDenied
    | EvtSafeAlternativesGenerated
    | EvtApprovalRequestCreated
    | EvtStarsEarned
    | EvtMasteryBonus
    | EvtUnlockableEarned
    | EvtBadgeEarned
    | EvtFlagMisconceptionLoop
    | EvtFlagOutOfScope
    | EvtFlagSafetyEvent
    | EvtWorldsEnabledChanged;

/** Utility: extract the payload type for a given event name. */
export type TelemetryPayload<T extends TelemetryEvent['event_name']> =
    Extract<TelemetryEvent, { event_name: T }>['payload'];
