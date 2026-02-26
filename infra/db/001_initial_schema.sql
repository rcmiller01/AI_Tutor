-- =============================================================================
-- Magic Mirror Tutor: Initial Schema
-- PostgreSQL 16+ with pgvector extension
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- =============================================================================
-- 1. IDENTITY & AUTH
-- =============================================================================

CREATE TABLE users_admin (
    user_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'admin')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE child_profile (
    child_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name VARCHAR(50)  NOT NULL,
    avatar_key   VARCHAR(100),
    grade_band   VARCHAR(5)   NOT NULL CHECK (grade_band IN ('PK', 'K', '1', '2', '3')),
    stars_balance INTEGER     NOT NULL DEFAULT 0 CHECK (stars_balance >= 0),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
    device_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id       UUID         NOT NULL REFERENCES child_profile(child_id),
    device_name    VARCHAR(100),
    session_token  VARCHAR(255) NOT NULL UNIQUE,
    last_seen_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- 2. POLICIES & CURRICULUM
-- =============================================================================

CREATE TABLE policies (
    policy_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id    UUID         NOT NULL REFERENCES child_profile(child_id),
    policy_type VARCHAR(50)  NOT NULL,
    value       JSONB        NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by  UUID         REFERENCES users_admin(user_id),
    UNIQUE (child_id, policy_type)
);

COMMENT ON TABLE policies IS 'Parent-set rules. policy_type maps to Policy schema enum. value is JSONB for flexibility (int, bool, array, object).';

CREATE TABLE curriculum_goals (
    goal_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id         UUID         NOT NULL REFERENCES child_profile(child_id),
    scope_tag        VARCHAR(50)  NOT NULL,
    description      TEXT         NOT NULL,
    target_skill_ids TEXT[],
    priority         VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    status           VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

-- =============================================================================
-- 3. SKILL SPECS & CONTENT
-- =============================================================================

CREATE TABLE skill_specs (
    skill_id   VARCHAR(100) PRIMARY KEY,
    version    INTEGER      NOT NULL DEFAULT 1,
    grade_band VARCHAR(5)   NOT NULL CHECK (grade_band IN ('PK', 'K', '1', '2', '3')),
    objective  TEXT         NOT NULL,
    spec_data  JSONB        NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE skill_specs IS 'Authoritative skill definitions. spec_data conforms to skill-spec.schema.json.';

CREATE TABLE content_objects (
    content_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id         VARCHAR(100) NOT NULL REFERENCES skill_specs(skill_id),
    engine_type      VARCHAR(30)  NOT NULL CHECK (engine_type IN ('MICRO_SKILL_DRILL', 'MATCH_SORT_CLASSIFY', 'STORY_MICROTASKS')),
    template_id      VARCHAR(30)  NOT NULL CHECK (template_id IN ('tap_choice', 'drag_bins', 'type_in_blank', 'match_pairs', 'story_page', 'comprehension_q')),
    version          INTEGER      NOT NULL DEFAULT 1,
    source           VARCHAR(20)  NOT NULL CHECK (source IN ('CURATED', 'LLM_GENERATED', 'MIXED')),
    difficulty_level INTEGER      NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 10),
    constraints_hash VARCHAR(64),
    payload          JSONB        NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_skill_template ON content_objects(skill_id, template_id, difficulty_level);
CREATE INDEX idx_content_engine ON content_objects(engine_type);

COMMENT ON TABLE content_objects IS 'Immutable content instances. payload conforms to content-object.schema.json payload defs.';

-- pgvector embedding column (1536 dimensions for text-embedding-3-small)
CREATE TABLE content_embeddings (
    content_id UUID PRIMARY KEY REFERENCES content_objects(content_id),
    embedding  vector(1536)  NOT NULL,
    model      VARCHAR(100)  NOT NULL DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX idx_content_embedding_hnsw ON content_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 4. CONTENT GENERATION JOBS
-- =============================================================================

CREATE TABLE content_gen_jobs (
    job_id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requested_by_session UUID,  -- FK added after sessions table is created
    skill_id             VARCHAR(100) NOT NULL REFERENCES skill_specs(skill_id),
    template_id          VARCHAR(30)  NOT NULL,
    difficulty_level     INTEGER      DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 10),
    constraints          JSONB        NOT NULL,
    output_schema_id     VARCHAR(100) NOT NULL,
    status               VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'rejected')),
    provider             VARCHAR(30)  NOT NULL CHECK (provider IN ('openrouter', 'openai', 'fallback_curated')),
    model                VARCHAR(100),
    result_content_id    UUID         REFERENCES content_objects(content_id),
    attempt_count        INTEGER      NOT NULL DEFAULT 0,
    max_attempts         INTEGER      NOT NULL DEFAULT 3,
    validation_report    JSONB,
    raw_llm_output       TEXT,
    prompt_tokens        INTEGER,
    completion_tokens    INTEGER,
    latency_ms           INTEGER,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ
);

CREATE INDEX idx_gen_jobs_status ON content_gen_jobs(status);
CREATE INDEX idx_gen_jobs_skill ON content_gen_jobs(skill_id, template_id);

-- =============================================================================
-- 5. SESSIONS & TELEMETRY
-- =============================================================================

CREATE TABLE sessions (
    session_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id         UUID         NOT NULL REFERENCES child_profile(child_id),
    skill_id         VARCHAR(100) NOT NULL REFERENCES skill_specs(skill_id),
    engine_type      VARCHAR(30)  NOT NULL CHECK (engine_type IN ('MICRO_SKILL_DRILL', 'MATCH_SORT_CLASSIFY', 'STORY_MICROTASKS')),
    mode             VARCHAR(20)  NOT NULL DEFAULT 'learning' CHECK (mode IN ('learning', 'game')),
    status           VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned', 'timed_out')),
    difficulty_level INTEGER      NOT NULL DEFAULT 1,
    random_seed      INTEGER,
    stats            JSONB        NOT NULL DEFAULT '{}',
    engine_state     JSONB,
    approval_id      UUID,
    started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    paused_at        TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ,
    duration_seconds INTEGER
);

CREATE INDEX idx_sessions_child ON sessions(child_id, started_at DESC);
CREATE INDEX idx_sessions_status ON sessions(status);

CREATE TABLE session_events (
    event_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id       UUID         NOT NULL REFERENCES sessions(session_id),
    content_id       UUID         REFERENCES content_objects(content_id),
    interaction_type VARCHAR(20)  NOT NULL CHECK (interaction_type IN ('tap', 'drag', 'type', 'voice_response', 'word_tap')),
    value            JSONB        NOT NULL,
    response_time_ms INTEGER,
    score_result     JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_session ON session_events(session_id, created_at);

-- =============================================================================
-- 6. APPROVALS
-- =============================================================================

CREATE TABLE approvals (
    approval_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID         NOT NULL REFERENCES child_profile(child_id),
    request_type    VARCHAR(30)  NOT NULL CHECK (request_type IN ('scope_change', 'skill_change', 'time_extension', 'game_mode')),
    status          VARCHAR(20)  NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'notified', 'approved', 'denied', 'expired', 'fulfilled')),
    request_details JSONB,
    resolution      JSONB,
    requested_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_child ON approvals(child_id, requested_at DESC);

-- Add FK from sessions to approvals (deferred because sessions is defined after approvals in dependency order)
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_approval
    FOREIGN KEY (approval_id) REFERENCES approvals(approval_id);

-- Add FK from content_gen_jobs to sessions (deferred for same reason)
ALTER TABLE content_gen_jobs ADD CONSTRAINT fk_gen_jobs_session
    FOREIGN KEY (requested_by_session) REFERENCES sessions(session_id);

-- =============================================================================
-- 7. REWARDS
-- =============================================================================

CREATE TABLE stars_ledger (
    entry_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id      UUID         NOT NULL REFERENCES child_profile(child_id),
    amount        INTEGER      NOT NULL,
    reason        VARCHAR(30)  NOT NULL CHECK (reason IN ('correct_answer', 'streak_bonus', 'mastery_bonus', 'level_up', 'reward_redeemed', 'unlockable_purchased', 'admin_adjustment')),
    session_id    UUID         REFERENCES sessions(session_id),
    balance_after INTEGER      NOT NULL CHECK (balance_after >= 0),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stars_child ON stars_ledger(child_id, created_at DESC);

CREATE TABLE star_rewards (
    reward_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id    UUID         NOT NULL REFERENCES child_profile(child_id),
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    cost_stars  INTEGER      NOT NULL CHECK (cost_stars > 0),
    icon_key    VARCHAR(100),
    status      VARCHAR(20)  NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'archived')),
    repeatable  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMPTZ
);

CREATE TABLE unlockables (
    unlockable_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                   VARCHAR(100) NOT NULL,
    description            TEXT,
    category               VARCHAR(20)  NOT NULL CHECK (category IN ('theme', 'character', 'background', 'sound_pack', 'badge')),
    cost_stars             INTEGER      NOT NULL DEFAULT 0,
    unlock_condition       VARCHAR(20)  NOT NULL DEFAULT 'purchase' CHECK (unlock_condition IN ('purchase', 'milestone')),
    milestone_type         VARCHAR(30),
    milestone_threshold    INTEGER,
    asset_key              VARCHAR(100),
    preview_key            VARCHAR(100),
    is_default             BOOLEAN      NOT NULL DEFAULT FALSE
);

-- Per-child unlock state
CREATE TABLE child_unlockables (
    child_id      UUID NOT NULL REFERENCES child_profile(child_id),
    unlockable_id UUID NOT NULL REFERENCES unlockables(unlockable_id),
    is_unlocked   BOOLEAN     NOT NULL DEFAULT FALSE,
    is_equipped   BOOLEAN     NOT NULL DEFAULT FALSE,
    unlocked_at   TIMESTAMPTZ,
    PRIMARY KEY (child_id, unlockable_id)
);

-- =============================================================================
-- 8. AUDIT LOG
-- =============================================================================

CREATE TABLE audit_log (
    log_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID         REFERENCES users_admin(user_id),
    action     VARCHAR(50)  NOT NULL,
    target     VARCHAR(100),
    details    JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- =============================================================================
-- 9. DAILY TIME TRACKING (for policy enforcement)
-- =============================================================================

CREATE TABLE daily_time_tracking (
    child_id     UUID        NOT NULL REFERENCES child_profile(child_id),
    date         DATE        NOT NULL DEFAULT CURRENT_DATE,
    mode         VARCHAR(20) NOT NULL CHECK (mode IN ('learning', 'game')),
    total_seconds INTEGER    NOT NULL DEFAULT 0 CHECK (total_seconds >= 0),
    PRIMARY KEY (child_id, date, mode)
);
