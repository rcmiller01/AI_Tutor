import { useState, useCallback } from 'react';

interface TapChoiceProps {
    promptText: string;
    choices: { choice_id: string; label: string }[];
    onSubmit: (choiceId: string) => void;
    disabled: boolean;
    feedback: {
        choiceId: string;
        isCorrect: boolean;
        hintText?: string;
    } | null;
}

export function TapChoice({ promptText, choices, onSubmit, disabled, feedback }: TapChoiceProps) {
    const [selected, setSelected] = useState<string | null>(null);

    const handleTap = useCallback(
        (choiceId: string) => {
            if (disabled) return;
            setSelected(choiceId);
            onSubmit(choiceId);
        },
        [disabled, onSubmit],
    );

    return (
        <div className="tap-choice">
            <h2 className="prompt-text">{promptText}</h2>
            <div className="choices-grid">
                {choices.map((choice) => {
                    let className = 'choice-button';
                    if (feedback && feedback.choiceId === choice.choice_id) {
                        className += feedback.isCorrect ? ' correct' : ' incorrect';
                    }
                    if (selected === choice.choice_id && !feedback) {
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
            {feedback && !feedback.isCorrect && feedback.hintText && (
                <div className="hint-banner">
                    <span className="hint-icon">💡</span>
                    <p>{feedback.hintText}</p>
                </div>
            )}
        </div>
    );
}
