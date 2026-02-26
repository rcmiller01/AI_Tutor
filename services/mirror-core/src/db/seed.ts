import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillSpec, TapChoiceItem } from '@mirror/schemas';
import { upsertSkillSpec, insertContentObject } from './queries.js';
import { query } from './pool.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SKILL_SPECS_DIR = resolve(__dirname, '../../../../content/skill-specs');

/**
 * Load seed skill specs from /content/skill-specs/ into DB.
 */
export async function seedSkillSpecs(): Promise<number> {
    const files = await readdir(SKILL_SPECS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    let count = 0;

    for (const file of jsonFiles) {
        const raw = await readFile(join(SKILL_SPECS_DIR, file), 'utf-8');
        const spec: SkillSpec = JSON.parse(raw);
        await upsertSkillSpec(spec);
        count++;
    }

    return count;
}

/**
 * Generate curated TapChoice content items for CVC blending.
 * These are hand-crafted items that don't require LLM generation.
 */
export async function seedCvcContent(): Promise<number> {
    // Check if content already exists
    const existing = await query(
        `SELECT COUNT(*) as count FROM content_objects WHERE skill_id = 'cvc-blending'`,
    );
    if (Number(existing.rows[0].count) > 0) {
        console.log('CVC content already seeded, skipping.');
        return 0;
    }

    const items: { difficulty: number; payload: TapChoiceItem }[] = [
        // ─── Difficulty 1: Simple short-a CVC ───
        {
            difficulty: 1,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does C-A-T make?',
                choices: [
                    { choice_id: 'a', label: 'cat' },
                    { choice_id: 'b', label: 'bat' },
                    { choice_id: 'c', label: 'hat' },
                    { choice_id: 'd', label: 'dog' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 1,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does B-A-T make?',
                choices: [
                    { choice_id: 'a', label: 'bat' },
                    { choice_id: 'b', label: 'cat' },
                    { choice_id: 'c', label: 'sat' },
                    { choice_id: 'd', label: 'mat' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 1,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does H-A-T make?',
                choices: [
                    { choice_id: 'a', label: 'hat' },
                    { choice_id: 'b', label: 'hot' },
                    { choice_id: 'c', label: 'rat' },
                    { choice_id: 'd', label: 'hit' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 1,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does R-A-T make?',
                choices: [
                    { choice_id: 'a', label: 'rat' },
                    { choice_id: 'b', label: 'run' },
                    { choice_id: 'c', label: 'bat' },
                    { choice_id: 'd', label: 'rot' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 1,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does S-A-T make?',
                choices: [
                    { choice_id: 'a', label: 'sat' },
                    { choice_id: 'b', label: 'sit' },
                    { choice_id: 'c', label: 'set' },
                    { choice_id: 'd', label: 'mat' },
                ],
                correct_choice_id: 'a',
            },
        },
        // ─── Difficulty 2: Mixed short vowels ───
        {
            difficulty: 2,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does D-O-G make?',
                choices: [
                    { choice_id: 'a', label: 'dog' },
                    { choice_id: 'b', label: 'dig' },
                    { choice_id: 'c', label: 'dug' },
                    { choice_id: 'd', label: 'log' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 2,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does P-I-G make?',
                choices: [
                    { choice_id: 'a', label: 'pig' },
                    { choice_id: 'b', label: 'peg' },
                    { choice_id: 'c', label: 'big' },
                    { choice_id: 'd', label: 'pug' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 2,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does B-U-G make?',
                choices: [
                    { choice_id: 'a', label: 'bug' },
                    { choice_id: 'b', label: 'bag' },
                    { choice_id: 'c', label: 'big' },
                    { choice_id: 'd', label: 'hug' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 2,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does S-U-N make?',
                choices: [
                    { choice_id: 'a', label: 'sun' },
                    { choice_id: 'b', label: 'son' },
                    { choice_id: 'c', label: 'run' },
                    { choice_id: 'd', label: 'sin' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 2,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does R-E-D make?',
                choices: [
                    { choice_id: 'a', label: 'red' },
                    { choice_id: 'b', label: 'rod' },
                    { choice_id: 'c', label: 'bed' },
                    { choice_id: 'd', label: 'rid' },
                ],
                correct_choice_id: 'a',
            },
        },
        // ─── Difficulty 3: Tricky distractors ───
        {
            difficulty: 3,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does H-O-P make?',
                choices: [
                    { choice_id: 'a', label: 'hop' },
                    { choice_id: 'b', label: 'hip' },
                    { choice_id: 'c', label: 'hot' },
                    { choice_id: 'd', label: 'hap' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 3,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does J-U-G make?',
                choices: [
                    { choice_id: 'a', label: 'jug' },
                    { choice_id: 'b', label: 'jig' },
                    { choice_id: 'c', label: 'jog' },
                    { choice_id: 'd', label: 'mug' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 3,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does P-E-N make?',
                choices: [
                    { choice_id: 'a', label: 'pen' },
                    { choice_id: 'b', label: 'pan' },
                    { choice_id: 'c', label: 'pin' },
                    { choice_id: 'd', label: 'pun' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 3,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does B-E-D make?',
                choices: [
                    { choice_id: 'a', label: 'bed' },
                    { choice_id: 'b', label: 'bad' },
                    { choice_id: 'c', label: 'bid' },
                    { choice_id: 'd', label: 'bud' },
                ],
                correct_choice_id: 'a',
            },
        },
        {
            difficulty: 3,
            payload: {
                type: 'tap_choice',
                prompt_text: 'What word does C-U-P make?',
                choices: [
                    { choice_id: 'a', label: 'cup' },
                    { choice_id: 'b', label: 'cap' },
                    { choice_id: 'c', label: 'cop' },
                    { choice_id: 'd', label: 'pup' },
                ],
                correct_choice_id: 'a',
            },
        },
    ];

    let count = 0;
    for (const item of items) {
        await insertContentObject({
            skill_id: 'cvc-blending',
            engine_type: 'MICRO_SKILL_DRILL',
            template_id: 'tap_choice',
            source: 'CURATED',
            difficulty_level: item.difficulty,
            payload: item.payload as unknown as Record<string, unknown>,
        });
        count++;
    }

    return count;
}

/**
 * Run all seeders. Idempotent — safe to call multiple times.
 */
export async function runAllSeeds(): Promise<void> {
    const specCount = await seedSkillSpecs();
    console.log(`Seeded ${specCount} skill specs.`);

    const contentCount = await seedCvcContent();
    console.log(`Seeded ${contentCount} CVC content items.`);
}
