import { randomUUID } from 'node:crypto';
import { getOne, getMany, query } from './pool.js';
import type {
    SkillSpec,
    Session,
    SessionStats,
    ContentObject,
    ScoreResult,
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
