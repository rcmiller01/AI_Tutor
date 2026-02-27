/**
 * Approval Request Database Queries
 *
 * CRUD operations for the approval workflow:
 * - Creating approval requests when policy denies access
 * - Listing pending approvals for parent dashboard
 * - Approving/denying requests
 * - Expiring stale requests
 */

import { randomUUID } from 'node:crypto';
import { getOne, getMany, query } from './pool.js';
import type { ApprovalRequest, ApprovalStatus, ApprovalRequestType } from '@mirror/schemas';

// ─── Types ─────────────────────────────────────────────────────

export interface ApprovalRow {
    approval_id: string;
    child_id: string;
    request_type: ApprovalRequestType;
    status: ApprovalStatus;
    request_details: Record<string, unknown> | null;
    resolution: Record<string, unknown> | null;
    requested_at: string;
    resolved_at: string | null;
    expires_at: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────

function rowToApproval(r: ApprovalRow): ApprovalRequest {
    return {
        approval_id: r.approval_id,
        child_id: r.child_id,
        request_type: r.request_type,
        status: r.status,
        requested_at: r.requested_at,
        resolved_at: r.resolved_at ?? undefined,
        expires_at: r.expires_at ?? undefined,
        request_details: r.request_details as ApprovalRequest['request_details'],
        resolution: r.resolution as ApprovalRequest['resolution'],
    };
}

// ─── Create ────────────────────────────────────────────────────

/**
 * Create a new approval request.
 *
 * @param approval - The approval request data
 * @returns The approval_id of the created request
 */
export async function insertApprovalRequest(approval: {
    child_id: string;
    request_type: ApprovalRequestType;
    request_details?: Record<string, unknown>;
    expires_in_minutes?: number;
}): Promise<string> {
    const id = randomUUID();
    const expiresAt = approval.expires_in_minutes
        ? new Date(Date.now() + approval.expires_in_minutes * 60 * 1000).toISOString()
        : null;

    await query(
        `INSERT INTO approvals (approval_id, child_id, request_type, request_details, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
            id,
            approval.child_id,
            approval.request_type,
            JSON.stringify(approval.request_details ?? {}),
            expiresAt,
        ],
    );

    return id;
}

// ─── Read ──────────────────────────────────────────────────────

/**
 * Get an approval request by ID.
 */
export async function getApprovalById(approvalId: string): Promise<ApprovalRequest | null> {
    const row = await getOne<ApprovalRow>(
        'SELECT * FROM approvals WHERE approval_id = $1',
        [approvalId],
    );
    return row ? rowToApproval(row) : null;
}

/**
 * List pending approval requests for a household.
 * Joins with children table to filter by household.
 */
export async function listPendingApprovals(householdId: string): Promise<ApprovalRequest[]> {
    const rows = await getMany<ApprovalRow>(
        `SELECT a.*
         FROM approvals a
         JOIN children c ON a.child_id = c.child_id
         WHERE c.household_id = $1 AND a.status = 'requested'
         ORDER BY a.requested_at DESC`,
        [householdId],
    );
    return rows.map(rowToApproval);
}

/**
 * List all approval requests for a household (including resolved).
 */
export async function listAllApprovals(
    householdId: string,
    limit = 50,
): Promise<ApprovalRequest[]> {
    const rows = await getMany<ApprovalRow>(
        `SELECT a.*
         FROM approvals a
         JOIN children c ON a.child_id = c.child_id
         WHERE c.household_id = $1
         ORDER BY a.requested_at DESC
         LIMIT $2`,
        [householdId, limit],
    );
    return rows.map(rowToApproval);
}

/**
 * List approval requests for a specific child.
 */
export async function listApprovalsForChild(
    childId: string,
    limit = 20,
): Promise<ApprovalRequest[]> {
    const rows = await getMany<ApprovalRow>(
        `SELECT * FROM approvals
         WHERE child_id = $1
         ORDER BY requested_at DESC
         LIMIT $2`,
        [childId, limit],
    );
    return rows.map(rowToApproval);
}

/**
 * Get the most recent pending approval for a child (if any).
 */
export async function getPendingApprovalForChild(
    childId: string,
): Promise<ApprovalRequest | null> {
    const row = await getOne<ApprovalRow>(
        `SELECT * FROM approvals
         WHERE child_id = $1 AND status = 'requested'
         ORDER BY requested_at DESC
         LIMIT 1`,
        [childId],
    );
    return row ? rowToApproval(row) : null;
}

// ─── Update ────────────────────────────────────────────────────

/**
 * Approve a request.
 */
export async function approveRequest(
    approvalId: string,
    resolvedBy: string,
    parentNote?: string,
    resultingSessionId?: string,
): Promise<ApprovalRequest> {
    const row = await getOne<ApprovalRow>(
        `UPDATE approvals
         SET status = 'approved',
             resolved_at = NOW(),
             resolution = $2
         WHERE approval_id = $1
         RETURNING *`,
        [
            approvalId,
            JSON.stringify({
                resolved_by: resolvedBy,
                parent_note: parentNote,
                resulting_session_id: resultingSessionId,
            }),
        ],
    );
    if (!row) throw new Error(`Approval not found: ${approvalId}`);
    return rowToApproval(row);
}

/**
 * Deny a request.
 */
export async function denyRequest(
    approvalId: string,
    resolvedBy: string,
    parentNote?: string,
): Promise<ApprovalRequest> {
    const row = await getOne<ApprovalRow>(
        `UPDATE approvals
         SET status = 'denied',
             resolved_at = NOW(),
             resolution = $2
         WHERE approval_id = $1
         RETURNING *`,
        [
            approvalId,
            JSON.stringify({
                resolved_by: resolvedBy,
                parent_note: parentNote,
            }),
        ],
    );
    if (!row) throw new Error(`Approval not found: ${approvalId}`);
    return rowToApproval(row);
}

/**
 * Mark an approval as notified (parent has seen it).
 */
export async function markAsNotified(approvalId: string): Promise<ApprovalRequest> {
    const row = await getOne<ApprovalRow>(
        `UPDATE approvals SET status = 'notified' WHERE approval_id = $1 RETURNING *`,
        [approvalId],
    );
    if (!row) throw new Error(`Approval not found: ${approvalId}`);
    return rowToApproval(row);
}

/**
 * Mark an approval as fulfilled (session created after approval).
 */
export async function markAsFulfilled(
    approvalId: string,
    sessionId: string,
): Promise<ApprovalRequest> {
    const row = await getOne<ApprovalRow>(
        `UPDATE approvals
         SET status = 'fulfilled',
             resolution = resolution || $2
         WHERE approval_id = $1
         RETURNING *`,
        [
            approvalId,
            JSON.stringify({ resulting_session_id: sessionId }),
        ],
    );
    if (!row) throw new Error(`Approval not found: ${approvalId}`);
    return rowToApproval(row);
}

// ─── Maintenance ───────────────────────────────────────────────

/**
 * Expire old approval requests that have passed their expires_at time.
 * Returns the number of requests expired.
 */
export async function expireOldApprovals(): Promise<number> {
    const result = await query(
        `UPDATE approvals
         SET status = 'expired'
         WHERE status = 'requested' AND expires_at IS NOT NULL AND expires_at < NOW()`,
        [],
    );
    return result.rowCount ?? 0;
}

/**
 * Count pending approvals for a household (for notification badge).
 */
export async function countPendingApprovals(householdId: string): Promise<number> {
    const row = await getOne<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM approvals a
         JOIN children c ON a.child_id = c.child_id
         WHERE c.household_id = $1 AND a.status = 'requested'`,
        [householdId],
    );
    return parseInt(row?.count ?? '0', 10);
}
