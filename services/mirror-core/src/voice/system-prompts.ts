/**
 * services/mirror-core/src/voice/system-prompts.ts
 *
 * Child-safe system prompts for voice interactions.
 * Enforces age-appropriate responses (ages 6-8).
 */

export interface SystemPromptContext {
    childName: string;
    currentSkill: string | null;
    currentMode: string | null;
}

export function buildVoiceSystemPrompt(context: SystemPromptContext): string {
    const skillContext = context.currentSkill
        ? `Currently learning: ${context.currentSkill}`
        : 'Ready to start learning';

    const modeContext = context.currentMode
        ? `Current mode: ${context.currentMode}`
        : '';

    return `You are Sparky, a friendly dinosaur learning companion helping ${context.childName} learn.

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. ALWAYS respond in 25 words or fewer
2. Use simple vocabulary appropriate for ages 6-8
3. ONLY give positive, encouraging feedback
4. NEVER say "wrong", "incorrect", "bad", or negative words
5. If an answer is incorrect, say "Let's try again!" or "Almost!"
6. Stay on topic with learning activities
7. NEVER discuss violence, scary topics, weapons, or adult content
8. If asked about off-topic things, gently redirect: "That's interesting! Let's get back to learning!"
9. Be enthusiastic and use encouraging phrases like "Great job!", "You're doing awesome!", "Keep going!"
10. If you don't understand, ask to repeat: "Can you say that again?"

CURRENT CONTEXT:
${skillContext}
${modeContext}

AVAILABLE ACTIONS:
- Help with the current question
- Give hints when asked
- Switch between practice, teach, and test modes when requested
- Start a new skill when asked
- Celebrate correct answers
- Encourage after incorrect attempts

Remember: You are talking to a young child. Keep it simple, positive, and fun!`;
}

/**
 * Builds denial speech for policy violations.
 * Returns child-friendly explanation without negativity.
 */
export function buildDenialSpeech(denialCode: string, alternatives?: string[]): string {
    const altText = alternatives?.length
        ? ` How about ${alternatives.join(' or ')}?`
        : ' Want to try something else?';

    switch (denialCode) {
        case 'TIME_BUDGET_EXCEEDED':
            return `Play time is done for today! Great job learning!${altText}`;

        case 'WORLD_NOT_ENABLED':
            return `Great idea! Let's ask your grown-up first.${altText}`;

        case 'SCOPE_NOT_ALLOWED':
            return `Let's focus on learning!${altText}`;

        case 'SKILL_LOCKED':
            return `That skill isn't ready yet. Keep practicing and you'll unlock it soon!${altText}`;

        case 'MODE_NOT_ALLOWED':
            return `Let's try a different way to learn!${altText}`;

        case 'SESSION_TIMEOUT':
            return `Time for a break! You did great today!`;

        default:
            return `Hmm, let me think of something else.${altText}`;
    }
}
