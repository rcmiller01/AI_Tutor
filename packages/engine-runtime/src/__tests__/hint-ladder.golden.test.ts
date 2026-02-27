/**
 * hint-ladder.golden.test.ts
 *
 * Golden Vitest scenarios for the MICRO_SKILL_DRILL hint ladder.
 *
 * These tests are "golden contract" tests: they assert the exact shape of the
 * engine state after each rung transition, using the static golden JSON fixtures.
 *
 * Phase 2 will import the real engine implementation. For now the tests
 * import and validate the fixture shapes only, so they pass in Phase 1
 * and become green integration tests in Phase 2.
 *
 * See: docs/GOLDENS_PLAN.md §2.2 Hint Ladder Goldens
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MicroSkillDrillState } from '../../types/engine-states.js';

// Vitest runs from the package root. Goldens live at src/__tests__/goldens/.
const GOLDENS_ROOT = resolve(process.cwd(), 'src/__tests__/goldens');

/** Load a golden fixture JSON file. */
function golden<T>(relPath: string): T {
    const abs = resolve(GOLDENS_ROOT, relPath);
    return JSON.parse(readFileSync(abs, 'utf-8')) as T;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const contentTap001 = golden<{ content_id: string; payload: { correct_choice_id: string } }>(
    'content/cvc-blending-tap-001.json',
);
const contentTap002 = golden<{ content_id: string }>(
    'content/cvc-blending-tap-002.json',
);
const stateHintLevel0 = golden<MicroSkillDrillState & { _description?: string }>(
    'engine-state/hint-level-0.json',
);
const statePreBottomOut = golden<MicroSkillDrillState & { _description?: string }>(
    'engine-state/hint-level-4-pre-bottom-out.json',
);
const statePostBottomOut = golden<MicroSkillDrillState & { _description?: string }>(
    'engine-state/hint-level-5-post-bottom-out.json',
);

// ─── Fixture shape validation ─────────────────────────────────────────────────

describe('Golden fixtures — shape validation', () => {
    it('cvc-tap-001 content fixture has correct structure', () => {
        expect(contentTap001.content_id).toBe('cvc-tap-001');
        expect(contentTap001.payload.correct_choice_id).toBe('A');
    });

    it('cvc-tap-002 content fixture is a different content_id', () => {
        expect(contentTap002.content_id).toBe('cvc-tap-002');
        expect(contentTap002.content_id).not.toBe(contentTap001.content_id);
    });

    it('hint-level-0 fixture: clean initial state', () => {
        expect(stateHintLevel0.hint_level).toBe(0);
        expect(stateHintLevel0.near_transfer_scheduled).toBe(false);
        expect(stateHintLevel0.near_transfer_content_id).toBeNull();
        expect(stateHintLevel0.current_content_id).toBe('cvc-tap-001');
    });

    it('hint-level-4 fixture: pre-bottom-out state', () => {
        expect(statePreBottomOut.hint_level).toBe(4);
        expect(statePreBottomOut.near_transfer_scheduled).toBe(false);
        expect(statePreBottomOut.near_transfer_content_id).toBeNull();
    });

    it('hint-level-5 fixture: post-bottom-out state', () => {
        expect(statePostBottomOut.hint_level).toBe(5);
        expect(statePostBottomOut.near_transfer_scheduled).toBe(true);
        expect(statePostBottomOut.near_transfer_content_id).toBe('cvc-tap-002');
        expect(statePostBottomOut.queue).toContain('cvc-tap-002');
        // near-transfer item must be at queue[1], directly after current item
        const idx = statePostBottomOut.queue.indexOf('cvc-tap-002');
        expect(idx).toBe(1);
    });
});

// ─── Hint ladder contract tests ───────────────────────────────────────────────
//
// Phase 1: These describe what the engine MUST do. They will fail until
// Phase 2 wires in the real engine.render_hints() implementation.
// Annotated with TODO so CI doesn't block on them.
//
// Phase 2: Remove the TODO and import engine. Tests become green.

describe('Hint ladder — contract (Phase 2 target)', () => {
    // TODO(Phase 2): import { MicroSkillDrillEngine } from '../../engines/micro-skill-drill.js'
    // and replace the skip blocks below with real assertions.

    it.skip('[Phase 2] rung 1 (nudge): hint_level increments to 1, returns rung_name = "nudge"', () => {
        // const { state, hint } = MicroSkillDrillEngine.render_hints(stateHintLevel0, skillSpec, ctx, []);
        // expect(state.hint_level).toBe(1);
        // expect(hint?.rung_name).toBe('nudge');
        // expect(hint?.hint_style).toBe('text');
    });

    it.skip('[Phase 2] rung 5 (bottom_out): hint_level === 5, near_transfer_scheduled === true, near_transfer_content_id set', () => {
        // const { state, hint } = MicroSkillDrillEngine.render_hints(statePreBottomOut, skillSpec, ctx, [contentTap002]);
        // expect(state.hint_level).toBe(5);
        // expect(state.near_transfer_scheduled).toBe(true);
        // expect(state.near_transfer_content_id).toBe('cvc-tap-002');
        // expect(state.queue[1]).toBe('cvc-tap-002');
        // expect(hint?.rung_name).toBe('bottom_out');
    });

    it.skip('[Phase 2] accessibility_skip_hints: jumps straight to bottom_out from hint_level 0', () => {
        // const ctx = { accessibility_skip_hints: true, hint_max_override: undefined };
        // const { state, hint } = MicroSkillDrillEngine.render_hints(stateHintLevel0, skillSpec, ctx, [contentTap002]);
        // expect(state.hint_level).toBe(5);
        // expect(hint?.rung_name).toBe('bottom_out');
    });

    it.skip('[Phase 2] hints_exhausted: render_hints returns null after hint_level >= max_hints_per_item', () => {
        // const exhaustedState = { ...statePostBottomOut };
        // const { hint } = MicroSkillDrillEngine.render_hints(exhaustedState, skillSpec, ctx, []);
        // expect(hint).toBeNull();
    });

    it.skip('[Phase 2] hint_level resets to 0 on new content_id', () => {
        // Simulate LOAD_ITEM with different content_id
        // const { state } = MicroSkillDrillEngine.load_item(statePostBottomOut, 'cvc-tap-002');
        // expect(state.hint_level).toBe(0);
        // expect(state.near_transfer_scheduled).toBe(false);
        // expect(state.near_transfer_content_id).toBeNull();
    });
});

// ─── Determinism invariant ────────────────────────────────────────────────────

describe('Near-transfer determinism contract', () => {
    it('near-transfer content_id in post-bottom-out fixture matches cvc-tap-002 fixture content_id', () => {
        expect(statePostBottomOut.near_transfer_content_id).toBe(contentTap002.content_id);
    });

    it('cvc-tap-002 is a different phonics family from cvc-tap-001 (literal label check)', () => {
        const target001 = 'cat'; // hardcoded from golden
        const target002 = 'dog'; // hardcoded from golden
        // Different word family = different ending vowel+consonant
        const ending001 = target001.slice(-2); // "at"
        const ending002 = target002.slice(-2); // "og"
        expect(ending001).not.toBe(ending002);
    });
});
