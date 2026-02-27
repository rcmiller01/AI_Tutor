import { randomUUID } from 'node:crypto';
import type {
    SkillSpec,
    ContentObject,
    ScoreResult,
    HintPayload,
    PromptPayload,
    SessionStats,
    MasteryStatus,
    SoundEffect,
    TapChoiceItem,
} from '@mirror/schemas';
import {
    getSkillSpec,
    getContentBySkillAndDifficulty,
    insertSession,
    updateSession,
    insertSessionEvent,
    getChildProfile,
} from '../db/queries.js';
import { generateContentBatch } from '../services/content-generator.js';
import { emitEvent, type TelemetryContext } from '../db/telemetry.js';

// Threshold for misconception loop flag
const MISCONCEPTION_LOOP_THRESHOLD = 3;

// ─── In-Memory Session State ─────────────────────────────────

interface DrillState {
    sessionId: string;
    skillSpec: SkillSpec;
    difficulty: number;
    contentPool: ContentObject[];
    currentItemIndex: number;
    currentContentId: string | null;
    hintsUsedForCurrentItem: number;
    itemsAttemptedAtLevel: number;
    itemsCorrectAtLevel: number;
    streak: number;
    bestStreak: number;
    totalStarsEarned: number;
    totalItemsAttempted: number;
    totalItemsCorrect: number;
    totalHintsUsed: number;
    // Misconception loop tracking
    consecutiveWrongCount: number;
    lastMisconceptionPattern: string | null;
    childId: string;
    householdId: string;
}

const activeSessions = new Map<string, DrillState>();

// ─── Streak Multiplier ───────────────────────────────────────

function getStreakMultiplier(streak: number): number {
    if (streak >= 10) return 3;
    if (streak >= 5) return 2;
    if (streak >= 3) return 1.5;
    return 1;
}

function getStreakSound(streak: number): SoundEffect | undefined {
    if (streak === 10) return 'streak_10';
    if (streak === 5) return 'streak_5';
    if (streak === 3) return 'streak_3';
    return undefined;
}

// ─── Public API ──────────────────────────────────────────────

const DEFAULT_CHILD_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001';

export async function startDrillSession(
    skillId: string,
    childId: string = DEFAULT_CHILD_ID,
    householdId?: string,
): Promise<{ sessionId: string }> {
    const spec = await getSkillSpec(skillId);
    if (!spec) throw new Error(`Skill not found: ${skillId}`);
    if (!spec.allowed_engine_types.includes('MICRO_SKILL_DRILL')) {
        throw new Error(`Skill ${skillId} does not support MICRO_SKILL_DRILL`);
    }

    // Get household ID from child profile if not provided
    let resolvedHouseholdId = householdId;
    if (!resolvedHouseholdId && childId !== DEFAULT_CHILD_ID) {
        const profile = await getChildProfile(childId);
        resolvedHouseholdId = profile?.household_id ?? DEFAULT_HOUSEHOLD_ID;
    }
    resolvedHouseholdId = resolvedHouseholdId ?? DEFAULT_HOUSEHOLD_ID;

    const startDifficulty = 1;
    const content = await getContentBySkillAndDifficulty(skillId, 'tap_choice', startDifficulty);
    if (content.length === 0) {
        throw new Error(`No content for skill ${skillId} at difficulty ${startDifficulty}`);
    }

    const session = await insertSession({
        child_id: childId,
        skill_id: skillId,
        engine_type: 'MICRO_SKILL_DRILL',
        mode: 'learning',
        difficulty_level: startDifficulty,
    });

    const state: DrillState = {
        sessionId: session.session_id,
        skillSpec: spec,
        difficulty: startDifficulty,
        contentPool: shuffleArray(content),
        currentItemIndex: -1,
        currentContentId: null,
        hintsUsedForCurrentItem: 0,
        itemsAttemptedAtLevel: 0,
        itemsCorrectAtLevel: 0,
        streak: 0,
        bestStreak: 0,
        totalStarsEarned: 0,
        totalItemsAttempted: 0,
        totalItemsCorrect: 0,
        totalHintsUsed: 0,
        // Misconception loop tracking
        consecutiveWrongCount: 0,
        lastMisconceptionPattern: null,
        childId,
        householdId: resolvedHouseholdId,
    };

    activeSessions.set(session.session_id, state);

    return { sessionId: session.session_id };
}

export async function getNextItem(sessionId: string): Promise<PromptPayload> {
    const state = activeSessions.get(sessionId);
    if (!state) throw new Error(`No active session: ${sessionId}`);

    state.currentItemIndex++;
    state.hintsUsedForCurrentItem = 0;

    // If we've exhausted the pool, reshuffle + try to load newly generated items
    if (state.currentItemIndex >= state.contentPool.length) {
        // Fetch fresh from DB in case background generation finished
        const freshContent = await getContentBySkillAndDifficulty(
            state.skillSpec.skill_id, 'tap_choice', state.difficulty, 50
        );
        state.contentPool = shuffleArray(freshContent.length > 0 ? freshContent : state.contentPool);
        state.currentItemIndex = 0;
    }

    // Trigger background generation if pool is running low (< 8 items)
    if (state.contentPool.length < 8) {
        generateContentBatch({
            skill_id: state.skillSpec.skill_id,
            template_id: 'tap_choice',
            difficulty_level: state.difficulty,
            batch_size: 10,
        }).catch(err => console.error('Background content gen failed:', err));
    }

    const content = state.contentPool[state.currentItemIndex];
    state.currentContentId = content.content_id;

    const payload = content.payload as TapChoiceItem;
    const itemsPerLevel = state.skillSpec.difficulty_ladder?.items_per_level ?? 10;

    return {
        prompt_id: randomUUID(),
        session_id: sessionId,
        content_id: content.content_id,
        template_id: 'tap_choice',
        widget_type: 'TapChoice',
        content: {
            type: payload.type,
            prompt_text: payload.prompt_text,
            prompt_audio_key: payload.prompt_audio_key,
            choices: payload.choices.map((c) => ({
                choice_id: c.choice_id,
                label: c.label,
                image_key: c.image_key,
            })),
            // Note: correct_choice_id is NOT sent to client
        },
        allowed_interactions: ['tap'],
        instruction_text: payload.prompt_text,
        progress: {
            current_item: state.itemsAttemptedAtLevel + 1,
            total_items: itemsPerLevel,
            current_difficulty: state.difficulty,
            stars_session_total: state.totalStarsEarned,
            streak_current: state.streak,
        },
    };
}

export async function submitInteraction(
    sessionId: string,
    choiceId: string,
    responseTimeMs?: number,
): Promise<ScoreResult> {
    const state = activeSessions.get(sessionId);
    if (!state) throw new Error(`No active session: ${sessionId}`);
    if (!state.currentContentId) throw new Error('No current item');

    const content = state.contentPool[state.currentItemIndex];
    const payload = content.payload as TapChoiceItem;
    const isCorrect = payload.correct_choice_id === choiceId;

    state.totalItemsAttempted++;
    state.itemsAttemptedAtLevel++;

    let starsEarned = 0;
    let soundEffect: SoundEffect | undefined;

    if (isCorrect) {
        state.totalItemsCorrect++;
        state.itemsCorrectAtLevel++;
        state.streak++;
        if (state.streak > state.bestStreak) state.bestStreak = state.streak;

        const multiplier = getStreakMultiplier(state.streak);
        const hintPenalty = state.hintsUsedForCurrentItem > 0
            ? (state.skillSpec.hint_policy?.hint_penalty ?? 0.5)
            : 1;
        starsEarned = Math.round((state.skillSpec.stars_per_correct ?? 1) * multiplier * hintPenalty);
        state.totalStarsEarned += starsEarned;

        soundEffect = getStreakSound(state.streak) ?? 'correct';

        // Reset misconception tracking on correct answer
        state.consecutiveWrongCount = 0;
        state.lastMisconceptionPattern = null;
    } else {
        state.streak = 0;
        soundEffect = 'incorrect';

        // Track misconception pattern
        const misconceptionPattern = detectMisconceptionPattern(state.skillSpec, choiceId, payload);
        if (misconceptionPattern) {
            if (state.lastMisconceptionPattern === misconceptionPattern) {
                state.consecutiveWrongCount++;
            } else {
                state.consecutiveWrongCount = 1;
                state.lastMisconceptionPattern = misconceptionPattern;
            }

            // Emit flag if threshold reached
            if (state.consecutiveWrongCount >= MISCONCEPTION_LOOP_THRESHOLD) {
                const telemetryCtx: TelemetryContext = {
                    session_id: sessionId,
                    child_id: state.childId,
                    household_id: state.householdId,
                };
                emitEvent('flag.misconception_loop', {
                    child_id: state.childId,
                    skill_id: state.skillSpec.skill_id,
                    pattern: misconceptionPattern,
                    consecutive_count: state.consecutiveWrongCount,
                }, telemetryCtx).catch(err => console.error('Failed to emit misconception flag:', err));
            }
        }
    }

    // Check mastery / level progression
    const ladder = state.skillSpec.difficulty_ladder ?? { levels: 5, promotion_threshold: 0.85, demotion_threshold: 0.4, items_per_level: 10 };
    const masteryStatus = evaluateMastery(state, ladder);

    // Handle level changes
    if (masteryStatus.state === 'mastery_gate') {
        const accuracy = state.itemsCorrectAtLevel / state.itemsAttemptedAtLevel;
        if (accuracy >= ladder.promotion_threshold) {
            if (state.difficulty >= ladder.levels) {
                // Check overall mastery
                const mt = state.skillSpec.mastery_threshold;
                const overallAccuracy = state.totalItemsCorrect / state.totalItemsAttempted;
                if (overallAccuracy >= mt.min_accuracy && state.totalItemsAttempted >= mt.min_items) {
                    masteryStatus.state = 'mastered';
                    starsEarned += state.skillSpec.stars_mastery_bonus ?? 10;
                    state.totalStarsEarned += state.skillSpec.stars_mastery_bonus ?? 10;
                    soundEffect = 'mastery';
                }
            } else {
                state.difficulty++;
                state.itemsAttemptedAtLevel = 0;
                state.itemsCorrectAtLevel = 0;
                // Load new content for higher difficulty
                const newContent = await getContentBySkillAndDifficulty(
                    state.skillSpec.skill_id, 'tap_choice', state.difficulty,
                );

                // If we don't have enough, trigger generation for the NEW level right away
                if (newContent.length < 10) {
                    generateContentBatch({
                        skill_id: state.skillSpec.skill_id,
                        template_id: 'tap_choice',
                        difficulty_level: state.difficulty,
                        batch_size: 10,
                    }).catch(() => { });
                }

                if (newContent.length > 0) {
                    state.contentPool = shuffleArray(newContent);
                    state.currentItemIndex = -1;
                } else {
                    // Stay at same level if NO content is ready right now, but we've triggered the build
                    state.difficulty--;
                    state.contentPool = shuffleArray(state.contentPool);
                    state.currentItemIndex = -1;
                    console.warn(`[DrillEngine] No content for level ${state.difficulty + 1} yet, staying at level ${state.difficulty}`);
                }
                soundEffect = 'level_up';
            }
        } else if (accuracy <= ladder.demotion_threshold && state.difficulty > 1) {
            state.difficulty--;
            state.itemsAttemptedAtLevel = 0;
            state.itemsCorrectAtLevel = 0;
            const newContent = await getContentBySkillAndDifficulty(
                state.skillSpec.skill_id, 'tap_choice', state.difficulty,
            );
            if (newContent.length > 0) {
                state.contentPool = shuffleArray(newContent);
                state.currentItemIndex = -1;
            }
        } else {
            // Stay at same level, reset counter
            state.itemsAttemptedAtLevel = 0;
            state.itemsCorrectAtLevel = 0;
        }
    }

    // Build hint if incorrect and hints remain
    let hint: HintPayload | undefined;
    if (!isCorrect) {
        const maxHints = state.skillSpec.hint_policy?.max_hints_per_item ?? 2;
        const hintsRemaining = maxHints - state.hintsUsedForCurrentItem;
        if (hintsRemaining > 0) {
            hint = buildHint(state, choiceId, hintsRemaining);
        }
    }

    const result: ScoreResult = {
        is_correct: isCorrect,
        stars_earned: starsEarned,
        streak: {
            current: state.streak,
            best: state.bestStreak,
            multiplier: getStreakMultiplier(state.streak),
        },
        mastery_status: masteryStatus,
        hint,
        sound_effect: soundEffect,
    };

    // Persist event
    await insertSessionEvent({
        session_id: sessionId,
        content_id: state.currentContentId,
        interaction_type: 'tap',
        value: { type: 'tap', choice_id: choiceId },
        response_time_ms: responseTimeMs,
        score_result: result,
    });

    // Update session stats
    const stats: SessionStats = {
        items_attempted: state.totalItemsAttempted,
        items_correct: state.totalItemsCorrect,
        accuracy: state.totalItemsAttempted > 0 ? state.totalItemsCorrect / state.totalItemsAttempted : 0,
        best_streak: state.bestStreak,
        hints_used: state.totalHintsUsed,
        stars_earned: state.totalStarsEarned,
        mastery_achieved: masteryStatus.state === 'mastered',
    };
    await updateSession(sessionId, { stats, difficulty_level: state.difficulty });

    return result;
}

export async function requestHint(sessionId: string): Promise<HintPayload> {
    const state = activeSessions.get(sessionId);
    if (!state) throw new Error(`No active session: ${sessionId}`);

    const maxHints = state.skillSpec.hint_policy?.max_hints_per_item ?? 2;
    const hintsRemaining = maxHints - state.hintsUsedForCurrentItem;
    if (hintsRemaining <= 0) throw new Error('No hints remaining for this item');

    state.hintsUsedForCurrentItem++;
    state.totalHintsUsed++;

    return buildHint(state, undefined, hintsRemaining - 1);
}

export function getSessionState(sessionId: string): DrillState | undefined {
    return activeSessions.get(sessionId);
}

// ─── Helpers ─────────────────────────────────────────────────

function evaluateMastery(
    state: DrillState,
    ladder: { items_per_level: number; promotion_threshold: number },
): MasteryStatus {
    const isGate = state.itemsAttemptedAtLevel >= ladder.items_per_level;
    const accuracy = state.itemsAttemptedAtLevel > 0
        ? state.itemsCorrectAtLevel / state.itemsAttemptedAtLevel
        : 0;

    return {
        state: isGate ? 'mastery_gate' : 'in_progress',
        accuracy,
        items_completed: state.itemsAttemptedAtLevel,
        items_remaining: isGate ? 0 : ladder.items_per_level - state.itemsAttemptedAtLevel,
        current_difficulty: state.difficulty,
        max_difficulty: state.skillSpec.difficulty_ladder?.levels ?? 5,
    };
}

function buildHint(state: DrillState, _wrongChoiceId?: string, hintsRemaining?: number): HintPayload {
    // Try to match a misconception pattern
    const misconceptions = state.skillSpec.misconceptions ?? [];
    const matchedMisconception = misconceptions.length > 0 ? misconceptions[0] : null;

    const styles = state.skillSpec.hint_policy?.allowed_hint_styles ?? ['text'];
    const style = styles[Math.min(state.hintsUsedForCurrentItem, styles.length - 1)];

    return {
        rung_name: 'nudge', // Legacy/stub
        hint_text: matchedMisconception?.hint_text
            ?? 'Try sounding out each letter one at a time. What sound does each letter make?',
        hint_style: style as any,
        hint_audio_key: matchedMisconception?.hint_audio_key,
        hints_remaining: hintsRemaining ?? 0,
    };
}

function shuffleArray<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Detect if a wrong answer matches a known misconception pattern.
 * Returns the pattern name if matched, null otherwise.
 */
function detectMisconceptionPattern(
    skillSpec: SkillSpec,
    wrongChoiceId: string,
    payload: TapChoiceItem,
): string | null {
    const misconceptions = skillSpec.misconceptions ?? [];
    if (misconceptions.length === 0) return null;

    // Find the wrong choice that was selected
    const wrongChoice = payload.choices.find(c => c.choice_id === wrongChoiceId);
    if (!wrongChoice) return null;

    // Check against known misconception patterns
    for (const misconception of misconceptions) {
        const pattern = misconception.pattern.toLowerCase();
        const choiceLabel = wrongChoice.label.toLowerCase();

        // Simple pattern matching: check if the choice matches the misconception pattern
        if (choiceLabel.includes(pattern) || pattern.includes(choiceLabel)) {
            return misconception.pattern;
        }

        // Regex pattern matching for more complex patterns
        try {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(choiceLabel)) {
                return misconception.pattern;
            }
        } catch {
            // Invalid regex, skip
        }
    }

    // Generic pattern: track repeated wrong choice selections
    return `wrong_choice:${wrongChoiceId}`;
}
