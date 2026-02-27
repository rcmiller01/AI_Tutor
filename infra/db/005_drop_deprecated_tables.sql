-- =============================================================================
-- Migration 005: Drop Deprecated Tables
-- Phase 0.2 - Foundation Artifacts Cleanup
-- =============================================================================
-- This migration safely drops the deprecated `users_admin` and `child_profile`
-- tables that were replaced by the v1.1 household identity model in migration 002.
--
-- The new tables are:
--   - `parents` (replaces users_admin)
--   - `children` (replaces child_profile)
--   - `households` (new)
-- =============================================================================

-- =============================================================================
-- SAFETY CHECK
-- =============================================================================
-- Only drop if the v1.1 tables exist and have data (ensuring migration 002 ran)

DO $$
BEGIN
    -- Verify parents table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parents') THEN
        RAISE EXCEPTION 'Cannot drop deprecated tables: parents table does not exist. Run migration 002 first.';
    END IF;

    -- Verify children table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'children') THEN
        RAISE EXCEPTION 'Cannot drop deprecated tables: children table does not exist. Run migration 002 first.';
    END IF;
END $$;

-- =============================================================================
-- DROP DEPRECATED TABLES
-- =============================================================================

-- Drop child_profile if it exists (replaced by children table)
DROP TABLE IF EXISTS child_profile CASCADE;

-- Drop users_admin if it exists (replaced by parents table)
DROP TABLE IF EXISTS users_admin CASCADE;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE parents IS 'Parent/guardian accounts for household identity model (v1.1). Replaces deprecated users_admin.';
COMMENT ON TABLE children IS 'Child profiles under a household (v1.1). Replaces deprecated child_profile.';
