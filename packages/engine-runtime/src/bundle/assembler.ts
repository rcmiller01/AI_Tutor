import { createHash, randomUUID } from 'node:crypto';
import type { SkillSpec, ContentObject } from '@mirror/schemas';

export interface AssembleBundleOptions {
    session_id: string;
    child_id: string;
    skill_spec: SkillSpec;
    world_id?: string;
    practice_content_pool: ContentObject[];
    difficulty_level?: number;
}

export interface LearningBundlePayload {
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
        params: Record<string, unknown>;
    };
    constraints_hash: string;
}

/**
 * Deterministically constructs a LearningBundle containing Talk, Practice, and Play references.
 * Zero LLM calls are made here.
 */
export function assembleLearningBundle(opts: AssembleBundleOptions): LearningBundlePayload {
    // 1. canonical JSON-stringify the item generator rules to produce a hash
    const canonicalJSON = JSON.stringify(opts.skill_spec.item_generator_rules);
    const hash = createHash('sha256').update(canonicalJSON).digest('hex');

    // 2. Select practice set items. For MVP, we take the up to first 2 that match difficulty
    const targetDiff = opts.difficulty_level ?? 1;
    const diffMatch = opts.practice_content_pool.filter(c => c.difficulty_level === targetDiff);
    // If not enough match exact difficulty, fallback to picking any from the pool
    const selected = diffMatch.length > 0 ? diffMatch : opts.practice_content_pool;
    const practiceSetIds = selected.slice(0, 2).map(c => c.content_id);

    // 3. Build Play config from first allowed engine/template in the skill spec
    const engineType = opts.skill_spec.allowed_engine_types[0] || 'MICRO_SKILL_DRILL';
    const templateId = opts.skill_spec.templates[0] || 'tap_choice';

    return {
        bundle_id: randomUUID(),
        session_id: opts.session_id,
        child_id: opts.child_id,
        skill_id: opts.skill_spec.skill_id,
        world_id: opts.world_id ?? null,
        talk_plan_id: `tp-${opts.skill_spec.skill_id}-${Date.now()}`, // MVP stub
        practice_set_ids: practiceSetIds,
        play_config: {
            engine_type: engineType,
            template_id: templateId,
            params: {
                item_count: practiceSetIds.length || 5,
                difficulty_level: targetDiff,
            },
        },
        constraints_hash: hash,
    };
}
