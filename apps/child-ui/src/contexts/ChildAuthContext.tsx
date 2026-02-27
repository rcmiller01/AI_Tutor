/**
 * apps/child-ui/src/contexts/ChildAuthContext.tsx
 *
 * Child authentication context:
 * - Fetches available profiles from backend
 * - Stores selected profile and token
 * - Provides token for API requests
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface ChildProfile {
    child_id: string;
    display_name: string;
    avatar_id: string | null;
    preferred_mode?: 'practice' | 'play' | 'talk';
    stars_balance?: number;
}

interface ChildAuthState {
    profile: ChildProfile | null;
    token: string | null;
    householdId: string | null;
    isLoading: boolean;
    profiles: ChildProfile[];
}

interface ChildAuthContextValue extends ChildAuthState {
    fetchProfiles: (householdId: string) => Promise<void>;
    selectProfile: (childId: string) => Promise<void>;
    logout: () => void;
}

const ChildAuthContext = createContext<ChildAuthContextValue | null>(null);

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export function ChildAuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ChildAuthState>({
        profile: null,
        token: null,
        householdId: null,
        isLoading: true,
        profiles: [],
    });

    // Restore session from localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('child_session_token');
        const storedProfile = localStorage.getItem('child_profile');
        const storedHouseholdId = localStorage.getItem('child_household_id');

        if (storedToken && storedProfile) {
            try {
                const profile = JSON.parse(storedProfile) as ChildProfile;
                setState({
                    profile,
                    token: storedToken,
                    householdId: storedHouseholdId,
                    isLoading: false,
                    profiles: [],
                });
            } catch {
                localStorage.removeItem('child_session_token');
                localStorage.removeItem('child_profile');
                localStorage.removeItem('child_household_id');
                setState(prev => ({ ...prev, isLoading: false }));
            }
        } else {
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, []);

    // Fetch available profiles for a household
    const fetchProfiles = useCallback(async (householdId: string) => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const res = await fetch(`${API_BASE}/children`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Household-Id': householdId,
                },
            });

            if (!res.ok) {
                throw new Error('Failed to fetch profiles');
            }

            const data = await res.json() as { children: ChildProfile[] };

            setState(prev => ({
                ...prev,
                profiles: data.children,
                householdId,
                isLoading: false,
            }));

            localStorage.setItem('child_household_id', householdId);
        } catch (err) {
            console.error('Failed to fetch profiles:', err);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, []);

    // Select a profile and get session token
    const selectProfile = useCallback(async (childId: string) => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const res = await fetch(`${API_BASE}/children/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ child_id: childId }),
            });

            if (!res.ok) {
                throw new Error('Failed to select profile');
            }

            const data = await res.json() as {
                child_session_token: string;
                child_id: string;
                household_id: string;
                display_name: string;
                avatar_id: string | null;
                preferred_mode: 'practice' | 'play' | 'talk';
                stars_balance: number;
            };

            const profile: ChildProfile = {
                child_id: data.child_id,
                display_name: data.display_name,
                avatar_id: data.avatar_id,
                preferred_mode: data.preferred_mode,
                stars_balance: data.stars_balance,
            };

            // Store in localStorage
            localStorage.setItem('child_session_token', data.child_session_token);
            localStorage.setItem('child_profile', JSON.stringify(profile));
            localStorage.setItem('child_household_id', data.household_id);

            setState({
                profile,
                token: data.child_session_token,
                householdId: data.household_id,
                isLoading: false,
                profiles: [],
            });
        } catch (err) {
            console.error('Failed to select profile:', err);
            setState(prev => ({ ...prev, isLoading: false }));
            throw err;
        }
    }, []);

    // Logout: clear profile and token
    const logout = useCallback(() => {
        localStorage.removeItem('child_session_token');
        localStorage.removeItem('child_profile');

        // Keep household ID so profiles can be fetched again
        const householdId = localStorage.getItem('child_household_id');

        setState({
            profile: null,
            token: null,
            householdId,
            isLoading: false,
            profiles: [],
        });
    }, []);

    return (
        <ChildAuthContext.Provider
            value={{
                ...state,
                fetchProfiles,
                selectProfile,
                logout,
            }}
        >
            {children}
        </ChildAuthContext.Provider>
    );
}

export function useChildAuth() {
    const context = useContext(ChildAuthContext);
    if (!context) {
        throw new Error('useChildAuth must be used within a ChildAuthProvider');
    }
    return context;
}

export function useChildToken() {
    const { token } = useChildAuth();
    return token;
}
