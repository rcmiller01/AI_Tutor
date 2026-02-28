import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../lib/api';
import './Auth.css';

const AVATARS = [
    { id: 'fox', label: 'Fox', emoji: '🦊' },
    { id: 'rabbit', label: 'Rabbit', emoji: '🐰' },
    { id: 'bear', label: 'Bear', emoji: '🐻' },
    { id: 'owl', label: 'Owl', emoji: '🦉' },
    { id: 'cat', label: 'Cat', emoji: '🐱' },
    { id: 'dog', label: 'Dog', emoji: '🐶' },
    { id: 'penguin', label: 'Penguin', emoji: '🐧' },
    { id: 'unicorn', label: 'Unicorn', emoji: '🦄' },
];

export function AddChild() {
    const [displayName, setDisplayName] = useState('');
    const [avatarId, setAvatarId] = useState('fox');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const navigate = useNavigate();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (!displayName.trim()) {
            setError('Please enter a name');
            return;
        }

        setIsSubmitting(true);

        try {
            await apiFetch('/admin/children', {
                method: 'POST',
                body: JSON.stringify({
                    display_name: displayName.trim(),
                    avatar_id: avatarId,
                }),
            });
            navigate('/', { replace: true });
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError('An unexpected error occurred');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="add-child-page">
            <div className="page-header">
                <Link to="/" className="back-link">← Back to Dashboard</Link>
                <h1>Add a Learner</h1>
            </div>

            <form className="add-child-form card" onSubmit={handleSubmit}>
                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                <div className="form-group">
                    <label htmlFor="displayName">Name</label>
                    <input
                        id="displayName"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter child's name"
                        required
                        disabled={isSubmitting}
                        autoFocus
                    />
                </div>

                <div className="form-group">
                    <label>Choose an Avatar</label>
                    <div className="avatar-grid">
                        {AVATARS.map(avatar => (
                            <button
                                key={avatar.id}
                                type="button"
                                className={`avatar-option ${avatarId === avatar.id ? 'selected' : ''}`}
                                onClick={() => setAvatarId(avatar.id)}
                                disabled={isSubmitting}
                            >
                                <span className="avatar-emoji">{avatar.emoji}</span>
                                <span className="avatar-label">{avatar.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-actions">
                    <Link to="/" className="btn-secondary">
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center gap-sm">
                                <span className="spinner" style={{ width: 16, height: 16 }} />
                                Adding...
                            </span>
                        ) : (
                            'Add Learner'
                        )}
                    </button>
                </div>
            </form>

            <style>{`
                .add-child-page {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: var(--space-lg);
                }

                .page-header {
                    margin-bottom: var(--space-lg);
                }

                .back-link {
                    color: var(--color-text-muted);
                    text-decoration: none;
                    font-size: 0.875rem;
                    display: inline-block;
                    margin-bottom: var(--space-sm);
                }

                .back-link:hover {
                    color: var(--color-text);
                }

                .page-header h1 {
                    margin: 0;
                }

                .add-child-form {
                    padding: var(--space-lg);
                }

                .avatar-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: var(--space-sm);
                    margin-top: var(--space-sm);
                }

                .avatar-option {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-xs);
                    padding: var(--space-md);
                    border: 2px solid var(--color-border);
                    border-radius: var(--radius-md);
                    background: var(--color-bg);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .avatar-option:hover:not(:disabled) {
                    border-color: var(--color-primary);
                    background: var(--color-bg-secondary);
                }

                .avatar-option.selected {
                    border-color: var(--color-primary);
                    background: var(--color-primary-light);
                }

                .avatar-option:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .avatar-emoji {
                    font-size: 2rem;
                }

                .avatar-label {
                    font-size: 0.75rem;
                    color: var(--color-text-muted);
                }

                .form-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--space-md);
                    margin-top: var(--space-lg);
                    padding-top: var(--space-lg);
                    border-top: 1px solid var(--color-border);
                }

                @media (max-width: 480px) {
                    .avatar-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
            `}</style>
        </div>
    );
}
