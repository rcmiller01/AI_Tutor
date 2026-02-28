/**
 * apps/child-ui/src/pages/ProfilePicker.tsx
 *
 * Avatar selection grid for children to pick their profile.
 * Touch-optimized with large (56px+) touch targets.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChildAuth, type ChildProfile } from '../contexts/ChildAuthContext';
import './ProfilePicker.css';

// Default household ID for MVP (device-provisioned in production)
// For local dev, this should match your parent account's household
const DEFAULT_HOUSEHOLD_ID = import.meta.env.VITE_HOUSEHOLD_ID || '2d85efda-f39f-4eec-8987-b9fd5b8d233f';

// Avatar color palette
const AVATAR_COLORS = [
    '#7c3aed', // purple
    '#10b981', // green
    '#f59e0b', // amber
    '#ec4899', // pink
    '#3b82f6', // blue
    '#ef4444', // red
];

function getAvatarColor(index: number): string {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function ProfilePicker() {
    const navigate = useNavigate();
    const { profiles, isLoading, fetchProfiles, selectProfile, profile } = useChildAuth();
    const [selecting, setSelecting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // If already logged in, redirect to home
    useEffect(() => {
        if (profile) {
            navigate('/home');
        }
    }, [profile, navigate]);

    // Fetch profiles on mount
    useEffect(() => {
        const householdId = localStorage.getItem('child_household_id') || DEFAULT_HOUSEHOLD_ID;
        fetchProfiles(householdId);
    }, [fetchProfiles]);

    const handleSelectProfile = async (child: ChildProfile) => {
        setSelecting(child.child_id);
        setError(null);

        try {
            await selectProfile(child.child_id);
            navigate('/home');
        } catch (err) {
            setError('Oops! Something went wrong. Try again!');
            setSelecting(null);
        }
    };

    if (isLoading) {
        return (
            <div className="profile-picker">
                <div className="loading-container">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="profile-picker">
            <header className="picker-header">
                <h1>Who's Learning Today?</h1>
                <p className="subtitle">Tap your picture to start!</p>
            </header>

            {error && (
                <div className="error-banner">
                    <p>{error}</p>
                </div>
            )}

            {profiles.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">?</div>
                    <p>No learners found!</p>
                    <p className="hint">Ask a grown-up to add you.</p>
                </div>
            ) : (
                <div className="profiles-grid">
                    {profiles.map((child, index) => (
                        <button
                            key={child.child_id}
                            className={`profile-card ${selecting === child.child_id ? 'selecting' : ''}`}
                            onClick={() => handleSelectProfile(child)}
                            disabled={selecting !== null}
                        >
                            <div
                                className="profile-avatar"
                                style={{ backgroundColor: getAvatarColor(index) }}
                            >
                                <span>{child.display_name[0].toUpperCase()}</span>
                            </div>
                            <span className="profile-name">{child.display_name}</span>
                            {selecting === child.child_id && (
                                <div className="loading-overlay">
                                    <div className="spinner-small" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
