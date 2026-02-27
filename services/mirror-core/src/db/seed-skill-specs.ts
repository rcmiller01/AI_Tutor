/**
 * seed-skill-specs.ts
 *
 * Idempotent seed script: imports all skill specs from content/skill-specs/
 * and their associated golden content objects into the local DB on first run.
 *
 * Usage (standalone):
 *   npx tsx services/mirror-core/src/db/seed-skill-specs.ts
 *
 * Also called from the main boot sequence when NODE_ENV !== 'production'
 * and SEED_ON_BOOT=true.
 *
 * Idempotency: uses ON CONFLICT DO NOTHING for both skill_specs and
 * content_objects. Safe to run multiple times.
 */

import fs from 'fs';
import path from 'path';
import { pool } from './pool.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const SKILL_SPEC_DIR = path.resolve(
    process.cwd(),
    '../../../../content/skill-specs',
);

/**
 * Skill spec JSON files to import. Order matters if there are FK deps.
 * All specs are independent — order here is arbitrary.
 */
const SKILL_SPEC_FILES = [
    'cvc-blending.json',
    'sight-words-k.json',
    'rhyming-words.json',
    'word-picture-match.json',
    'short-comprehension.json',
];

/**
 * Golden content object files — CURATED items used as test fixtures and
 * as the near-transfer pool seed for cvc-blending.
 * File name → content_id (from file payload).
 */
const GOLDEN_CONTENT_FILES = [
    'cvc-blending-tap-001.json',
    'cvc-blending-tap-002.json',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawSkillSpec {
    skill_id: string;
    version: number;
    grade_band: string;
    objective: string;
    [key: string]: unknown;
}

interface RawContentObject {
    content_id: string;
    skill_id: string;
    engine_type: string;
    template_id: string;
    version: number;
    source: string;
    difficulty_level: number;
    constraints_hash?: string;
    payload: unknown;
    created_at: string;
    _comment?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadJson<T>(filePath: string): T {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
}

function resolveSpecPath(fileName: string): string {
    return path.join(SKILL_SPEC_DIR, fileName);
}

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedSkillSpec(spec: RawSkillSpec): Promise<void> {
    const { skill_id, version, grade_band, objective, ...rest } = spec;

    await pool.query(
        `INSERT INTO skill_specs (skill_id, version, grade_band, objective, spec_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (skill_id) DO NOTHING`,
        [skill_id, version, grade_band, objective, JSON.stringify(rest)],
    );

    console.log(`  [seed] skill_spec: ${skill_id} — OK`);
}

async function seedContentObject(obj: RawContentObject): Promise<void> {
    const {
        content_id,
        skill_id,
        engine_type,
        template_id,
        version,
        source,
        difficulty_level,
        constraints_hash,
        payload,
    } = obj;

    await pool.query(
        `INSERT INTO content_objects
            (content_id, skill_id, engine_type, template_id, version, source,
             difficulty_level, constraints_hash, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (content_id) DO NOTHING`,
        [
            content_id,
            skill_id,
            engine_type,
            template_id,
            version,
            source,
            difficulty_level,
            constraints_hash ?? null,
            JSON.stringify(payload),
        ],
    );

    console.log(`  [seed] content_object: ${content_id} (${skill_id}) — OK`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('[seed-skill-specs] Starting seed…');

    // 1. Skill specs
    console.log('\n[seed] Importing skill specs…');
    for (const fileName of SKILL_SPEC_FILES) {
        const filePath = resolveSpecPath(fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`  [seed] WARN: ${fileName} not found — skipping`);
            continue;
        }
        const spec = loadJson<RawSkillSpec>(filePath);
        await seedSkillSpec(spec);
    }

    // 2. Golden content objects
    console.log('\n[seed] Importing golden content objects…');
    for (const fileName of GOLDEN_CONTENT_FILES) {
        const filePath = resolveSpecPath(fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`  [seed] WARN: ${fileName} not found — skipping`);
            continue;
        }
        const obj = loadJson<RawContentObject>(filePath);
        // Skip _comment field by destructuring it out
        const { _comment: _c, ...cleanObj } = obj;
        await seedContentObject(cleanObj);
    }

    console.log('\n[seed-skill-specs] Done ✓');
}

main()
    .catch((err) => {
        console.error('[seed-skill-specs] FATAL:', err);
        process.exit(1);
    })
    .finally(() => pool.end());
