/**
 * Session Lifecycle Routes
 *
 * Phase 3 implementation with:
 * - Policy enforcement
 * - Learning bundle creation
 * - Triad mode switching
 * - Telemetry emission
 */

import type { FastifyInstance } from 'fastify';
import type { TriadMode, PlayConfig } from '@mirror/schemas';
import { requireChildAuth, blockParentOnChildRoute } from '../auth/middleware.js';
import {
    getSkillSpec,
    getContentBySkillAndDifficulty,
    insertLearningBundle,
    getLearningBundleBySession,
    insertSessionV11,
    getSessionV11,
    getActiveSessionForChild,
    updateSessionMode,
    pauseSession,
    resumeSession,
    endSession,
    getSession,
} from '../db/queries.js';
import { getWorldBySkillId, addDailyTime } from '../db/policy-queries.js';
import { checkPolicy, checkModeSwitch } from '../policy/engine.js';
import { emitEvent } from '../db/telemetry.js';
import { assembleLearningBundle } from '@mirror/engine-runtime';

// Import the legacy drill engine for backward compatibility
import { startDrillSession, getNextItem, submitInteraction, requestHint } from '../engines/drill-engine.js';

// ─── Types ─────────────────────────────────────────────────────

interface StartSessionBody {
    skill_id: string;
    mode?: TriadMode;
    world_id?: string;
}

interface SwitchModeBody {
    mode: TriadMode;
}

interface InteractBody {
    choice_id: string;
    response_time_ms?: number;
}

// ─── Routes ────────────────────────────────────────────────────

export async function sessionRoutes(app: FastifyInstance) {
    // ─── v1.1 Session Start ────────────────────────────────────

    /**
     * POST /sessions/start
     *
     * Create a new v1.1 session with policy checks and bundle creation.
     * Requires child authentication.
     *
     * Body: { skill_id, mode?, world_id? }
     * Returns: Session + LearningBundle or DenialResponse
     */
    app.post<{ Body: StartSessionBody }>(
        '/sessions/start',
        { preHandler: [requireChildAuth, blockParentOnChildRoute] },
        async (request, reply) => {
            const childId = request.childClaims!.sub;
            const householdId = request.childClaims!.household_id;
            const { skill_id, mode = 'talk', world_id } = request.body;

            try {
                // 1. Check for existing active session
                const existingSession = await getActiveSessionForChild(childId);
                if (existingSession) {
                    reply.code(409).send({
                        error: {
                            code: 'SESSION_EXISTS',
                            message: 'An active session already exists',
                        },
                        existing_session_id: existingSession.session_id,
                    });
                    return;
                }

                // 2. Validate skill exists
                const skillSpec = await getSkillSpec(skill_id);
                if (!skillSpec) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: `Skill not found: ${skill_id}` },
                    });
                    return;
                }

                // 3. Get world for skill (if not provided)
                const resolvedWorldId = world_id ?? (await getWorldBySkillId(skill_id))?.world_id;

                // 4. Run policy check
                const engineType = skillSpec.allowed_engine_types[0] ?? 'MICRO_SKILL_DRILL';
                const policyResult = await checkPolicy(
                    { child_id: childId, household_id: householdId },
                    skill_id,
                    mode,
                    engineType,
                );

                if (!policyResult.allowed) {
                    // Return denial with safe alternatives
                    reply.code(200).send({
                        denied: true,
                        ...policyResult.denial,
                    });
                    return;
                }

                // 5. Get content pool for bundle assembly
                const templateId = skillSpec.templates[0] ?? 'tap_choice';
                const contentPool = await getContentBySkillAndDifficulty(skill_id, templateId, 1, 10);

                // 6. Assemble learning bundle (deterministic, NO LLM)
                // We need to create a temporary session_id first
                const tempSessionId = crypto.randomUUID();
                const bundlePayload = assembleLearningBundle({
                    session_id: tempSessionId,
                    child_id: childId,
                    skill_spec: skillSpec,
                    world_id: resolvedWorldId,
                    practice_content_pool: contentPool,
                    difficulty_level: 1,
                });

                // 7. Persist bundle to DB
                const bundle = await insertLearningBundle({
                    session_id: tempSessionId,
                    child_id: childId,
                    skill_id,
                    world_id: resolvedWorldId ?? null,
                    talk_plan_id: bundlePayload.talk_plan_id,
                    practice_set_ids: bundlePayload.practice_set_ids,
                    play_config: bundlePayload.play_config as PlayConfig,
                    constraints_hash: bundlePayload.constraints_hash,
                });

                // 8. Create session with bundle_id
                const session = await insertSessionV11({
                    child_id: childId,
                    skill_id,
                    engine_type: engineType,
                    current_mode: mode,
                    difficulty_level: 1,
                    bundle_id: bundle.bundle_id,
                });

                // 9. Emit telemetry events
                const telemetryCtx = {
                    session_id: session.session_id,
                    child_id: childId,
                    household_id: householdId,
                };

                await emitEvent('bundle.created', {
                    bundle_id: bundle.bundle_id,
                    skill_id,
                    world_id: resolvedWorldId ?? null,
                }, telemetryCtx);

                await emitEvent('session.mode_offered', {
                    modes: ['talk', 'practice', 'play'] as TriadMode[],
                }, telemetryCtx);

                await emitEvent('session.mode_selected', {
                    mode,
                    is_initial_selection: true,
                }, telemetryCtx);

                // 10. Return success response
                reply.code(201).send({
                    session_id: session.session_id,
                    bundle_id: bundle.bundle_id,
                    current_mode: mode,
                    skill_id,
                    world_id: resolvedWorldId ?? null,
                    bundle,
                    triad_offer_text: `Want to talk, practice, or play ${skillSpec.objective}?`,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                app.log.error({ err }, 'Session start failed');
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    // ─── Switch Mode ───────────────────────────────────────────

    /**
     * POST /sessions/:id/switch-mode
     *
     * Switch the triad mode of an existing session.
     * Bundle is preserved across mode switches.
     */
    app.post<{ Params: { id: string }; Body: SwitchModeBody }>(
        '/sessions/:id/switch-mode',
        { preHandler: [requireChildAuth, blockParentOnChildRoute] },
        async (request, reply) => {
            const sessionId = request.params.id;
            const childId = request.childClaims!.sub;
            const householdId = request.childClaims!.household_id;
            const { mode: newMode } = request.body;

            try {
                // 1. Get existing session
                const session = await getSessionV11(sessionId);
                if (!session) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Session not found' },
                    });
                    return;
                }

                // 2. Verify ownership
                if (session.child_id !== childId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not your session' },
                    });
                    return;
                }

                // 3. Check if mode switch is allowed
                const policyResult = await checkModeSwitch(
                    { child_id: childId, household_id: householdId },
                    session.current_mode,
                    newMode,
                );

                if (!policyResult.allowed) {
                    reply.code(200).send({
                        denied: true,
                        ...policyResult.denial,
                    });
                    return;
                }

                // 4. Update session mode
                const previousMode = session.current_mode;
                await updateSessionMode(sessionId, newMode);

                // 5. Get bundle for response
                const bundle = await getLearningBundleBySession(sessionId);

                // 6. Emit telemetry
                await emitEvent('session.mode_switched', {
                    from_mode: previousMode,
                    to_mode: newMode,
                    bundle_id: bundle?.bundle_id ?? '',
                }, {
                    session_id: sessionId,
                    child_id: childId,
                    household_id: householdId,
                });

                await emitEvent('bundle.mode_reused', {
                    bundle_id: bundle?.bundle_id ?? '',
                    mode: newMode,
                }, {
                    session_id: sessionId,
                    child_id: childId,
                    household_id: householdId,
                });

                // 7. Return updated session
                reply.send({
                    session_id: sessionId,
                    previous_mode: previousMode,
                    current_mode: newMode,
                    bundle_id: bundle?.bundle_id,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                app.log.error({ err }, 'Mode switch failed');
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    // ─── Pause Session ─────────────────────────────────────────

    /**
     * POST /sessions/:id/pause
     *
     * Pause an active session. Snapshots engine_state to DB.
     */
    app.post<{ Params: { id: string } }>(
        '/sessions/:id/pause',
        { preHandler: [requireChildAuth, blockParentOnChildRoute] },
        async (request, reply) => {
            const sessionId = request.params.id;
            const childId = request.childClaims!.sub;

            try {
                const session = await getSessionV11(sessionId);
                if (!session) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Session not found' },
                    });
                    return;
                }

                if (session.child_id !== childId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not your session' },
                    });
                    return;
                }

                if (session.status !== 'active') {
                    reply.code(400).send({
                        error: { code: 'INVALID_STATE', message: `Cannot pause session in status: ${session.status}` },
                    });
                    return;
                }

                const paused = await pauseSession(sessionId);
                reply.send({
                    session_id: sessionId,
                    status: paused.status,
                    paused_at: paused.paused_at,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    // ─── Resume Session ────────────────────────────────────────

    /**
     * POST /sessions/:id/resume
     *
     * Resume a paused session.
     */
    app.post<{ Params: { id: string } }>(
        '/sessions/:id/resume',
        { preHandler: [requireChildAuth, blockParentOnChildRoute] },
        async (request, reply) => {
            const sessionId = request.params.id;
            const childId = request.childClaims!.sub;

            try {
                const session = await getSessionV11(sessionId);
                if (!session) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Session not found' },
                    });
                    return;
                }

                if (session.child_id !== childId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not your session' },
                    });
                    return;
                }

                if (session.status !== 'paused') {
                    reply.code(400).send({
                        error: { code: 'INVALID_STATE', message: `Cannot resume session in status: ${session.status}` },
                    });
                    return;
                }

                const resumed = await resumeSession(sessionId);
                const bundle = await getLearningBundleBySession(sessionId);

                reply.send({
                    session_id: sessionId,
                    status: resumed.status,
                    current_mode: resumed.current_mode,
                    bundle,
                    engine_state: resumed.engine_state,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    // ─── End Session ───────────────────────────────────────────

    /**
     * POST /sessions/:id/end
     *
     * End an active or paused session.
     */
    app.post<{ Params: { id: string } }>(
        '/sessions/:id/end',
        { preHandler: [requireChildAuth, blockParentOnChildRoute] },
        async (request, reply) => {
            const sessionId = request.params.id;
            const childId = request.childClaims!.sub;
            const householdId = request.childClaims!.household_id;

            try {
                const session = await getSessionV11(sessionId);
                if (!session) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Session not found' },
                    });
                    return;
                }

                if (session.child_id !== childId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not your session' },
                    });
                    return;
                }

                if (session.status !== 'active' && session.status !== 'paused') {
                    reply.code(400).send({
                        error: { code: 'INVALID_STATE', message: `Cannot end session in status: ${session.status}` },
                    });
                    return;
                }

                const ended = await endSession(sessionId);

                // Track time for the mode used
                if (ended.duration_seconds) {
                    await addDailyTime(childId, session.current_mode, ended.duration_seconds);
                }

                // Emit summary telemetry
                await emitEvent('session.summary_created', {
                    session_id: sessionId,
                    duration_seconds: ended.duration_seconds ?? 0,
                    accuracy: ended.stats.accuracy,
                    stars_earned: ended.stats.stars_earned,
                    mastery_achieved: ended.stats.mastery_achieved,
                }, {
                    session_id: sessionId,
                    child_id: childId,
                    household_id: householdId,
                });

                reply.send({
                    session_id: sessionId,
                    status: ended.status,
                    ended_at: ended.ended_at,
                    duration_seconds: ended.duration_seconds,
                    stats: ended.stats,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    // ─── Get Session ───────────────────────────────────────────

    /**
     * GET /sessions/:id
     *
     * Get session details including bundle.
     */
    app.get<{ Params: { id: string } }>(
        '/sessions/:id',
        { preHandler: [requireChildAuth, blockParentOnChildRoute] },
        async (request, reply) => {
            const sessionId = request.params.id;
            const childId = request.childClaims!.sub;

            try {
                const session = await getSessionV11(sessionId);
                if (!session) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Session not found' },
                    });
                    return;
                }

                if (session.child_id !== childId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not your session' },
                    });
                    return;
                }

                const bundle = await getLearningBundleBySession(sessionId);

                reply.send({
                    ...session,
                    bundle,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    // ─── Get Bundle ────────────────────────────────────────────

    /**
     * GET /sessions/:id/bundle
     *
     * Get the learning bundle for a session.
     */
    app.get<{ Params: { id: string } }>(
        '/sessions/:id/bundle',
        { preHandler: [requireChildAuth, blockParentOnChildRoute] },
        async (request, reply) => {
            const sessionId = request.params.id;
            const childId = request.childClaims!.sub;

            try {
                const session = await getSessionV11(sessionId);
                if (!session) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Session not found' },
                    });
                    return;
                }

                if (session.child_id !== childId) {
                    reply.code(403).send({
                        error: { code: 'AUTH_FORBIDDEN', message: 'Not your session' },
                    });
                    return;
                }

                const bundle = await getLearningBundleBySession(sessionId);
                if (!bundle) {
                    reply.code(404).send({
                        error: { code: 'NOT_FOUND', message: 'Bundle not found for session' },
                    });
                    return;
                }

                reply.send(bundle);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                reply.code(500).send({ error: { code: 'INTERNAL', message } });
            }
        },
    );

    // ─── Legacy Routes (v1.0 compatibility) ────────────────────

    /**
     * POST /sessions
     * Legacy session creation (v1.0 style, no auth, no bundle)
     */
    app.post<{
        Body: { skill_id: string; engine_type?: string; mode?: string };
    }>('/sessions', async (request, reply) => {
        const { skill_id } = request.body;
        try {
            const { sessionId } = await startDrillSession(skill_id);
            const session = await getSession(sessionId);
            reply.code(201).send(session);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });

    /**
     * POST /sessions/:id/next
     * Get next item (legacy v1.0)
     */
    app.post<{ Params: { id: string } }>('/sessions/:id/next', async (request, reply) => {
        try {
            const prompt = await getNextItem(request.params.id);
            reply.send(prompt);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });

    /**
     * POST /sessions/:id/interact
     * Submit interaction (works with both v1.0 and v1.1)
     */
    app.post<{
        Params: { id: string };
        Body: InteractBody;
    }>('/sessions/:id/interact', async (request, reply) => {
        try {
            const result = await submitInteraction(
                request.params.id,
                request.body.choice_id,
                request.body.response_time_ms,
            );
            reply.send(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });

    /**
     * POST /sessions/:id/hint
     * Request hint (works with both v1.0 and v1.1)
     */
    app.post<{ Params: { id: string } }>('/sessions/:id/hint', async (request, reply) => {
        try {
            const hint = await requestHint(request.params.id);
            reply.send(hint);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            reply.code(400).send({ error: { code: 'INVALID_INPUT', message } });
        }
    });
}
