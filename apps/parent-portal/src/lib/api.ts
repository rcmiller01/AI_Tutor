const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const TOKEN_KEY = 'admin_access_token';

export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export async function refreshAccessToken(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE}/admin/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        if (data.admin_access_token) {
            setStoredToken(data.admin_access_token);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getStoredToken();

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: 'include',
    });

    // If 401, try to refresh token once
    if (response.status === 401 && token) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            const newToken = getStoredToken();
            (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
            response = await fetch(`${API_BASE}${path}`, {
                ...options,
                headers,
                credentials: 'include',
            });
        }
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
            response.status,
            errorData.error?.code || 'UNKNOWN_ERROR',
            errorData.error?.message || `HTTP ${response.status}`
        );
    }

    return response.json();
}

// Auth-specific API calls
export interface LoginResponse {
    admin_access_token: string;
    token_type: string;
    expires_in: number;
    expires_at: string;
    household_id: string;
}

export interface RegisterResponse {
    parent_id: string;
    email: string;
    household_id: string;
    created_at: string;
}

export interface LoginResult {
    household_id: string;
    email: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
    const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
            response.status,
            errorData.error?.code || 'LOGIN_FAILED',
            errorData.error?.message || 'Login failed'
        );
    }

    const data: LoginResponse = await response.json();
    setStoredToken(data.admin_access_token);
    return {
        household_id: data.household_id,
        email: email,
    };
}

export async function register(
    email: string,
    password: string,
    householdName: string
): Promise<RegisterResponse> {
    const response = await fetch(`${API_BASE}/admin/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, household_name: householdName }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
            response.status,
            errorData.error?.code || 'REGISTER_FAILED',
            errorData.error?.message || 'Registration failed'
        );
    }

    return response.json();
}

export async function logout(): Promise<void> {
    try {
        await fetch(`${API_BASE}/admin/logout`, {
            method: 'POST',
            credentials: 'include',
        });
    } finally {
        clearAuth();
    }
}
