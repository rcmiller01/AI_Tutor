/**
 * apps/child-ui/src/App.tsx
 *
 * Main application with routing and context providers.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChildAuthProvider, useChildAuth } from './contexts/ChildAuthContext';
import { ProfilePicker } from './pages/ProfilePicker';
import { Home } from './pages/Home';
import { Session } from './pages/Session';
import './App.css';

// Protected route wrapper
function RequireAuth({ children }: { children: React.ReactNode }) {
    const { profile, isLoading } = useChildAuth();

    if (isLoading) {
        return (
            <div className="app">
                <div className="loading">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<ProfilePicker />} />
            <Route
                path="/home"
                element={
                    <RequireAuth>
                        <Home />
                    </RequireAuth>
                }
            />
            <Route
                path="/session"
                element={
                    <RequireAuth>
                        <Session />
                    </RequireAuth>
                }
            />
            {/* Fallback to profile picker */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ChildAuthProvider>
                <div className="app">
                    <AppRoutes />
                </div>
            </ChildAuthProvider>
        </BrowserRouter>
    );
}
