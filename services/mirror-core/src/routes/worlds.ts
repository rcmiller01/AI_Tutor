/**
 * Worlds API Routes
 *
 * Parent-facing routes for managing world access:
 * - List all worlds with household status
 * - Toggle world enabled/disabled for household
 */

import type { FastifyInstance } from 'fastify';
import { requireParentAuth } from '../auth/middleware.js';
import {
    getAllWorldsForHousehold,
    setHouseholdWorldEnabled,
    getWorldById,
} from '../db/policy-queries.js';
import { emitEvent } from '../db/telemetry.js';

// ─── Types ─────────────────────────────────────────────────────

interface EnableBody {
    enabled: boolean;
}

// ─── Routes ────────────────────────────────────────────────────

export async function worldsRoutes(app: FastifyInstance) {
    /**
     * GET /admin/worlds
     *
     * List all worlds with their enabled status for this household.
     */
    app.get(
        '/admin/worlds',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const householdId = request.parentClaims!.household_id;

            try {
                const worlds = await getAllWorldsForHousehold(householdId);

                const enriched = worlds.map((w) => ({
                    world_id: w.world_id,
                    name: w.name,
                    icon: w.icon,
                    enabled_globally: w.enabled,
                    enabled_for_household: w.enabled_for_household,
                    // Effective enabled = both must be true
                    effectively_enabled: w.enabled && w.enabled_for_household,
                    skill_ids: w.skill_ids,
                    scope_tags: w.scope_tags,
                }));

                reply.send({ worlds: enriched });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                app.log.error({ err }, 'Failed to list worlds');
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    /**
     * GET /admin/worlds/:id
     *
     * Get a specific world with household status.
     */
    app.get<{ Params: { id: string } }>(
        '/admin/worlds/:id',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const worldId = request.params.id;
            const householdId = request.parentClaims!.household_id;

            try {
                const worlds = await getAllWorldsForHousehold(householdId);
                const world = worlds.find((w) => w.world_id === worldId);

                if (!world) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: `World not found: ${worldId}` },
                    });
                    return;
                }

                reply.send({
                    world_id: world.world_id,
                    name: world.name,
                    icon: world.icon,
                    enabled_globally: world.enabled,
                    enabled_for_household: world.enabled_for_household,
                    effectively_enabled: world.enabled && world.enabled_for_household,
                    skill_ids: world.skill_ids,
                    scope_tags: world.scope_tags,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    /**
     * PUT /admin/worlds/:id/enabled
     *
     * Toggle a world's enabled status for this household.
     */
    app.put<{ Params: { id: string }; Body: EnableBody }>(
        '/admin/worlds/:id/enabled',
        { preHandler: requireParentAuth },
        async (request, reply) => {
            const worldId = request.params.id;
            const householdId = request.parentClaims!.household_id;
            const { enabled } = request.body;

            try {
                // Verify world exists
                const world = await getWorldById(worldId);
                if (!world) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: `World not found: ${worldId}` },
                    });
                    return;
                }

                // Update household setting
                await setHouseholdWorldEnabled(householdId, worldId, enabled);

                // Emit telemetry
                await emitEvent('worlds.enabled_changed', {
                    household_id: householdId,
                    world_id: worldId,
                    enabled,
                }, {
                    session_id: null,
                    child_id: null,
                    household_id: householdId,
                });

                reply.send({
                    world_id: worldId,
                    enabled_for_household: enabled,
                    effectively_enabled: world.enabled && enabled,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                app.log.error({ err }, 'Failed to update world enabled status');
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );
}
