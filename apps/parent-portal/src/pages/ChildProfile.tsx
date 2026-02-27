import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { PolicyEditor } from '../components/PolicyEditor';
import './ChildProfile.css';

interface Child {
    child_id: string;
    display_name: string;
    avatar_id: string | null;
    preferred_mode: string;
    accessibility_skip_hints: boolean;
    stars_balance: number;
}

interface ChildPolicy {
    daily_limit_minutes: number;
    session_max_minutes: number;
    allowed_days: number[];
    allowed_start_time: string;
    allowed_end_time: string;
}

export function ChildProfile() {
    const { childId } = useParams<{ childId: string }>();
    const navigate = useNavigate();

    const [child, setChild] = useState<Child | null>(null);
    const [policy, setPolicy] = useState<ChildPolicy | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        async function fetchChildData() {
            if (!childId) return;

            try {
                const [childData, policyData] = await Promise.all([
                    apiFetch<{ child: Child }>(`/admin/children/${childId}`),
                    apiFetch<{ policy: ChildPolicy }>(`/admin/policies/${childId}`).catch(() => ({
                        policy: {
                            daily_limit_minutes: 60,
                            session_max_minutes: 20,
                            allowed_days: [0, 1, 2, 3, 4, 5, 6],
                            allowed_start_time: '06:00',
                            allowed_end_time: '20:00',
                        },
                    })),
                ]);

                setChild(childData.child);
                setPolicy(policyData.policy);
                setEditName(childData.child.display_name);
            } catch (err) {
                console.error('Failed to fetch child data:', err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchChildData();
    }, [childId]);

    const handleSaveChild = async () => {
        if (!childId) return;

        try {
            await apiFetch(`/admin/children/${childId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    display_name: editName,
                }),
            });

            setChild(prev => prev ? { ...prev, display_name: editName } : null);
            setIsEditing(false);
        } catch (err) {
            console.error('Failed to update child:', err);
        }
    };

    const handleSavePolicy = async (newPolicy: ChildPolicy) => {
        if (!childId) return;

        try {
            await apiFetch(`/admin/policies/${childId}`, {
                method: 'PUT',
                body: JSON.stringify(newPolicy),
            });

            setPolicy(newPolicy);
        } catch (err) {
            console.error('Failed to update policy:', err);
        }
    };

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="spinner" />
            </div>
        );
    }

    if (!child) {
        return (
            <div className="not-found">
                <p>Child not found</p>
                <button className="btn-primary" onClick={() => navigate('/')}>
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="child-profile">
            <header className="profile-header">
                <button className="btn-ghost back-btn" onClick={() => navigate('/')}>
                    Back
                </button>
            </header>

            {/* Child Info Card */}
            <section className="profile-section">
                <div className="card child-info-card">
                    <div className="child-avatar-large">
                        <span>{child.display_name[0].toUpperCase()}</span>
                    </div>

                    {isEditing ? (
                        <div className="edit-form">
                            <div className="form-group">
                                <label htmlFor="name">Name</label>
                                <input
                                    id="name"
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                />
                            </div>
                            <div className="edit-actions">
                                <button className="btn-ghost" onClick={() => setIsEditing(false)}>
                                    Cancel
                                </button>
                                <button className="btn-primary" onClick={handleSaveChild}>
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="child-details">
                            <h2>{child.display_name}</h2>
                            <p className="text-muted">{child.stars_balance} stars</p>
                            <button
                                className="btn-secondary"
                                onClick={() => setIsEditing(true)}
                            >
                                Edit Profile
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* Policy Editor */}
            <section className="profile-section">
                <h3>Learning Policies</h3>
                {policy && (
                    <PolicyEditor
                        childId={childId!}
                        policy={policy}
                        onSave={handleSavePolicy}
                    />
                )}
            </section>
        </div>
    );
}
