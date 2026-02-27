import type {
    TapChoiceItem,
    TypeInBlankItem,
    DragBinsSet,
    MatchPairsSet,
    StoryPage,
    ComprehensionQ,
    ContentPayload,
} from '@mirror/schemas';

// =============================================================================
// Configuration
// =============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

// =============================================================================
// Types
// =============================================================================

interface OpenAIEmbeddingResponse {
    object: 'list';
    data: Array<{
        object: 'embedding';
        embedding: number[];
        index: number;
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

// =============================================================================
// Core Embedding Functions
// =============================================================================

/**
 * Generates an embedding vector for the given text using OpenAI's API.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // Truncate text if too long (OpenAI has token limits)
    const truncatedText = text.slice(0, 8000);

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: truncatedText,
            dimensions: EMBEDDING_DIMENSIONS,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embedding API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OpenAIEmbeddingResponse;

    if (!data.data || data.data.length === 0) {
        throw new Error('OpenAI API returned no embeddings');
    }

    return data.data[0].embedding;
}

/**
 * Generates embeddings for multiple texts in a batch.
 * More efficient than calling generateEmbedding multiple times.
 */
export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    if (texts.length === 0) return [];

    // Truncate each text
    const truncatedTexts = texts.map(t => t.slice(0, 8000));

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: truncatedTexts,
            dimensions: EMBEDDING_DIMENSIONS,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embedding API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OpenAIEmbeddingResponse;

    // Sort by index to ensure correct order
    return data.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);
}

// =============================================================================
// Content-Specific Embedding Text Builders
// =============================================================================

function buildTapChoiceText(item: TapChoiceItem, skillId: string): string {
    const correctChoice = item.choices.find(c => c.choice_id === item.correct_choice_id);
    const distractors = item.choices
        .filter(c => c.choice_id !== item.correct_choice_id)
        .map(c => c.label)
        .join(', ');

    return [
        `skill:${skillId}`,
        `type:tap_choice`,
        `stem:${item.prompt_text}`,
        `answer:${correctChoice?.label ?? ''}`,
        `distractors:${distractors}`,
    ].join(' ');
}

function buildTypeInBlankText(item: TypeInBlankItem, skillId: string): string {
    return [
        `skill:${skillId}`,
        `type:type_in_blank`,
        `stem:${item.prompt_text}`,
        `answer:${item.correct_answer}`,
        item.accept_alternatives ? `alternatives:${item.accept_alternatives.join(', ')}` : '',
    ].filter(Boolean).join(' ');
}

function buildDragBinsText(item: DragBinsSet, skillId: string): string {
    const bins = item.bins.map(b => b.label).join(', ');
    const items = item.items.map(i => i.label).join(', ');

    return [
        `skill:${skillId}`,
        `type:drag_bins`,
        `instruction:${item.instruction_text ?? ''}`,
        `bins:${bins}`,
        `items:${items}`,
    ].join(' ');
}

function buildMatchPairsText(item: MatchPairsSet, skillId: string): string {
    const pairs = item.pairs.map(p => `${p.left.label}-${p.right.label}`).join(', ');

    return [
        `skill:${skillId}`,
        `type:match_pairs`,
        `instruction:${item.instruction_text ?? ''}`,
        `pairs:${pairs}`,
    ].join(' ');
}

function buildStoryPageText(item: StoryPage, skillId: string): string {
    const tappableWords = item.word_spans
        .filter(w => w.is_tappable)
        .map(w => w.word)
        .join(', ');

    return [
        `skill:${skillId}`,
        `type:story_page`,
        `story:${item.story_id ?? ''}`,
        `page:${item.page_number}`,
        `text:${item.page_text}`,
        tappableWords ? `vocabulary:${tappableWords}` : '',
    ].filter(Boolean).join(' ');
}

function buildComprehensionQText(item: ComprehensionQ, skillId: string): string {
    const correctChoice = item.choices.find(c => c.choice_id === item.correct_choice_id);

    return [
        `skill:${skillId}`,
        `type:comprehension_q`,
        `story:${item.story_id ?? ''}`,
        `question_type:${item.question_type}`,
        `question:${item.question}`,
        `answer:${correctChoice?.label ?? ''}`,
    ].join(' ');
}

/**
 * Builds a structured text representation of content for embedding.
 * The format includes skill ID, content type, and key semantic features.
 */
export function buildEmbeddingText(payload: ContentPayload, skillId: string): string {
    switch (payload.type) {
        case 'tap_choice':
            return buildTapChoiceText(payload, skillId);
        case 'type_in_blank':
            return buildTypeInBlankText(payload, skillId);
        case 'drag_bins':
            return buildDragBinsText(payload, skillId);
        case 'match_pairs':
            return buildMatchPairsText(payload, skillId);
        case 'story_page':
            return buildStoryPageText(payload, skillId);
        case 'comprehension_q':
            return buildComprehensionQText(payload, skillId);
        default:
            // Fallback for unknown types - stringify the payload
            return `skill:${skillId} content:${JSON.stringify(payload)}`;
    }
}

/**
 * Generates an embedding for a content payload.
 * Combines skill context with content features for semantic search.
 */
export async function generateContentEmbedding(
    payload: ContentPayload,
    skillId: string
): Promise<number[]> {
    const text = buildEmbeddingText(payload, skillId);
    return generateEmbedding(text);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculates cosine similarity between two embeddings.
 * Returns a value between -1 and 1, where 1 means identical.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
}

/**
 * Formats an embedding array for pgvector storage.
 */
export function formatForPgvector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
}

/**
 * Parses a pgvector string back to a number array.
 */
export function parseFromPgvector(pgvectorStr: string): number[] {
    // pgvector format: [0.1,0.2,0.3,...]
    const inner = pgvectorStr.slice(1, -1);
    return inner.split(',').map(Number);
}

// Export constants for use elsewhere
export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
