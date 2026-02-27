-- =============================================================================
-- Phase 4: Content Generation Pipeline
-- Adds validation tracking, inline embeddings, and near-transfer queue
-- =============================================================================

-- =============================================================================
-- 1. Add validation and retry columns to content_objects
-- =============================================================================

ALTER TABLE content_objects
    ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'pending'
        CHECK (validation_status IN ('pending', 'valid', 'invalid', 'fallback')),
    ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS addendum TEXT;

-- Add inline embedding column to content_objects (1536 dimensions for text-embedding-3-small)
-- This allows querying content and embeddings together without JOIN
ALTER TABLE content_objects
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index for validation status queries
CREATE INDEX IF NOT EXISTS idx_content_validation_status
    ON content_objects(skill_id, validation_status);

-- HNSW index for fast approximate nearest neighbor search on inline embeddings
-- Only create if the column exists and index doesn't
CREATE INDEX IF NOT EXISTS idx_content_objects_embedding_hnsw
    ON content_objects
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 2. Content Usage Tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_usage (
    content_id UUID NOT NULL REFERENCES content_objects(content_id),
    session_id UUID NOT NULL REFERENCES sessions(session_id),
    child_id   UUID NOT NULL REFERENCES child_profile(child_id),
    used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (content_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_content_usage_child
    ON content_usage(child_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_usage_content
    ON content_usage(content_id);

COMMENT ON TABLE content_usage IS 'Tracks which content items have been shown to each child, for avoiding repeats and near-transfer logic.';

-- =============================================================================
-- 3. Near-Transfer Queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS near_transfer_queue (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_problem_id  UUID NOT NULL REFERENCES content_objects(content_id),
    target_content_id    UUID NOT NULL REFERENCES content_objects(content_id),
    child_id             UUID NOT NULL REFERENCES child_profile(child_id),
    session_id           UUID NOT NULL REFERENCES sessions(session_id),
    scheduled_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at         TIMESTAMPTZ,
    status               VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_near_transfer_child_status
    ON near_transfer_queue(child_id, status);

CREATE INDEX IF NOT EXISTS idx_near_transfer_scheduled
    ON near_transfer_queue(scheduled_at)
    WHERE status = 'pending';

COMMENT ON TABLE near_transfer_queue IS 'Queue for near-transfer content to be delivered after bottom-out hints. Scheduled in one session, delivered in subsequent sessions.';

-- =============================================================================
-- 4. Content Generation Job Extensions
-- =============================================================================

-- Add addendum column to content_gen_jobs for retry context
ALTER TABLE content_gen_jobs
    ADD COLUMN IF NOT EXISTS addendum TEXT;

-- Update the source check constraint to include GENERATED (normalized from LLM_GENERATED)
-- Note: PostgreSQL doesn't allow modifying CHECK constraints in place, so we handle both values
DO $$
BEGIN
    -- Only run if the column exists and doesn't already allow 'GENERATED'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'content_objects' AND column_name = 'source'
    ) THEN
        -- The existing constraint allows CURATED, LLM_GENERATED, MIXED
        -- We'll insert using LLM_GENERATED which is already allowed
        NULL; -- No action needed, existing constraint is fine
    END IF;
END $$;

-- =============================================================================
-- 5. Add migration version tracking
-- =============================================================================

-- Optional: Track migration version
DO $$
BEGIN
    INSERT INTO audit_log (action, target, details)
    VALUES ('migration', '004_content_embeddings', '{"version": "1.0", "description": "Phase 4 content generation pipeline"}')
    ON CONFLICT DO NOTHING;
EXCEPTION
    WHEN undefined_table THEN
        -- audit_log might not exist in test environments
        NULL;
END $$;
