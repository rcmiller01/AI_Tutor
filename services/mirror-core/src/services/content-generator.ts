import { getSkillSpec } from '../db/queries.js';
import { createContentGenJob, updateContentGenJob } from '../db/jobs.js';
import { createCompletion } from '../llm/openrouter.js';
import {
    validateTapChoice,
    validateTypeInBlank,
    validateDragBins,
    validateMatchPairs,
    buildValidationAddendum,
    type ValidationContext,
    type ValidationResult,
} from './content-validator.js';
import { generateContentEmbedding } from './embedding-service.js';
import {
    insertContentWithEmbedding,
    getCuratedContent,
    type ContentMetadata,
} from '../db/embedding-queries.js';
import type {
    TapChoiceItem,
    TypeInBlankItem,
    DragBinsSet,
    MatchPairsSet,
    ContentPayload,
    TemplateId,
    EngineType,
} from '@mirror/schemas';

// =============================================================================
// Configuration
// =============================================================================

const MAX_RETRY_COUNT = 3;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_CHILD_AGE = 7;

// Simple lock to prevent concurrent generations for the same skill+difficulty
const inProgressGenerations = new Set<string>();

// =============================================================================
// Types
// =============================================================================

export interface ContentGenParams {
    skill_id: string;
    template_id: TemplateId;
    difficulty_level: number;
    batch_size?: number;
    child_age?: number;
    reading_level?: 'pre' | 'early' | 'fluent';
    engine_type?: EngineType;
    addendum?: string;
    retry_count?: number;
}

export interface ContentGenResult {
    content_ids: string[];
    from_cache: boolean;
    fallback_used: boolean;
    validation_errors?: string[];
}

// =============================================================================
// Prompt Templates
// =============================================================================

function buildSystemPrompt(batchSize: number, childAge: number): string {
    return `You are a content generator for a children's reading tutor targeting ages ${childAge - 1}-${childAge + 1}.
Generate ${batchSize} educational items.
Output ONLY valid JSON containing an array of objects under an "items" key.

CRITICAL RULES:
1. All content must be age-appropriate, clear, and unambiguous
2. There must be EXACTLY ONE correct answer per item
3. The correct answer must NOT appear in the question/prompt text
4. Wrong answer choices (distractors) should be plausible but clearly wrong
5. Use simple vocabulary appropriate for ages ${childAge - 1}-${childAge + 1}
6. Avoid scary, violent, or negative content
7. No leading zeros in numeric answers (use "7" not "07")`;
}

function buildUserPrompt(
    templateId: TemplateId,
    skillId: string,
    difficultyLevel: number,
    rules: Record<string, unknown>,
    batchSize: number,
    addendum?: string
): string {
    const patterns = Array.isArray(rules.phonics_patterns)
        ? rules.phonics_patterns.join(', ')
        : 'any words';
    const maxLength = (rules.max_word_length as number) ?? 10;

    let basePrompt = '';

    if (templateId === 'tap_choice') {
        basePrompt = `Generate ${batchSize} tap-choice items for skill: ${skillId}
Difficulty level: ${difficultyLevel}
Phonics patterns to use: ${patterns}
Max word length: ${maxLength} characters
Number of choices per item: 4

Output JSON format:
{
  "items": [
    {
      "type": "tap_choice",
      "prompt_text": "instruction or question",
      "choices": [
        { "choice_id": "a", "label": "word1" },
        { "choice_id": "b", "label": "word2" },
        { "choice_id": "c", "label": "word3" },
        { "choice_id": "d", "label": "word4" }
      ],
      "correct_choice_id": "a"
    }
  ]
}`;
    } else if (templateId === 'type_in_blank') {
        basePrompt = `Generate ${batchSize} fill-in-the-blank items for skill: ${skillId}
Difficulty level: ${difficultyLevel}
Max answer length: ${maxLength} characters

Output JSON format:
{
  "items": [
    {
      "type": "type_in_blank",
      "prompt_text": "The ___ is big.",
      "correct_answer": "cat"
    }
  ]
}`;
    } else if (templateId === 'drag_bins') {
        basePrompt = `Generate ${batchSize} sorting/categorization items for skill: ${skillId}
Difficulty level: ${difficultyLevel}

Output JSON format:
{
  "items": [
    {
      "type": "drag_bins",
      "instruction_text": "Sort the words by their starting sound",
      "bins": [
        { "bin_id": "b1", "label": "B sounds" },
        { "bin_id": "b2", "label": "D sounds" }
      ],
      "items": [
        { "item_id": "i1", "label": "ball" },
        { "item_id": "i2", "label": "dog" }
      ],
      "correct_bin_map": { "i1": "b1", "i2": "b2" }
    }
  ]
}`;
    } else if (templateId === 'match_pairs') {
        basePrompt = `Generate ${batchSize} matching pair items for skill: ${skillId}
Difficulty level: ${difficultyLevel}

Output JSON format:
{
  "items": [
    {
      "type": "match_pairs",
      "instruction_text": "Match the rhyming words",
      "pairs": [
        { "pair_id": "p1", "left": { "label": "cat" }, "right": { "label": "hat" } },
        { "pair_id": "p2", "left": { "label": "dog" }, "right": { "label": "log" } }
      ]
    }
  ]
}`;
    }

    // Add addendum for retry attempts
    if (addendum) {
        basePrompt += `\n\n${addendum}`;
    }

    return basePrompt;
}

// =============================================================================
// Validation
// =============================================================================

function validateItem(
    item: unknown,
    templateId: TemplateId,
    ctx: ValidationContext
): ValidationResult {
    if (!item || typeof item !== 'object') {
        return {
            valid: false,
            errors: [{ field: 'item', rule: 'type', message: 'Item must be an object' }],
        };
    }

    const obj = item as Record<string, unknown>;

    // Ensure type matches template
    if (obj.type !== templateId) {
        return {
            valid: false,
            errors: [{ field: 'type', rule: 'match', message: `Expected type "${templateId}", got "${obj.type}"` }],
        };
    }

    switch (templateId) {
        case 'tap_choice':
            return validateTapChoice(obj as unknown as TapChoiceItem, ctx);
        case 'type_in_blank':
            return validateTypeInBlank(obj as unknown as TypeInBlankItem, ctx);
        case 'drag_bins':
            return validateDragBins(obj as unknown as DragBinsSet, ctx);
        case 'match_pairs':
            return validateMatchPairs(obj as unknown as MatchPairsSet, ctx);
        default:
            // For other templates, do basic validation
            return { valid: true, errors: [] };
    }
}

// =============================================================================
// Fallback Chain
// =============================================================================

async function tryOpenRouter(
    systemPrompt: string,
    userPrompt: string
): Promise<{ items: unknown[]; tokens: number } | null> {
    try {
        const response = await createCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            { responseFormat: { type: 'json_object' } }
        );

        const contentText = response.choices[0].message.content;
        const parsed = JSON.parse(contentText);

        if (!parsed.items || !Array.isArray(parsed.items)) {
            console.warn('[ContentGen] OpenRouter response missing items array');
            return null;
        }

        return { items: parsed.items, tokens: response.usage.total_tokens };
    } catch (err) {
        console.error('[ContentGen] OpenRouter failed:', err);
        return null;
    }
}

async function tryOpenAI(
    systemPrompt: string,
    userPrompt: string
): Promise<{ items: unknown[]; tokens: number } | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('[ContentGen] OpenAI API key not configured');
        return null;
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.4,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            console.error('[ContentGen] OpenAI API error:', response.status);
            return null;
        }

        const data = await response.json() as {
            choices: Array<{ message: { content: string } }>;
            usage: { total_tokens: number };
        };

        const contentText = data.choices[0].message.content;
        const parsed = JSON.parse(contentText);

        if (!parsed.items || !Array.isArray(parsed.items)) {
            console.warn('[ContentGen] OpenAI response missing items array');
            return null;
        }

        return { items: parsed.items, tokens: data.usage.total_tokens };
    } catch (err) {
        console.error('[ContentGen] OpenAI failed:', err);
        return null;
    }
}

async function getCuratedFallback(
    skillId: string,
    difficultyLevel: number,
    count: number
): Promise<ContentPayload[]> {
    const curated = await getCuratedContent(skillId, difficultyLevel, count);
    return curated.map(c => c.payload);
}

// =============================================================================
// Main Generation Function
// =============================================================================

/**
 * Generates content with validation pipeline and fallback chain.
 *
 * Pipeline:
 * 1. Try OpenRouter (primary)
 * 2. Validate content
 * 3. If validation fails and retries < MAX_RETRY_COUNT, retry with addendum
 * 4. If OpenRouter fails, try OpenAI (secondary)
 * 5. If all LLM fails, use curated fallback content
 *
 * All valid content gets embeddings generated and stored.
 */
export async function generateContentBatch(
    params: ContentGenParams
): Promise<ContentGenResult> {
    const {
        skill_id,
        template_id,
        difficulty_level,
        batch_size = DEFAULT_BATCH_SIZE,
        child_age = DEFAULT_CHILD_AGE,
        reading_level = 'early',
        engine_type = 'MICRO_SKILL_DRILL',
        addendum,
        retry_count = 0,
    } = params;

    const lockKey = `${skill_id}:${template_id}:${difficulty_level}`;
    if (inProgressGenerations.has(lockKey)) {
        console.log(`[ContentGen] Generation already in progress for ${lockKey}`);
        return { content_ids: [], from_cache: false, fallback_used: false };
    }

    inProgressGenerations.add(lockKey);

    try {
        const spec = await getSkillSpec(skill_id);
        if (!spec) throw new Error(`Skill ${skill_id} not found`);

        const rules = spec.item_generator_rules ?? {};
        const validationCtx: ValidationContext = {
            skill_id,
            child_age,
            reading_level,
            engine_type: engine_type === 'MICRO_SKILL_DRILL' ? 'MSD' :
                         engine_type === 'MATCH_SORT_CLASSIFY' ? 'MSC' : 'SMT',
            max_word_length: rules.max_word_length as number | undefined,
        };

        console.log(`[ContentGen] Generating ${batch_size} items for ${skill_id} Lvl ${difficulty_level}...`);

        // Create job for tracking
        const jobId = await createContentGenJob(
            skill_id,
            template_id,
            difficulty_level,
            { batch_size, child_age, addendum },
            rules as Record<string, unknown>
        );

        await updateContentGenJob(jobId, { status: 'running' });

        console.log(`[ContentGen] Job ${jobId} started for ${skill_id}, retry: ${retry_count}`);

        const systemPrompt = buildSystemPrompt(batch_size, child_age);
        const userPrompt = buildUserPrompt(template_id, skill_id, difficulty_level, rules as Record<string, unknown>, batch_size, addendum);

        // Fallback chain: OpenRouter -> OpenAI -> Curated
        let llmResult = await tryOpenRouter(systemPrompt, userPrompt);
        let provider: 'openrouter' | 'openai' | 'curated' = 'openrouter';

        if (!llmResult) {
            console.log('[ContentGen] Falling back to OpenAI...');
            llmResult = await tryOpenAI(systemPrompt, userPrompt);
            provider = 'openai';
        }

        const newContentIds: string[] = [];
        let fallbackUsed = false;
        const allValidationErrors: string[] = [];

        if (llmResult) {
            // Validate each item
            let validCount = 0;
            const invalidItems: Array<{ item: unknown; errors: string[] }> = [];

            for (const item of llmResult.items) {
                const validation = validateItem(item, template_id, validationCtx);

                if (validation.valid) {
                    // Generate embedding and store
                    try {
                        const embedding = await generateContentEmbedding(
                            item as ContentPayload,
                            skill_id
                        );

                        const metadata: ContentMetadata = {
                            skill_id,
                            engine_type,
                            template_id,
                            source: 'LLM_GENERATED',
                            difficulty_level,
                            validation_status: 'valid',
                            retry_count,
                        };

                        const contentId = await insertContentWithEmbedding(
                            item as ContentPayload,
                            embedding,
                            metadata
                        );

                        newContentIds.push(contentId);
                        validCount++;
                    } catch (embedErr) {
                        console.error('[ContentGen] Embedding/storage failed:', embedErr);
                        // Still count as valid, but without embedding
                    }
                } else {
                    const errors = validation.errors.map(e => `${e.field}: ${e.message}`);
                    invalidItems.push({ item, errors });
                    allValidationErrors.push(...errors);
                    console.warn('[ContentGen] Validation failed:', errors);
                }
            }

            // If some items failed validation and we haven't exhausted retries
            if (invalidItems.length > 0 && retry_count < MAX_RETRY_COUNT) {
                const retryAddendum = buildValidationAddendum(
                    invalidItems.flatMap(i =>
                        i.errors.map(e => ({
                            field: e.split(':')[0],
                            rule: 'retry',
                            message: e,
                        }))
                    )
                );

                console.log(`[ContentGen] Validation failed for ${invalidItems.length} items, retrying (attempt ${retry_count + 1}/${MAX_RETRY_COUNT})...`);

                // Recursively retry for failed items
                const retryResult = await generateContentBatch({
                    ...params,
                    batch_size: invalidItems.length,
                    addendum: retryAddendum,
                    retry_count: retry_count + 1,
                });

                newContentIds.push(...retryResult.content_ids);
            }

            // Update job status
            await updateContentGenJob(jobId, {
                status: validCount > 0 ? 'succeeded' : 'failed',
                total_tokens_used: llmResult.tokens,
            });

            if (validCount > 0) {
                console.log(`[ContentGen] Generated ${validCount} valid items via ${provider}`);
            }
        }

        // Fallback to curated content if LLM failed completely
        if (newContentIds.length === 0) {
            console.log('[ContentGen] All LLM attempts failed, using curated fallback...');
            fallbackUsed = true;

            const curatedItems = await getCuratedFallback(skill_id, difficulty_level, batch_size);

            for (const item of curatedItems) {
                try {
                    const embedding = await generateContentEmbedding(item, skill_id);
                    const metadata: ContentMetadata = {
                        skill_id,
                        engine_type,
                        template_id,
                        source: 'CURATED',
                        difficulty_level,
                        validation_status: 'fallback',
                        retry_count,
                    };

                    const contentId = await insertContentWithEmbedding(item, embedding, metadata);
                    newContentIds.push(contentId);
                } catch (err) {
                    console.error('[ContentGen] Failed to store curated item:', err);
                }
            }

            console.log(`[ContentGen] Used ${curatedItems.length} curated fallback items`);
        }

        if (newContentIds.length > 0) {
            console.log(`[ContentGen] Job ${jobId} completed: ${newContentIds.length} items`);
        }

        return {
            content_ids: newContentIds,
            from_cache: false,
            fallback_used: fallbackUsed,
            validation_errors: allValidationErrors.length > 0 ? allValidationErrors : undefined,
        };

    } finally {
        inProgressGenerations.delete(lockKey);
    }
}
