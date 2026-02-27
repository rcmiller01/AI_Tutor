/**
 * Policy Engine
 *
 * Core policy enforcement logic for session creation and scope changes.
 * Evaluates policies and returns either allow or denial with safe alternatives.
 */

import type { DenialResponse, DenialReasonCode, TriadMode } from '@mirror/schemas';
import {
    getPolicy,
    getDailyTimeUsed,
    isWorldEnabledForHousehold,
    getWorldBySkillId,
    POLICY_TYPES,
} from '../db/policy-queries.js';
import { insertApprovalRequest } from '../db/approval-queries.js';
import { computeSafeAlternatives } from './safe-alternatives.js';
import { emitEvent } from '../db/telemetry.js';

// ─── Types ─────────────────────────────────────────────────────

export interface PolicyContext {
    child_id: string;
    household_id: string;
}

export interface PolicyCheckResult {
    allowed: true;
}

export interface PolicyDenialResult {
    allowed: false;
    denial: DenialResponse;
}

export type PolicyResult = PolicyCheckResult | PolicyDenialResult;

// ─── Policy Check Functions ────────────────────────────────────

/**
 * Main policy check function.
 *
 * Evaluates all applicable policies for a session start or scope change request.
 * Returns { allowed: true } or { allowed: false, denial: DenialResponse }.
 *
 * Policy checks (in order):
 * 1. World enabled for household
 * 2. Daily game time limit (for 'play' mode only)
 * 3. Allowed engine types (optional)
 *
 * On denial:
 * - Computes safe alternatives deterministically (NO LLM)
 * - Creates ApprovalRequest in background
 * - Emits telemetry events
 *
 * @param ctx - Policy context (child_id, household_id)
 * @param requestedSkillId - The skill being requested
 * @param requestedMode - The triad mode being requested
 * @param requestedEngineType - Optional engine type constraint
 * @returns PolicyResult
 */
export async function checkPolicy(
    ctx: PolicyContext,
    requestedSkillId: string,
    requestedMode: TriadMode,
    requestedEngineType?: string,
): Promise<PolicyResult> {
    const { child_id, household_id } = ctx;

    // 1. Check world enablement
    const world = await getWorldBySkillId(requestedSkillId);
    if (world) {
        const worldEnabled = await isWorldEnabledForHousehold(household_id, world.world_id);
        if (!worldEnabled) {
            return createDenialResponse(
                ctx,
                'WORLD_NOT_ENABLED',
                requestedSkillId,
                world.world_id,
            );
        }
    }

    // 2. Check daily game time limit (only applies to 'play' mode)
    if (requestedMode === 'play') {
        const limitPolicy = await getPolicy(child_id, POLICY_TYPES.DAILY_GAME_TIME_LIMIT_MINUTES);
        if (limitPolicy) {
            const limitMinutes = limitPolicy.value as number;
            const usedSeconds = await getDailyTimeUsed(child_id, 'play');
            const usedMinutes = Math.floor(usedSeconds / 60);

            if (usedMinutes >= limitMinutes) {
                return createDenialResponse(
                    ctx,
                    'TIME_BUDGET_EXCEEDED',
                    requestedSkillId,
                    world?.world_id,
                );
            }
        }
    }

    // 3. Check allowed engine types (optional)
    if (requestedEngineType) {
        const enginePolicy = await getPolicy(child_id, POLICY_TYPES.ALLOWED_ENGINE_TYPES);
        if (enginePolicy) {
            const allowedTypes = enginePolicy.value as string[];
            if (!allowedTypes.includes(requestedEngineType)) {
                return createDenialResponse(
                    ctx,
                    'ENGINE_TYPE_NOT_ALLOWED',
                    requestedSkillId,
                    world?.world_id,
                );
            }
        }
    }

    // All checks passed
    return { allowed: true };
}

/**
 * Check if a mode switch is allowed.
 * Mode switches within an existing session have fewer restrictions.
 */
export async function checkModeSwitch(
    ctx: PolicyContext,
    currentMode: TriadMode,
    requestedMode: TriadMode,
): Promise<PolicyResult> {
    const { child_id } = ctx;

    // Mode switch to 'play' requires time budget check
    if (requestedMode === 'play' && currentMode !== 'play') {
        const limitPolicy = await getPolicy(child_id, POLICY_TYPES.DAILY_GAME_TIME_LIMIT_MINUTES);
        if (limitPolicy) {
            const limitMinutes = limitPolicy.value as number;
            const usedSeconds = await getDailyTimeUsed(child_id, 'play');
            const usedMinutes = Math.floor(usedSeconds / 60);

            if (usedMinutes >= limitMinutes) {
                return createDenialResponse(
                    ctx,
                    'TIME_BUDGET_EXCEEDED',
                    undefined, // no specific skill for mode switch
                    undefined,
                );
            }
        }
    }

    return { allowed: true };
}

// ─── Denial Response Creation ──────────────────────────────────

/**
 * Create a denial response with safe alternatives and background approval request.
 */
async function createDenialResponse(
    ctx: PolicyContext,
    denialReasonCode: DenialReasonCode,
    requestedSkillId?: string,
    requestedWorldId?: string,
): Promise<PolicyDenialResult> {
    const { child_id, household_id } = ctx;

    // Compute safe alternatives (NO LLM - purely deterministic)
    const safeAlternatives = await computeSafeAlternatives(
        household_id,
        requestedSkillId,
        requestedWorldId,
    );

    // Determine request type based on denial reason
    const requestType = denialReasonCode === 'TIME_BUDGET_EXCEEDED'
        ? 'time_extension'
        : 'scope_change';

    // Create approval request in background
    const approvalId = await insertApprovalRequest({
        child_id,
        request_type: requestType,
        request_details: {
            requested_skill_id: requestedSkillId,
            requested_scope_tag: requestedWorldId,
            denial_reason_code: denialReasonCode,
        },
        expires_in_minutes: 60, // Approval requests expire after 1 hour
    });

    // Emit telemetry events
    await emitEvent(
        'policy.request_denied',
        {
            denial_reason_code: denialReasonCode,
            requested_skill_id: requestedSkillId,
            requested_scope_tag: requestedWorldId,
        },
        { session_id: null, child_id, household_id },
    );

    await emitEvent(
        'policy.safe_alternatives_generated',
        {
            alternatives: safeAlternatives.map((a) => ({
                skill_id: a.skill_id,
                world_id: a.world_id,
            })),
        },
        { session_id: null, child_id, household_id },
    );

    await emitEvent(
        'approval.request_created',
        {
            approval_id: approvalId,
            request_type: requestType,
            denial_reason_code: denialReasonCode,
        },
        { session_id: null, child_id, household_id },
    );

    return {
        allowed: false,
        denial: {
            denial_reason_code: denialReasonCode,
            safe_alternatives: safeAlternatives,
            approval_id: approvalId,
        },
    };
}

// ─── Time Budget Helpers ───────────────────────────────────────

/**
 * Get remaining time budget for play mode.
 * Returns null if no limit is set.
 */
export async function getPlayTimeBudget(childId: string): Promise<{
    limit_minutes: number | null;
    used_minutes: number;
    remaining_minutes: number | null;
}> {
    const limitPolicy = await getPolicy(childId, POLICY_TYPES.DAILY_GAME_TIME_LIMIT_MINUTES);
    const usedSeconds = await getDailyTimeUsed(childId, 'play');
    const usedMinutes = Math.floor(usedSeconds / 60);

    if (!limitPolicy) {
        return {
            limit_minutes: null,
            used_minutes: usedMinutes,
            remaining_minutes: null,
        };
    }

    const limitMinutes = limitPolicy.value as number;
    return {
        limit_minutes: limitMinutes,
        used_minutes: usedMinutes,
        remaining_minutes: Math.max(0, limitMinutes - usedMinutes),
    };
}

/**
 * Check if play mode is currently allowed (time budget check only).
 */
export async function isPlayModeAllowed(childId: string): Promise<boolean> {
    const budget = await getPlayTimeBudget(childId);
    if (budget.remaining_minutes === null) return true; // No limit set
    return budget.remaining_minutes > 0;
}
