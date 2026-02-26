interface ScoreDisplayProps {
    stars: number;
    streak: number;
    streakMultiplier: number;
    currentItem: number;
    totalItems: number;
    difficulty: number;
    accuracy?: number;
}

export function ScoreDisplay({
    stars,
    streak,
    streakMultiplier,
    currentItem,
    totalItems,
    difficulty,
}: ScoreDisplayProps) {
    return (
        <div className="score-display">
            <div className="score-item stars">
                <span className="score-icon">⭐</span>
                <span className="score-value">{stars}</span>
            </div>
            <div className="score-item streak">
                <span className="score-icon">🔥</span>
                <span className="score-value">
                    {streak}
                    {streakMultiplier > 1 && <span className="multiplier">×{streakMultiplier}</span>}
                </span>
            </div>
            <div className="score-item progress">
                <span className="score-label">
                    {currentItem}/{totalItems}
                </span>
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${(currentItem / totalItems) * 100}%` }}
                    />
                </div>
            </div>
            <div className="score-item difficulty">
                <span className="score-label">Lvl {difficulty}</span>
            </div>
        </div>
    );
}
