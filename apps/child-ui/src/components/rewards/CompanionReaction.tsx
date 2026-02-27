/**
 * apps/child-ui/src/components/rewards/CompanionReaction.tsx
 *
 * Dinosaur companion with different emotional states.
 * Static version - full animation in polish phase.
 */

import './CompanionReaction.css';

export type CompanionState = 'idle' | 'celebrate' | 'encourage' | 'thinking';

interface CompanionReactionProps {
    state: CompanionState;
    message?: string;
}

// Simple dinosaur SVG states
const DINO_STATES: Record<CompanionState, { emoji: string; animation: string }> = {
    idle: { emoji: '\u{1F995}', animation: 'float' },        // sauropod
    celebrate: { emoji: '\u{1F973}', animation: 'bounce' },  // party face
    encourage: { emoji: '\u{1F917}', animation: 'wave' },    // hugging face
    thinking: { emoji: '\u{1F914}', animation: 'pulse' },    // thinking face
};

export function CompanionReaction({ state, message }: CompanionReactionProps) {
    const { emoji, animation } = DINO_STATES[state];

    return (
        <div className={`companion-container ${animation}`}>
            <div className="companion-dino">
                <span className="dino-emoji">{emoji}</span>
            </div>
            {message && (
                <div className="companion-bubble">
                    <p>{message}</p>
                </div>
            )}
        </div>
    );
}
