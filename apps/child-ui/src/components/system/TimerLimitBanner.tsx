/**
 * apps/child-ui/src/components/system/TimerLimitBanner.tsx
 *
 * Banner shown when play time is running low or exhausted.
 * Positive, supportive messaging without negative framing.
 */

import './TimerLimitBanner.css';

export interface TimerLimitBannerProps {
    /** Minutes remaining (0 = time exhausted) */
    minutesRemaining: number;
    /** Current mode that's limited */
    mode: 'play' | 'practice' | 'talk';
    /** Called when child wants to switch to a different mode */
    onSwitchMode?: (newMode: 'practice' | 'talk') => void;
    /** Called when child wants to dismiss the banner */
    onDismiss?: () => void;
}

export function TimerLimitBanner({
    minutesRemaining,
    mode,
    onSwitchMode,
    onDismiss,
}: TimerLimitBannerProps) {
    const isExhausted = minutesRemaining <= 0;
    const isWarning = minutesRemaining > 0 && minutesRemaining <= 5;

    // Positive messaging based on status
    const getMessage = () => {
        if (isExhausted) {
            return {
                title: "Great Playing!",
                body: "You've had lots of fun today! Let's try something else.",
                icon: "🎮",
            };
        }
        if (isWarning) {
            return {
                title: `${minutesRemaining} Minutes Left!`,
                body: "Almost time to switch - finish up your game!",
                icon: "⏰",
            };
        }
        return {
            title: `${minutesRemaining} Minutes Available`,
            body: "Have fun playing!",
            icon: "🎯",
        };
    };

    const message = getMessage();
    const bannerClass = isExhausted
        ? 'timer-banner-exhausted'
        : isWarning
        ? 'timer-banner-warning'
        : 'timer-banner-info';

    return (
        <div className={`timer-limit-banner ${bannerClass}`} role="alert">
            <div className="timer-icon">
                <span aria-hidden="true">{message.icon}</span>
            </div>
            <div className="timer-content">
                <h3 className="timer-title">{message.title}</h3>
                <p className="timer-body">{message.body}</p>
            </div>
            {isExhausted && (
                <div className="timer-actions">
                    {onSwitchMode && (
                        <>
                            <button
                                className="timer-btn btn-practice"
                                onClick={() => onSwitchMode('practice')}
                            >
                                Practice
                            </button>
                            <button
                                className="timer-btn btn-talk"
                                onClick={() => onSwitchMode('talk')}
                            >
                                Talk
                            </button>
                        </>
                    )}
                    {onDismiss && (
                        <button
                            className="timer-btn btn-dismiss"
                            onClick={onDismiss}
                        >
                            OK
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
