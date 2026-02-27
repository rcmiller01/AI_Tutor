/**
 * apps/child-ui/src/components/widgets/MatchPairs.tsx
 *
 * Match items from two columns by tapping.
 * Touch-optimized with large touch targets.
 */

import { useState, useCallback } from 'react';
import './MatchPairs.css';

interface PairItem {
    pair_id: string;
    left: { label: string };
    right: { label: string };
}

export interface MatchPairsProps {
    pairs: PairItem[];
    onSubmit: (response: { pairings: Array<{ left_index: number; right_index: number }> }) => void;
    disabled: boolean;
}

export function MatchPairs({ pairs, onSubmit, disabled }: MatchPairsProps) {
    // Shuffle right side items for display
    const [rightOrder] = useState(() => {
        const indices = pairs.map((_, i) => i);
        // Fisher-Yates shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return indices;
    });

    // Track matches: leftIndex -> rightIndex
    const [matches, setMatches] = useState<Record<number, number>>({});
    // Track selection
    const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
    const [selectedRight, setSelectedRight] = useState<number | null>(null);

    // Handle left item tap
    const handleLeftTap = useCallback((leftIndex: number) => {
        if (disabled) return;

        // If already matched, remove match
        if (matches[leftIndex] !== undefined) {
            setMatches(prev => {
                const next = { ...prev };
                delete next[leftIndex];
                return next;
            });
            return;
        }

        setSelectedLeft(prev => prev === leftIndex ? null : leftIndex);

        // If right is selected, make match
        if (selectedRight !== null) {
            setMatches(prev => ({
                ...prev,
                [leftIndex]: selectedRight,
            }));
            setSelectedLeft(null);
            setSelectedRight(null);
        }
    }, [disabled, matches, selectedRight]);

    // Handle right item tap
    const handleRightTap = useCallback((rightIndex: number) => {
        if (disabled) return;

        // If already matched, find and remove
        const matchedLeft = Object.entries(matches).find(
            ([, r]) => r === rightIndex
        )?.[0];
        if (matchedLeft !== undefined) {
            setMatches(prev => {
                const next = { ...prev };
                delete next[Number(matchedLeft)];
                return next;
            });
            return;
        }

        setSelectedRight(prev => prev === rightIndex ? null : rightIndex);

        // If left is selected, make match
        if (selectedLeft !== null) {
            setMatches(prev => ({
                ...prev,
                [selectedLeft]: rightIndex,
            }));
            setSelectedLeft(null);
            setSelectedRight(null);
        }
    }, [disabled, matches, selectedLeft]);

    // Handle submit
    const handleSubmit = useCallback(() => {
        if (disabled) return;

        const pairings = Object.entries(matches).map(([left, right]) => ({
            left_index: Number(left),
            right_index: right,
        }));

        onSubmit({ pairings });
    }, [disabled, matches, onSubmit]);

    // Check if all pairs are matched
    const allMatched = Object.keys(matches).length === pairs.length;

    // Check if a right item is matched
    const isRightMatched = (rightIndex: number) =>
        Object.values(matches).includes(rightIndex);

    // Get match color (consistent per pair)
    const MATCH_COLORS = ['#7c3aed', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
    const getMatchColor = (leftIndex: number) =>
        MATCH_COLORS[leftIndex % MATCH_COLORS.length];

    return (
        <div className="match-pairs-widget">
            <p className="instructions">Tap items to match them:</p>

            <div className="pairs-container">
                {/* Left column */}
                <div className="pairs-column left">
                    {pairs.map((pair, leftIndex) => {
                        const isMatched = matches[leftIndex] !== undefined;
                        const isSelected = selectedLeft === leftIndex;

                        return (
                            <button
                                key={pair.pair_id}
                                className={`pair-item ${isSelected ? 'selected' : ''} ${isMatched ? 'matched' : ''}`}
                                style={isMatched ? { borderColor: getMatchColor(leftIndex) } : undefined}
                                onClick={() => handleLeftTap(leftIndex)}
                                disabled={disabled}
                            >
                                {pair.left.label}
                            </button>
                        );
                    })}
                </div>

                {/* Right column (shuffled) */}
                <div className="pairs-column right">
                    {rightOrder.map((originalIndex) => {
                        const pair = pairs[originalIndex];
                        const isMatched = isRightMatched(originalIndex);
                        const isSelected = selectedRight === originalIndex;
                        const matchedLeftIndex = Object.entries(matches).find(
                            ([, r]) => r === originalIndex
                        )?.[0];

                        return (
                            <button
                                key={pair.pair_id + '-right'}
                                className={`pair-item ${isSelected ? 'selected' : ''} ${isMatched ? 'matched' : ''}`}
                                style={isMatched && matchedLeftIndex !== undefined
                                    ? { borderColor: getMatchColor(Number(matchedLeftIndex)) }
                                    : undefined
                                }
                                onClick={() => handleRightTap(originalIndex)}
                                disabled={disabled}
                            >
                                {pair.right.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Submit button */}
            {allMatched && (
                <button
                    className="submit-btn"
                    onClick={handleSubmit}
                    disabled={disabled}
                >
                    Check My Answer
                </button>
            )}
        </div>
    );
}
