const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }
    return res.json();
}

export const api = {
    // Health
    health: () => request<{ status: string }>('/health'),

    // Skills
    listSkills: () =>
        request<{ skill_id: string; grade_band: string; objective: string }[]>('/skills'),

    getSkill: (id: string) => request<Record<string, unknown>>(`/skills/${id}`),

    // Sessions
    createSession: (skillId: string) =>
        request<Record<string, unknown>>('/sessions', {
            method: 'POST',
            body: JSON.stringify({ skill_id: skillId, engine_type: 'MICRO_SKILL_DRILL', mode: 'learning' }),
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

    requestHint: (sessionId: string) =>
        request<{ hint_text: string; hint_style: string; hints_remaining: number }>(
            `/sessions/${sessionId}/hint`,
            { method: 'POST' },
        ),
};
