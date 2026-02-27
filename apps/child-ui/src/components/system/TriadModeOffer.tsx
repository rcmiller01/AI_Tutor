/**
 * apps/child-ui/src/components/system/TriadModeOffer.tsx
 *
 * Offers the child a choice between Talk, Practice, and Play modes.
 * Large, colorful buttons with child-friendly descriptions.
 */

import type { TriadMode } from '@mirror/schemas';
import './TriadModeOffer.css';

export interface TriadModeOfferProps {
    /** Current skill name being learned */
    skillName: string;
    /** Available modes to offer (some may be disabled by policy) */
    availableModes: TriadMode[];
    /** Recommended mode based on child's history (optional) */
    recommendedMode?: TriadMode;
    /** Play mode time remaining in minutes (show warning if low) */
    playTimeRemaining?: number;
    /** Called when child selects a mode */
    onSelectMode: (mode: TriadMode) => void;
}

const MODE_CONFIG: Record<TriadMode, {
    icon: string;
    title: string;
    description: string;
    color: string;
    bgGradient: string;
}> = {
    talk: {
        icon: '💬',
        title: 'Talk',
        description: 'Chat and learn together',
        color: '#007bff',
        bgGradient: 'linear-gradient(135deg, #cce5ff 0%, #b8daff 100%)',
    },
    practice: {
        icon: '✏️',
        title: 'Practice',
        description: 'Answer questions and earn stars',
        color: '#28a745',
        bgGradient: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
    },
    play: {
        icon: '🎮',
        title: 'Play',
        description: 'Fun games to test your skills',
        color: '#9c27b0',
        bgGradient: 'linear-gradient(135deg, #e1bee7 0%, #ce93d8 100%)',
    },
};

export function TriadModeOffer({
    skillName,
    availableModes,
    recommendedMode,
    playTimeRemaining,
    onSelectMode,
}: TriadModeOfferProps) {
    const showPlayWarning = playTimeRemaining !== undefined && playTimeRemaining <= 5;

    return (
        <div className="triad-mode-offer">
            <h2 className="offer-title">How do you want to learn {skillName}?</h2>

            <div className="mode-buttons">
                {availableModes.map((mode) => {
                    const config = MODE_CONFIG[mode];
                    const isRecommended = mode === recommendedMode;
                    const isPlayLimited = mode === 'play' && showPlayWarning;

                    return (
                        <button
                            key={mode}
                            className={`mode-button ${isRecommended ? 'recommended' : ''}`}
                            style={{
                                background: config.bgGradient,
                                borderColor: config.color,
                            }}
                            onClick={() => onSelectMode(mode)}
                        >
                            <span className="mode-icon" aria-hidden="true">
                                {config.icon}
                            </span>
                            <span className="mode-title" style={{ color: config.color }}>
                                {config.title}
                            </span>
                            <span className="mode-description">
                                {config.description}
                            </span>
                            {isRecommended && (
                                <span className="recommended-badge">For You!</span>
                            )}
                            {isPlayLimited && (
                                <span className="time-warning">
                                    {playTimeRemaining} min left
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {availableModes.length === 0 && (
                <p className="no-modes-message">
                    Let's ask a grown-up what we can do right now!
                </p>
            )}
        </div>
    );
}
