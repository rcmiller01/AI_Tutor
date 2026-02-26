# Architecture Spec: Magic Mirror Tutor + Locked Learning Games (v1)

## 0) Scope and Invariants

This spec defines the **runtime architecture** for a web-based, cross-platform system (Desktop Linux/Windows + Android) that delivers learning via **three deterministic engines**, with **cloud-only AI** for content generation and voice conversation, and a **local PostgreSQL + pgvector** database as the system of record for content + analytics.

### Hard Invariants (must not regress)

- **Deterministic engine runtime** controls correctness, scoring, hint limits, and session state.
- LLM is **never** the runtime brain; it only generates bounded content objects.
- **All policy changes** happen in the **Parent Portal** (admin login).
- Analytics are **local-only**, stored in DB; Parent Portal reads from DB.
- Day 1: **single child profile**.

---

## 1) High-Level Topology

### 1.1 Components

#### A) Child Client App (Web UI + device shell)

- Runs on: Desktop (Electron/Tauri wrapper or browser kiosk) + Android (WebView wrapper).
- Responsibilities:
  - UI rendering for engines (touch/controller)
  - Voice capture + wake UX (if used)
  - Session orchestration with Engine Runtime API
  - Local notifications for "approval pending/denied/approved"

#### B) Parent Portal (Web UI)

- Runs on: Desktop or phone browser.
- Responsibilities:
  - Admin login
  - Approve/deny requests (Parent Approval Cards)
  - Manage policies (time limits, allowed scopes)
  - View analytics dashboards (reads from local DB via API)

#### C) Local Backend Service ("Mirror Core")

- Runs on: the primary device (desktop/laptop) hosting Postgres.
- Exposes HTTP/WebSocket API to both Child App and Parent Portal.
- Responsibilities:
  - Deterministic Engine Runtime orchestration
  - Policy engine enforcement + approvals workflow
  - Content storage + retrieval (pgvector)
  - Audit logs + analytics events
  - Cloud AI gateway (calls to STT/LLM/TTS or realtime voice API)
  - Authentication/session tokens

#### D) Local DB: PostgreSQL + pgvector

- System of record for:
  - Skill specs
  - Content instances
  - Session telemetry + aggregates
  - Policies + approvals + audit logs
  - Vector embeddings for retrieval

#### E) Cloud AI Providers

- Cloud-only for MVP.
- Used for:
  - Speech to text (if not realtime end-to-end)
  - LLM content generation (bounded JSON outputs)
  - TTS (if not realtime)
  - Optional realtime "speech-in/speech-out" conversation path

---

## 2) Runtime Data Flow (the "Deterministic Spine")

### 2.1 Learning/game session loop

1. Child selects/requests activity (or voice command triggers intent).
2. Backend **Policy Engine** checks:
   - Time budget remaining
   - Scope allowed (skill/topic/grade band)
   - Mode allowed (learning vs games)
3. If allowed:
   - Backend starts a **Session** bound to a `skill_id` and `engine_type`.
   - Backend loads the **Skill Spec** + current mastery state.
4. Engine Runtime:
   - Chooses next item using **templates + generator rules**
   - May request **LLM-generated content** *only* through constrained "Content Generation Jobs"
   - Validates content against schema + rule checks
5. Child interacts:
   - Sends `InteractionEvent` (tap/drag/type etc.)
   - Engine Runtime scores deterministically and returns:
     - Correct/incorrect
     - Allowed hint (if any)
     - Updated streak/progress
     - Mastery gate status
6. Backend logs telemetry to DB; UI updates immediately.
7. Mastery gate triggers:
   - Progress to next difficulty step, or
   - Mark skill mastered, or
   - Schedule remediation branch (still deterministic).

### 2.2 Out-of-scope request (Parent Approval Card)

1. Child requests something outside policy or current scope.
2. Backend creates `ApprovalRequest` record + notifies Parent Portal.
3. Parent logs in and approves/denies.
4. If approved:
   - Backend creates a **new Session** with approved `skill_id`/scope
   - Child receives notification and can start the new session
5. If denied:
   - Child receives friendly denial + suggested allowed alternatives.

---

## 3) Deterministic Engine Runtime

### 3.1 Engine types (locked)

- `MICRO_SKILL_DRILL`
- `MATCH_SORT_CLASSIFY`
- `STORY_MICROTASKS`

### 3.2 Engine Runtime responsibilities

The runtime must be able to operate with **no LLM** (given stored content) and must never depend on LLM output for correctness.

**Deterministic responsibilities:**

- State machine for each engine type
- Allowed interactions and UI widget requirements
- Answer-key evaluation
- Misconception mapping and hint policy
- Mastery computation
- Item scheduling and difficulty ladder progression
- Time boxing and streak logic
- Telemetry emission (fine-grained events)

### 3.3 Engine plugin contract

Engines are implemented as modules that conform to this interface:

| Method | Signature |
|---|---|
| `engine_type` | `enum` |
| `init` | `(session_ctx) -> engine_state` |
| `next_prompt` | `(engine_state) -> PromptPayload` |
| `score_interaction` | `(engine_state, InteractionEvent) -> ScoreResult` |
| `maybe_generate_content` | `(engine_state) -> ContentGenJob?` |
| `apply_generated_content` | `(engine_state, ContentObject) -> engine_state` |
| `is_mastered` | `(engine_state) -> MasteryResult` |
| `render_hints` | `(score_result, skill_spec) -> HintPayload` |

---

## 4) Skill Specs + Content Objects (Schemas)

### 4.1 Skill Spec (authoritative rails)

A `skill_spec` defines what can happen for a skill.

| Field | Description |
|---|---|
| `skill_id` | String, unique, stable |
| `grade_band` | e.g., K, 1, 2 |
| `objective` | 1 sentence |
| `allowed_engine_types` | Subset of 3 engine types |
| `allowed_interactions` | tap / drag / type |
| `templates` | tap_choice, drag_bins, type_in_blank, match_pairs, story_page, comprehension_q |
| `item_generator_rules` | Constraints: phonics patterns, allowed vocab, disallowed graphemes |
| `answer_key_logic` | Deterministic method + tolerance |
| `misconceptions[]` | wrong→hint mapping |
| `mastery_threshold` | Accuracy / streak / time |
| `hint_policy` | Max hints per item, allowed styles |
| `scope_tags` | Topic tags for policy: reading/phonics/sightwords/etc. |

### 4.2 Content Objects (generated or curated)

Content is stored as immutable "instances" that engines can use.

**Common metadata:**

| Field | Description |
|---|---|
| `content_id` | UUID |
| `skill_id` | FK to skill spec |
| `engine_type` | Engine that uses this content |
| `template_id` | Template type |
| `version` | Content version |
| `source` | `CURATED` \| `LLM_GENERATED` \| `MIXED` |
| `created_at` | Timestamp |
| `constraints_hash` | Hash of relevant generator constraints |
| `embedding` | pgvector for retrieval |

**Template-specific payload examples:**

| Template | Fields |
|---|---|
| `TapChoiceItem` | prompt text, choices[], correct_choice_id |
| `DragBinsSet` | bins[], items[], correct_bin_map |
| `MatchPairsSet` | pairs[] |
| `StoryPage` | page_text, read_aloud_ssml, word_spans[], allowed_vocab_ids |
| `ComprehensionQ` | question, choices, correct, rationale (optional for parent mode) |

### 4.3 Content Generation Jobs (LLM requests)

LLM interactions are mediated via a job queue to enforce rails.

| Field | Description |
|---|---|
| `job_id` | UUID |
| `requested_by` | Engine / session |
| `skill_id` | Target skill |
| `template_id` | Target template |
| `constraints` | Explicit JSON constraints |
| `output_schema_id` | Server-known JSON schema |
| `status` | `PENDING` / `RUNNING` / `SUCCEEDED` / `FAILED` / `REJECTED` |
| `provider` + `model` | AI provider details |
| `result_content_id` | FK to stored content (if succeeded) |
| `validation_report` | Rule violations, if any |

**Validation rules:**

- JSON schema must validate
- Hard constraints must pass (vocab allowlist, reading-level heuristics, phonics pattern, length bounds)
- No disallowed topics (policy-based content safety)
- If validation fails: reject and either regenerate with tighter prompt or fall back to curated content

---

## 5) Policy Engine + Approvals

### 5.1 Policy model

Policies live in DB and apply to the **child profile**.

**Policy types (Day 1):**

- `DAILY_GAME_TIME_LIMIT_MINUTES`
- `ALLOWED_ENGINE_TYPES` (maybe "games only on weekends" later)
- `ALLOWED_SCOPE_TAGS` (e.g., reading only)
- `QUIET_HOURS` (optional later)
- `REQUIRES_APPROVAL_FOR_SCOPE_CHANGE` (default true)

### 5.2 Policy enforcement points

Enforce at:

- Session creation
- Switching `skill_id` within a session (generally disallowed; requires approval)
- Time budget consumption (every minute tick or per interaction)
- Game-mode entry
- Content generation requests (ensure requested scope allowed)

### 5.3 Parent Approval Card workflow

**States:**

```
REQUESTED → NOTIFIED → APPROVED | DENIED
                           │          │
                       FULFILLED   (end)
                    (optional) EXPIRED
```

**Approval constraints:**

- Approvals are only actioned through Parent Portal with admin session.
- Approvals produce an auditable record: who, when, what scope, and why (optional note).

---

## 6) Identity, Authentication & Authorization

### 6.1 Parent Portal authentication

- Admin account created at setup.
- Auth method: username/email + password (hashed) + optional passkey later.
- Issues:
  - `admin_access_token` (short lived)
  - `admin_refresh_token` (longer lived)

### 6.2 Child device session

- Child App runs with a device-bound token: `device_session_token`.
- Child cannot call admin endpoints.

### 6.3 Local speaker recognition (optional signal)

- Stored locally:
  - Speaker embeddings per enrolled user (parent, later child)
- Used only as:
  - UI hint ("Recognized: Parent?")
  - Optional convenience step for approvals (but approvals still require portal login)
  - Future multi-child auto-selection (not Day 1)

---

## 7) Backend API Surface (Mirror Core)

### 7.1 Public endpoints (Child App)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/sessions/start` | Start session — body: `{ mode, requested_skill_id?, requested_scope_tag?, engine_type? }` → returns `session_id` + initial `PromptPayload` |
| `POST` | `/api/sessions/{id}/interact` | Submit interaction — body: `InteractionEvent` → returns `ScoreResult` + next `PromptPayload` (or mastery result) |
| `POST` | `/api/sessions/{id}/hint` | Request hint → returns `HintPayload` (if allowed by policy) |
| `GET` | `/api/sessions/{id}` | Get current session state snapshot (for resume) |
| `POST` | `/api/voice/intent` | Submit transcript → returns routed intent + action suggestion (backend decides) |
| `GET` | `/api/policies/summary` | Child-visible limits (e.g., minutes left) |

### 7.2 Parent Portal endpoints (Admin)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/admin/login` | Admin authentication |
| `GET` | `/api/admin/dashboard/overview` | Dashboard summary |
| `GET` | `/api/admin/approvals` | List approval cards |
| `POST` | `/api/admin/approvals/{id}/approve` | Approve request |
| `POST` | `/api/admin/approvals/{id}/deny` | Deny request |
| `GET` | `/api/admin/policies` | Get current policies |
| `PUT` | `/api/admin/policies` | Update policies |
| `GET` | `/api/admin/skills` | List skill specs |
| `POST` | `/api/admin/skills` | Create/import skill spec |
| `GET` | `/api/admin/analytics/*` | Read local DB aggregates |

### 7.3 Real-time notifications

- **WebSocket:** `/ws/updates`
  - Child receives: approval approved/denied, time remaining warnings
  - Parent receives: new approval requests, session flags ("stuck skill")

---

## 8) Voice Architecture (cloud-only, with guardrails)

### 8.1 Two supported modes (choose per device capability)

**Mode A: Realtime speech-in/speech-out**

- Child App streams audio to cloud realtime API
- Backend mediates session config + tool calls
- Backend still enforces:
  - Allowed intents
  - Policy checks
  - "Content generation only" constraints

**Mode B: Modular pipeline**

- Wake UX (client-side button or lightweight wake detector)
- Audio → cloud STT
- Transcript → backend intent router (LLM-assisted but deterministic allow/deny)
- Backend responds with:
  - Engine prompt changes, or
  - TTS request (cloud TTS) + UI payload

### 8.2 Voice guardrails

- Voice can request actions, but backend decides allowed actions.
- Any scope change request becomes Approval Card.
- Voice responses in child mode are:
  - Short
  - Aligned with active task
  - Never "open tutoring lecture mode"

---

## 9) Storage Design (Postgres + pgvector)

### 9.1 Core tables

| Table | Purpose |
|---|---|
| `users_admin` | Admin auth |
| `devices` | Child client devices |
| `child_profile` | Single row Day 1 |
| `policies` | Parent-set rules |
| `skill_specs` | Skill definitions |
| `content_objects` | Immutable content instances |
| `content_embeddings` | pgvector embeddings (or vector column in content_objects) |
| `sessions` | Session records |
| `session_events` | Append-only telemetry |
| `approvals` | Approval card records |
| `audit_log` | Admin action audit trail |

### 9.2 Vector retrieval (pgvector)

Use embeddings to retrieve:

- Similar content objects for a given `skill_id` and template
- "Similar request" content expansion (child asks for "more like this")

**Flow:**

1. Query pgvector by embedding similarity + filters (`skill_id`, template, grade band)
2. Select top-k candidates
3. Either reuse directly or pass into **bounded LLM job** to create a modified variant
4. Store as new `content_id` + embedding

---

## 10) Determinism and Validation Strategy

### 10.1 Golden rules

- Engines operate deterministically from:
  - `skill_spec`
  - Current `engine_state`
  - `interaction_event`
  - `content_object`
- No hidden randomness in scoring.
- Randomness in content selection is allowed only if:
  - Seeded per session for reproducibility, and
  - Selection never affects correctness logic.

### 10.2 Content validation pipeline

Before storing any LLM output:

1. JSON schema validation
2. Constraint checks (vocab allowlist, length limits, reading-level heuristic bounds)
3. Profanity/safety filter (local or provider)
4. If rejected: retry with tighter prompt or fallback to curated content set

---

## 11) UI Architecture (web-based, cross-platform)

### 11.1 Shared component library (maps to engines)

| Category | Components |
|---|---|
| **Interaction widgets** | `TapChoice`, `TypeInBlank`, `DragBins`, `MatchPairs` |
| **Reading widgets** | `ReadAloudPage`, `WordTapPopup` |
| **Progress widgets** | `StreakMeter`, `MasteryGate` |
| **System widgets** | `ParentApprovalCard` (child-visible "pending" banner only), `TimerLimitBanner`, `RoleBadge`, `MicStateIndicator` |
| **Input layer** | Controller input mapper (buttons → focus/selection/drag shortcuts) |

### 11.2 Rendering contract

Backend sends `PromptPayload` describing:

- Template ID
- UI widget type
- Content payload
- Allowed interactions

**Client renders accordingly; client never decides correctness.**

---

## 12) Deployment Model

### 12.1 Desktop

- Run Postgres locally (service or container).
- Run Mirror Core backend locally (service/container).
- Child App: Electron/Tauri wrapper OR browser kiosk pointing at local backend.
- Parent Portal: same backend, different route (e.g., `/admin`).

### 12.2 Android

- Android app is a WebView wrapper for Child UI.
- Connects to Mirror Core over LAN (same home network) **or** the phone can host Mirror Core later (not Day 1).
- Parent Portal can be accessed from phone browser to Mirror Core host.

---

## 13) Threat Model (Kid-Proofing Basics)

### Threats

| Threat | Description |
|---|---|
| Voice override | Child tries "I'm the parent" by voice |
| Admin access | Child attempts to access admin endpoints |
| Local tampering | Child tries to modify local app storage |
| Replay attack | Recorded parent voice (future concern) |

### Mitigations (Day 1)

- Admin endpoints require login session token.
- Child App holds only a device token with limited scope.
- All policy edits only in Parent Portal.
- Sensitive actions require portal approval, not voice.
- Audit log of policy changes.

---

## 14) Testing Strategy

### 14.1 Deterministic engine tests

- Golden `skill_specs` + golden `content_objects`
- For each template:
  - Known interactions → expected `ScoreResult`
  - Misconception mapping → expected hint outputs
  - Mastery threshold checks

### 14.2 Content validation tests

- LLM output fuzz tests (invalid schema, disallowed vocab, wrong length)
- Ensure rejection + fallback behavior works

### 14.3 End-to-end flows

- Start session → interact → mastery → session end
- Out-of-scope request → approval card → approve → new session created
- Game time budget decrements → lockout once exhausted

### 14.4 Performance checks

- Interaction latency (client → backend → client) must feel instant
- Voice loop latency targets measured separately (provider-dependent)

---

## 15) File Layout (Repo)

```
/apps/child-ui/                  # Child-facing web app
/apps/parent-portal/             # Parent portal web app
/services/mirror-core/           # Backend service
/packages/ui-components/         # Shared UI widgets
/packages/engine-runtime/        # Deterministic engines
/packages/schemas/               # JSON schemas + validators
/infra/db/                       # Migrations, pgvector setup
/content/skill-specs/            # Seed skill specs for import
```

---

## 16) Next Artifacts (Implementation-Ready)

1. **JSON Schemas** for: SkillSpec, ContentObject (per template), InteractionEvent, ScoreResult, ApprovalRequest
2. **OpenAPI spec** for backend endpoints
3. **Engine Runtime state machines** (one per engine type)
4. **DB migrations** (tables + pgvector indexes)
5. **Prompt contracts** for LLM content jobs (strict JSON output)
