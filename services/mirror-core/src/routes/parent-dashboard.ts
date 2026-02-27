/**
 * services/mirror-core/src/routes/parent-dashboard.ts
 *
 * Parent dashboard endpoints:
 *   GET  /api/admin/dashboard/stats  — dashboard statistics
 *   GET  /api/admin/children/:id     — get single child
 *   GET  /api/sessions/history/:childId — session history for a child
 *   GET  /api/approvals/count        — count of pending approvals
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireParentAuth } from '../auth/middleware.js';
import { getChildById, getChildrenByHousehold } from '../db/auth-queries.js';
import { getOne, getMany } from '../db/pool.js';

export async function parentDashboardRoutes(app: FastifyInstance) {

    // ── Dashboard Stats ─────────────────────────────────────────────────────────

    /**
     * GET /api/admin/dashboard/stats
     * Returns aggregated stats for the parent dashboard.
     */
    app.get(
        '/admin/dashboard/stats',
        { preHandler: requireParentAuth },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { household_id } = request.parentClaims!;

            try {
                // Get children for this household
                const children = await getChildrenByHousehold(household_id);
                const childIds = children.map(c => c.child_id);

                if (childIds.length === 0) {
                    return reply.send({
                        total_sessions_today: 0,
                        total_time_today_minutes: 0,
                        pending_approvals: 0,
                    });
                }

                // Get session stats for today
                const sessionStats = await getOne<{
                    session_count: string;
                    total_minutes: string;
                }>(
                    `SELECT
                        COUNT(*)::text as session_count,
                        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60), 0)::int::text as total_minutes
                     FROM sessions
                     WHERE child_id = ANY($1)
                       AND started_at >= CURRENT_DATE`,
                    [childIds]
                );

                // Get pending approvals count
                const approvalCount = await getOne<{ count: string }>(
                    `SELECT COUNT(*)::text as count
                     FROM approval_requests
                     WHERE household_id = $1 AND status = 'pending'`,
                    [household_id]
                );

                return reply.send({
                    total_sessions_today: parseInt(sessionStats?.session_count ?? '0', 10),
                    total_time_today_minutes: parseInt(sessionStats?.total_minutes ?? '0', 10),
                    pending_approvals: parseInt(approvalCount?.count ?? '0', 10),
                });
            } catch (err) {
                request.log.error({ err }, 'Failed to get dashboard stats');
                return reply.code(500).send({
                    error: { code: 'INTERNAL', message: 'Failed to fetch dashboard stats' },
                });
            }
        }
    );

    // ── Single Child ────────────────────────────────────────────────────────────

    /**
     * GET /api/admin/children/:id
     * Returns a single child's profile.
     */
    app.get<{ Params: { id: string } }>(
        '/admin/children/:id',
        { preHandler: requireParentAuth },
        async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            const { id } = request.params;
            const { household_id } = request.parentClaims!;

            const child = await getChildById(id);

            if (!child) {
                return reply.code(404).send({
                    error: { code: 'NOT_FOUND', message: 'Child not found' },
                });
            }

            if (child.household_id !== household_id) {
                return reply.code(403).send({
                    error: { code: 'AUTH_FORBIDDEN', message: 'Child does not belong to your household' },
                });
            }

            return reply.send({
                child: {
                    child_id: child.child_id,
                    display_name: child.display_name,
                    avatar_id: child.avatar_id,
                    preferred_mode: child.preferred_mode,
                    accessibility_skip_hints: child.accessibility_skip_hints,
                    stars_balance: child.stars_balance,
                    created_at: child.created_at,
                },
            });
        }
    );

    // ── Session History ─────────────────────────────────────────────────────────

    /**
     * GET /api/sessions/history/:childId
     * Returns session history for a child.
     */
    app.get<{
        Params: { childId: string };
        Querystring: { limit?: string };
    }>(
        '/sessions/history/:childId',
        { preHandler: requireParentAuth },
        async (
            request: FastifyRequest<{
                Params: { childId: string };
                Querystring: { limit?: string };
            }>,
            reply: FastifyReply
        ) => {
            const { childId } = request.params;
            const { household_id } = request.parentClaims!;
            const limit = parseInt(request.query.limit ?? '10', 10);

            // Verify child belongs to household
            const child = await getChildById(childId);
            if (!child || child.household_id !== household_id) {
                return reply.code(403).send({
                    error: { code: 'AUTH_FORBIDDEN', message: 'Access denied' },
                });
            }

            try {
                const sessions = await getMany<{
                    session_id: string;
                    child_id: string;
                    skill_id: string;
                    started_at: string;
                    ended_at: string | null;
                    status: string;
                }>(
                    `SELECT session_id, child_id, skill_id, started_at, ended_at, status
                     FROM sessions
                     WHERE child_id = $1
                     ORDER BY started_at DESC
                     LIMIT $2`,
                    [childId, limit]
                );

                // Transform to expected format
                const sessionSummaries = sessions.map(s => ({
                    session_id: s.session_id,
                    child_id: s.child_id,
                    started_at: s.started_at,
                    ended_at: s.ended_at,
                    duration_minutes: s.ended_at
                        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                        : Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000),
                    skills_practiced: s.skill_id ? [s.skill_id] : [],
                    problems_attempted: 0, // Would need to aggregate from session_events
                    problems_correct: 0,   // Would need to aggregate from session_events
                }));

                return reply.send({ sessions: sessionSummaries });
            } catch (err) {
                request.log.error({ err }, 'Failed to get session history');
                return reply.code(500).send({
                    error: { code: 'INTERNAL', message: 'Failed to fetch session history' },
                });
            }
        }
    );

    // ── Approval Count ──────────────────────────────────────────────────────────

    /**
     * GET /api/approvals/count
     * Returns count of pending approvals for the household.
     */
    app.get(
        '/approvals/count',
        { preHandler: requireParentAuth },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { household_id } = request.parentClaims!;

            try {
                const result = await getOne<{ count: string }>(
                    `SELECT COUNT(*)::text as count
                     FROM approval_requests
                     WHERE household_id = $1 AND status = 'pending'`,
                    [household_id]
                );

                return reply.send({
                    pending: parseInt(result?.count ?? '0', 10),
                });
            } catch (err) {
                request.log.error({ err }, 'Failed to get approval count');
                return reply.code(500).send({
                    error: { code: 'INTERNAL', message: 'Failed to fetch approval count' },
                });
            }
        }
    );
}
