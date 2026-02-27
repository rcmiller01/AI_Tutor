/**
 * apps/child-ui/src/hooks/usePromptRenderer.tsx
 *
 * Maps PromptPayload template_id to the appropriate widget component.
 */

import { useMemo } from 'react';
import type { PromptPayload } from '@mirror/schemas';
import { TapChoice } from '../components/widgets/TapChoice';
import { DragBins } from '../components/widgets/DragBins';
import { MatchPairs } from '../components/widgets/MatchPairs';
import { TypeInBlank } from '../components/widgets/TypeInBlank';
import { ReadAloudPage } from '../components/widgets/ReadAloudPage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WidgetComponent = React.ComponentType<any>;

// Map template IDs to widget components
const WIDGET_MAP: Record<string, WidgetComponent> = {
    tap_choice: TapChoice,
    drag_bins: DragBins,
    match_pairs: MatchPairs,
    type_in_blank: TypeInBlank,
    story_page: ReadAloudPage,
    // comprehension_q uses TapChoice format
    comprehension_q: TapChoice,
};

interface UsePromptRendererResult {
    Widget: WidgetComponent | null;
    widgetProps: Record<string, unknown>;
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

        case 'story_page':
            return {
                content: {
                    page_number: content.page_number ?? 1,
                    page_text: content.page_text ?? '',
                    word_spans: content.word_spans ?? [],
                    illustration_key: content.illustration_key,
                },
            };

        case 'comprehension_q':
            return {
                promptText: content.question ?? '',
                choices: content.choices ?? [],
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
