/**
 * apps/child-ui/src/components/widgets/TypeInBlank.tsx
 *
 * Text input widget for fill-in-the-blank answers.
 * Touch-optimized with large text input.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import './TypeInBlank.css';

export interface TypeInBlankProps {
    promptText: string;
    placeholder?: string;
    onSubmit: (response: { text: string }) => void;
    disabled: boolean;
}

export function TypeInBlank({
    promptText,
    placeholder = 'Type your answer...',
    onSubmit,
    disabled,
}: TypeInBlankProps) {
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current && !disabled) {
            inputRef.current.focus();
        }
    }, [disabled]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value);
    }, []);

    const handleSubmit = useCallback(() => {
        if (disabled || !value.trim()) return;
        onSubmit({ text: value.trim() });
    }, [disabled, value, onSubmit]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    }, [handleSubmit]);

    return (
        <div className="type-in-blank-widget">
            <h2 className="prompt-text">{promptText}</h2>

            <div className="input-container">
                <input
                    ref={inputRef}
                    type="text"
                    className="answer-input"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                />
            </div>

            <button
                className="submit-btn"
                onClick={handleSubmit}
                disabled={disabled || !value.trim()}
            >
                Check My Answer
            </button>
        </div>
    );
}
