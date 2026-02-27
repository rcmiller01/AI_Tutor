/**
 * services/mirror-core/src/routes/child-auth.ts
 *
 * Child-facing auth + profile picker endpoints:
 *   GET  /api/children         — list profiles for avatar picker (open, no auth)
 *   POST /api/children/select  — select profile by child_id; issue child session token
 *   GET  /api/admin/children   — list children for household (parent auth required)
 *   POST /api/admin/children   — create child profile (parent auth required)
 *   PUT  /api/admin/children/:child_id — update child profile (parent auth required)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { issueChildSessionToken } from '../auth/tokens.js';
import { requireParentAuth } from '../auth/middleware.js';
import {
    getChildrenByHousehold,
    getChildById,
    insertChild,
    updateChild,
} from '../db/auth-queries.js';

export async function childAuthRoutes(app: FastifyInstance) {

    // ── Child-facing (no auth) ────────────────────────────────────────────────

    // GET /api/children — avatar picker list
    app.get('/children', async (request: FastifyRequest, reply: FastifyReply) => {
        // Household must be inferred from device context. For MVP we return all children
        // in the household derived from the X-Household-Id header (device-provisioned).
        const householdId = request.headers['x-household-id'];
        if (!householdId || typeof householdId !== 'string') {
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'X-Household-Id header required' } });
            return;
        }

        const children = await getChildrenByHousehold(householdId);
        reply.send({
            children: children.map(c => ({
                child_id: c.child_id,
                display_name: c.display_name,
                avatar_id: c.avatar_id,
            })),
        });
    });

    // POST /api/children/select — child selects profile; issues child session token
    app.post<{
        Body: { child_id: string };
    }>('/children/select', async (request: FastifyRequest<{ Body: { child_id: string } }>, reply: FastifyReply) => {
        const { child_id } = request.body;

        if (!child_id) {
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'child_id is required' } });
            return;
        }

        const child = await getChildById(child_id);
        if (!child) {
            reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Child profile not found' } });
            return;
        }

        const { token, expiresAt } = await issueChildSessionToken(
            child.child_id,
            child.household_id,
        );

        request.log.info({ child_id: child.child_id }, 'child.profile_selected');

        reply.send({
            child_session_token: token,
            child_id: child.child_id,
            household_id: child.household_id,
            display_name: child.display_name,
            avatar_id: child.avatar_id,
            preferred_mode: child.preferred_mode,
            accessibility_skip_hints: child.accessibility_skip_hints,
            stars_balance: child.stars_balance,
            expires_in: 4 * 60 * 60, // 4 hr in seconds
            expires_at: expiresAt.toISOString(),
        });
    });

    // ── Admin (parent auth required) ──────────────────────────────────────────

    // GET /api/admin/children — list children in the parent's household
    app.get(
        '/admin/children',
        { preHandler: requireParentAuth },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { household_id } = request.parentClaims!;
            const children = await getChildrenByHousehold(household_id);
            reply.send({
                children: children.map(c => ({
                    child_id: c.child_id,
                    display_name: c.display_name,
                    avatar_id: c.avatar_id,
                    preferred_mode: c.preferred_mode,
                    accessibility_skip_hints: c.accessibility_skip_hints,
                    stars_balance: c.stars_balance,
                    created_at: c.created_at,
                })),
            });
        },
    );

    // POST /api/admin/children — create a child profile
    app.post<{
        Body: { display_name: string; avatar_id: string };
    }>(
        '/admin/children',
        { preHandler: requireParentAuth },
        async (request: FastifyRequest<{ Body: { display_name: string; avatar_id: string } }>, reply: FastifyReply) => {
            const { display_name, avatar_id } = request.body;
            const { household_id } = request.parentClaims!;

            if (!display_name || !avatar_id) {
                reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'display_name and avatar_id are required' } });
                return;
            }

            try {
                const child = await insertChild(household_id, display_name, avatar_id);
                reply.code(201).send({
                    child_id: child.child_id,
                    household_id: child.household_id,
                    display_name: child.display_name,
                    avatar_id: child.avatar_id,
                    preferred_mode: child.preferred_mode,
                    accessibility_skip_hints: child.accessibility_skip_hints,
                    stars_balance: child.stars_balance,
                    created_at: child.created_at,
                });
            } catch (err) {
                request.log.error({ err }, 'Create child failed');
                reply.code(500).send({ error: { code: 'INTERNAL', message: 'Failed to create child profile' } });
            }
        },
    );

    // PUT /api/admin/children/:child_id — update child profile
    app.put<{
        Params: { child_id: string };
        Body: { display_name?: string; avatar_id?: string; accessibility_skip_hints?: boolean };
    }>(
        '/admin/children/:child_id',
        { preHandler: requireParentAuth },
        async (
            request: FastifyRequest<{
                Params: { child_id: string };
                Body: { display_name?: string; avatar_id?: string; accessibility_skip_hints?: boolean };
            }>,
            reply: FastifyReply,
        ) => {
            const { child_id } = request.params;
            const { household_id } = request.parentClaims!;

            // Verify child belongs to this household
            const existing = await getChildById(child_id);
            if (!existing) {
                reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Child not found' } });
                return;
            }
            if (existing.household_id !== household_id) {
                reply.code(403).send({ error: { code: 'AUTH_FORBIDDEN', message: 'Child does not belong to your household' } });
                return;
            }

            const { display_name, avatar_id, accessibility_skip_hints } = request.body;

            if (display_name === undefined && avatar_id === undefined && accessibility_skip_hints === undefined) {
                reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'At least one field to update is required' } });
                return;
            }

            try {
                const updated = await updateChild(child_id, { display_name, avatar_id, accessibility_skip_hints });
                reply.send({
                    child_id: updated.child_id,
                    household_id: updated.household_id,
                    display_name: updated.display_name,
                    avatar_id: updated.avatar_id,
                    preferred_mode: updated.preferred_mode,
                    accessibility_skip_hints: updated.accessibility_skip_hints,
                    stars_balance: updated.stars_balance,
                    created_at: updated.created_at,
                });
            } catch (err) {
                request.log.error({ err }, 'Update child failed');
                reply.code(500).send({ error: { code: 'INTERNAL', message: 'Failed to update child profile' } });
            }
        },
    );
}
