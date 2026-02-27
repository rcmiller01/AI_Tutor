/**
 * apps/child-ui/src/lib/api.ts
 *
 * API client with v1.1 session endpoints.
 * Uses X-Child-Token header for authenticated requests.
 */

import type { PromptPayload, ScoreResult, HintPayload, LearningBundle } from '@mirror/schemas';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export type TriadMode = 'talk' | 'practice' | 'play';

// Get child token from localStorage
function getChildToken(): string | null {
    return localStorage.getItem('child_session_token');
}

// Generic request function with child token support
async function request<T>(
    path: string,
    options?: RequestInit & { requiresAuth?: boolean }
): Promise<T> {
    const { requiresAuth = true, ...init } = options ?? {};

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
    };

    // Add child token if required and available
    if (requiresAuth) {
        const token = getChildToken();
        if (token) {
            headers['X-Child-Token'] = token;
        }
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }

    return res.json();
}

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ChildProfile {
    child_id: string;
    display_name: string;
    avatar_id: string | null;
}

export interface SessionStartResponse {
    session_id: string;
    skill_id: string;
    status: 'active' | 'paused' | 'denied';
    current_bundle: LearningBundle | null;
    prompt: PromptPayload | null;
    denial_reason?: string;
}

export interface InteractionResponse {
    score: ScoreResult;
    next_prompt: PromptPayload | null;
    session_status: 'active' | 'paused' | 'mastery_gate' | 'complete';
    mastery_gate?: {
        skill_id: string;
        message: string;
    };
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const api = {
    // ── Health ────────────────────────────────────────────────────────────────
    health: () => request<{ status: string }>('/health', { requiresAuth: false }),

    // ── Profile ───────────────────────────────────────────────────────────────
    getProfiles: (householdId: string) =>
        request<{ children: ChildProfile[] }>('/children', {
            requiresAuth: false,
            headers: { 'X-Household-Id': householdId },
        }),

    selectProfile: (childId: string) =>
        request<{
            child_session_token: string;
            child_id: string;
            household_id: string;
            display_name: string;
            avatar_id: string | null;
            preferred_mode: TriadMode;
            stars_balance: number;
        }>('/children/select', {
            method: 'POST',
            body: JSON.stringify({ child_id: childId }),
            requiresAuth: false,
        }),

    // ── Skills ────────────────────────────────────────────────────────────────
    listSkills: () =>
        request<{ skills: Array<{ skill_id: string; grade_band: string; objective: string }> }>(
            '/skills'
        ),

    getSkill: (id: string) => request<Record<string, unknown>>(`/skills/${id}`),

    // ── Sessions ──────────────────────────────────────────────────────────────
    startSession: (skillId: string, mode: TriadMode) =>
        request<SessionStartResponse>('/sessions/start', {
            method: 'POST',
            body: JSON.stringify({ skill_id: skillId, mode }),
        }),

    interact: (sessionId: string, response: unknown, responseTimeMs?: number) =>
        request<InteractionResponse>(`/sessions/${sessionId}/interact`, {
            method: 'POST',
            body: JSON.stringify({
                response,
                response_time_ms: responseTimeMs,
            }),
        }),

    requestHint: (sessionId: string) =>
        request<HintPayload>(`/sessions/${sessionId}/hint`, {
            method: 'POST',
        }),

    switchMode: (sessionId: string, mode: TriadMode) =>
        request<{ mode: TriadMode; bundle: LearningBundle | null }>(
            `/sessions/${sessionId}/switch-mode`,
            {
                method: 'POST',
                body: JSON.stringify({ mode }),
            }
        ),

    pauseSession: (sessionId: string) =>
        request<{ status: string }>(`/sessions/${sessionId}/pause`, {
            method: 'POST',
        }),

    resumeSession: (sessionId: string) =>
        request<{ status: string; prompt: PromptPayload | null }>(
            `/sessions/${sessionId}/resume`,
            {
                method: 'POST',
            }
        ),

    // ── Worlds ────────────────────────────────────────────────────────────────
    getUnlockedSkills: () =>
        request<{ skills: Array<{ skill_id: string; world_id: string; unlocked: boolean }> }>(
            '/worlds/unlocked'
        ),

    // ── Legacy compatibility ──────────────────────────────────────────────────
    // These match the old API shape for backward compatibility

    createSession: (skillId: string) =>
        request<{ session_id: string }>('/sessions', {
            method: 'POST',
            body: JSON.stringify({
                skill_id: skillId,
                engine_type: 'MICRO_SKILL_DRILL',
                mode: 'learning',
            }),
        }),

    getNextItem: (sessionId: string) =>
        request<{
            prompt_id: string;
            content_id: string;
            template_id: string;
            widget_type: string;
            content: {
                prompt_text: string;
                choices: { choice_id: string; label: string }[];
            };
            instruction_text: string;
            progress: {
                current_item: number;
                total_items: number;
                current_difficulty: number;
                stars_session_total: number;
                streak_current: number;
            };
        }>(`/sessions/${sessionId}/next`, { method: 'POST' }),

    submitInteraction: (sessionId: string, choiceId: string, responseTimeMs?: number) =>
        request<{
            is_correct: boolean;
            stars_earned: number;
            streak: { current: number; best: number; multiplier: number };
            mastery_status: { state: string; accuracy?: number; current_difficulty?: number };
            hint?: { hint_text: string; hint_style: string; hints_remaining: number };
            sound_effect?: string;
        }>(`/sessions/${sessionId}/interact`, {
            method: 'POST',
            body: JSON.stringify({ choice_id: choiceId, response_time_ms: responseTimeMs }),
        }),
};
