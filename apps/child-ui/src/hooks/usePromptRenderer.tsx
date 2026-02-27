/**
 * apps/child-ui/src/hooks/usePromptRenderer.tsx
 *
 * Maps PromptPayload template_id to the appropriate widget component.
 */

import { useMemo } from 'react';
import type { PromptPayload } from '@mirror/schemas';
import { TapChoice, type TapChoiceProps } from '../components/widgets/TapChoice';
import { DragBins, type DragBinsProps } from '../components/widgets/DragBins';
import { MatchPairs, type MatchPairsProps } from '../components/widgets/MatchPairs';
import { TypeInBlank, type TypeInBlankProps } from '../components/widgets/TypeInBlank';

// Widget component types
type WidgetComponent =
    | typeof TapChoice
    | typeof DragBins
    | typeof MatchPairs
    | typeof TypeInBlank;

// Map template IDs to widget components
const WIDGET_MAP: Record<string, WidgetComponent> = {
    tap_choice: TapChoice,
    drag_bins: DragBins,
    match_pairs: MatchPairs,
    type_in_blank: TypeInBlank,
};

interface UsePromptRendererResult {
    Widget: WidgetComponent | null;
    widgetProps: TapChoiceProps | DragBinsProps | MatchPairsProps | TypeInBlankProps | Record<string, never>;
}

/**
 * Transform PromptPayload content to widget props based on template type.
 */
function transformContent(prompt: PromptPayload): Record<string, unknown> {
    const { template_id, content } = prompt;

    switch (template_id) {
        case 'tap_choice':
            return {
                promptText: content.prompt_text ?? '',
                choices: content.choices ?? [],
            };

        case 'drag_bins':
            return {
                bins: content.bins ?? [],
                items: content.items ?? [],
            };

        case 'match_pairs':
            return {
                pairs: content.pairs ?? [],
            };

        case 'type_in_blank':
            return {
                promptText: content.prompt_text ?? '',
                placeholder: content.placeholder ?? 'Type your answer...',
            };

        default:
            return {};
    }
}

export function usePromptRenderer(prompt: PromptPayload | null): UsePromptRendererResult {
    return useMemo(() => {
        if (!prompt) {
            return { Widget: null, widgetProps: {} };
        }

        const Widget = WIDGET_MAP[prompt.template_id] ?? null;
        const widgetProps = Widget ? transformContent(prompt) : {};

        return { Widget, widgetProps };
    }, [prompt]);
}
