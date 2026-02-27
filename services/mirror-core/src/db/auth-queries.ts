/**
 * services/mirror-core/src/db/auth-queries.ts
 *
 * DB query functions for the auth service (parents + households + children tables).
 * All writes use parameterized queries. No raw string interpolation.
 */

import { randomUUID } from 'node:crypto';
import { getOne, getMany, query } from './pool.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParentRow {
    parent_id: string;
    email: string;
    password_hash: string;
    mfa_enabled: boolean;
    passkey_enabled: boolean;
    created_at: string;
}

export interface HouseholdRow {
    household_id: string;
    parent_id: string;
    settings_json: Record<string, unknown>;
    created_at: string;
}

export interface ChildRow {
    child_id: string;
    household_id: string;
    display_name: string;
    avatar_id: string;
    preferred_mode: 'talk' | 'practice' | 'play' | null;
    accessibility_skip_hints: boolean;
    stars_balance: number;
    created_at: string;
}

// ─── Parents ──────────────────────────────────────────────────────────────────

export async function insertParent(
    email: string,
    passwordHash: string,
): Promise<ParentRow> {
    const id = randomUUID();
    const row = await getOne<ParentRow>(
        `INSERT INTO parents (parent_id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, email.toLowerCase().trim(), passwordHash],
    );
    return row!;
}

export async function getParentByEmail(email: string): Promise<ParentRow | null> {
    return getOne<ParentRow>(
        'SELECT * FROM parents WHERE email = $1',
        [email.toLowerCase().trim()],
    );
}

export async function getParentById(parentId: string): Promise<ParentRow | null> {
    return getOne<ParentRow>(
        'SELECT * FROM parents WHERE parent_id = $1',
        [parentId],
    );
}

// ─── Households ───────────────────────────────────────────────────────────────

export async function insertHousehold(parentId: string): Promise<HouseholdRow> {
    const id = randomUUID();
    const row = await getOne<HouseholdRow>(
        `INSERT INTO households (household_id, parent_id)
         VALUES ($1, $2)
         RETURNING *`,
        [id, parentId],
    );
    return row!;
}

export async function getHouseholdByParent(parentId: string): Promise<HouseholdRow | null> {
    return getOne<HouseholdRow>(
        'SELECT * FROM households WHERE parent_id = $1',
        [parentId],
    );
}

// ─── Children ─────────────────────────────────────────────────────────────────

export async function insertChild(
    householdId: string,
    displayName: string,
    avatarId: string,
): Promise<ChildRow> {
    const id = randomUUID();
    const row = await getOne<ChildRow>(
        `INSERT INTO children (child_id, household_id, display_name, avatar_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, householdId, displayName.trim(), avatarId.trim()],
    );
    return row!;
}

export async function getChildrenByHousehold(householdId: string): Promise<ChildRow[]> {
    return getMany<ChildRow>(
        `SELECT * FROM children WHERE household_id = $1 ORDER BY created_at ASC`,
        [householdId],
    );
}

export async function getChildById(childId: string): Promise<ChildRow | null> {
    return getOne<ChildRow>(
        'SELECT * FROM children WHERE child_id = $1',
        [childId],
    );
}

export async function updateChild(
    childId: string,
    updates: Partial<Pick<ChildRow, 'display_name' | 'avatar_id' | 'accessibility_skip_hints'>>,
): Promise<ChildRow> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (updates.display_name !== undefined) { sets.push(`display_name = $${i++}`); vals.push(updates.display_name.trim()); }
    if (updates.avatar_id !== undefined) { sets.push(`avatar_id = $${i++}`); vals.push(updates.avatar_id.trim()); }
    if (updates.accessibility_skip_hints !== undefined) { sets.push(`accessibility_skip_hints = $${i++}`); vals.push(updates.accessibility_skip_hints); }

    if (sets.length === 0) throw new Error('No fields to update');

    vals.push(childId);
    const row = await getOne<ChildRow>(
        `UPDATE children SET ${sets.join(', ')} WHERE child_id = $${i} RETURNING *`,
        vals,
    );
    if (!row) throw new Error('Child not found');
    return row;
}

// ─── Refresh token store (revocation list) ────────────────────────────────────
// Minimal implementation: revoked tokens stored in memory for MVP.
// Phase 1.5: replace with a Redis set or DB table.

const revokedRefreshTokens = new Set<string>();

export function revokeRefreshToken(tokenJti: string): void {
    revokedRefreshTokens.add(tokenJti);
}

export function isRefreshTokenRevoked(tokenJti: string): boolean {
    return revokedRefreshTokens.has(tokenJti);
}

// ─── Refresh token DB table (stub for future migration) ───────────────────────
// Phase 1.5 will add a `refresh_tokens` table with (jti, parent_id, expires_at, revoked).
// For now we store a jti claim in the JWT and check the in-memory revocation set.

export async function insertRefreshTokenRecord(
    _parentId: string,
    _jti: string,
    _expiresAt: Date,
): Promise<void> {
    // Stub: no DB write in Phase 1.3.
    // Phase 1.5: INSERT INTO refresh_tokens (jti, parent_id, expires_at) VALUES ($1, $2, $3)
    await query('SELECT 1'); // no-op to satisfy async contract
}
