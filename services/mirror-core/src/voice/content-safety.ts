/**
 * services/mirror-core/src/voice/content-safety.ts
 *
 * Content safety filter for voice responses.
 * Ensures AI responses are child-appropriate (ages 6-8).
 */

import { emitEvent, type TelemetryContext } from '../db/telemetry.js';

// Words/phrases that should never appear in child responses
const BLOCKED_PATTERNS = [
    // Negative feedback words
    /\bwrong\b/gi,
    /\bincorrect\b/gi,
    /\bbad\b/gi,
    /\bstupid\b/gi,
    /\bdumb\b/gi,
    /\bfailed\b/gi,
    /\bfailure\b/gi,
    /\bloser\b/gi,
    /\bterrible\b/gi,
    /\bawful\b/gi,
    /\bhorrible\b/gi,

    // Violence and scary content
    /\bkill\b/gi,
    /\bdead\b/gi,
    /\bdeath\b/gi,
    /\bdie\b/gi,
    /\bdying\b/gi,
    /\bblood\b/gi,
    /\bweapon\b/gi,
    /\bgun\b/gi,
    /\bknife\b/gi,
    /\bscary\b/gi,
    /\bmonster\b/gi,
    /\bghost\b/gi,
    /\bzombie\b/gi,
    /\bhaunt/gi,
    /\bkiller\b/gi,
    /\bmurder/gi,
    /\bviolent/gi,
    /\bviolence\b/gi,

    // Adult content indicators
    /\bsexy\b/gi,
    /\bnaked\b/gi,
    /\bdrug\b/gi,
    /\balcohol\b/gi,
    /\bbeer\b/gi,
    /\bwine\b/gi,
    /\bdrunk\b/gi,
    /\bcigarette/gi,
    /\bsmok/gi,

    // Profanity patterns (minimal set)
    /\bdamn\b/gi,
    /\bhell\b/gi,
    /\bcrap\b/gi,
];

// Safe replacements for negative feedback
const NEGATIVE_REPLACEMENTS: Record<string, string> = {
    'wrong': 'not quite',
    'incorrect': 'almost',
    'bad': 'let\'s try again',
    'failed': 'keep trying',
    'failure': 'another try',
};

/**
 * Filter response content for child safety.
 * Replaces or removes inappropriate content.
 */
export function filterResponseContent(text: string): string {
    if (!text) return text;

    let filtered = text;

    // Replace negative feedback words with positive alternatives
    for (const [negative, positive] of Object.entries(NEGATIVE_REPLACEMENTS)) {
        const regex = new RegExp(`\\b${negative}\\b`, 'gi');
        filtered = filtered.replace(regex, positive);
    }

    // Remove blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(filtered)) {
            // If blocked content found, return a safe fallback
            return generateSafeFallback(text);
        }
    }

    // Enforce word limit (25 words max for voice)
    const words = filtered.split(/\s+/);
    if (words.length > 25) {
        filtered = words.slice(0, 25).join(' ') + '...';
    }

    return filtered;
}

/**
 * Generate a safe fallback response when content is blocked.
 */
function generateSafeFallback(originalText: string): string {
    // Try to determine intent from original text
    const lowerText = originalText.toLowerCase();

    if (lowerText.includes('try') || lowerText.includes('again')) {
        return 'Let\'s try again! You\'ve got this!';
    }

    if (lowerText.includes('answer') || lowerText.includes('correct')) {
        return 'Keep going! You\'re doing great!';
    }

    if (lowerText.includes('help') || lowerText.includes('hint')) {
        return 'Here\'s a hint - look carefully and try again!';
    }

    // Generic safe fallback
    return 'Let\'s keep learning together!';
}

/**
 * Check if text contains any blocked content.
 * Useful for pre-validation.
 */
export function containsBlockedContent(text: string): boolean {
    if (!text) return false;

    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(text)) {
            return true;
        }
    }

    return false;
}

/**
 * Check content and emit a safety flag if blocked content is detected.
 * Call this when filtering AI responses in the voice relay.
 */
export async function checkAndFlagSafetyEvent(
    text: string,
    ctx: TelemetryContext,
    contentId?: string,
): Promise<{ blocked: boolean; filtered: string; filterType?: string }> {
    if (!text) {
        return { blocked: false, filtered: text };
    }

    // Check for blocked content
    for (const pattern of BLOCKED_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            // Emit flag.safety_event telemetry
            const filterType = categorizeBlockedContent(match[0]);
            await emitEvent(
                'flag.safety_event',
                {
                    child_id: ctx.child_id ?? 'unknown',
                    filter_type: filterType,
                    content_id: contentId ?? null,
                },
                ctx,
            );

            return {
                blocked: true,
                filtered: generateSafeFallback(text),
                filterType,
            };
        }
    }

    return { blocked: false, filtered: text };
}

/**
 * Categorize the type of blocked content for analytics.
 */
function categorizeBlockedContent(matchedWord: string): string {
    const lowerWord = matchedWord.toLowerCase();

    // Negative feedback
    if (['wrong', 'incorrect', 'bad', 'stupid', 'dumb', 'failed', 'failure', 'loser', 'terrible', 'awful', 'horrible'].includes(lowerWord)) {
        return 'negative_feedback';
    }

    // Violence/scary
    if (['kill', 'dead', 'death', 'die', 'dying', 'blood', 'weapon', 'gun', 'knife', 'scary', 'monster', 'ghost', 'zombie', 'killer', 'murder', 'violent', 'violence'].some(w => lowerWord.includes(w))) {
        return 'violence_scary';
    }

    // Adult content
    if (['sexy', 'naked', 'drug', 'alcohol', 'beer', 'wine', 'drunk', 'cigarette', 'smok'].some(w => lowerWord.includes(w))) {
        return 'adult_content';
    }

    // Profanity
    if (['damn', 'hell', 'crap'].includes(lowerWord)) {
        return 'profanity';
    }

    return 'other_blocked';
}

/**
 * Validate a complete response for child safety.
 * Returns validation result with details.
 */
export function validateResponse(text: string): {
    valid: boolean;
    filtered: string;
    issues: string[];
} {
    const issues: string[] = [];

    // Check word count
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 25) {
        issues.push(`Response too long: ${wordCount} words (max 25)`);
    }

    // Check for blocked content
    for (const pattern of BLOCKED_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            issues.push(`Blocked content: "${match[0]}"`);
        }
    }

    const filtered = filterResponseContent(text);

    return {
        valid: issues.length === 0,
        filtered,
        issues,
    };
}
