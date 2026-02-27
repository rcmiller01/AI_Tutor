/**
 * Policy, Worlds, and Time Tracking Database Queries
 *
 * Provides CRUD operations for:
 * - Policy management (per-child or per-household)
 * - World access control (global and per-household)
 * - Daily time tracking (per-child, per-mode)
 */

import { randomUUID } from 'node:crypto';
import { getOne, getMany, query } from './pool.js';
import type { Policy, TriadMode } from '@mirror/schemas';

// ─── Types ─────────────────────────────────────────────────────

export interface WorldRow {
    world_id: string;
    name: string;
    icon: string;
    enabled: boolean;
    skill_ids: string[];
    scope_tags: string[];
}

export interface WorldWithHouseholdStatus extends WorldRow {
    enabled_for_household: boolean;
}

export interface PolicyRow {
    policy_id: string;
    child_id: string;
    household_id: string | null;
    policy_type: string;
    value: unknown;
    updated_at: string;
    updated_by: string | null;
}

export interface DailyTimeRow {
    child_id: string;
    date: string;
    mode: string;
    total_seconds: number;
}

// ─── Worlds ────────────────────────────────────────────────────

/**
 * Get all worlds (global registry).
 */
export async function getAllWorlds(): Promise<WorldRow[]> {
    return getMany<WorldRow>('SELECT * FROM worlds ORDER BY name');
}

/**
 * Get a world by ID.
 */
export async function getWorldById(worldId: string): Promise<WorldRow | null> {
    return getOne<WorldRow>('SELECT * FROM worlds WHERE world_id = $1', [worldId]);
}

/**
 * Get the world containing a specific skill.
 */
export async function getWorldBySkillId(skillId: string): Promise<WorldRow | null> {
    return getOne<WorldRow>(
        `SELECT * FROM worlds WHERE $1 = ANY(skill_ids) LIMIT 1`,
        [skillId],
    );
}

/**
 * Get all enabled worlds for a household with their household-specific status.
 * A world is accessible iff worlds.enabled AND household_enabled_worlds.enabled are both TRUE.
 */
export async function getEnabledWorldsForHousehold(
    householdId: string,
): Promise<WorldWithHouseholdStatus[]> {
    const rows = await getMany<WorldWithHouseholdStatus>(
        `SELECT w.*, COALESCE(hew.enabled, TRUE) AS enabled_for_household
         FROM worlds w
         LEFT JOIN household_enabled_worlds hew
             ON w.world_id = hew.world_id AND hew.household_id = $1
         WHERE w.enabled = TRUE
         ORDER BY w.name`,
        [householdId],
    );
    return rows;
}

/**
 * Get all worlds with their household-specific status (including globally disabled).
 */
export async function getAllWorldsForHousehold(
    householdId: string,
): Promise<WorldWithHouseholdStatus[]> {
    const rows = await getMany<WorldWithHouseholdStatus>(
        `SELECT w.*, COALESCE(hew.enabled, TRUE) AS enabled_for_household
         FROM worlds w
         LEFT JOIN household_enabled_worlds hew
             ON w.world_id = hew.world_id AND hew.household_id = $1
         ORDER BY w.name`,
        [householdId],
    );
    return rows;
}

/**
 * Set the enabled status of a world for a specific household.
 */
export async function setHouseholdWorldEnabled(
    householdId: string,
    worldId: string,
    enabled: boolean,
): Promise<void> {
    await query(
        `INSERT INTO household_enabled_worlds (household_id, world_id, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (household_id, world_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
        [householdId, worldId, enabled],
    );
}

/**
 * Check if a world is enabled for a household.
 * Returns true iff both global and household-level enabled flags are true.
 */
export async function isWorldEnabledForHousehold(
    householdId: string,
    worldId: string,
): Promise<boolean> {
    const row = await getOne<{ globally_enabled: boolean; household_enabled: boolean }>(
        `SELECT
            w.enabled AS globally_enabled,
            COALESCE(hew.enabled, TRUE) AS household_enabled
         FROM worlds w
         LEFT JOIN household_enabled_worlds hew
             ON w.world_id = hew.world_id AND hew.household_id = $1
         WHERE w.world_id = $2`,
        [householdId, worldId],
    );
    return row ? (row.globally_enabled && row.household_enabled) : false;
}

/**
 * Check if a skill is allowed for a household (based on world access).
 */
export async function isSkillAllowedForHousehold(
    householdId: string,
    skillId: string,
): Promise<boolean> {
    const world = await getWorldBySkillId(skillId);
    if (!world) {
        // Skill not in any world - allow by default (or could deny)
        return true;
    }
    return isWorldEnabledForHousehold(householdId, world.world_id);
}

// ─── Policies ──────────────────────────────────────────────────

/**
 * Policy type constants.
 */
export const POLICY_TYPES = {
    DAILY_GAME_TIME_LIMIT_MINUTES: 'DAILY_GAME_TIME_LIMIT_MINUTES',
    ALLOWED_ENGINE_TYPES: 'ALLOWED_ENGINE_TYPES',
    ALLOWED_SCOPE_TAGS: 'ALLOWED_SCOPE_TAGS',
    QUIET_HOURS: 'QUIET_HOURS',
    REQUIRES_APPROVAL_FOR_SCOPE_CHANGE: 'REQUIRES_APPROVAL_FOR_SCOPE_CHANGE',
} as const;

function rowToPolicy(r: PolicyRow): Policy {
    return {
        policy_id: r.policy_id,
        child_id: r.child_id,
        policy_type: r.policy_type,
        value: r.value,
        updated_at: r.updated_at,
        updated_by: r.updated_by ?? undefined,
    };
}

/**
 * Get all policies for a child.
 */
export async function getPoliciesForChild(childId: string): Promise<Policy[]> {
    const rows = await getMany<PolicyRow>(
        'SELECT * FROM policies WHERE child_id = $1 ORDER BY policy_type',
        [childId],
    );
    return rows.map(rowToPolicy);
}

/**
 * Get a specific policy for a child.
 */
export async function getPolicy(
    childId: string,
    policyType: string,
): Promise<Policy | null> {
    const row = await getOne<PolicyRow>(
        'SELECT * FROM policies WHERE child_id = $1 AND policy_type = $2',
        [childId, policyType],
    );
    return row ? rowToPolicy(row) : null;
}

/**
 * Get a policy value with type casting.
 */
export async function getPolicyValue<T>(
    childId: string,
    policyType: string,
    defaultValue: T,
): Promise<T> {
    const policy = await getPolicy(childId, policyType);
    return policy ? (policy.value as T) : defaultValue;
}

/**
 * Upsert a policy for a child.
 */
export async function upsertPolicy(
    childId: string,
    policyType: string,
    value: unknown,
    updatedBy?: string,
): Promise<Policy> {
    const id = randomUUID();
    const row = await getOne<PolicyRow>(
        `INSERT INTO policies (policy_id, child_id, policy_type, value, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (child_id, policy_type) DO UPDATE SET
             value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
         RETURNING *`,
        [id, childId, policyType, JSON.stringify(value), updatedBy ?? null],
    );
    return rowToPolicy(row!);
}

/**
 * Delete a policy for a child.
 */
export async function deletePolicy(
    childId: string,
    policyType: string,
): Promise<boolean> {
    const result = await query(
        'DELETE FROM policies WHERE child_id = $1 AND policy_type = $2',
        [childId, policyType],
    );
    return (result.rowCount ?? 0) > 0;
}

// ─── Daily Time Tracking ───────────────────────────────────────

/**
 * Get daily time used for a child in a specific mode.
 * Returns 0 if no record exists for today.
 */
export async function getDailyTimeUsed(
    childId: string,
    mode: TriadMode | 'learning' | 'game',
): Promise<number> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const row = await getOne<DailyTimeRow>(
        'SELECT total_seconds FROM daily_time_tracking WHERE child_id = $1 AND date = $2 AND mode = $3',
        [childId, today, mode],
    );
    return row?.total_seconds ?? 0;
}

/**
 * Add time to daily tracking for a child in a specific mode.
 * Creates record if doesn't exist, otherwise increments.
 */
export async function addDailyTime(
    childId: string,
    mode: TriadMode | 'learning' | 'game',
    seconds: number,
): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    await query(
        `INSERT INTO daily_time_tracking (child_id, date, mode, total_seconds)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (child_id, date, mode) DO UPDATE SET
             total_seconds = daily_time_tracking.total_seconds + EXCLUDED.total_seconds`,
        [childId, today, mode, seconds],
    );
}

/**
 * Get daily time used for all modes for a child.
 */
export async function getDailyTimeForAllModes(
    childId: string,
): Promise<Record<string, number>> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await getMany<DailyTimeRow>(
        'SELECT mode, total_seconds FROM daily_time_tracking WHERE child_id = $1 AND date = $2',
        [childId, today],
    );
    return Object.fromEntries(rows.map((r) => [r.mode, r.total_seconds]));
}

/**
 * Get time budget remaining for a child in play mode.
 * Returns null if no limit is set, otherwise returns remaining minutes.
 */
export async function getPlayTimeBudgetRemaining(
    childId: string,
): Promise<number | null> {
    const limitPolicy = await getPolicy(childId, POLICY_TYPES.DAILY_GAME_TIME_LIMIT_MINUTES);
    if (!limitPolicy) return null;

    const limitMinutes = limitPolicy.value as number;
    const usedSeconds = await getDailyTimeUsed(childId, 'play');
    const usedMinutes = Math.floor(usedSeconds / 60);

    return Math.max(0, limitMinutes - usedMinutes);
}
