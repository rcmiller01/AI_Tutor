/**
 * apps/child-ui/src/components/widgets/TapChoice.tsx
 *
 * Multiple choice selection widget with touch-optimized buttons.
 * Touch targets are 56px+ for ages 6-8.
 */

import { useState, useCallback } from 'react';
import './TapChoice.css';

export interface TapChoiceProps {
    promptText: string;
    choices: Array<{ choice_id: string; label: string }>;
    onSubmit: (response: { choice_id: string }) => void;
    disabled: boolean;
    feedback?: {
        isCorrect: boolean;
        selectedId: string;
    } | null;
}

export function TapChoice({
    promptText,
    choices,
    onSubmit,
    disabled,
    feedback,
}: TapChoiceProps) {
    const [selected, setSelected] = useState<string | null>(null);

    const handleTap = useCallback(
        (choiceId: string) => {
            if (disabled) return;
            setSelected(choiceId);
            onSubmit({ choice_id: choiceId });
        },
        [disabled, onSubmit]
    );

    return (
        <div className="tap-choice-widget">
            <h2 className="prompt-text">{promptText}</h2>

            <div className="choices-grid">
                {choices.map((choice) => {
                    let className = 'choice-button';

                    if (feedback && feedback.selectedId === choice.choice_id) {
                        className += feedback.isCorrect ? ' correct' : ' try-again';
                    } else if (selected === choice.choice_id && !feedback) {
                        className += ' selected';
                    }

                    return (
                        <button
                            key={choice.choice_id}
                            className={className}
                            onClick={() => handleTap(choice.choice_id)}
                            disabled={disabled}
                        >
                            {choice.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
