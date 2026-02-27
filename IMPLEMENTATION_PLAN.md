# Implementation Plan: Magic Mirror Tutor

> **Version:** aligned with PRD v2.1 / Architecture v1.1 / Design Checklist v0.2
> **Strategy:** Phases are ordered by dependency. Each phase produces a testable, shippable slice. Phases are broken into sub-tasks — these are the unit of "next minimal TODO" when we descend into a phase.
> **Test framework:** Vitest (unit/integration). Goldens: `packages/engine-runtime/src/__tests__/goldens/`.
> **Reference docs:** [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [DESIGN_CHECKLIST.md](./DESIGN_CHECKLIST.md) · [docs/ACCEPTANCE_CRITERIA_MATRIX.md](./docs/ACCEPTANCE_CRITERIA_MATRIX.md) · [docs/GOLDENS_PLAN.md](./docs/GOLDENS_PLAN.md)

---

## Status Legend

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |
| 🟡 | Stub / partial (exists but needs fleshing out) |
| 🔴 | Blocked |

---

## Phase 0 — Foundation Artifacts *(Design before build)* ✅

> **Exit criterion:** Every artifact in this phase exists and is reviewed. No Phase 1 work begins without Phase 0 complete.
> **Status:** All 6 sub-tasks complete. Phase 0 is DONE — Phase 1 work may begin.

### 0.1 Schema Package (`packages/schemas`)
- ✅ TypeScript types for: `SkillSpec`, `ContentObject` (all templates), `InteractionEvent`, `ScoreResult`, `HintPayload`, `Session`, `PromptPayload`, `ApprovalRequest`, `Policy`, rewards
- ✅ **Added v1.1 types:**
  - `LearningBundle` + `PlayConfig`
  - `HintLadderState` + `HINT_RUNGS` constant
  - `ChildProfile` + `ChildModeStats`
  - `Parent` + `Household`
  - `World` + `HouseholdEnabledWorld`
  - `SafeAlternative` + `DenialResponse`
  - `TriadMode`, `DenialReasonCode`, `HintRung`, `FlagType`, `MfaType` enums
  - `SessionV11` (extends `Session` with `current_mode` + `bundle_id`)
  - `TelemetryEventBase` + full discriminated union `TelemetryEvent` (35 event types)
  - `TelemetryPayload<T>` utility type
- ✅ `tsc --noEmit` passes with zero errors

### 0.2 DB Schema & Migrations (`infra/db/`)
- ✅ **Household auth tables:**
  - `parents` (id, email, password_hash, mfa_enabled, passkey_enabled, created_at)
  - `households` (id, parent_id, settings_json)
  - `children` (id, household_id, display_name, avatar_id, preferred_mode, accessibility_skip_hints, created_at)
  - `child_mode_stats` (child_id, mode, recent_count, lifetime_count, updated_at)
- ✅ **Worlds tables:**
  - `worlds` (world_id, name, icon, enabled, skill_ids[], scope_tags[])
  - `household_enabled_worlds` (household_id, world_id, enabled)
- ✅ **Bundle table:**
  - `learning_bundles` (bundle_id, session_id, child_id, skill_id, world_id, talk_plan_id, practice_set_ids, play_config jsonb, constraints_hash, created_at)
- ✅ **Update `sessions` table:** add `bundle_id` FK, add `current_mode` ('talk'|'practice'|'play'), add `child_ref_id` FK → `children` (parallel to legacy `child_id`; cut-over deferred to migration 003)
- 🟡 **Drop / replace `users_admin` and `child_profile`** — deprecated with SQL comments; safe-drop deferred to migration 003 (Phase 1.3 gate)
- ✅ Add `accessibility_skip_hints` boolean to `children` table
- ✅ Seed migration: insert default `worlds` rows (Reading Realm, Phonics Forest, Numbers Kingdom)
- ✅ Verify all FKs, indexes (sessions.child_ref_id, sessions.bundle_id, session_events.session_id, child_mode_stats, household_enabled_worlds)

### 0.3 Seed Content & Skill Specs (`content/skill-specs/`)
- ✅ `cvc-blending.json`
- ✅ `sight-words-k.json`
- ✅ `rhyming-words.json`
- ✅ `word-picture-match.json`
- ✅ `short-comprehension.json`
- ✅ **Flesh out `hint_policy.max_hints_per_item`** to 5 on CVC blending; added all 5 hint styles
- ✅ Add `near_transfer_pool` field to all 5 skill specs (cvc-blending uses `content_id_list`; others use `query` strategy)
- ✅ Create golden content objects:
  - `cvc-blending-tap-001.json` (primary item: "c-a-t")
  - `cvc-blending-tap-002.json` (near-transfer: "d-o-g", different phonics family)
- ✅ Seed script: `services/mirror-core/src/db/seed-skill-specs.ts` — idempotent, imports all skill specs + golden content objects

### 0.4 Engine State Machines (Formal)
- ✅ `docs/engines/micro-skill-drill.md` — fully updated for v1.1
- ✅ `docs/engines/match-sort-classify.md` — fully updated for v1.1
- ✅ `docs/engines/story-microtasks.md` — fully updated for v1.1
- ✅ **All three updated** with:
  - `hint_level` field in engine state (per-item; per-task for Story)
  - `near_transfer_scheduled` + `near_transfer_content_id` fields
  - Full 5-rung state diagram: `NUDGE → STRATEGY → WORKED_EXAMPLE → PARTIAL_FILL → BOTTOM_OUT`
  - `NEAR_TRANSFER_SCHEDULE` state + transition after BOTTOM_OUT
  - Accessibility skip path (`HINT_SKIP_TO_BOTTOM_OUT`)
  - TriadMode transition table (Talk ↔ Practice ↔ Play) with engine behavior per transition
  - Telemetry events emitted per engine
  - TypeScript engine state shape per engine

### 0.5 OpenAPI / API Spec (`docs/api/`)
- ✅ API spec fully rewritten for v1.1 (`docs/api/api-spec.md`)
- ✅ **New / updated endpoints documented:**
  - `POST /api/admin/register` — create parent account
  - `POST /api/admin/login` — issue `admin_access_token` (JWT, 15 min) + `admin_refresh_token` cookie
  - `POST /api/admin/logout` + `POST /api/admin/refresh`
  - `GET/POST/PUT /api/admin/children` — household child management
  - `GET /api/children` + `POST /api/children/select` — avatar picker + child JWT issue
  - `POST /api/sessions/start` — `mode` field (talk|practice|play), `child_id` from JWT, bundle in response; soft-denial returns `DenialResponse` with `safe_alternatives[]`
  - `POST /api/sessions/{id}/switch-mode` — body: `{ mode }`, returns updated session + next prompt
  - `GET  /api/sessions/{id}/bundle` — return current `LearningBundle`
  - `POST /api/sessions/{id}/hint` — response includes `hint_level`, `hints_remaining`, `rung_name`, `near_transfer_scheduled`
  - `POST /api/voice/intent` — response includes `safe_alternatives[]` on denial
  - `GET  /api/admin/worlds` + `PUT /api/admin/worlds/{id}/enabled`
  - `GET  /api/admin/dashboard/flags` — flagged moments list with filter params
  - `GET  /api/admin/dashboard/sessions` — session history
  - `GET/PUT /api/admin/policies`
  - `GET  /api/admin/approvals`, `POST .../approve`, `POST .../deny`
  - `WebSocket /ws/voice` — voice relay with policy check on tool calls; denial frame on block
  - `WebSocket /ws/updates` — push to child + parent
- ✅ **Auth model documented:** dual JWT (parent 15-min + child 4-hr); role enforcement at middleware; no bypass paths
- ✅ **Telemetry catalog documented** per endpoint (all 30+ events mapped to their triggering endpoint)

### 0.6 Prompt Contracts (`docs/prompts/`)
- ✅ `docs/prompts/content-generation-contracts.md` fully rewritten for v1.1
- ✅ **Contracts defined** (each with system prompt, user prompt template, JSON output schema, validation pipeline, retry policy):
  - `CONTENT_GEN_TAP_CHOICE` — vocab allowlist, disallowed graphemes, length, uniqueness, answer-leakage checks
  - `CONTENT_GEN_STORY_PAGE` — reading level bounds, word count bounds, span coverage/accuracy, tappable count, safety
  - `TALK_PLAN_GEN` — offline LearningBundle pre-assembly; 3–5 exchange pairs; ≤25 words/turn; no reading demands; bridge bridging to Practice
  - `NEAR_TRANSFER_GEN` — same skill_id + constraints_hash; different surface form (different phonics sub-family); copy-detection check
- ✅ Retry policy documented per contract (max 3 attempts; constraint addenda injected on retries 1 and 2; curated fallback on exhaust)
- ✅ Provider config: OpenRouter (gemini-2.0-flash, temp 0.3) → OpenAI fallback → curated pool
- ✅ `ContentGenJob` state flow diagram (PENDING → RUNNING → SUCCEEDED | REJECTED | FAILED)

---

## Phase 1 — Repo Scaffolding & Backend Boot ✅

> **Exit criterion:** `pnpm dev` starts Mirror Core; Postgres migrates cleanly; health check passes.
> **Status:** All Phase 1 tasks are complete (auth services, DB migrations, scaffolding).

### 1.1 Monorepo Structure ✅
- ✅ `pnpm` workspaces configured
- ✅ `packages/schemas` exists and builds
- ✅ `services/mirror-core` exists
- ✅ `apps/child-ui` scaffold exists (Vite + Tauri)
- ✅ `apps/parent-portal` scaffold exists (Vite)
- ✅ `packages/engine-runtime` — scaffold created with:
  - `package.json` (Vitest + `@mirror/schemas` dep)
  - `vitest.config.ts` (covers `.test.ts` and `.golden.test.ts`)
  - `tsconfig.json` (extends base, project ref to schemas)
  - `src/index.ts` + `src/types/engine-plugin.ts` + `src/types/engine-states.ts`
  - `src/__tests__/goldens/` directory structure:
    - `content/cvc-blending-tap-001.json`, `cvc-blending-tap-002.json`
    - `engine-state/hint-level-0.json`, `hint-level-4-pre-bottom-out.json`, `hint-level-5-post-bottom-out.json`
    - `bundles/cvc-bundle-001.json`
  - `src/__tests__/hint-ladder.golden.test.ts` — 12 tests (7 pass, 5 `.skip` Phase 2 stubs)
  - `src/__tests__/triad-bundle.golden.test.ts` — 12 tests (8 pass, 4 `.skip` Phase 2 stubs)
  - **`pnpm test:golden` → 15 pass, 9 skipped ✅**

### 1.2 Mirror Core Backend Boot ✅
- ✅ TypeScript Node.js service exists
- ✅ DB connection pool (`services/mirror-core/src/db/pool.ts`)
- ✅ **Structured logging hardened:**
  - `genReqId: () => randomUUID()` — every request gets a unique ID
  - `X-Request-Id` response header automatically set for client correlation
  - Production mode: structured JSON base fields (`service`, `env`) on every log line
  - Removed raw `console.log(DATABASE_URL)` leak
  - `SEED_ON_BOOT` env guard (seeds skipped in production unless explicitly set)
- ✅ **`/api/health` endpoint updated** — now checks DB connectivity (`SELECT 1`), returns:
  - `{ status, service, version, timestamp, uptime_seconds, db: { status, latency_ms, error } }`
  - Returns `503` if DB is down (`db.status: "error"`)
- ✅ **`db:migrate` scripts fixed** in root `package.json`:
  - `db:migrate:001` — migration 001 only
  - `db:migrate:002` — migration 002 only
  - `db:migrate:all` — both migrations in sequence
  - `db:seed` — runs seed-skill-specs.ts
- ✅ `test` + `test:golden` scripts added to root `package.json`

### 1.3 Auth Service (Household Model) ✅
- ✅ `POST /api/admin/register` — create parent account (email + bcrypt hash)
- ✅ `POST /api/admin/login` — issue `admin_access_token` (JWT, 15 min) + `admin_refresh_token`
- ✅ `POST /api/admin/logout` — invalidate refresh token
- ⏭️ TOTP enrollment endpoint (optional, skipped for MVP)
- ⏭️ Passkey registration + assertion endpoints (WebAuthn, optional, skipped for MVP)
- ✅ Parent session middleware: `requireParentAuth` — validates JWT on all `/api/admin/*` routes; returns 401 on expiry
- ✅ `POST /api/children/select` — child selects profile by avatar; issues `child_session_token` (JWT, scoped to child_id + household_id)
- ✅ Child session middleware: `requireChildAuth` — tests token, and `blockParentOnChildRoute` cross-role verification

### 1.4 Child Profile & Household CRUD ✅
- ✅ `POST /api/admin/children` — create child profile (display_name, avatar_id)
- ✅ `GET  /api/admin/children` — list children in household
- ✅ `PUT  /api/admin/children/{id}` — update display_name / avatar / accessibility preferences
- ✅ `GET  /api/children` — public (avatar picker) — list profiles for device header `X-Household-Id`

---

## Phase 2 — Deterministic Engine Runtime

> **Exit criterion:** All hint-ladder and engine golden tests pass. Engine operates with zero LLM calls given seeded content.

### 2.1 Engine Runtime Package (`packages/engine-runtime`)
- ⬜ Define `EnginePlugin` interface (per Architecture §3.3 + updated signature for `render_hints`)
- ⬜ Implement `MicroSkillDrillEngine`:
  - `init(session_ctx) → engine_state`
  - `next_prompt(engine_state) → PromptPayload`
  - `score_interaction(engine_state, InteractionEvent) → ScoreResult`
  - `render_hints(engine_state, ScoreResult, SkillSpec) → HintPayload`
  - `is_mastered(engine_state) → MasteryResult`
  - `maybe_generate_content(engine_state) → ContentGenJob | null`
- ⬜ Implement hint ladder logic in `render_hints()`:
  - Read `engine_state.hint_level`
  - Select rung deterministically (Nudge → Strategy → WorkedExample → PartialFill → BottomOut)
  - Respect `skill_spec.hint_policy.max_hints_per_item` cap
  - On BottomOut: set `near_transfer_scheduled = true`, select near-transfer `content_id`, insert into front of queue
  - Accessibility skip: if `child_policy.accessibility_skip_hints = true`, jump directly to BottomOut
  - Increment `hint_level` in returned engine_state
- ⬜ Engine state: `current_content_id`, `hint_level`, `near_transfer_scheduled`, `near_transfer_content_id`, `queue[]`
- ⬜ `hint_level` resets to 0 when `current_content_id` changes

### 2.2 Hint Ladder Golden Tests
- ⬜ Create golden fixture files (per GOLDENS_PLAN.md §1.1–1.2):
  - `goldens/content/cvc-blending-tap-001.json`
  - `goldens/content/cvc-blending-tap-002.json`
  - `goldens/engine-state/hint-level-0.json`
  - `goldens/engine-state/hint-level-4-pre-bottom-out.json`
  - `goldens/engine-state/hint-level-5-post-bottom-out.json`
- ⬜ Write `hint-ladder.golden.test.ts` — all 9 scenarios from GOLDENS_PLAN.md §1.3
- ⬜ All 9 scenarios pass

### 2.3 LearningBundle Assembly
- ⬜ `createLearningBundle(session_id, child_id, skill_id, world_id)` function:
  - Selects `practice_set_ids[]` from DB (curated content for skill, difficulty 1)
  - Assigns `talk_plan_id` (stub string ref for now; full talk plan schema deferred)
  - Builds `play_config` from skill spec `allowed_engine_types[0]` + `templates[0]`
  - Computes `constraints_hash` = SHA-256(canonical JSON of `skill_spec.item_generator_rules`)
  - Persists to `learning_bundles` table
  - Makes **zero LLM calls**
- ⬜ `switchMode(session_id, mode)`: updates `sessions.current_mode`; does NOT create new bundle
- ⬜ `getBundle(session_id)`: returns current bundle for session

### 2.4 Triad Bundle Golden Tests
- ⬜ Create golden fixture: `goldens/bundles/cvc-bundle-001.json` (stub, with real constraints_hash)
- ⬜ Write `triad-bundle.golden.test.ts` — all 9 scenarios from GOLDENS_PLAN.md §2.2
- ⬜ All 9 scenarios pass

### 2.5 Remaining Engine Implementations
- ⬜ `MatchSortClassifyEngine` — same plugin interface; hint ladder applies
- ⬜ `StoryMicroTasksEngine` — hint ladder applies to comprehension items; story pages themselves have no hints

---

## Phase 3 — Session Orchestration & Policy Engine

> **Exit criterion:** Full session lifecycle via API, policy denials return `safe_alternatives[]`, telemetry events emitted.

### 3.1 Session Lifecycle API
- ⬜ `POST /api/sessions/start`:
  - Requires `child_id` (from child session token)
  - Defaults `mode = 'talk'`
  - Creates `LearningBundle` (Phase 2.3)
  - Returns `session_id`, `bundle_id`, initial `PromptPayload`, and triad offer text
- ⬜ `POST /api/sessions/{id}/interact` — score via engine; emit `session_events` telemetry
- ⬜ `POST /api/sessions/{id}/hint` — `render_hints()` via engine; emit `hint.requested` + `hint.rung_served`
- ⬜ `POST /api/sessions/{id}/switch-mode` — `switchMode()`; emit `session.mode_switched`
- ⬜ `POST /api/sessions/{id}/pause` — snapshot `engine_state` to DB
- ⬜ `GET  /api/sessions/{id}` — return session + engine_state for resume
- ⬜ Auto-timeout: cron/timer sets session to `timed_out` after N minutes idle (configurable)

### 3.2 Policy Engine
- ⬜ `checkPolicy(child_id, requested_skill_id, mode)` — enforces:
  - Daily game time limit
  - Allowed scope tags (enabled worlds)
  - Allowed engine types
- ⬜ On denial: compute `safe_alternatives[]` deterministically from `household_enabled_worlds` — **no LLM**
- ⬜ Return `DenialResponse { denial_reason_code, safe_alternatives[] }`
- ⬜ Create `ApprovalRequest` record in background on any denial
- ⬜ Notify Parent Portal via WebSocket (`/ws/updates`) of new approval request

### 3.3 Approval Workflow
- ⬜ `GET  /api/admin/approvals` — list pending approval cards
- ⬜ `POST /api/admin/approvals/{id}/approve` — create new session with approved scope
- ⬜ `POST /api/admin/approvals/{id}/deny` — update status; no further action
- ⬜ WebSocket: push approval result to child app

### 3.4 Worlds API
- ⬜ `GET  /api/admin/worlds` — list all worlds with enabled status for this household
- ⬜ `PUT  /api/admin/worlds/{id}/enabled` — toggle per household
- ⬜ Seed default world rows in migration (Phase 0.2)

### 3.5 Telemetry Emission
- ⬜ Implement `emitEvent(event_name, payload)` utility — inserts into `session_events`
- ⬜ Wire events per ACCEPTANCE_CRITERIA_MATRIX.md telemetry catalog (all 30+ events)
- ⬜ Emit `flag.*` events on: repeated misconception loop (≥3 consecutive), out-of-scope request, safety event

---

## Phase 4 — Content Generation Pipeline

> **Exit criterion:** Engine can request LLM-generated content; validation pipeline rejects bad output; curated fallback always available.

### 4.1 Content Generation Job Queue
- ⬜ `ContentGenJob` table + queue processor
- ⬜ `POST` internal job → `PENDING` → picked up by worker → `RUNNING` → `SUCCEEDED | FAILED | REJECTED`
- ⬜ Worker calls OpenRouter (or Mercury2) with prompt contract for requested template
- ⬜ Validation pipeline:
  1. JSON schema validate
  2. Vocab allowlist check
  3. Disallowed grapheme check
  4. Reading-level heuristic bounds
  5. Profanity/safety filter
  6. On fail: retry with tighter prompt (max 2 retries) → fallback to curated on final fail
- ⬜ Store validated output as new `ContentObject` + compute + store embedding (pgvector)

### 4.2 Near-Transfer Content Pool
- ⬜ Ensure each skill always has ≥2 curated items (for near-transfer scheduling without LLM)
- ⬜ Engine's near-transfer selector: query DB for `skill_id = X AND content_id != current_content_id AND difficulty_level = N`
- ⬜ If pool empty: trigger `ContentGenJob` for a near-transfer variant; use curated fallback in the meantime

### 4.3 pgvector Retrieval
- ⬜ Embed content on write (`text-embedding-3-small`)
- ⬜ `findSimilarContent(skill_id, template_id, embedding, k)` utility function
- ⬜ Use in bundle assembly to select diverse practice items

---

## Phase 5 — Parent Portal

> **Exit criterion:** Parent can log in, view session summaries, see flagged moments, manage policies and worlds, and approve/deny requests.

### 5.1 Parent Portal App (`apps/parent-portal`)
- ⬜ Scaffold React app (Vite)
- ⬜ Auth: login form → `POST /api/admin/login` → store token in memory (NOT localStorage)
- ⬜ Session timeout UI: re-authentication prompt after 15 min inactivity
- ⬜ **Parent Mode Lock:** entry always triggers login challenge; no bypass

### 5.2 Dashboard
- ⬜ Overview: per-child session summaries (skills, time, accuracy, mastery gates)
- ⬜ Flagged Moments list: misconception loops, out-of-scope requests, safety events — with timestamp and description
- ⬜ **No transcript view** (intentional omission in v1)
- ⬜ Mode preference per child: display `preferred_mode` + recent mode distribution from `child_mode_stats`

### 5.3 Policy Management
- ⬜ Set `DAILY_GAME_TIME_LIMIT_MINUTES` per child
- ⬜ Enable/disable worlds per household
- ⬜ Set `hint_policy.max_hints_per_item` per child (3–5 range, accessibility override)
- ⬜ Set `accessibility_skip_hints` flag per child

### 5.4 Approval Cards UI
- ⬜ Real-time notification badge for pending approvals (WebSocket)
- ⬜ Approval card detail: child's request, requested scope, timestamp
- ⬜ Approve → creates new session scope; Deny → child gets `safe_alternatives[]`

### 5.5 Child Profile Management
- ⬜ Create / edit child profiles (display name, avatar selection)
- ⬜ View child's star balance, badges, unlockables

---

## Phase 6 — Child App UI & Engine Widgets

> **Exit criterion:** A child can complete a full session (Talk → Practice → Play) via the UI with all three engines rendering correctly.

### 6.1 Child App Scaffold (`apps/child-ui`)
- ⬜ React + Vite scaffold
- ⬜ Avatar/profile picker screen (no auth, large touch targets)
- ⬜ Home screen: companion character (dinosaur), badge strip with empty slots, mode entry

### 6.2 Shared Component Library (`packages/ui-components`)
- ⬜ Interaction widgets: `TapChoice`, `DragBins`, `MatchPairs`, `TypeInBlank`
- ⬜ Reading widgets: `ReadAloudPage`, `WordTapPopup`
- ⬜ Progress widgets: `StreakMeter`, `MasteryGate`, `BadgeStrip`
- ⬜ Reward widgets: `StarsBurst`, `UnlockableReveal`, `CompanionReaction`
- ⬜ System widgets: `TriadModeOffer`, `HintButton`, `ParentApprovalBanner`, `TimerLimitBanner`
- ⬜ All widgets driven by `PromptPayload` from backend — client never decides correctness

### 6.3 Triad Mode UX
- ⬜ Default entry: Talk mode starts immediately after profile selection
- ⬜ First-interaction triad offer: *"Want to talk, practice, or play?"* — all 3 always shown
- ⬜ Mode switch: tap mode label at any time → `POST /api/sessions/{id}/switch-mode`
- ⬜ Biased offer: if `preferred_mode` is set, reorder options (preferred first) but never remove any

### 6.4 Talk Mode UI
- ⬜ Voice-first: child taps mic or speaks to start
- ⬜ Text display of response (short, bounded)
- ⬜ Practice bridge offer rendered as a tappable button below Talk response

### 6.5 Reward Animations
- ⬜ Stars animation on correct answer
- ⬜ Badge slot fill animation
- ⬜ Unlockable reveal animation (contained, not full-screen interrupt)
- ⬜ Companion dinosaur reacts to events (idle → celebrate → encourage)
- ⬜ No streak-penalty UI anywhere — only positive feedback

---

## Phase 7 — Voice Integration

> **Exit criterion:** Child can speak and receive voice responses via OpenAI Realtime API, proxied through Mirror Core.

### 7.1 Realtime API Proxy
- ⬜ Mirror Core WebSocket relay: `ws://local/voice` ↔ OpenAI Realtime API
- ⬜ System prompt injected at connection: child-safe, task-aligned, short-response rules
- ⬜ Tool/function definitions: only allowed intents (start session, request hint, mode switch, skip)
- ⬜ Policy check before executing any tool call returned by Realtime API
- ⬜ Backend intercepts all responses before forwarding to child (content safety check)

### 7.2 Voice Guard Rails
- ⬜ Realtime API enforces word ceiling per response in system prompt
- ⬜ Any scope-change request via voice → policy check → denial → `safe_alternatives[]`
- ⬜ Voice is never the sole mechanism for approval; approval always requires portal login

### 7.3 Read-Aloud (Story Engine)
- ⬜ Story pages use Realtime API TTS for narration where SSML is provided
- ⬜ Fallback: browser TTS (`speechSynthesis`) if Realtime API unavailable

---

## Phase 8 — Ambient Display (Mirror/Idle Mode)

> **Exit criterion:** With no active session, the display shows ambient mode; wake-on-voice works.

### 8.1 Idle (Mirror) Mode
- ⬜ When no session is active, display enters ambient mode (clock, gentle animation, companion idle)
- ⬜ Tauri shell configured for always-on display (no screen saver, kiosk mode option)

### 8.2 Wake-on-Voice
- ⬜ Always-listening wake word or button → starts new session in Talk mode
- ⬜ Wakeup time targets: wake → first response < 2 seconds

---

## Phase 9 — Android Build

> **Exit criterion:** Child app runs on Android device, connects to Mirror Core over LAN.

- ⬜ Android WebView wrapper (Capacitor or raw WebView)
- ⬜ LAN autodiscovery or manual Mirror Core IP configuration
- ⬜ Touch input verified (no hover-only interactions)
- ⬜ Controller input mapper tested on Android gamepad

---

## Phase 10 — Polish, Analytics & Launch Prep

> **Exit criterion:** All acceptance criteria in ACCEPTANCE_CRITERIA_MATRIX.md checked; metrics dashboard readable.

### 10.1 Analytics Dashboard (Parent Portal)
- ⬜ Session completion rate chart
- ⬜ Time-on-task per skill per child
- ⬜ Mastery progression per `skill_id`
- ⬜ Hint usage breakdown (which rungs most common)
- ⬜ Mode preference breakdown (Talk vs Practice vs Play)
- ⬜ Parent approval frequency + reasons

### 10.2 Acceptance Criteria Sweep
- ⬜ Run through every item in `docs/ACCEPTANCE_CRITERIA_MATRIX.md`
- ⬜ All Vitest golden tests passing (hint-ladder + triad bundle)
- ⬜ All telemetry events verified firing with correct payloads

### 10.3 Performance Targets
- ⬜ Interaction → feedback latency: < 100ms (localhost), < 200ms (LAN)
- ⬜ Wake-word → first voice response: < 2 seconds
- ⬜ Session start (including bundle creation): < 500ms

### 10.4 Security Review (Design Checklist)
- ⬜ Parent Mode Lock: verify short timeout enforced, no bypass paths
- ⬜ Child token: verify 403 on all admin endpoints
- ⬜ Admin JWT: verify 401 on expiry, server-side only
- ⬜ No client-side-only guards anywhere

---

## Deferred (Post-v1)

| Item | Notes |
|---|---|
| Full transcript view in parent portal | Optional later opt-in |
| Talk plan schema (full) | Stub string ref used in v1 bundles |
| Offline fallback (Phi-3-mini or similar) | Cloud-only for MVP |
| Multi-world navigation UI | Worlds in data model; picker UI deferred |
| Complex group/class mode | Not in roadmap yet |
| Bank-grade biometric security | Voice fingerprinting is hint only |
| Android hosting Mirror Core locally | Desktop-hosted only for MVP |

---

## Document Changelog

| Date | Version | Change |
|---|---|---|
| 2026-02-26 | v1.0 | Created. Aligned to PRD v2.1, Architecture v1.1, Design Checklist v0.2. |
