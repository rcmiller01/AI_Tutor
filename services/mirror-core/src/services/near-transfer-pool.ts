import {
    findNearTransferContent,
    getContentById,
    getSeenContentIds,
    scheduleNearTransfer,
    getPendingNearTransfer,
    markNearTransferDelivered,
    type NearTransferCandidate,
} from '../db/embedding-queries.js';
import { generateEmbedding, buildEmbeddingText } from './embedding-service.js';
import { getWorldBySkillId } from '../db/policy-queries.js';
import type { ContentPayload } from '@mirror/schemas';

// =============================================================================
// Types
// =============================================================================

export interface NearTransferRequest {
    original_skill_id: string;
    original_problem_id: string;
    original_problem_embedding?: number[];
    child_id: string;
    session_id: string;
    household_id: string;
}

export interface NearTransferResult {
    near_transfer_id: string;
    target_content_id: string;
    skill_id: string;
    similarity: number;
}

export interface PendingNearTransfer {
    id: string;
    content_id: string;
    content: ContentPayload;
    skill_id: string;
}

// =============================================================================
// Configuration
// =============================================================================

const MIN_SIMILARITY_THRESHOLD = 0.5;
const MAX_NEAR_TRANSFER_PER_SESSION = 3;
const NEAR_TRANSFER_LIMIT = 10; // Candidates to consider

// =============================================================================
// Near-Transfer Scheduling
// =============================================================================

/**
 * Schedules near-transfer content for a child after they reach bottom-out hint.
 *
 * Algorithm:
 * 1. Get the embedding of the original problem (or compute it)
 * 2. Find content in adjacent skills with similar concepts
 * 3. Exclude content the child has already seen
 * 4. Schedule the best match for delivery in a future session
 */
export async function scheduleNearTransferContent(
    request: NearTransferRequest
): Promise<NearTransferResult | null> {
    const {
        original_skill_id,
        original_problem_id,
        original_problem_embedding,
        child_id,
        session_id,
        // household_id unused - telemetry disabled temporarily
    } = request;

    console.log(`[NearTransfer] Scheduling for child ${child_id}, problem ${original_problem_id}`);

    // Get or compute the embedding for the original problem
    let embedding = original_problem_embedding;
    if (!embedding) {
        const originalContent = await getContentById(original_problem_id);
        if (!originalContent) {
            console.warn(`[NearTransfer] Original problem ${original_problem_id} not found`);
            return null;
        }

        const embeddingText = buildEmbeddingText(originalContent.payload, original_skill_id);
        embedding = await generateEmbedding(embeddingText);
    }

    // Get the world for this skill (for filtering related skills)
    const world = await getWorldBySkillId(original_skill_id);
    const worldId = world?.world_id;

    // Find similar content in other skills
    const candidates = await findNearTransferContent(
        original_skill_id,
        embedding,
        NEAR_TRANSFER_LIMIT,
        worldId
    );

    if (candidates.length === 0) {
        console.log('[NearTransfer] No candidates found');
        return null;
    }

    // Get content the child has already seen
    const seenIds = await getSeenContentIds(child_id);
    const seenSet = new Set(seenIds);

    // Filter out seen content and find the best match
    const validCandidates = candidates.filter(
        c => !seenSet.has(c.content_id) && c.similarity >= MIN_SIMILARITY_THRESHOLD
    );

    if (validCandidates.length === 0) {
        console.log('[NearTransfer] No valid candidates after filtering');
        return null;
    }

    // Select the best candidate (highest similarity)
    const bestCandidate = validCandidates[0];

    // Schedule it for future delivery
    const nearTransferId = await scheduleNearTransfer(
        original_problem_id,
        bestCandidate.content_id,
        child_id,
        session_id
    );

    console.log(
        `[NearTransfer] Scheduled ${bestCandidate.content_id} (similarity: ${bestCandidate.similarity.toFixed(3)})`
    );

    return {
        near_transfer_id: nearTransferId,
        target_content_id: bestCandidate.content_id,
        skill_id: bestCandidate.skill_id,
        similarity: bestCandidate.similarity,
    };
}

// =============================================================================
// Near-Transfer Retrieval
// =============================================================================

/**
 * Gets pending near-transfer content for a child.
 * Called at session start to inject scheduled content.
 */
export async function getPendingNearTransferContent(
    childId: string
): Promise<PendingNearTransfer[]> {
    const pending = await getPendingNearTransfer(childId, MAX_NEAR_TRANSFER_PER_SESSION);

    const results: PendingNearTransfer[] = [];

    for (const item of pending) {
        const content = await getContentById(item.target_content_id);
        if (content) {
            results.push({
                id: item.id,
                content_id: item.target_content_id,
                content: content.payload,
                skill_id: content.skill_id,
            });
        }
    }

    return results;
}

/**
 * Marks near-transfer content as delivered.
 * Called when the content is shown to the child.
 */
export async function deliverNearTransfer(
    nearTransferId: string,
    sessionId: string,
    _childId: string,
    _householdId: string
): Promise<void> {
    await markNearTransferDelivered(nearTransferId, sessionId);

    console.log(`[NearTransfer] Delivered ${nearTransferId}`);
}

// =============================================================================
// Near-Transfer Pool Management
// =============================================================================

/**
 * Finds additional near-transfer candidates for a skill.
 * Useful for pre-populating the pool.
 */
export async function findNearTransferCandidates(
    skillId: string,
    embedding: number[],
    excludeIds: string[] = [],
    limit: number = 5
): Promise<NearTransferCandidate[]> {
    const world = await getWorldBySkillId(skillId);
    const candidates = await findNearTransferContent(
        skillId,
        embedding,
        limit + excludeIds.length,
        world?.world_id
    );

    const excludeSet = new Set(excludeIds);
    return candidates
        .filter(c => !excludeSet.has(c.content_id))
        .slice(0, limit);
}

/**
 * Checks if a child has pending near-transfer content.
 */
export async function hasPendingNearTransfer(childId: string): Promise<boolean> {
    const pending = await getPendingNearTransfer(childId, 1);
    return pending.length > 0;
}

/**
 * Gets the count of pending near-transfer items for a child.
 */
export async function getPendingNearTransferCount(childId: string): Promise<number> {
    const pending = await getPendingNearTransfer(childId, 100);
    return pending.length;
}
