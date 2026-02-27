/**
 * apps/child-ui/src/components/widgets/ReadAloudPage.tsx
 *
 * Story page widget with read-aloud functionality.
 * Features:
 * - Word highlighting during TTS playback
 * - Tappable vocabulary words
 * - Illustration display
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { StoryPage, WordSpan } from '@mirror/schemas';
import { WordTapPopup } from './WordTapPopup';
import './ReadAloudPage.css';

export interface ReadAloudPageProps {
    /** Story page content */
    content: StoryPage;
    /** Called when user finishes the page */
    onComplete?: () => void;
    /** Called when word is tapped (for vocabulary tracking) */
    onWordTap?: (word: string, wordIndex: number) => void;
    /** Whether TTS is currently playing */
    isPlaying?: boolean;
    /** Current word index being read (for highlighting) */
    currentWordIndex?: number;
    /** Called to request TTS playback */
    onPlayRequest?: () => void;
    /** Called to pause TTS playback */
    onPauseRequest?: () => void;
}

export function ReadAloudPage({
    content,
    onComplete,
    onWordTap,
    isPlaying = false,
    currentWordIndex = -1,
    onPlayRequest,
    onPauseRequest,
}: ReadAloudPageProps) {
    const [selectedWord, setSelectedWord] = useState<WordSpan | null>(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const textRef = useRef<HTMLDivElement>(null);

    // Handle word tap
    const handleWordTap = useCallback((word: WordSpan, event: React.MouseEvent) => {
        if (!word.is_tappable) return;

        // Calculate popup position
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        setPopupPosition({
            x: rect.left + rect.width / 2,
            y: rect.top,
        });
        setSelectedWord(word);

        // Notify parent
        onWordTap?.(word.word, content.word_spans.indexOf(word));
    }, [content.word_spans, onWordTap]);

    // Close popup
    const handleClosePopup = useCallback(() => {
        setSelectedWord(null);
    }, []);

    // Render text with word spans
    const renderText = () => {
        const { page_text, word_spans } = content;

        if (!word_spans || word_spans.length === 0) {
            return <p className="story-text">{page_text}</p>;
        }

        const elements: React.ReactNode[] = [];
        let lastIndex = 0;

        word_spans.forEach((span, idx) => {
            // Add text before this span
            if (span.start_index > lastIndex) {
                elements.push(
                    <span key={`text-${lastIndex}`}>
                        {page_text.slice(lastIndex, span.start_index)}
                    </span>
                );
            }

            // Add the word span
            const isHighlighted = idx === currentWordIndex;
            const isTappable = span.is_tappable;

            elements.push(
                <span
                    key={`word-${idx}`}
                    className={`
                        story-word
                        ${isHighlighted ? 'highlighted' : ''}
                        ${isTappable ? 'tappable' : ''}
                    `}
                    onClick={(e) => isTappable && handleWordTap(span, e)}
                    role={isTappable ? 'button' : undefined}
                    tabIndex={isTappable ? 0 : undefined}
                    aria-label={isTappable ? `Learn about: ${span.word}` : undefined}
                >
                    {span.word}
                </span>
            );

            lastIndex = span.end_index;
        });

        // Add remaining text
        if (lastIndex < page_text.length) {
            elements.push(
                <span key={`text-${lastIndex}`}>
                    {page_text.slice(lastIndex)}
                </span>
            );
        }

        return <p className="story-text">{elements}</p>;
    };

    return (
        <div className="read-aloud-page">
            {/* Illustration */}
            {content.illustration_key && (
                <div className="story-illustration">
                    <img
                        src={`/illustrations/${content.illustration_key}`}
                        alt={`Illustration for page ${content.page_number}`}
                        onError={(e) => {
                            // Hide broken images
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
            )}

            {/* Story text */}
            <div className="story-content" ref={textRef}>
                {renderText()}
            </div>

            {/* Controls */}
            <div className="story-controls">
                <button
                    className="control-btn btn-play"
                    onClick={isPlaying ? onPauseRequest : onPlayRequest}
                    aria-label={isPlaying ? 'Pause reading' : 'Read aloud'}
                >
                    <span className="control-icon" aria-hidden="true">
                        {isPlaying ? '⏸️' : '🔊'}
                    </span>
                    <span className="control-text">
                        {isPlaying ? 'Pause' : 'Read to Me'}
                    </span>
                </button>

                <button
                    className="control-btn btn-next"
                    onClick={onComplete}
                    aria-label="Next page"
                >
                    <span className="control-text">Next</span>
                    <span className="control-icon" aria-hidden="true">➡️</span>
                </button>
            </div>

            {/* Page number */}
            <div className="page-number" aria-label={`Page ${content.page_number}`}>
                {content.page_number}
            </div>

            {/* Word popup */}
            {selectedWord && (
                <WordTapPopup
                    word={selectedWord.word}
                    definition={selectedWord.definition}
                    soundItOut={selectedWord.sound_it_out}
                    position={popupPosition}
                    onClose={handleClosePopup}
                />
            )}
        </div>
    );
}
