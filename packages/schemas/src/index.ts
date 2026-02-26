// =============================================================================
// Magic Mirror Tutor: Shared TypeScript Types
// Generated from Phase 0 JSON Schemas
// =============================================================================

// --- Enums ---

export type EngineType = 'MICRO_SKILL_DRILL' | 'MATCH_SORT_CLASSIFY' | 'STORY_MICROTASKS';
export type TemplateId = 'tap_choice' | 'drag_bins' | 'type_in_blank' | 'match_pairs' | 'story_page' | 'comprehension_q';
export type InteractionType = 'tap' | 'drag' | 'type' | 'voice_response' | 'word_tap';
export type GradeBand = 'PK' | 'K' | '1' | '2' | '3';
export type ContentSource = 'CURATED' | 'LLM_GENERATED' | 'MIXED';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'timed_out';
export type SessionMode = 'learning' | 'game';
export type ApprovalStatus = 'requested' | 'notified' | 'approved' | 'denied' | 'expired' | 'fulfilled';
export type ApprovalRequestType = 'scope_change' | 'skill_change' | 'time_extension' | 'game_mode';
export type HintStyle = 'text' | 'audio' | 'highlight' | 'eliminate_wrong' | 'show_example';
export type SoundEffect = 'correct' | 'incorrect' | 'streak_3' | 'streak_5' | 'streak_10' | 'mastery' | 'level_up';
export type MasteryState = 'in_progress' | 'mastery_gate' | 'mastered' | 'remediation';
export type AnswerMethod = 'exact_match' | 'set_match' | 'ordered_match' | 'fuzzy_match';
export type ScopeTag = 'reading' | 'phonics' | 'sight_words' | 'comprehension' | 'vocabulary' | 'spelling' | 'math' | 'science';
export type UnlockableCategory = 'theme' | 'character' | 'background' | 'sound_pack' | 'badge';
export type StarReason = 'correct_answer' | 'streak_bonus' | 'mastery_bonus' | 'level_up' | 'reward_redeemed' | 'unlockable_purchased' | 'admin_adjustment';
export type ContentGenProvider = 'mercury2' | 'openai' | 'fallback_curated';
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
