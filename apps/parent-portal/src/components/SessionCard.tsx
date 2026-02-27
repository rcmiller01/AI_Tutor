import './SessionCard.css';

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

interface SessionCardProps {
    session: SessionSummary;
    childName: string;
}

export function SessionCard({ session, childName }: SessionCardProps) {
    const accuracy = session.problems_attempted > 0
        ? Math.round((session.problems_correct / session.problems_attempted) * 100)
        : 0;

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return `Today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        } else if (diffDays === 1) {
            return `Yesterday at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        } else {
            return date.toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        }
    };

    const getAccuracyColor = (acc: number) => {
        if (acc >= 80) return 'var(--color-success)';
        if (acc >= 60) return 'var(--color-warning)';
        return 'var(--color-error)';
    };

    return (
        <div className="session-card card">
            <div className="session-header">
                <div className="session-info">
                    <span className="session-child">{childName}</span>
                    <span className="session-date text-muted">{formatDate(session.started_at)}</span>
                </div>
                <div className="session-duration">
                    {session.duration_minutes} min
                </div>
            </div>

            <div className="session-stats">
                <div className="session-stat">
                    <span className="stat-label">Problems</span>
                    <span className="stat-value">
                        {session.problems_correct}/{session.problems_attempted}
                    </span>
                </div>

                <div className="session-stat">
                    <span className="stat-label">Accuracy</span>
                    <span
                        className="stat-value"
                        style={{ color: getAccuracyColor(accuracy) }}
                    >
                        {accuracy}%
                    </span>
                </div>

                <div className="session-stat">
                    <span className="stat-label">Skills</span>
                    <span className="stat-value">{session.skills_practiced.length}</span>
                </div>
            </div>

            {session.skills_practiced.length > 0 && (
                <div className="session-skills">
                    {session.skills_practiced.slice(0, 3).map((skill, index) => (
                        <span key={index} className="skill-tag">{skill}</span>
                    ))}
                    {session.skills_practiced.length > 3 && (
                        <span className="skill-tag">+{session.skills_practiced.length - 3} more</span>
                    )}
                </div>
            )}
        </div>
    );
}
