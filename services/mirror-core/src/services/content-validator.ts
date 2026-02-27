import type {
    TapChoiceItem,
    DragBinsSet,
    TypeInBlankItem,
    MatchPairsSet,
    StoryPage,
    ComprehensionQ,
    ContentPayload,
    HintRung,
} from '@mirror/schemas';

// =============================================================================
// Validation Types
// =============================================================================

export interface ValidationContext {
    skill_id: string;
    child_age: number;
    reading_level: 'pre' | 'early' | 'fluent';
    engine_type: 'MSD' | 'MSC' | 'SMT';
    max_word_length?: number;
}

export interface ValidationError {
    field: string;
    rule: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

export interface HintLadder {
    rungs: Array<{
        rung: HintRung;
        text: string;
        style: string;
    }>;
}

// =============================================================================
// Flesch-Kincaid Grade Level Calculator
// =============================================================================

function countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;

    // Remove silent e at end
    word = word.replace(/e$/, '');

    // Count vowel groups
    const vowelGroups = word.match(/[aeiouy]+/g);
    return vowelGroups ? Math.max(1, vowelGroups.length) : 1;
}

function calculateFleschKincaidGrade(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.match(/[a-zA-Z]/));

    if (sentences.length === 0 || words.length === 0) return 0;

    const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = totalSyllables / words.length;

    // Flesch-Kincaid Grade Level formula
    const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
}

// =============================================================================
// Content Safety Checks
// =============================================================================

const UNSAFE_PATTERNS = [
    /\b(kill|die|dead|death|blood|murder)\b/i,
    /\b(scary|monster|ghost|nightmare)\b/i,
    /\b(hate|stupid|dumb|idiot)\b/i,
    /\b(gun|weapon|knife|sword)\b/i,
];

function containsUnsafeContent(text: string): boolean {
    return UNSAFE_PATTERNS.some(pattern => pattern.test(text));
}

// =============================================================================
// TapChoice Validation
// =============================================================================

export function validateTapChoice(
    item: TapChoiceItem,
    ctx: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];
    const maxWordLength = ctx.max_word_length ?? 15;

    // Rule 1: prompt_text must exist and be non-empty
    if (!item.prompt_text || typeof item.prompt_text !== 'string') {
        errors.push({
            field: 'prompt_text',
            rule: 'required',
            message: 'prompt_text is required and must be a string',
        });
    }

    // Rule 2: Must have 2-6 choices
    if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 6) {
        errors.push({
            field: 'choices',
            rule: 'choice_count',
            message: 'Must have between 2 and 6 choices',
        });
    }

    // Rule 3: correct_choice_id must exist in choices
    if (item.choices && item.correct_choice_id) {
        const hasCorrectChoice = item.choices.some(c => c.choice_id === item.correct_choice_id);
        if (!hasCorrectChoice) {
            errors.push({
                field: 'correct_choice_id',
                rule: 'valid_answer',
                message: `correct_choice_id "${item.correct_choice_id}" not found in choices`,
            });
        }
    }

    // Rule 4: Answer must not appear in stem/prompt
    if (item.prompt_text && item.choices && item.correct_choice_id) {
        const correctChoice = item.choices.find(c => c.choice_id === item.correct_choice_id);
        if (correctChoice && item.prompt_text.toLowerCase().includes(correctChoice.label.toLowerCase())) {
            errors.push({
                field: 'prompt_text',
                rule: 'answer_not_in_stem',
                message: 'The correct answer should not appear in the prompt/stem',
            });
        }
    }

    // Rule 5: Word length limits
    if (item.choices) {
        for (const choice of item.choices) {
            if (choice.label && choice.label.length > maxWordLength) {
                errors.push({
                    field: `choices.${choice.choice_id}`,
                    rule: 'max_word_length',
                    message: `Choice "${choice.label}" exceeds max length of ${maxWordLength}`,
                });
            }
        }
    }

    // Rule 6: Reading level check
    if (item.prompt_text) {
        const gradeLevel = calculateFleschKincaidGrade(item.prompt_text);
        const maxGrade = ctx.child_age - 4; // Age 6 -> Grade 2, Age 8 -> Grade 4
        if (gradeLevel > maxGrade) {
            errors.push({
                field: 'prompt_text',
                rule: 'reading_level',
                message: `Reading level (grade ${gradeLevel}) exceeds target (grade ${maxGrade}) for age ${ctx.child_age}`,
            });
        }
    }

    // Rule 7: No unsafe content
    const allText = [item.prompt_text, ...(item.choices?.map(c => c.label) ?? [])].join(' ');
    if (containsUnsafeContent(allText)) {
        errors.push({
            field: 'content',
            rule: 'safe_content',
            message: 'Content contains potentially harmful or scary words',
        });
    }

    // Rule 8: Unique choice IDs
    if (item.choices) {
        const ids = item.choices.map(c => c.choice_id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== ids.length) {
            errors.push({
                field: 'choices',
                rule: 'unique_ids',
                message: 'Choice IDs must be unique',
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

// =============================================================================
// TypeInBlank Validation
// =============================================================================

export function validateTypeInBlank(
    item: TypeInBlankItem,
    ctx: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];

    // Rule 1: prompt_text required
    if (!item.prompt_text || typeof item.prompt_text !== 'string') {
        errors.push({
            field: 'prompt_text',
            rule: 'required',
            message: 'prompt_text is required and must be a string',
        });
    }

    // Rule 2: correct_answer required and reasonable length
    if (!item.correct_answer || typeof item.correct_answer !== 'string') {
        errors.push({
            field: 'correct_answer',
            rule: 'required',
            message: 'correct_answer is required and must be a string',
        });
    } else if (item.correct_answer.length > 50) {
        errors.push({
            field: 'correct_answer',
            rule: 'max_length',
            message: 'correct_answer should be 50 characters or less',
        });
    }

    // Rule 3: No leading zeros in numeric answers
    if (item.correct_answer && /^0\d+$/.test(item.correct_answer)) {
        errors.push({
            field: 'correct_answer',
            rule: 'no_leading_zeros',
            message: 'Numeric answers should not have leading zeros',
        });
    }

    // Rule 4: Answer not in prompt
    if (item.prompt_text && item.correct_answer) {
        if (item.prompt_text.toLowerCase().includes(item.correct_answer.toLowerCase())) {
            errors.push({
                field: 'prompt_text',
                rule: 'answer_not_in_stem',
                message: 'The correct answer should not appear in the prompt',
            });
        }
    }

    // Rule 5: Reading level
    if (item.prompt_text) {
        const gradeLevel = calculateFleschKincaidGrade(item.prompt_text);
        const maxGrade = ctx.child_age - 4;
        if (gradeLevel > maxGrade) {
            errors.push({
                field: 'prompt_text',
                rule: 'reading_level',
                message: `Reading level (grade ${gradeLevel}) exceeds target for age ${ctx.child_age}`,
            });
        }
    }

    // Rule 6: Safe content
    const allText = [item.prompt_text, item.correct_answer].join(' ');
    if (containsUnsafeContent(allText)) {
        errors.push({
            field: 'content',
            rule: 'safe_content',
            message: 'Content contains potentially harmful or scary words',
        });
    }

    return { valid: errors.length === 0, errors };
}

// =============================================================================
// DragBins Validation
// =============================================================================

export function validateDragBins(
    item: DragBinsSet,
    _ctx: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];

    // Rule 1: Must have at least 2 bins
    if (!Array.isArray(item.bins) || item.bins.length < 2) {
        errors.push({
            field: 'bins',
            rule: 'min_bins',
            message: 'Must have at least 2 bins',
        });
    }

    // Rule 2: Must have items
    if (!Array.isArray(item.items) || item.items.length < 2) {
        errors.push({
            field: 'items',
            rule: 'min_items',
            message: 'Must have at least 2 items to sort',
        });
    }

    // Rule 3: correct_bin_map must be valid
    if (item.items && item.bins && item.correct_bin_map) {
        const binIds = new Set(item.bins.map(b => b.bin_id));
        const itemIds = new Set(item.items.map(i => i.item_id));

        for (const [itemId, binId] of Object.entries(item.correct_bin_map)) {
            if (!itemIds.has(itemId)) {
                errors.push({
                    field: 'correct_bin_map',
                    rule: 'valid_item',
                    message: `Item "${itemId}" in correct_bin_map not found in items`,
                });
            }
            if (!binIds.has(binId)) {
                errors.push({
                    field: 'correct_bin_map',
                    rule: 'valid_bin',
                    message: `Bin "${binId}" in correct_bin_map not found in bins`,
                });
            }
        }

        // Every item should have a mapping
        for (const itemId of itemIds) {
            if (!(itemId in item.correct_bin_map)) {
                errors.push({
                    field: 'correct_bin_map',
                    rule: 'complete_mapping',
                    message: `Item "${itemId}" has no bin mapping`,
                });
            }
        }
    }

    // Rule 4: Safe content
    const allText = [
        item.instruction_text ?? '',
        ...(item.bins?.map(b => b.label) ?? []),
        ...(item.items?.map(i => i.label) ?? []),
    ].join(' ');
    if (containsUnsafeContent(allText)) {
        errors.push({
            field: 'content',
            rule: 'safe_content',
            message: 'Content contains potentially harmful or scary words',
        });
    }

    return { valid: errors.length === 0, errors };
}

// =============================================================================
// MatchPairs Validation
// =============================================================================

export function validateMatchPairs(
    item: MatchPairsSet,
    _ctx: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];

    // Rule 1: Must have at least 2 pairs
    if (!Array.isArray(item.pairs) || item.pairs.length < 2) {
        errors.push({
            field: 'pairs',
            rule: 'min_pairs',
            message: 'Must have at least 2 pairs',
        });
    }

    // Rule 2: Unique pair IDs
    if (item.pairs) {
        const ids = item.pairs.map(p => p.pair_id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== ids.length) {
            errors.push({
                field: 'pairs',
                rule: 'unique_ids',
                message: 'Pair IDs must be unique',
            });
        }
    }

    // Rule 3: Each pair must have left and right
    if (item.pairs) {
        for (const pair of item.pairs) {
            if (!pair.left?.label) {
                errors.push({
                    field: `pairs.${pair.pair_id}.left`,
                    rule: 'required',
                    message: 'Left side of pair is required',
                });
            }
            if (!pair.right?.label) {
                errors.push({
                    field: `pairs.${pair.pair_id}.right`,
                    rule: 'required',
                    message: 'Right side of pair is required',
                });
            }
        }
    }

    // Rule 4: Safe content
    const allText = [
        item.instruction_text ?? '',
        ...(item.pairs?.flatMap(p => [p.left?.label ?? '', p.right?.label ?? '']) ?? []),
    ].join(' ');
    if (containsUnsafeContent(allText)) {
        errors.push({
            field: 'content',
            rule: 'safe_content',
            message: 'Content contains potentially harmful or scary words',
        });
    }

    return { valid: errors.length === 0, errors };
}

// =============================================================================
// StoryPage Validation
// =============================================================================

export function validateStoryPage(
    item: StoryPage,
    ctx: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];

    // Rule 1: page_text required
    if (!item.page_text || typeof item.page_text !== 'string') {
        errors.push({
            field: 'page_text',
            rule: 'required',
            message: 'page_text is required',
        });
    }

    // Rule 2: Reading level
    if (item.page_text) {
        const gradeLevel = calculateFleschKincaidGrade(item.page_text);
        const maxGrade = ctx.child_age - 4;
        if (gradeLevel > maxGrade) {
            errors.push({
                field: 'page_text',
                rule: 'reading_level',
                message: `Reading level (grade ${gradeLevel}) exceeds target for age ${ctx.child_age}`,
            });
        }
    }

    // Rule 3: word_spans consistency
    if (item.page_text && item.word_spans) {
        for (const span of item.word_spans) {
            const extracted = item.page_text.substring(span.start_index, span.end_index);
            if (extracted !== span.word) {
                errors.push({
                    field: 'word_spans',
                    rule: 'span_consistency',
                    message: `Word span for "${span.word}" doesn't match text indices`,
                });
            }
        }
    }

    // Rule 4: Safe content
    if (item.page_text && containsUnsafeContent(item.page_text)) {
        errors.push({
            field: 'page_text',
            rule: 'safe_content',
            message: 'Story content contains potentially harmful or scary words',
        });
    }

    return { valid: errors.length === 0, errors };
}

// =============================================================================
// ComprehensionQ Validation
// =============================================================================

export function validateComprehensionQ(
    item: ComprehensionQ,
    _ctx: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];

    // Rule 1: question required
    if (!item.question || typeof item.question !== 'string') {
        errors.push({
            field: 'question',
            rule: 'required',
            message: 'question is required',
        });
    }

    // Rule 2: Must have choices
    if (!Array.isArray(item.choices) || item.choices.length < 2) {
        errors.push({
            field: 'choices',
            rule: 'min_choices',
            message: 'Must have at least 2 choices',
        });
    }

    // Rule 3: correct_choice_id must be valid
    if (item.choices && item.correct_choice_id) {
        const hasCorrect = item.choices.some(c => c.choice_id === item.correct_choice_id);
        if (!hasCorrect) {
            errors.push({
                field: 'correct_choice_id',
                rule: 'valid_answer',
                message: 'correct_choice_id not found in choices',
            });
        }
    }

    // Rule 4: Valid question type
    const validTypes = ['literal', 'inference', 'vocabulary', 'sequence'];
    if (!validTypes.includes(item.question_type)) {
        errors.push({
            field: 'question_type',
            rule: 'valid_type',
            message: `question_type must be one of: ${validTypes.join(', ')}`,
        });
    }

    // Rule 5: Safe content
    const allText = [item.question, ...(item.choices?.map(c => c.label) ?? [])].join(' ');
    if (containsUnsafeContent(allText)) {
        errors.push({
            field: 'content',
            rule: 'safe_content',
            message: 'Content contains potentially harmful or scary words',
        });
    }

    return { valid: errors.length === 0, errors };
}

// =============================================================================
// HintLadder Validation
// =============================================================================

const EXPECTED_RUNGS: HintRung[] = ['nudge', 'strategy', 'worked_example', 'partial_fill', 'bottom_out'];

export function validateHintLadder(
    hints: HintLadder,
    _ctx: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];

    // Rule 1: Must have exactly 5 rungs
    if (!hints.rungs || hints.rungs.length !== 5) {
        errors.push({
            field: 'rungs',
            rule: 'rung_count',
            message: 'Hint ladder must have exactly 5 rungs',
        });
    }

    // Rule 2: Rungs must be in correct order
    if (hints.rungs) {
        for (let i = 0; i < Math.min(hints.rungs.length, EXPECTED_RUNGS.length); i++) {
            if (hints.rungs[i].rung !== EXPECTED_RUNGS[i]) {
                errors.push({
                    field: `rungs[${i}]`,
                    rule: 'rung_order',
                    message: `Rung ${i + 1} should be "${EXPECTED_RUNGS[i]}", got "${hints.rungs[i].rung}"`,
                });
            }
        }
    }

    // Rule 3: Each rung must have text
    if (hints.rungs) {
        for (let i = 0; i < hints.rungs.length; i++) {
            if (!hints.rungs[i].text || hints.rungs[i].text.trim().length === 0) {
                errors.push({
                    field: `rungs[${i}].text`,
                    rule: 'required',
                    message: `Rung ${i + 1} must have hint text`,
                });
            }
        }
    }

    // Rule 4: Rung 5 (bottom_out) should be actionable, not just the answer
    if (hints.rungs && hints.rungs[4]) {
        const bottomOut = hints.rungs[4].text;
        if (bottomOut && bottomOut.length < 20) {
            errors.push({
                field: 'rungs[4].text',
                rule: 'actionable_hint',
                message: 'Bottom-out hint should be actionable with explanation, not just the answer',
            });
        }
    }

    // Rule 5: Progression - hints should get more specific
    // (This is a heuristic: later hints tend to be longer)
    if (hints.rungs && hints.rungs.length >= 3) {
        const firstLength = hints.rungs[0].text?.length ?? 0;
        const lastLength = hints.rungs[hints.rungs.length - 1].text?.length ?? 0;
        if (lastLength < firstLength * 0.5) {
            errors.push({
                field: 'rungs',
                rule: 'hint_progression',
                message: 'Hints should progress from abstract to concrete (later hints should be more detailed)',
            });
        }
    }

    // Rule 6: Safe content
    const allText = hints.rungs?.map(r => r.text).join(' ') ?? '';
    if (containsUnsafeContent(allText)) {
        errors.push({
            field: 'rungs',
            rule: 'safe_content',
            message: 'Hint content contains potentially harmful or scary words',
        });
    }

    return { valid: errors.length === 0, errors };
}

// =============================================================================
// Generic Content Validation
// =============================================================================

export function validateContentPayload(
    payload: ContentPayload,
    ctx: ValidationContext
): ValidationResult {
    switch (payload.type) {
        case 'tap_choice':
            return validateTapChoice(payload, ctx);
        case 'type_in_blank':
            return validateTypeInBlank(payload, ctx);
        case 'drag_bins':
            return validateDragBins(payload, ctx);
        case 'match_pairs':
            return validateMatchPairs(payload, ctx);
        case 'story_page':
            return validateStoryPage(payload, ctx);
        case 'comprehension_q':
            return validateComprehensionQ(payload, ctx);
        default:
            return {
                valid: false,
                errors: [{ field: 'type', rule: 'valid_type', message: 'Unknown content type' }],
            };
    }
}

// =============================================================================
// Addendum Builder
// =============================================================================

/**
 * Builds an addendum string to append to the next LLM prompt
 * when validation fails, guiding the model to fix specific issues.
 */
export function buildValidationAddendum(errors: ValidationError[]): string {
    if (errors.length === 0) return '';

    const lines = [
        'IMPORTANT: The previous generation had validation errors. Please fix the following issues:',
        '',
    ];

    for (const error of errors) {
        lines.push(`- ${error.rule}: ${error.message}`);
    }

    lines.push('');
    lines.push('Generate new content that addresses all of the above issues.');

    return lines.join('\n');
}
