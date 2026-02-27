/**
 * apps/child-ui/src/components/system/HintBanner.tsx
 *
 * Displays a hint with supportive messaging.
 * Positive feedback only - no "wrong" indicators.
 */

import type { HintPayload } from '@mirror/schemas';
import './HintBanner.css';

interface HintBannerProps {
    hint: HintPayload;
    onDismiss?: () => void;
}

export function HintBanner({ hint, onDismiss }: HintBannerProps) {
    return (
        <div className="hint-banner-component" onClick={onDismiss}>
            <div className="hint-content">
                <span className="hint-icon">💡</span>
                <p className="hint-text">{hint.hint_text}</p>
            </div>
            {onDismiss && (
                <button className="hint-dismiss" onClick={onDismiss}>
                    Got it!
                </button>
            )}
        </div>
    );
}
