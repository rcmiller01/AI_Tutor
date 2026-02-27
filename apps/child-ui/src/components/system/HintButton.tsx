/**
 * apps/child-ui/src/components/system/HintButton.tsx
 *
 * Button to request a hint during gameplay.
 * Shows remaining hint count.
 */

import './HintButton.css';

interface HintButtonProps {
    remaining: number;
    onRequest: () => void;
    disabled?: boolean;
}

export function HintButton({ remaining, onRequest, disabled }: HintButtonProps) {
    const canRequest = remaining > 0 && !disabled;

    return (
        <button
            className={`hint-button ${canRequest ? '' : 'disabled'}`}
            onClick={canRequest ? onRequest : undefined}
            disabled={!canRequest}
        >
            <span className="hint-icon">💡</span>
            <span className="hint-label">Hint</span>
            {remaining > 0 && (
                <span className="hint-count">{remaining}</span>
            )}
        </button>
    );
}
