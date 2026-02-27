-- =============================================================================
-- Migration 003: Telemetry Events Table
-- Phase 3 - Session Orchestration & Policy Engine
-- =============================================================================
-- This migration creates a dedicated telemetry_events table for all system
-- events (auth, policy, hints, bundles, flags, etc.). This is separate from
-- session_events which tracks user interactions (tap, drag, type).
-- =============================================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TELEMETRY EVENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS telemetry_events (
    event_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_name    VARCHAR(50)  NOT NULL,  -- domain.action format, e.g. 'policy.request_denied'
    session_id    UUID         REFERENCES sessions(session_id),  -- nullable for auth events
    child_id      UUID,                   -- nullable for parent-only events
    household_id  UUID         NOT NULL,  -- always required for scoping
    occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    payload       JSONB        NOT NULL DEFAULT '{}'
);

-- Index for querying events by session
CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_events(session_id, occurred_at DESC);

-- Index for querying events by child
CREATE INDEX IF NOT EXISTS idx_telemetry_child ON telemetry_events(child_id, occurred_at DESC);

-- Index for querying events by household (parent dashboard)
CREATE INDEX IF NOT EXISTS idx_telemetry_household ON telemetry_events(household_id, occurred_at DESC);

-- Index for querying events by name (analytics)
CREATE INDEX IF NOT EXISTS idx_telemetry_event_name ON telemetry_events(event_name, occurred_at DESC);

-- Index for flag events (flagged moments dashboard)
CREATE INDEX IF NOT EXISTS idx_telemetry_flags ON telemetry_events(event_name, household_id, occurred_at DESC)
    WHERE event_name LIKE 'flag.%';

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE telemetry_events IS 'Append-only telemetry for all system events (auth, policy, hints, bundles, flags). Separate from session_events which tracks user interactions.';
COMMENT ON COLUMN telemetry_events.event_name IS 'Event name in domain.action format: auth.login_success, policy.request_denied, hint.rung_served, etc.';
COMMENT ON COLUMN telemetry_events.session_id IS 'FK to sessions. NULL for auth events or events outside a session context.';
COMMENT ON COLUMN telemetry_events.child_id IS 'Child associated with event. NULL for parent-only events like auth.parent_registered.';
COMMENT ON COLUMN telemetry_events.household_id IS 'Always required. Used for scoping queries to a household.';
COMMENT ON COLUMN telemetry_events.payload IS 'Event-specific data as JSONB. Structure varies by event_name.';
