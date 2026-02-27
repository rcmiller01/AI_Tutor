/**
 * Approval Workflow Routes
 *
 * Handles parent approval/denial of child requests:
 * - List pending approvals
 * - Approve a request (optionally creates a new session)
 * - Deny a request
 */

import type { FastifyInstance } from 'fastify';
import { requireParentAuth } from '../auth/middleware.js';
import {
    listPendingApprovals,
    listAllApprovals,
    getApprovalById,
    approveRequest,
    denyRequest,
    countPendingApprovals,
} from '../db/approval-queries.js';
import { getChildById } from '../db/auth-queries.js';
import { emitEvent } from '../db/telemetry.js';

// ─── Types ─────────────────────────────────────────────────────

interface ApproveBody {
    parent_note?: string;
}

interface DenyBody {
    parent_note?: string;
}

interface ListQuery {
    status?: 'requested' | 'all';
    limit?: number;
}

// ─── Routes ────────────────────────────────────────────────────

export async function approvalRoutes(app: FastifyInstance) {
    /**
     * GET /admin/approvals
     *
     * List approval requests for the household.
     * Query params: status ('requested' | 'all'), limit
     */
    app.get<{ Querystring: ListQuery }>(
        '/admin/approvals',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const householdId = request.parentClaims!.household_id;
            const status = request.query.status ?? 'requested';
            const limit = request.query.limit ?? 50;

            try {
                const approvals = status === 'all'
                    ? await listAllApprovals(householdId, limit)
                    : await listPendingApprovals(householdId);

                // Enrich with child display names
                const enriched = await Promise.all(
                    approvals.map(async (a) => {
                        const child = await getChildById(a.child_id);
                        return {
                            ...a,
                            child_display_name: child?.display_name ?? 'Unknown',
                            child_avatar_id: child?.avatar_id,
                        };
                    }),
                );

                reply.send({ approvals: enriched });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                app.log.error({ err }, 'Failed to list approvals');
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    /**
     * GET /admin/approvals/count
     *
     * Get count of pending approvals (for notification badge).
     */
    app.get(
        '/admin/approvals/count',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const householdId = request.parentClaims!.household_id;

            try {
                const count = await countPendingApprovals(householdId);
                reply.send({ count });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    /**
     * GET /admin/approvals/:id
     *
     * Get a specific approval request.
     */
    app.get<{ Params: { id: string } }>(
        '/admin/approvals/:id',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const approvalId = request.params.id;
            const householdId = request.parentClaims!.household_id;

            try {
                const approval = await getApprovalById(approvalId);
                if (!approval) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Approval not found' },
                    });
                    return;
                }

                // Verify approval belongs to this household
                const child = await getChildById(approval.child_id);
                if (!child || child.household_id !== householdId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not authorized' },
                    });
                    return;
                }

                reply.send({
                    ...approval,
                    child_display_name: child.display_name,
                    child_avatar_id: child.avatar_id,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    /**
     * POST /admin/approvals/:id/approve
     *
     * Approve an approval request.
     */
    app.post<{ Params: { id: string }; Body: ApproveBody }>(
        '/admin/approvals/:id/approve',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const approvalId = request.params.id;
            const parentId = request.parentClaims!.sub;
            const householdId = request.parentClaims!.household_id;
            const { parent_note } = request.body ?? {};

            try {
                const approval = await getApprovalById(approvalId);
                if (!approval) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Approval not found' },
                    });
                    return;
                }

                // Verify approval belongs to this household
                const child = await getChildById(approval.child_id);
                if (!child || child.household_id !== householdId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not authorized' },
                    });
                    return;
                }

                // Check if already resolved
                if (approval.status !== 'requested' && approval.status !== 'notified') {
                    reply.code(400).send({
                        error: {
                            code: 'INVALID_STATE',
                            message: `Cannot approve request in status: ${approval.status}`,
                        },
                    });
                    return;
                }

                // Approve the request
                const updated = await approveRequest(approvalId, parentId, parent_note);

                // Emit telemetry
                await emitEvent('approval.request_created', {
                    approval_id: approvalId,
                    request_type: approval.request_type,
                    denial_reason_code: 'REQUIRES_APPROVAL',
                }, {
                    session_id: null,
                    child_id: approval.child_id,
                    household_id: householdId,
                });

                reply.send({
                    approval_id: updated.approval_id,
                    status: updated.status,
                    resolved_at: updated.resolved_at,
                    resolution: updated.resolution,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                app.log.error({ err }, 'Failed to approve request');
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    /**
     * POST /admin/approvals/:id/deny
     *
     * Deny an approval request.
     */
    app.post<{ Params: { id: string }; Body: DenyBody }>(
        '/admin/approvals/:id/deny',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const approvalId = request.params.id;
            const parentId = request.parentClaims!.sub;
            const householdId = request.parentClaims!.household_id;
            const { parent_note } = request.body ?? {};

            try {
                const approval = await getApprovalById(approvalId);
                if (!approval) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Approval not found' },
                    });
                    return;
                }

                // Verify approval belongs to this household
                const child = await getChildById(approval.child_id);
                if (!child || child.household_id !== householdId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not authorized' },
                    });
                    return;
                }

                // Check if already resolved
                if (approval.status !== 'requested' && approval.status !== 'notified') {
                    reply.code(400).send({
                        error: {
                            code: 'INVALID_STATE',
                            message: `Cannot deny request in status: ${approval.status}`,
                        },
                    });
                    return;
                }

                // Deny the request
                const updated = await denyRequest(approvalId, parentId, parent_note);

                reply.send({
                    approval_id: updated.approval_id,
                    status: updated.status,
                    resolved_at: updated.resolved_at,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                app.log.error({ err }, 'Failed to deny request');
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );
}
