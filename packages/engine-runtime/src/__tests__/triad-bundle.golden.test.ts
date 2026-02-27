/**
 * triad-bundle.golden.test.ts
 *
 * Golden Vitest scenarios for LearningBundle assembly.
 *
 * Phase 1: fixture shape validation pass immediately.
 * Phase 2: bundle assembler contract tests are .skip'd.
 *
 * See: docs/GOLDENS_PLAN.md §2.4 Triad Bundle Goldens
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs from the package root. Goldens live at src/__tests__/goldens/.
const GOLDENS_ROOT = resolve(process.cwd(), 'src/__tests__/goldens');

function golden<T>(relPath: string): T {
    const abs = resolve(GOLDENS_ROOT, relPath);
    return JSON.parse(readFileSync(abs, 'utf-8')) as T;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface BundleFixture {
    bundle_id: string;
    session_id: string;
    child_id: string;
    skill_id: string;
    world_id: string | null;
    talk_plan_id: string;
    practice_set_ids: string[];
    play_config: {
        engine_type: string;
        template_id: string;
        params: { item_count: number; difficulty_level: number };
    };
    constraints_hash: string;
    created_at: string;
}

const bundle = golden<BundleFixture>('bundles/cvc-bundle-001.json');
const contentTap001 = golden<{ content_id: string }>('content/cvc-blending-tap-001.json');
const contentTap002 = golden<{ content_id: string }>('content/cvc-blending-tap-002.json');

// ─── Bundle fixture shape validation ──────────────────────────────────────────

describe('Golden bundle fixture — shape validation', () => {
    it('has all required top-level keys', () => {
        expect(bundle.bundle_id).toBeDefined();
        expect(bundle.skill_id).toBe('cvc-blending');
        expect(bundle.talk_plan_id).toBeDefined();
        expect(bundle.practice_set_ids).toBeInstanceOf(Array);
        expect(bundle.play_config).toBeDefined();
        expect(bundle.created_at).toBeDefined();
    });

    it('practice_set_ids references both golden content objects', () => {
        expect(bundle.practice_set_ids).toContain(contentTap001.content_id);
        expect(bundle.practice_set_ids).toContain(contentTap002.content_id);
    });

    it('play_config has valid engine_type', () => {
        const validEngines = ['MICRO_SKILL_DRILL', 'MATCH_SORT_CLASSIFY', 'STORY_MICROTASKS'];
        expect(validEngines).toContain(bundle.play_config.engine_type);
    });

    it('play_config engine_type matches skill allowed_engine_types (cvc-blending → MICRO_SKILL_DRILL)', () => {
        expect(bundle.play_config.engine_type).toBe('MICRO_SKILL_DRILL');
    });

    it('play_config.params has item_count > 0 and difficulty_level >= 1', () => {
        expect(bundle.play_config.params.item_count).toBeGreaterThan(0);
        expect(bundle.play_config.params.difficulty_level).toBeGreaterThanOrEqual(1);
    });

    it('bundle_id does not change between modes (same bundle_id = same learning bundle)', () => {
        // Invariant: regardless of mode switch (talk→practice→play), bundle_id stays fixed.
        // This test validates the fixture: a single bundle_id covers all three modes.
        expect(typeof bundle.bundle_id).toBe('string');
        expect(bundle.bundle_id.length).toBeGreaterThan(0);
    });
});

// ─── Near-transfer identity contract ──────────────────────────────────────────

describe('Bundle near-transfer identity', () => {
    it('practice_set_ids[0] and practice_set_ids[1] are distinct content objects', () => {
        expect(bundle.practice_set_ids[0]).not.toBe(bundle.practice_set_ids[1]);
    });

    it('both practice items have the same skill_id', () => {
        // Both golden fixtures are for cvc-blending
        const tap001SkillId = golden<{ skill_id: string }>('content/cvc-blending-tap-001.json').skill_id;
        const tap002SkillId = golden<{ skill_id: string }>('content/cvc-blending-tap-002.json').skill_id;
        expect(tap001SkillId).toBe(tap002SkillId);
        expect(tap001SkillId).toBe(bundle.skill_id);
    });
});

// ─── Bundle assembler contract (Phase 2 target) ───────────────────────────────

describe('Bundle assembler — contract (Phase 2 target)', () => {
    // TODO(Phase 2): import { assembleLearningBundle } from '../../bundle/assembler.js'
    // and replace the skip blocks below.

    it.skip('[Phase 2] assembleLearningBundle produces a valid bundle with no LLM call', () => {
        // const bundle = await assembleLearningBundle({ skill_id: 'cvc-blending', difficulty_level: 1, near_transfer_pool: [contentTap002] });
        // expect(bundle.practice_set_ids).toHaveLength(2);
        // expect(bundle.talk_plan_id).toBeTruthy();
        // expect(bundle.constraints_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it.skip('[Phase 2] bundle assembled from cvc-blending matches snapshot fixture', () => {
        // expect(bundle).toMatchSnapshot();
    });

    it.skip('[Phase 2] bundle mode switch does NOT change bundle_id', () => {
        // const session = await switchMode(session_id, 'play');
        // expect(session.bundle_id).toBe(original_bundle_id);
    });

    it.skip('[Phase 2] constraints_hash equals SHA-256 of canonical item_generator_rules JSON', () => {
        // const spec = loadSkillSpec('cvc-blending');
        // const expected = sha256(JSON.stringify(spec.item_generator_rules, null, 0));
        // expect(bundle.constraints_hash).toBe(expected);
    });
});
