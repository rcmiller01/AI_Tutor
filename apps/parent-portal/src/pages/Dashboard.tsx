import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';
import { SessionCard } from '../components/SessionCard';
import './Dashboard.css';

interface Child {
    child_id: string;
    display_name: string;
    avatar_id: string | null;
}

interface SessionSummary {
    session_id: string;
    child_id: string;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number;
    skills_practiced: string[];
    problems_attempted: number;
    problems_correct: number;
}

interface DashboardStats {
    total_sessions_today: number;
    total_time_today_minutes: number;
    pending_approvals: number;
}

export function Dashboard() {
    useAuth(); // Ensure user is authenticated
    const [children, setChildren] = useState<Child[]>([]);
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchDashboardData() {
            try {
                const [childrenData, statsData] = await Promise.all([
                    apiFetch<{ children: Child[] }>('/admin/children'),
                    apiFetch<DashboardStats>('/admin/dashboard/stats').catch(() => null),
                ]);

                setChildren(childrenData.children);
                setStats(statsData);

                // Fetch recent sessions for each child
                if (childrenData.children.length > 0) {
                    const sessionPromises = childrenData.children.map(child =>
                        apiFetch<{ sessions: SessionSummary[] }>(
                            `/sessions/history/${child.child_id}?limit=3`
                        ).catch(() => ({ sessions: [] }))
                    );

                    const sessionResults = await Promise.all(sessionPromises);
                    const allSessions = sessionResults
                        .flatMap(r => r.sessions)
                        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
                        .slice(0, 10);

                    setSessions(allSessions);
                }
            } catch (err) {
                console.error('Failed to fetch dashboard data:', err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchDashboardData();
    }, []);

    const getChildName = (childId: string) => {
        const child = children.find(c => c.child_id === childId);
        return child?.display_name || 'Unknown';
    };

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h1>Dashboard</h1>
                <p className="text-muted">Here's what's happening with your learners</p>
            </header>

            {/* Stats */}
            {stats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <span className="stat-value">{stats.total_sessions_today}</span>
                        <span className="stat-label">Sessions Today</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{stats.total_time_today_minutes}</span>
                        <span className="stat-label">Minutes Learned</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{stats.pending_approvals}</span>
                        <span className="stat-label">Pending Approvals</span>
                    </div>
                </div>
            )}

            {/* Children */}
            <section className="dashboard-section">
                <div className="section-header">
                    <h2>Your Learners</h2>
                    <Link to="/children/new" className="btn-secondary">
                        + Add Child
                    </Link>
                </div>

                {children.length === 0 ? (
                    <div className="empty-state card">
                        <p>No learners yet. Add your first child to get started!</p>
                        <Link to="/children/new" className="btn-primary">
                            Add Child
                        </Link>
                    </div>
                ) : (
                    <div className="children-grid">
                        {children.map(child => (
                            <Link
                                key={child.child_id}
                                to={`/children/${child.child_id}`}
                                className="child-card card"
                            >
                                <div className="child-avatar">
                                    <span>{child.display_name[0].toUpperCase()}</span>
                                </div>
                                <div className="child-info">
                                    <h3>{child.display_name}</h3>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            {/* Recent Sessions */}
            <section className="dashboard-section">
                <div className="section-header">
                    <h2>Recent Sessions</h2>
                </div>

                {sessions.length === 0 ? (
                    <div className="empty-state card">
                        <p>No sessions yet. Learning sessions will appear here.</p>
                    </div>
                ) : (
                    <div className="sessions-list">
                        {sessions.map(session => (
                            <SessionCard
                                key={session.session_id}
                                session={session}
                                childName={getChildName(session.child_id)}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
