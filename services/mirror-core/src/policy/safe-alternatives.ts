/**
 * Safe Alternatives Computation
 *
 * Deterministically computes 2-3 safe alternative skills/worlds when a policy
 * denial occurs. This is a pure database-driven computation with NO LLM calls.
 */

import type { SafeAlternative } from '@mirror/schemas';
import { getEnabledWorldsForHousehold } from '../db/policy-queries.js';

/**
 * Compute safe alternatives deterministically from household's enabled worlds.
 *
 * Algorithm:
 * 1. Get all enabled worlds for the household (globally AND household-level enabled)
 * 2. Exclude the denied skill/world (if specified)
 * 3. Collect all skills from enabled worlds
 * 4. Sort alphabetically (deterministic ordering)
 * 5. Return first 2-3 candidates
 *
 * @param householdId - The household to compute alternatives for
 * @param excludeSkillId - Optional skill to exclude (the one being denied)
 * @param excludeWorldId - Optional world to exclude (the one being denied)
 * @returns Array of 2-3 SafeAlternative objects
 */
export async function computeSafeAlternatives(
    householdId: string,
    excludeSkillId?: string,
    excludeWorldId?: string,
): Promise<SafeAlternative[]> {
    // Get all enabled worlds for this household
    const enabledWorlds = await getEnabledWorldsForHousehold(householdId);

    const candidates: SafeAlternative[] = [];

    for (const world of enabledWorlds) {
        // Skip globally or household-disabled worlds
        if (!world.enabled || !world.enabled_for_household) {
            continue;
        }

        // Skip the world being denied (if specified)
        if (world.world_id === excludeWorldId) {
            continue;
        }

        // Add all skills from this world as candidates
        for (const skillId of world.skill_ids) {
            // Skip the skill being denied (if specified)
            if (skillId === excludeSkillId) {
                continue;
            }

            candidates.push({
                skill_id: skillId,
                world_id: world.world_id,
                display_label: world.name,
            });
        }
    }

    // Deterministic sorting: alphabetical by world_id, then skill_id
    // This ensures consistent results across requests
    candidates.sort((a, b) => {
        const worldCompare = (a.world_id ?? '').localeCompare(b.world_id ?? '');
        if (worldCompare !== 0) return worldCompare;
        return a.skill_id.localeCompare(b.skill_id);
    });

    // Return between 2 and 3 alternatives
    // If we have fewer than 2, return what we have (edge case)
    const maxAlternatives = 3;
    const minAlternatives = 2;
    const count = Math.min(candidates.length, maxAlternatives);

    // If we have at least minAlternatives, return that many
    // Otherwise return all we have (even if it's 0 or 1)
    if (candidates.length >= minAlternatives) {
        return candidates.slice(0, count);
    }

    return candidates;
}

/**
 * Get a diverse set of alternatives (one from each unique world).
 * Useful when you want variety across worlds rather than just alphabetical order.
 */
export async function computeDiverseAlternatives(
    householdId: string,
    excludeSkillId?: string,
    excludeWorldId?: string,
    maxPerWorld = 1,
): Promise<SafeAlternative[]> {
    const enabledWorlds = await getEnabledWorldsForHousehold(householdId);

    const candidates: SafeAlternative[] = [];
    const worldCounts = new Map<string, number>();

    for (const world of enabledWorlds) {
        if (!world.enabled || !world.enabled_for_household) continue;
        if (world.world_id === excludeWorldId) continue;

        const currentCount = worldCounts.get(world.world_id) ?? 0;
        if (currentCount >= maxPerWorld) continue;

        for (const skillId of world.skill_ids) {
            if (skillId === excludeSkillId) continue;
            if ((worldCounts.get(world.world_id) ?? 0) >= maxPerWorld) break;

            candidates.push({
                skill_id: skillId,
                world_id: world.world_id,
                display_label: world.name,
            });

            worldCounts.set(world.world_id, (worldCounts.get(world.world_id) ?? 0) + 1);
        }
    }

    // Sort for determinism
    candidates.sort((a, b) => {
        const worldCompare = (a.world_id ?? '').localeCompare(b.world_id ?? '');
        if (worldCompare !== 0) return worldCompare;
        return a.skill_id.localeCompare(b.skill_id);
    });

    return candidates.slice(0, 3);
}
