/**
 * apps/child-ui/src/components/progress/StreakMeter.tsx
 *
 * Displays current streak count with fire animation.
 * Positive feedback only - shows current count, no "broken" messages.
 */

import './StreakMeter.css';

interface StreakMeterProps {
    current: number;
    max?: number;
}

export function StreakMeter({ current, max = 10 }: StreakMeterProps) {
    // Determine fire intensity based on streak
    const intensity = current >= 10 ? 'blazing' : current >= 5 ? 'hot' : current >= 3 ? 'warm' : '';

    return (
        <div className={`streak-meter ${intensity}`}>
            <span className="streak-icon">🔥</span>
            <span className="streak-value">{current}</span>
            {current >= 5 && (
                <span className="streak-multiplier">x{Math.min(Math.floor(current / 5) + 1, 3)}</span>
            )}
        </div>
    );
}
