/**
 * apps/child-ui/src/components/widgets/WordTapPopup.tsx
 *
 * Popup shown when a vocabulary word is tapped in story mode.
 * Shows definition and sound-it-out breakdown.
 */

import { useEffect, useRef } from 'react';
import './WordTapPopup.css';

export interface WordTapPopupProps {
    /** The word that was tapped */
    word: string;
    /** Definition of the word */
    definition?: string;
    /** Sound-it-out breakdown (e.g., ["c", "a", "t"]) */
    soundItOut?: string[];
    /** Position of the popup (relative to viewport) */
    position: { x: number; y: number };
    /** Called when popup should close */
    onClose: () => void;
    /** Called to play pronunciation */
    onPlaySound?: () => void;
}

export function WordTapPopup({
    word,
    definition,
    soundItOut,
    position,
    onClose,
    onPlaySound,
}: WordTapPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    // Calculate position (ensure popup stays on screen)
    const getStyle = (): React.CSSProperties => {
        const popupWidth = 280;
        const popupHeight = 200;
        const margin = 16;

        let left = position.x - popupWidth / 2;
        let top = position.y - popupHeight - margin;

        // Keep on screen horizontally
        if (left < margin) left = margin;
        if (left + popupWidth > window.innerWidth - margin) {
            left = window.innerWidth - popupWidth - margin;
        }

        // If popup would go above screen, show below instead
        if (top < margin) {
            top = position.y + margin;
        }

        return {
            left: `${left}px`,
            top: `${top}px`,
        };
    };

    return (
        <div
            ref={popupRef}
            className="word-tap-popup"
            style={getStyle()}
            role="dialog"
            aria-label={`Word: ${word}`}
        >
            {/* Word header */}
            <div className="popup-header">
                <h3 className="popup-word">{word}</h3>
                <button
                    className="popup-close"
                    onClick={onClose}
                    aria-label="Close"
                >
                    &times;
                </button>
            </div>

            {/* Definition */}
            {definition && (
                <div className="popup-section">
                    <p className="popup-definition">{definition}</p>
                </div>
            )}

            {/* Sound it out */}
            {soundItOut && soundItOut.length > 0 && (
                <div className="popup-section sound-it-out">
                    <span className="section-label">Sound it out:</span>
                    <div className="sound-letters">
                        {soundItOut.map((letter, idx) => (
                            <span key={idx} className="sound-letter">
                                {letter}
                                {idx < soundItOut.length - 1 && (
                                    <span className="sound-separator">-</span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="popup-actions">
                {onPlaySound && (
                    <button
                        className="popup-btn btn-sound"
                        onClick={onPlaySound}
                        aria-label="Hear pronunciation"
                    >
                        <span aria-hidden="true">🔊</span> Hear It
                    </button>
                )}
                <button
                    className="popup-btn btn-got-it"
                    onClick={onClose}
                >
                    Got It!
                </button>
            </div>
        </div>
    );
}
