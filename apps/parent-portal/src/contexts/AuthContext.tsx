import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from 'react';
import {
    login as apiLogin,
    logout as apiLogout,
    refreshAccessToken,
    getStoredToken,
    clearAuth,
} from '../lib/api';

export interface Parent {
    email: string;
    household_id: string;
}

interface AuthState {
    user: Parent | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

interface AuthActions {
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<Parent | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Try to restore session on mount
    useEffect(() => {
        async function checkAuth() {
            const token = getStoredToken();
            if (!token) {
                setIsLoading(false);
                return;
            }

            // Try to refresh the token to validate the session
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
                clearAuth();
                setIsLoading(false);
                return;
            }

            // Token is valid - we need to get user info
            // For now, decode from localStorage if we stored it
            const storedUser = localStorage.getItem('parent_user');
            if (storedUser) {
                try {
                    setUser(JSON.parse(storedUser));
                } catch {
                    clearAuth();
                    localStorage.removeItem('parent_user');
                }
            }

            setIsLoading(false);
        }

        checkAuth();
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const response = await apiLogin(email, password);
        const parent: Parent = {
            email: response.email,
            household_id: response.household_id,
        };
        setUser(parent);
        localStorage.setItem('parent_user', JSON.stringify(parent));
    }, []);

    const logout = useCallback(async () => {
        await apiLogout();
        setUser(null);
        localStorage.removeItem('parent_user');
    }, []);

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
