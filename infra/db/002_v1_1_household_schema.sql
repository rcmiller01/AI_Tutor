-- =============================================================================
-- Magic Mirror Tutor: Migration 002 — v1.1 Household Schema
-- Adds: parents, households, children (v1.1), child_mode_stats,
--       worlds, household_enabled_worlds, learning_bundles.
-- Updates: sessions (bundle_id, current_mode, child_id FK → children).
-- Deprecates: users_admin, child_profile (renamed; kept for rollback safety).
-- Seeds: 3 default worlds (Reading, Phonics, Numbers).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- GUARD: skip if already applied (idempotency for manual re-runs)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'parents'
    ) THEN
        RAISE NOTICE 'Migration 002 already applied — skipping.';
        RETURN;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. PARENTS  (replaces users_admin for household auth model)
-- ---------------------------------------------------------------------------

CREATE TABLE parents (
    parent_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,  -- bcrypt; never sent to client
    mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
    passkey_enabled BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE parents IS
    'One row per parent account. Replaces users_admin in v1.1.
     password_hash is always bcrypt. email is the login identifier.';

-- ---------------------------------------------------------------------------
-- 2. HOUSEHOLDS
-- ---------------------------------------------------------------------------

CREATE TABLE households (
    household_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id     UUID        NOT NULL REFERENCES parents(parent_id) ON DELETE CASCADE,
    settings_json JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_households_parent ON households(parent_id);

COMMENT ON TABLE households IS
    'One household per parent (1-to-1 in MVP; model supports future multi-parent).';

-- ---------------------------------------------------------------------------
-- 3. CHILDREN  (v1.1 — replaces child_profile)
-- ---------------------------------------------------------------------------

CREATE TABLE children (
    child_id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id             UUID         NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
    display_name             VARCHAR(50)  NOT NULL,
    avatar_id                VARCHAR(100) NOT NULL,
    preferred_mode           VARCHAR(10)  CHECK (preferred_mode IN ('talk', 'practice', 'play')),
    -- NULL until enough data to bias; explicit NOT IN ('') guard via CHECK
    accessibility_skip_hints BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Stars balance (legacy; maintained here for child-facing reward display)
    stars_balance            INTEGER      NOT NULL DEFAULT 0 CHECK (stars_balance >= 0),
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_children_household ON children(household_id);

COMMENT ON TABLE children IS
    'Child profiles under a household. No password or PIN — avatar picker is sole auth.
     accessibility_skip_hints: if TRUE, hint ladder jumps directly to bottom_out rung.';

-- ---------------------------------------------------------------------------
-- 4. CHILD_MODE_STATS  (per-child, per-mode selection counters)
-- ---------------------------------------------------------------------------

CREATE TABLE child_mode_stats (
    child_id       UUID        NOT NULL REFERENCES children(child_id) ON DELETE CASCADE,
    mode           VARCHAR(10) NOT NULL CHECK (mode IN ('talk', 'practice', 'play')),
    recent_count   INTEGER     NOT NULL DEFAULT 0 CHECK (recent_count >= 0),   -- rolling window
    lifetime_count INTEGER     NOT NULL DEFAULT 0 CHECK (lifetime_count >= 0),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, mode)
);

COMMENT ON TABLE child_mode_stats IS
    'Tracks how many times a child has selected each TriadMode.
     recent_count = rolling window (engine decides window size).
     Used by preferred_mode bias logic.';

-- ---------------------------------------------------------------------------
-- 5. WORLDS
-- ---------------------------------------------------------------------------

CREATE TABLE worlds (
    world_id   VARCHAR(50)  PRIMARY KEY,  -- slug, e.g. 'reading'
    name       VARCHAR(100) NOT NULL,
    icon       VARCHAR(100) NOT NULL,     -- asset reference key
    enabled    BOOLEAN      NOT NULL DEFAULT TRUE,  -- global admin enable
    skill_ids  TEXT[]       NOT NULL DEFAULT '{}',
    scope_tags TEXT[]       NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE worlds IS
    'Global world registry. enabled = FALSE turns off the world for ALL households.
     household_enabled_worlds provides per-household overrides.';

-- ---------------------------------------------------------------------------
-- 6. HOUSEHOLD_ENABLED_WORLDS
-- ---------------------------------------------------------------------------

CREATE TABLE household_enabled_worlds (
    household_id UUID        NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
    world_id     VARCHAR(50) NOT NULL REFERENCES worlds(world_id) ON DELETE CASCADE,
    enabled      BOOLEAN     NOT NULL DEFAULT TRUE,  -- per-household override
    PRIMARY KEY (household_id, world_id)
);

CREATE INDEX idx_hew_household ON household_enabled_worlds(household_id);

COMMENT ON TABLE household_enabled_worlds IS
    'Per-household world enable/disable overrides.
     A world is accessible iff worlds.enabled AND household_enabled_worlds.enabled are both TRUE.';

-- ---------------------------------------------------------------------------
-- 7. LEARNING_BUNDLES  (triad session artifact)
-- ---------------------------------------------------------------------------

CREATE TABLE learning_bundles (
    bundle_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id        UUID         NOT NULL,  -- FK added after sessions is updated below
    child_id          UUID         NOT NULL,  -- denormalised for quick lookup; FK below
    skill_id          VARCHAR(100) NOT NULL REFERENCES skill_specs(skill_id),
    world_id          VARCHAR(50)  REFERENCES worlds(world_id),  -- nullable
    talk_plan_id      VARCHAR(255) NOT NULL,  -- opaque ref; full schema deferred
    practice_set_ids  TEXT[]       NOT NULL DEFAULT '{}',
    play_config       JSONB        NOT NULL,  -- PlayConfig: { engine_type, template_id, params }
    constraints_hash  VARCHAR(64)  NOT NULL,  -- SHA-256 of canonical item_generator_rules JSON
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bundles_session ON learning_bundles(session_id);
CREATE INDEX idx_bundles_child   ON learning_bundles(child_id);

COMMENT ON TABLE learning_bundles IS
    'Created once at session start; reused across all mode switches (Talk/Practice/Play).
     Must be constructable with zero LLM calls (engine policy).
     constraints_hash = SHA-256(canonical JSON of skill_spec.item_generator_rules).';

-- ---------------------------------------------------------------------------
-- 8. UPDATE SESSIONS TABLE
--    • Add current_mode ('talk'|'practice'|'play') — replaces legacy 'mode'
--    • Add bundle_id FK (child of learning_bundles)
--    • Add child_id FK pointing to the new children table
-- ---------------------------------------------------------------------------

-- 8a. Add current_mode column
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS current_mode VARCHAR(10)
        NOT NULL DEFAULT 'talk'
        CHECK (current_mode IN ('talk', 'practice', 'play'));

COMMENT ON COLUMN sessions.current_mode IS
    'Active TriadMode for this session. Updated by POST /sessions/{id}/switch-mode.
     The legacy "mode" column (learning|game) is retained for backward compat.';

-- 8b. Add bundle_id FK (nullable until a bundle is created)
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS bundle_id UUID;

-- 8c. Add new child_id_v11 column pointing to children (new table).
--     We cannot rename the existing child_id FK without dropping constraints,
--     so we add a parallel column child_ref_id and coordinate usage in code.
--     Phase 1.2 will drop the old sessions.child_id FK once seed data is
--     migrated and the old child_profile table is safe to archive.
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS child_ref_id UUID REFERENCES children(child_id);

CREATE INDEX IF NOT EXISTS idx_sessions_child_ref ON sessions(child_ref_id, started_at DESC);

COMMENT ON COLUMN sessions.child_ref_id IS
    'FK to children (v1.1 table). Parallel to legacy child_id (FK to child_profile).
     Code should use child_ref_id for all new logic. Legacy child_id retained
     until migration is fully cut over.';

-- 8d. Add deferred FK: learning_bundles.session_id → sessions.session_id
ALTER TABLE learning_bundles
    ADD CONSTRAINT fk_bundles_session
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE;

-- 8e. Add deferred FK: learning_bundles.child_id → children.child_id
ALTER TABLE learning_bundles
    ADD CONSTRAINT fk_bundles_child
        FOREIGN KEY (child_id) REFERENCES children(child_id);

-- 8f. Add deferred FK: sessions.bundle_id → learning_bundles.bundle_id
ALTER TABLE sessions
    ADD CONSTRAINT fk_sessions_bundle
        FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id);

-- ---------------------------------------------------------------------------
-- 9. AUDIT LOG: add parent_id column (replaces user_id for v1.1)
-- ---------------------------------------------------------------------------

ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES parents(parent_id);

COMMENT ON COLUMN audit_log.parent_id IS
    'FK to parents (v1.1). Parallel to legacy user_id (FK to users_admin).';

-- ---------------------------------------------------------------------------
-- 10. POLICIES TABLE: add household_id + accessibility_skip_hints support
--     (child-level skip-hints flag is already on children; the policies table
--      stores other configurable values like DAILY_GAME_TIME_LIMIT_MINUTES)
-- ---------------------------------------------------------------------------

ALTER TABLE policies
    ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(household_id);

COMMENT ON COLUMN policies.household_id IS
    'Nullable household-level policy override. child_id remains for per-child policies.';

-- ---------------------------------------------------------------------------
-- 11. DAILY_TIME_TRACKING: add triad mode support
-- ---------------------------------------------------------------------------
-- The existing mode check is ('learning', 'game'). Extend to also allow
-- triad modes. We do this by dropping the constraint and re-adding it.

ALTER TABLE daily_time_tracking
    DROP CONSTRAINT IF EXISTS daily_time_tracking_mode_check;

ALTER TABLE daily_time_tracking
    ADD CONSTRAINT daily_time_tracking_mode_check
        CHECK (mode IN ('learning', 'game', 'talk', 'practice', 'play'));

COMMENT ON TABLE daily_time_tracking IS
    'Tracks seconds per child per day per mode.
     mode now accepts both legacy values (learning/game) and triad modes (talk/practice/play).';

-- ---------------------------------------------------------------------------
-- 12. INDEXES — additional performance indexes for v1.1 access patterns
-- ---------------------------------------------------------------------------

-- sessions: lookup by current_mode
CREATE INDEX IF NOT EXISTS idx_sessions_current_mode ON sessions(current_mode);

-- sessions: lookup by bundle_id
CREATE INDEX IF NOT EXISTS idx_sessions_bundle_id ON sessions(bundle_id);

-- child_mode_stats: for fast preferred_mode computation
CREATE INDEX IF NOT EXISTS idx_cms_child_recent ON child_mode_stats(child_id, recent_count DESC);

-- ---------------------------------------------------------------------------
-- 13. SEED: DEFAULT WORLDS
-- ---------------------------------------------------------------------------
-- Insert the 3 default worlds required by Phase 0.2.
-- ON CONFLICT DO NOTHING makes this idempotent.

INSERT INTO worlds (world_id, name, icon, enabled, skill_ids, scope_tags)
VALUES
    (
        'reading',
        'Reading Realm',
        'icon_world_reading',
        TRUE,
        ARRAY['short-comprehension', 'sight-words-k', 'rhyming-words', 'word-picture-match'],
        ARRAY['reading', 'comprehension', 'sight_words', 'vocabulary']
    ),
    (
        'phonics',
        'Phonics Forest',
        'icon_world_phonics',
        TRUE,
        ARRAY['cvc-blending'],
        ARRAY['phonics']
    ),
    (
        'numbers',
        'Numbers Kingdom',
        'icon_world_numbers',
        TRUE,
        ARRAY[],   -- placeholder; math skill specs TBD
        ARRAY['math']
    )
ON CONFLICT (world_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 14. DEPRECATION NOTICES (comments only — no DROP yet)
-- ---------------------------------------------------------------------------
-- users_admin: deprecated in v1.1. Will be archived (renamed / dropped) in
--   migration 003 once Phase 1.3 auth service is wired to parents table.
--   Do not add new columns or references to users_admin.
--
-- child_profile: deprecated in v1.1. Will be archived in migration 003 once
--   all sessions.child_id references are cut over to sessions.child_ref_id.
--   Do not add new columns or references to child_profile.

COMMENT ON TABLE users_admin IS
    '[DEPRECATED v1.1] Replaced by parents + households. Retained for rollback safety.
     Will be dropped in migration 003 after Phase 1.3 is complete.';

COMMENT ON TABLE child_profile IS
    '[DEPRECATED v1.1] Replaced by children. Retained for rollback safety.
     Will be dropped in migration 003 after sessions.child_id is cut over to child_ref_id.';
