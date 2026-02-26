# API Specification: Mirror Core

> All endpoints are served by Mirror Core on `http://localhost:{PORT}`.
> Child endpoints use device session token. Admin endpoints use JWT bearer token.

---

## Authentication

### Admin Auth

```
POST /api/admin/login
```

| Field | Type | Required |
|---|---|---|
| `username` | string | ✅ |
| `password` | string | ✅ |

**Response 200:**
```json
{ "token": "jwt...", "expires_at": "2026-03-01T..." }
```

**Auth header for admin endpoints:** `Authorization: Bearer {jwt}`

### Device Auth

Child devices use a pre-provisioned session token (created by parent in portal).

**Auth header for child endpoints:** `X-Device-Token: {session_token}`

---

## Child Endpoints (Public)

### Sessions

```
POST /api/sessions
```
Create a new session. AI-assisted selection: child requests a game/skill, engine validates against policies.

| Field | Type | Required | Notes |
|---|---|---|---|
| `skill_id` | string | ✅ | Requested skill |
| `engine_type` | enum | ✅ | MICRO_SKILL_DRILL, MATCH_SORT_CLASSIFY, STORY_MICROTASKS |
| `mode` | enum | ✅ | "learning" or "game" |

**Response 201:** [Session object](file:///c:/Users/rober/Documents/AI_Tutor/docs/schemas/session.schema.json)

**Errors:**
- `403` — Policy violation (time exceeded, scope blocked)
- `409` — Active session already exists

---

```
GET /api/sessions/active
```
Get the currently active session (if any).

**Response 200:** Session object or `null`

---

```
GET /api/sessions/{id}
```
Get session state snapshot.

**Response 200:** Session object

---

```
POST /api/sessions/{id}/pause
```
Pause a session. Saves engine state for resume.

**Response 200:** `{ "status": "paused", "paused_at": "..." }`

---

```
POST /api/sessions/{id}/resume
```
Resume a paused session.

**Response 200:** Session object (status = "active")

---

```
POST /api/sessions/{id}/end
```
End a session (completed or abandoned).

| Field | Type | Required |
|---|---|---|
| `reason` | enum | ✅ | "completed", "abandoned", "timed_out" |

**Response 200:** Session object (final stats)

---

### Engine Interaction

```
POST /api/sessions/{id}/next
```
Request the next prompt from the engine.

**Response 200:** [PromptPayload](file:///c:/Users/rober/Documents/AI_Tutor/docs/schemas/prompt-payload.schema.json)

---

```
POST /api/sessions/{id}/interact
```
Submit a child interaction.

**Request body:** [InteractionEvent](file:///c:/Users/rober/Documents/AI_Tutor/docs/schemas/interaction-event.schema.json) (minus `event_id`, `session_id` — server assigns)

**Response 200:** [ScoreResult](file:///c:/Users/rober/Documents/AI_Tutor/docs/schemas/score-result.schema.json)

---

```
POST /api/sessions/{id}/hint
```
Request a hint for the current item.

**Response 200:**
```json
{ "hint_text": "...", "hint_style": "highlight", "hints_remaining": 1 }
```

**Errors:** `400` — No hints remaining

---

### Voice

```
WebSocket /ws/voice
```
Real-time voice connection. Mirror Core relays to/from OpenAI Realtime API.

**Client → Server:**
- `{ "type": "audio_chunk", "data": "<base64>" }`
- `{ "type": "end_turn" }`

**Server → Client:**
- `{ "type": "audio_chunk", "data": "<base64>" }`
- `{ "type": "transcript", "text": "...", "is_final": true }`
- `{ "type": "function_call", "name": "select_game", "args": {...} }`
- `{ "type": "error", "message": "..." }`

---

```
POST /api/voice/intent
```
Submit a text transcript for intent routing (fallback for non-voice interaction).

| Field | Type | Required |
|---|---|---|
| `transcript` | string | ✅ |

**Response 200:**
```json
{
  "intent": "select_game",
  "confidence": 0.95,
  "action": { "skill_id": "cvc-blending", "engine_type": "MICRO_SKILL_DRILL" },
  "requires_approval": false
}
```

---

### Policy & Rewards

```
GET /api/policies/summary
```
Get child-visible policy summary.

**Response 200:**
```json
{
  "learning_minutes_remaining": 25,
  "game_minutes_remaining": 10,
  "allowed_skills": ["cvc-blending", "sight-words-k"],
  "is_quiet_hours": false
}
```

---

```
GET /api/rewards/stars
```
Get current Star balance and recent transactions.

**Response 200:**
```json
{
  "balance": 145,
  "recent": [
    { "entry_id": "...", "amount": 5, "reason": "streak_bonus", "created_at": "..." }
  ]
}
```

---

```
GET /api/rewards/unlockables
```
Get all unlockable items with unlock status.

**Response 200:**
```json
{
  "unlockables": [
    { "unlockable_id": "...", "name": "Space Theme", "category": "theme", "cost_stars": 50, "is_unlocked": false }
  ],
  "equipped": { "theme": "...", "character": "..." }
}
```

---

```
POST /api/rewards/unlockables/{id}/purchase
```
Purchase an unlockable with Stars.

**Response 200:** Updated unlockable (is_unlocked = true)
**Errors:** `400` — Insufficient Stars, `409` — Already unlocked

---

## Admin Endpoints

All require `Authorization: Bearer {jwt}`.

### Auth

```
POST /api/admin/login
```
(Documented above)

```
POST /api/admin/logout
```
Invalidate token.

---

### Approvals

```
GET /api/admin/approvals
```
List pending approvals.

**Query params:** `status=requested` (default), `status=all`

**Response 200:** Array of [ApprovalRequest](file:///c:/Users/rober/Documents/AI_Tutor/docs/schemas/approval-request.schema.json)

---

```
POST /api/admin/approvals/{id}/resolve
```
Approve or deny a request.

| Field | Type | Required |
|---|---|---|
| `decision` | enum | ✅ | "approved" or "denied" |
| `parent_note` | string | | Optional message to child |

**Response 200:** Updated ApprovalRequest

---

### Policies

```
GET /api/admin/policies
```
Get all policies for child.

**Response 200:** Array of [Policy](file:///c:/Users/rober/Documents/AI_Tutor/docs/schemas/policy.schema.json)

---

```
PUT /api/admin/policies
```
Update one or more policies.

**Request body:** Array of `{ policy_type, value }`

**Response 200:** Updated policies

---

### Curriculum

```
GET /api/admin/curriculum
```
Get curriculum goals.

**Response 200:** Array of CurriculumGoal objects

---

```
PUT /api/admin/curriculum
```
Set/update curriculum goals.

**Request body:** Array of CurriculumGoal objects (goal_id optional for new goals)

**Response 200:** Updated goals

---

### Skills

```
GET /api/admin/skills
```
List all skill specs.

**Response 200:** Array of `{ skill_id, grade_band, objective, version }`

---

```
POST /api/admin/skills
```
Create or import a skill spec.

**Request body:** Full SkillSpec JSON

**Response 201:** Created skill spec

---

### Rewards (Admin)

```
GET /api/admin/rewards
```
Get Star reward definitions.

**Response 200:** Array of StarReward objects

---

```
POST /api/admin/rewards
```
Create a new Star reward.

| Field | Type | Required |
|---|---|---|
| `name` | string | ✅ |
| `cost_stars` | integer | ✅ |
| `description` | string | |
| `repeatable` | boolean | | default: true |

**Response 201:** Created StarReward

---

```
POST /api/admin/rewards/{id}/redeem
```
Mark a reward as redeemed by parent.

**Response 200:** Updated StarReward + stars deducted from child balance

---

### Analytics

```
GET /api/admin/analytics/sessions
```
Session history with filtering.

**Query params:** `from`, `to`, `skill_id`, `limit`

---

```
GET /api/admin/analytics/progress
```
Skill mastery progress.

**Response 200:** Per-skill accuracy, difficulty level, mastery status

---

```
GET /api/admin/analytics/stars
```
Star transaction history.

---

## WebSocket: Real-Time Notifications

```
WebSocket /ws/updates
```

**Child receives:**
- `{ "type": "approval_resolved", "approval_id": "...", "status": "approved" }`
- `{ "type": "time_warning", "minutes_remaining": 5 }`
- `{ "type": "time_expired", "mode": "game" }`
- `{ "type": "reward_created", "reward": {...} }`

**Parent receives:**
- `{ "type": "approval_requested", "approval": {...} }`
- `{ "type": "session_flag", "flag": "stuck_on_skill", "skill_id": "..." }`
- `{ "type": "milestone_reached", "milestone": "50_stars" }`

---

## Error Response Format

All errors follow:

```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Daily game time limit exceeded",
    "details": { "limit_minutes": 30, "used_minutes": 30 }
  }
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `POLICY_VIOLATION` | 403 | Action blocked by parent policy |
| `SESSION_EXISTS` | 409 | Active session already running |
| `NOT_FOUND` | 404 | Resource not found |
| `INVALID_INPUT` | 400 | Request validation failed |
| `AUTH_REQUIRED` | 401 | Missing or invalid auth |
| `AUTH_FORBIDDEN` | 403 | Insufficient role |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL` | 500 | Server error |
