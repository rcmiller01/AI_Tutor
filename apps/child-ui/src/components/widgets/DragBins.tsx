/**
 * apps/child-ui/src/components/widgets/DragBins.tsx
 *
 * Drag items into categorized bins.
 * Touch-optimized with large touch targets.
 */

import { useState, useCallback } from 'react';
import './DragBins.css';

export interface DragBinsProps {
    bins: Array<{ bin_id: string; label: string }>;
    items: Array<{ item_id: string; label: string }>;
    onSubmit: (response: { placements: Record<string, string> }) => void;
    disabled: boolean;
}

export function DragBins({ bins, items, onSubmit, disabled }: DragBinsProps) {
    // Track which bin each item is placed in
    const [placements, setPlacements] = useState<Record<string, string>>({});
    // Track currently selected item (tap-to-place mode for touch)
    const [selectedItem, setSelectedItem] = useState<string | null>(null);

    // Handle item tap (select for placement)
    const handleItemTap = useCallback((itemId: string) => {
        if (disabled) return;

        // If already placed, remove from bin
        if (placements[itemId]) {
            setPlacements(prev => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
            return;
        }

        // Toggle selection
        setSelectedItem(prev => prev === itemId ? null : itemId);
    }, [disabled, placements]);

    // Handle bin tap (place selected item)
    const handleBinTap = useCallback((binId: string) => {
        if (disabled || !selectedItem) return;

        setPlacements(prev => ({
            ...prev,
            [selectedItem]: binId,
        }));
        setSelectedItem(null);
    }, [disabled, selectedItem]);

    // Handle submit
    const handleSubmit = useCallback(() => {
        if (disabled) return;

        // Check if all items are placed
        const allPlaced = items.every(item => placements[item.item_id]);
        if (!allPlaced) return;

        onSubmit({ placements });
    }, [disabled, items, placements, onSubmit]);

    // Get items in a specific bin
    const getItemsInBin = (binId: string) =>
        items.filter(item => placements[item.item_id] === binId);

    // Get unplaced items
    const unplacedItems = items.filter(item => !placements[item.item_id]);

    const allPlaced = unplacedItems.length === 0;

    return (
        <div className="drag-bins-widget">
            {/* Bins */}
            <div className="bins-row">
                {bins.map(bin => (
                    <div
                        key={bin.bin_id}
                        className={`bin ${selectedItem ? 'accepting' : ''}`}
                        onClick={() => handleBinTap(bin.bin_id)}
                    >
                        <span className="bin-label">{bin.label}</span>
                        <div className="bin-items">
                            {getItemsInBin(bin.bin_id).map(item => (
                                <button
                                    key={item.item_id}
                                    className="placed-item"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleItemTap(item.item_id);
                                    }}
                                    disabled={disabled}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Unplaced items */}
            {unplacedItems.length > 0 && (
                <div className="items-tray">
                    <p className="tray-label">Tap an item, then tap a box:</p>
                    <div className="items-row">
                        {unplacedItems.map(item => (
                            <button
                                key={item.item_id}
                                className={`item-chip ${selectedItem === item.item_id ? 'selected' : ''}`}
                                onClick={() => handleItemTap(item.item_id)}
                                disabled={disabled}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Submit button */}
            {allPlaced && (
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
