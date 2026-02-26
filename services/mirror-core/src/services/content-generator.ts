import { getSkillSpec, insertContentObject } from '../db/queries.js';
import { createContentGenJob, updateContentGenJob } from '../db/jobs.js';
import { createCompletion } from '../llm/openrouter.js';
import type { TapChoiceItem } from '@mirror/schemas';

// Simple lock to prevent concurrent generations for the same skill+difficulty
const inProgressGenerations = new Set<string>();

/**
 * Validates a generated TapChoice item.
 */
function validateTapChoice(item: unknown, maxWordLength: number): { valid: true; item: TapChoiceItem } | { valid: false; reason: string } {
    if (!item || typeof item !== 'object') return { valid: false, reason: 'Not an object' };
    const obj = item as any;

    if (obj.type !== 'tap_choice') return { valid: false, reason: 'Wrong type' };
    if (typeof obj.prompt_text !== 'string' || !obj.prompt_text) return { valid: false, reason: 'Missing or empty prompt_text' };
    if (!Array.isArray(obj.choices) || obj.choices.length < 2 || obj.choices.length > 6) {
        return { valid: false, reason: 'Must have 2-6 choices' };
    }

    if (typeof obj.correct_choice_id !== 'string') return { valid: false, reason: 'Missing correct_choice_id' };

    const choiceIds = new Set<string>();
    let hasCorrectChoice = false;

    for (const choice of obj.choices) {
        if (typeof choice.choice_id !== 'string') return { valid: false, reason: 'Invalid choice_id' };
        if (typeof choice.label !== 'string') return { valid: false, reason: 'Invalid choice label' };
        if (choice.label.length > maxWordLength) return { valid: false, reason: `Word "${choice.label}" exceeds max length ${maxWordLength}` };

        choiceIds.add(choice.choice_id);
        if (choice.choice_id === obj.correct_choice_id) {
            hasCorrectChoice = true;
        }
    }

    if (!hasCorrectChoice) {
        return { valid: false, reason: `correct_choice_id "${obj.correct_choice_id}" not found in choices` };
    }

    return { valid: true, item: obj as TapChoiceItem };
}

/**
 * Generates a batch of Drill Items using OpenRouter.
 */
export async function generateContentBatch(
    skillId: string,
    templateId: 'tap_choice',
    difficultyLevel: number,
    batchSize: number = 5
): Promise<string[]> {
    const lockKey = `${skillId}:${templateId}:${difficultyLevel}`;
    if (inProgressGenerations.has(lockKey)) {
        console.log(`[ContentGen] Generation already in progress for ${lockKey}`);
        return [];
    }

    inProgressGenerations.add(lockKey);

    try {
        const spec = await getSkillSpec(skillId);
        if (!spec) throw new Error(`Skill ${skillId} not found`);

        const rules = spec.item_generator_rules ?? {};
        const patterns = Array.isArray(rules.phonics_patterns) ? rules.phonics_patterns.join(', ') : 'any words';
        const maxLength = rules.max_word_length ?? 10;

        console.log(`[ContentGen] Kicking off generation of ${batchSize} items for ${skillId} Lvl ${difficultyLevel}...`);

        const systemPrompt = `You are a content generator for a children's reading tutor targeting ages 6-8.
Generate ${batchSize} multiple-choice items for the phonics skill.
Output ONLY valid JSON containing an array of objects under an "items" key.
All content must be age-appropriate, clear, and unambiguous.
There must be EXACTLY ONE correct answer per item.
Wrong answer choices (distractors) should be plausible but clearly wrong.`;

        const userPrompt = `Generate ${batchSize} tap-choice items for skill: ${skillId}
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
      "choices": [{ "choice_id": "a", "label": "word" }],
      "correct_choice_id": "a"
    }
  ]
}`;

        const newContentIds: string[] = [];

        // We'll generate a single job for tracking the batch request
        const jobId = await createContentGenJob(
            skillId,
            templateId,
            difficultyLevel,
            { systemPrompt, userPrompt, batchSize },
            rules
        );

        await updateContentGenJob(jobId, { status: 'running' });

        try {
            const response = await createCompletion(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                { responseFormat: { type: 'json_object' } }
            );

            const contentText = response.choices[0].message.content;
            let parsed: any;

            try {
                parsed = JSON.parse(contentText);
            } catch (err) {
                throw new Error('LLM did not return valid JSON');
            }

            if (!parsed.items || !Array.isArray(parsed.items)) {
                throw new Error('LLM JSON missing "items" array');
            }

            const generatedItems = parsed.items;
            let validCount = 0;

            for (const item of generatedItems) {
                const validation = validateTapChoice(item, maxLength);
                if (validation.valid) {
                    const id = await insertContentObject({
                        skill_id: skillId,
                        engine_type: 'MICRO_SKILL_DRILL',
                        template_id: templateId,
                        source: 'GENERATED',
                        difficulty_level: difficultyLevel,
                        payload: validation.item as unknown as Record<string, unknown>
                    });
                    newContentIds.push(id);
                    validCount++;
                } else {
                    console.warn(`[ContentGen] Item validation failed: ${validation.reason}`, item);
                }
            }

            if (validCount === 0) {
                throw new Error('No items passed validation');
            }

            // Record success
            await updateContentGenJob(jobId, {
                status: 'succeeded',
                total_tokens_used: response.usage.total_tokens
            });

            console.log(`[ContentGen] Successfully generated ${validCount} valid items for ${skillId} Lvl ${difficultyLevel}`);

        } catch (llmErr) {
            console.error('[ContentGen] Generation failed:', llmErr);
            await updateContentGenJob(jobId, {
                status: 'failed',
                error_details: llmErr instanceof Error ? llmErr.message : 'Unknown error'
            });
        }

        return newContentIds;

    } finally {
        inProgressGenerations.delete(lockKey);
    }
}
