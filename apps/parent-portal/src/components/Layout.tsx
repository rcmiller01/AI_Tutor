import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import './Layout.css';

interface ApprovalCount {
    pending: number;
}

export function Layout() {
    const { user, logout } = useAuth();
    const [pendingCount, setPendingCount] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        async function fetchPendingCount() {
            try {
                const data = await apiFetch<ApprovalCount>('/approvals/count');
                setPendingCount(data.pending);
            } catch {
                // Silently fail - badge just won't show
            }
        }

        fetchPendingCount();
        // Poll every 30 seconds
        const interval = setInterval(fetchPendingCount, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleLogout = async () => {
        await logout();
    };

    return (
        <div className="layout">
            <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
                <div className="sidebar-header">
                    <h1 className="logo">Magic Mirror</h1>
                    <button
                        className="btn-ghost sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                    >
                        {sidebarOpen ? '<' : '>'}
                    </button>
                </div>

                <nav className="nav">
                    <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">&#9776;</span>
                        {sidebarOpen && <span>Dashboard</span>}
                    </NavLink>

                    <NavLink to="/approvals" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">&#10003;</span>
                        {sidebarOpen && <span>Approvals</span>}
                        {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
                    </NavLink>

                    <NavLink to="/worlds" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="nav-icon">&#9733;</span>
                        {sidebarOpen && <span>Worlds</span>}
                    </NavLink>
                </nav>

                <div className="sidebar-footer">
                    {sidebarOpen && user && (
                        <div className="user-info">
                            <span className="user-email">{user.email}</span>
                        </div>
                    )}
                    <button className="btn-ghost logout-btn" onClick={handleLogout}>
                        {sidebarOpen ? 'Logout' : 'X'}
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
