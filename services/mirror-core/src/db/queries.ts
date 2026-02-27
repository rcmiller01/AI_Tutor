import { randomUUID } from 'node:crypto';
import { getOne, getMany, query } from './pool.js';
import type {
    SkillSpec,
    Session,
    SessionV11,
    SessionStats,
    ContentObject,
    ScoreResult,
    LearningBundle,
    PlayConfig,
    TriadMode,
} from '@mirror/schemas';

// ─── Skill Specs ─────────────────────────────────────────────

interface SkillSpecRow {
    skill_id: string;
    version: number;
    grade_band: string;
    objective: string;
    spec_data: SkillSpec;
}

export async function getSkillSpec(skillId: string): Promise<SkillSpec | null> {
    const row = await getOne<SkillSpecRow>(
        'SELECT * FROM skill_specs WHERE skill_id = $1',
        [skillId],
    );
    if (!row) return null;
    return { ...row.spec_data, skill_id: row.skill_id, version: row.version };
}

export async function listSkillSpecs(): Promise<
    { skill_id: string; grade_band: string; objective: string; version: number }[]
> {
    return getMany(
        'SELECT skill_id, grade_band, objective, version FROM skill_specs ORDER BY skill_id',
    );
}

export async function upsertSkillSpec(spec: SkillSpec): Promise<void> {
    await query(
        `INSERT INTO skill_specs (skill_id, version, grade_band, objective, spec_data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (skill_id) DO UPDATE SET
       version = EXCLUDED.version,
       grade_band = EXCLUDED.grade_band,
       objective = EXCLUDED.objective,
       spec_data = EXCLUDED.spec_data,
       updated_at = NOW()`,
        [spec.skill_id, spec.version, spec.grade_band, spec.objective, JSON.stringify(spec)],
    );
}

// ─── Content Objects ─────────────────────────────────────────

interface ContentRow {
    content_id: string;
    skill_id: string;
    engine_type: string;
    template_id: string;
    version: number;
    source: string;
    difficulty_level: number;
    payload: Record<string, unknown>;
    created_at: string;
}

export async function getContentBySkillAndDifficulty(
    skillId: string,
    templateId: string,
    difficultyLevel: number,
    limit = 20,
): Promise<ContentObject[]> {
    const rows = await getMany<ContentRow>(
        `SELECT * FROM content_objects
     WHERE skill_id = $1 AND template_id = $2 AND difficulty_level = $3
     ORDER BY RANDOM()
     LIMIT $4`,
        [skillId, templateId, difficultyLevel, limit],
    );
    return rows.map((r) => ({
        content_id: r.content_id,
        skill_id: r.skill_id,
        engine_type: r.engine_type as ContentObject['engine_type'],
        template_id: r.template_id as ContentObject['template_id'],
        version: r.version,
        source: r.source as ContentObject['source'],
        difficulty_level: r.difficulty_level,
        payload: r.payload as unknown as ContentObject['payload'],
        created_at: r.created_at,
    }));
}

export async function insertContentObject(obj: {
    skill_id: string;
    engine_type: string;
    template_id: string;
    source: string;
    difficulty_level: number;
    payload: Record<string, unknown>;
}): Promise<string> {
    const id = randomUUID();
    await query(
        `INSERT INTO content_objects (content_id, skill_id, engine_type, template_id, source, difficulty_level, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, obj.skill_id, obj.engine_type, obj.template_id, obj.source, obj.difficulty_level, JSON.stringify(obj.payload)],
    );
    return id;
}

// ─── Sessions ────────────────────────────────────────────────

interface SessionRow {
    session_id: string;
    child_id: string;
    skill_id: string;
    engine_type: string;
    mode: string;
    status: string;
    difficulty_level: number;
    random_seed: number | null;
    stats: SessionStats;
    engine_state: unknown;
    approval_id: string | null;
    started_at: string;
    paused_at: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
}

function rowToSession(r: SessionRow): Session {
    return {
        session_id: r.session_id,
        child_id: r.child_id,
        skill_id: r.skill_id,
        engine_type: r.engine_type as Session['engine_type'],
        mode: r.mode as Session['mode'],
        status: r.status as Session['status'],
        difficulty_level: r.difficulty_level,
        random_seed: r.random_seed ?? undefined,
        stats: r.stats,
        engine_state: r.engine_state,
        started_at: r.started_at,
        paused_at: r.paused_at ?? undefined,
        ended_at: r.ended_at ?? undefined,
        duration_seconds: r.duration_seconds ?? undefined,
        approval_id: r.approval_id ?? undefined,
    };
}

export async function insertSession(session: {
    child_id: string;
    skill_id: string;
    engine_type: string;
    mode: string;
    difficulty_level: number;
}): Promise<Session> {
    const id = randomUUID();
    const defaultStats: SessionStats = {
        items_attempted: 0,
        items_correct: 0,
        accuracy: 0,
        best_streak: 0,
        hints_used: 0,
        stars_earned: 0,
        mastery_achieved: false,
    };
    const row = await getOne<SessionRow>(
        `INSERT INTO sessions (session_id, child_id, skill_id, engine_type, mode, difficulty_level, stats)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
        [id, session.child_id, session.skill_id, session.engine_type, session.mode, session.difficulty_level, JSON.stringify(defaultStats)],
    );
    return rowToSession(row!);
}

export async function getSession(sessionId: string): Promise<Session | null> {
    const row = await getOne<SessionRow>(
        'SELECT * FROM sessions WHERE session_id = $1',
        [sessionId],
    );
    return row ? rowToSession(row) : null;
}

export async function updateSession(
    sessionId: string,
    updates: Partial<Pick<Session, 'status' | 'difficulty_level' | 'stats' | 'engine_state' | 'paused_at' | 'ended_at' | 'duration_seconds'>>,
): Promise<Session> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (updates.status !== undefined) { sets.push(`status = $${i++}`); vals.push(updates.status); }
    if (updates.difficulty_level !== undefined) { sets.push(`difficulty_level = $${i++}`); vals.push(updates.difficulty_level); }
    if (updates.stats !== undefined) { sets.push(`stats = $${i++}`); vals.push(JSON.stringify(updates.stats)); }
    if (updates.engine_state !== undefined) { sets.push(`engine_state = $${i++}`); vals.push(JSON.stringify(updates.engine_state)); }
    if (updates.paused_at !== undefined) { sets.push(`paused_at = $${i++}`); vals.push(updates.paused_at); }
    if (updates.ended_at !== undefined) { sets.push(`ended_at = $${i++}`); vals.push(updates.ended_at); }
    if (updates.duration_seconds !== undefined) { sets.push(`duration_seconds = $${i++}`); vals.push(updates.duration_seconds); }

    vals.push(sessionId);
    const row = await getOne<SessionRow>(
        `UPDATE sessions SET ${sets.join(', ')} WHERE session_id = $${i} RETURNING *`,
        vals,
    );
    return rowToSession(row!);
}

// ─── Session Events ──────────────────────────────────────────

export async function insertSessionEvent(event: {
    session_id: string;
    content_id: string;
    interaction_type: string;
    value: unknown;
    response_time_ms?: number;
    score_result?: ScoreResult;
}): Promise<string> {
    const id = randomUUID();
    await query(
        `INSERT INTO session_events (event_id, session_id, content_id, interaction_type, value, response_time_ms, score_result)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, event.session_id, event.content_id, event.interaction_type, JSON.stringify(event.value), event.response_time_ms ?? null, event.score_result ? JSON.stringify(event.score_result) : null],
    );
    return id;
}

// ─── Learning Bundles ─────────────────────────────────────────

interface LearningBundleRow {
    bundle_id: string;
    session_id: string;
    child_id: string;
    skill_id: string;
    world_id: string | null;
    talk_plan_id: string;
    practice_set_ids: string[];
    play_config: PlayConfig;
    constraints_hash: string;
    created_at: string;
}

function rowToBundle(r: LearningBundleRow): LearningBundle {
    return {
        bundle_id: r.bundle_id,
        session_id: r.session_id,
        child_id: r.child_id,
        skill_id: r.skill_id,
        world_id: r.world_id,
        talk_plan_id: r.talk_plan_id,
        practice_set_ids: r.practice_set_ids,
        play_config: r.play_config,
        constraints_hash: r.constraints_hash,
        created_at: r.created_at,
    };
}

export async function insertLearningBundle(bundle: {
    session_id: string;
    child_id: string;
    skill_id: string;
    world_id: string | null;
    talk_plan_id: string;
    practice_set_ids: string[];
    play_config: PlayConfig;
    constraints_hash: string;
}): Promise<LearningBundle> {
    const id = randomUUID();
    const row = await getOne<LearningBundleRow>(
        `INSERT INTO learning_bundles (bundle_id, session_id, child_id, skill_id, world_id, talk_plan_id, practice_set_ids, play_config, constraints_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
            id,
            bundle.session_id,
            bundle.child_id,
            bundle.skill_id,
            bundle.world_id,
            bundle.talk_plan_id,
            bundle.practice_set_ids,
            JSON.stringify(bundle.play_config),
            bundle.constraints_hash,
        ],
    );
    return rowToBundle(row!);
}

export async function getLearningBundle(bundleId: string): Promise<LearningBundle | null> {
    const row = await getOne<LearningBundleRow>(
        'SELECT * FROM learning_bundles WHERE bundle_id = $1',
        [bundleId],
    );
    return row ? rowToBundle(row) : null;
}

export async function getLearningBundleBySession(sessionId: string): Promise<LearningBundle | null> {
    const row = await getOne<LearningBundleRow>(
        'SELECT * FROM learning_bundles WHERE session_id = $1',
        [sessionId],
    );
    return row ? rowToBundle(row) : null;
}

// ─── Sessions v1.1 (with bundle_id and current_mode) ──────────

interface SessionV11Row extends SessionRow {
    current_mode: TriadMode;
    bundle_id: string | null;
    child_ref_id: string | null;
}

function rowToSessionV11(r: SessionV11Row): SessionV11 {
    return {
        session_id: r.session_id,
        child_id: r.child_ref_id ?? r.child_id, // prefer v1.1 child_ref_id
        skill_id: r.skill_id,
        engine_type: r.engine_type as Session['engine_type'],
        current_mode: r.current_mode,
        status: r.status as Session['status'],
        difficulty_level: r.difficulty_level,
        random_seed: r.random_seed ?? undefined,
        stats: r.stats,
        engine_state: r.engine_state,
        started_at: r.started_at,
        paused_at: r.paused_at ?? undefined,
        ended_at: r.ended_at ?? undefined,
        duration_seconds: r.duration_seconds ?? undefined,
        approval_id: r.approval_id ?? undefined,
        bundle_id: r.bundle_id,
    };
}

/**
 * Create a v1.1 session with bundle_id and current_mode.
 * Uses child_ref_id (new v1.1 FK) instead of legacy child_id.
 */
export async function insertSessionV11(session: {
    child_id: string;
    skill_id: string;
    engine_type: string;
    current_mode: TriadMode;
    difficulty_level: number;
    bundle_id: string;
}): Promise<SessionV11> {
    const id = randomUUID();
    const defaultStats: SessionStats = {
        items_attempted: 0,
        items_correct: 0,
        accuracy: 0,
        best_streak: 0,
        hints_used: 0,
        stars_earned: 0,
        mastery_achieved: false,
    };
    const row = await getOne<SessionV11Row>(
        `INSERT INTO sessions (session_id, child_ref_id, skill_id, engine_type, mode, current_mode, difficulty_level, bundle_id, stats, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
         RETURNING *`,
        [
            id,
            session.child_id,
            session.skill_id,
            session.engine_type,
            'learning', // legacy mode field
            session.current_mode,
            session.difficulty_level,
            session.bundle_id,
            JSON.stringify(defaultStats),
        ],
    );
    return rowToSessionV11(row!);
}

export async function getSessionV11(sessionId: string): Promise<SessionV11 | null> {
    const row = await getOne<SessionV11Row>(
        'SELECT * FROM sessions WHERE session_id = $1',
        [sessionId],
    );
    return row ? rowToSessionV11(row) : null;
}

/**
 * Get the active session for a child (if any).
 * Returns null if no active session exists.
 */
export async function getActiveSessionForChild(childId: string): Promise<SessionV11 | null> {
    const row = await getOne<SessionV11Row>(
        `SELECT * FROM sessions
         WHERE child_ref_id = $1 AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`,
        [childId],
    );
    return row ? rowToSessionV11(row) : null;
}

/**
 * Update the current_mode of a session (for mode switching).
 */
export async function updateSessionMode(
    sessionId: string,
    newMode: TriadMode,
): Promise<SessionV11> {
    const row = await getOne<SessionV11Row>(
        `UPDATE sessions SET current_mode = $2 WHERE session_id = $1 RETURNING *`,
        [sessionId, newMode],
    );
    if (!row) throw new Error(`Session not found: ${sessionId}`);
    return rowToSessionV11(row);
}

/**
 * Pause a session (set status to 'paused' and record paused_at).
 */
export async function pauseSession(sessionId: string): Promise<SessionV11> {
    const row = await getOne<SessionV11Row>(
        `UPDATE sessions SET status = 'paused', paused_at = NOW() WHERE session_id = $1 RETURNING *`,
        [sessionId],
    );
    if (!row) throw new Error(`Session not found: ${sessionId}`);
    return rowToSessionV11(row);
}

/**
 * Resume a paused session (set status back to 'active').
 */
export async function resumeSession(sessionId: string): Promise<SessionV11> {
    const row = await getOne<SessionV11Row>(
        `UPDATE sessions SET status = 'active', paused_at = NULL WHERE session_id = $1 RETURNING *`,
        [sessionId],
    );
    if (!row) throw new Error(`Session not found: ${sessionId}`);
    return rowToSessionV11(row);
}

/**
 * End a session (set status to 'completed' and record ended_at + duration).
 */
export async function endSession(sessionId: string): Promise<SessionV11> {
    const row = await getOne<SessionV11Row>(
        `UPDATE sessions
         SET status = 'completed',
             ended_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
         WHERE session_id = $1
         RETURNING *`,
        [sessionId],
    );
    if (!row) throw new Error(`Session not found: ${sessionId}`);
    return rowToSessionV11(row);
}

/**
 * Timeout stale sessions that have been idle for too long.
 * Returns the number of sessions timed out.
 */
export async function timeoutStaleSessions(idleMinutes: number): Promise<number> {
    const result = await query(
        `UPDATE sessions
         SET status = 'timed_out',
             ended_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
         WHERE status = 'active'
         AND (
             (paused_at IS NOT NULL AND paused_at < NOW() - INTERVAL '1 minute' * $1)
             OR (paused_at IS NULL AND started_at < NOW() - INTERVAL '1 minute' * $1)
         )`,
        [idleMinutes],
    );
    return result.rowCount ?? 0;
}

/**
 * Update session engine_state (for state persistence across interactions).
 */
export async function updateSessionEngineState(
    sessionId: string,
    engineState: unknown,
): Promise<void> {
    await query(
        `UPDATE sessions SET engine_state = $2 WHERE session_id = $1`,
        [sessionId, JSON.stringify(engineState)],
    );
}

/**
 * Update session stats (for progress tracking).
 */
export async function updateSessionStats(
    sessionId: string,
    stats: SessionStats,
): Promise<void> {
    await query(
        `UPDATE sessions SET stats = $2 WHERE session_id = $1`,
        [sessionId, JSON.stringify(stats)],
    );
}

/**
 * Get content objects by IDs (for loading bundle practice_set).
 */
export async function getContentByIds(contentIds: string[]): Promise<ContentObject[]> {
    if (contentIds.length === 0) return [];
    const placeholders = contentIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await getMany<ContentRow>(
        `SELECT * FROM content_objects WHERE content_id IN (${placeholders})`,
        contentIds,
    );
    return rows.map((r) => ({
        content_id: r.content_id,
        skill_id: r.skill_id,
        engine_type: r.engine_type as ContentObject['engine_type'],
        template_id: r.template_id as ContentObject['template_id'],
        version: r.version,
        source: r.source as ContentObject['source'],
        difficulty_level: r.difficulty_level,
        payload: r.payload as unknown as ContentObject['payload'],
        created_at: r.created_at,
    }));
}

// ─── Child Profiles ──────────────────────────────────────────────

interface ChildProfileRow {
    child_id: string;
    household_id: string;
    display_name: string;
    avatar_id: string;
    preferred_mode: TriadMode | null;
    accessibility_skip_hints: boolean;
    created_at: string;
}

/**
 * Get a child profile by ID.
 */
export async function getChildProfile(childId: string): Promise<ChildProfileRow | null> {
    return getOne<ChildProfileRow>(
        'SELECT * FROM children WHERE child_id = $1',
        [childId],
    );
}

// ─── Voice Helper Functions ──────────────────────────────────────

interface SkillLookupRow {
    skill_id: string;
    skill_name: string;
}

/**
 * Find a skill by keyword (fuzzy match on skill_id or objective).
 */
export async function findSkillByKeyword(keyword: string): Promise<{ skill_id: string; skill_name: string } | null> {
    const searchTerm = `%${keyword.toLowerCase()}%`;
    const row = await getOne<SkillLookupRow>(
        `SELECT skill_id, objective as skill_name FROM skill_specs
         WHERE LOWER(skill_id) LIKE $1 OR LOWER(objective) LIKE $1
         LIMIT 1`,
        [searchTerm],
    );
    return row;
}

/**
 * Start a learning session (simplified for voice).
 * Returns session with initial prompt.
 */
export async function startLearningSession(params: {
    child_id: string;
    skill_id: string;
    mode: TriadMode;
}): Promise<{ session_id: string; prompt: unknown }> {
    const id = randomUUID();
    const defaultStats: SessionStats = {
        items_attempted: 0,
        items_correct: 0,
        accuracy: 0,
        best_streak: 0,
        hints_used: 0,
        stars_earned: 0,
        mastery_achieved: false,
    };

    // Default engine type for voice-started sessions
    const engineType = 'msd';

    const row = await getOne<SessionV11Row>(
        `INSERT INTO sessions (session_id, child_ref_id, skill_id, engine_type, mode, current_mode, difficulty_level, stats, status)
         VALUES ($1, $2, $3, $4, 'learning', $5, 1, $6, 'active')
         RETURNING *`,
        [id, params.child_id, params.skill_id, engineType, params.mode, JSON.stringify(defaultStats)],
    );

    // Get first content item for prompt
    const content = await getContentBySkillAndDifficulty(params.skill_id, 'tap_choice', 1, 1);
    const prompt = content[0]?.payload ?? { text: 'Let\'s start learning!' };

    return {
        session_id: row!.session_id,
        prompt,
    };
}

/**
 * Get a hint for the current session question.
 */
export async function getSessionHint(sessionId: string): Promise<{ hint_text: string; hint_level: number }> {
    const session = await getSessionV11(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Update hints_used stat
    const newStats = { ...session.stats, hints_used: session.stats.hints_used + 1 };
    await updateSessionStats(sessionId, newStats);

    // Generate hint based on hint level
    const hintLevel = Math.min(newStats.hints_used, 3);
    const hints = [
        'Think about what we learned!',
        'Look carefully at each choice.',
        'Try sounding it out slowly.',
    ];

    return {
        hint_text: hints[hintLevel - 1] ?? hints[0],
        hint_level: hintLevel,
    };
}

/**
 * Switch session mode.
 */
export async function switchSessionMode(sessionId: string, newMode: string): Promise<void> {
    await updateSessionMode(sessionId, newMode as TriadMode);
}

/**
 * Skip the current question and get next.
 */
export async function skipSessionQuestion(sessionId: string): Promise<unknown> {
    const session = await getSessionV11(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Get next content item
    const content = await getContentBySkillAndDifficulty(session.skill_id, 'tap_choice', session.difficulty_level, 1);
    return content[0]?.payload ?? { text: 'Here\'s your next question!' };
}

/**
 * Submit an answer for the current question.
 */
export async function submitSessionAnswer(
    sessionId: string,
    answer: string,
): Promise<{
    correct: boolean;
    feedback: string;
    stars_earned?: number;
    attempts_remaining?: number;
    next_prompt?: unknown;
}> {
    const session = await getSessionV11(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Simplified scoring (real implementation would check against content)
    // For now, randomly determine correctness for demo purposes
    const isCorrect = answer.length > 0 && Math.random() > 0.3;

    const newStats = { ...session.stats };
    newStats.items_attempted += 1;

    if (isCorrect) {
        newStats.items_correct += 1;
        newStats.best_streak += 1;
        const starsEarned = newStats.best_streak >= 3 ? 2 : 1;
        newStats.stars_earned += starsEarned;
        newStats.accuracy = Math.round((newStats.items_correct / newStats.items_attempted) * 100);

        await updateSessionStats(sessionId, newStats);

        // Get next content
        const content = await getContentBySkillAndDifficulty(session.skill_id, 'tap_choice', session.difficulty_level, 1);

        return {
            correct: true,
            feedback: 'Great job! That\'s correct!',
            stars_earned: starsEarned,
            next_prompt: content[0]?.payload,
        };
    } else {
        newStats.best_streak = 0;
        newStats.accuracy = Math.round((newStats.items_correct / newStats.items_attempted) * 100);
        await updateSessionStats(sessionId, newStats);

        return {
            correct: false,
            feedback: 'Almost! Let\'s try again!',
            attempts_remaining: 2,
        };
    }
}

/**
 * Get the current question for a session.
 */
export async function getSessionCurrentQuestion(sessionId: string): Promise<unknown> {
    const session = await getSessionV11(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Get current content from engine state or fetch new
    if (session.engine_state && typeof session.engine_state === 'object') {
        const state = session.engine_state as { current_prompt?: unknown };
        if (state.current_prompt) return state.current_prompt;
    }

    // Fallback: get a content item
    const content = await getContentBySkillAndDifficulty(session.skill_id, 'tap_choice', session.difficulty_level, 1);
    return content[0]?.payload ?? { text: 'What\'s your answer?' };
}
