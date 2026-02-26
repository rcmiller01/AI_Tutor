export interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenRouterResponse {
    id: string;
    choices: {
        message: {
            content: string;
            role: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export async function createCompletion(
    messages: OpenRouterMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        responseFormat?: { type: 'json_object' };
    } = {}
): Promise<OpenRouterResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

    const payload = {
        model: options.model ?? 'google/gemini-2.5-pro',
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 1024,
        response_format: options.responseFormat,
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'http://localhost:3000', // Required by OpenRouter
            'X-Title': 'Magic Mirror Tutor', // Required by OpenRouter
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<OpenRouterResponse>;
}
