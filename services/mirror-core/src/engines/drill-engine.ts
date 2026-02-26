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
} from '../db/queries.js';

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

export async function startDrillSession(
    skillId: string,
    childId: string = DEFAULT_CHILD_ID,
): Promise<{ sessionId: string }> {
    const spec = await getSkillSpec(skillId);
    if (!spec) throw new Error(`Skill not found: ${skillId}`);
    if (!spec.allowed_engine_types.includes('MICRO_SKILL_DRILL')) {
        throw new Error(`Skill ${skillId} does not support MICRO_SKILL_DRILL`);
    }

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
    };

    activeSessions.set(session.session_id, state);

    return { sessionId: session.session_id };
}

export async function getNextItem(sessionId: string): Promise<PromptPayload> {
    const state = activeSessions.get(sessionId);
    if (!state) throw new Error(`No active session: ${sessionId}`);

    state.currentItemIndex++;
    state.hintsUsedForCurrentItem = 0;

    // If we've exhausted the pool, reshuffle
    if (state.currentItemIndex >= state.contentPool.length) {
        state.contentPool = shuffleArray(state.contentPool);
        state.currentItemIndex = 0;
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
    } else {
        state.streak = 0;
        soundEffect = 'incorrect';
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
                if (newContent.length > 0) {
                    state.contentPool = shuffleArray(newContent);
                    state.currentItemIndex = -1;
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
        hint_text: matchedMisconception?.hint_text
            ?? 'Try sounding out each letter one at a time. What sound does each letter make?',
        hint_style: style,
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
