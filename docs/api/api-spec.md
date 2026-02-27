# API Specification: Mirror Core
> **Version:** v1.1 — aligned with PRD v2.1 / Architecture v1.1 / IMPLEMENTATION_PLAN.md §0.5
> All endpoints are served by Mirror Core on `http://localhost:{PORT}` (default `3000`).

---

## Authentication Model

Two independent token types co-exist. The server enforces both at the middleware layer.

| Token type | Header | Audience | TTL | Issued by |
|---|---|---|---|---|
| **Parent JWT** (`admin_access_token`) | `Authorization: Bearer {jwt}` | All `/api/admin/*` routes | 15 min | `POST /api/admin/login` |
| **Child JWT** (`child_session_token`) | `X-Child-Token: {jwt}` | All `/api/*` non-admin routes | 4 hr | `POST /api/children/select` |

- Parent JWT is **blocked** on all non-admin routes (`403`).
- Child JWT is **blocked** on all `/api/admin/*` routes (`403`).
- Both tokens are JWTs signed server-side. The child token contains `{ child_id, household_id }` claims.
- Admin JWT refresh: `POST /api/admin/refresh` issues a new 15-min token via long-lived refresh cookie.
- **No bypass paths.** Parent portal entry always triggers a login challenge.

---

## Common Response Formats

### Success envelope
Endpoints return the resource directly, **not** wrapped. HTTP status conveys success.

### Error envelope
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
| `POLICY_DENIAL` | 200 | Soft denial — returns `DenialResponse` with `safe_alternatives[]` |
| `SESSION_EXISTS` | 409 | Active session already running |
| `NOT_FOUND` | 404 | Resource not found |
| `INVALID_INPUT` | 400 | Request validation failed (includes field errors) |
| `NO_HINTS_REMAINING` | 400 | Hint cap reached for this item |
| `AUTH_REQUIRED` | 401 | Missing or expired token |
| `AUTH_FORBIDDEN` | 403 | Role insufficient (child token on admin route, or vice versa) |
| `INTERNAL` | 500 | Server error |

---

## Parent Auth Endpoints

### `POST /api/admin/register`
Create a parent account. Only callable without auth (open registration in MVP).

**Request:**
```json
{ "email": "parent@example.com", "password": "..." }
```

**Response 201:**
```json
{ "parent_id": "uuid", "email": "parent@example.com", "household_id": "uuid", "created_at": "..." }
```

**Telemetry emitted:** `auth.parent_registered`

---

### `POST /api/admin/login`
Authenticate parent; issue tokens.

**Request:**
```json
{ "email": "parent@example.com", "password": "..." }
```

**Response 200:**
```json
{
  "admin_access_token": "jwt...",
  "token_type": "Bearer",
  "expires_in": 900,
  "expires_at": "2026-03-01T12:15:00Z",
  "household_id": "uuid"
}
```
Sets `admin_refresh_token` as `HttpOnly; SameSite=Strict` cookie.

**Errors:** `401` — Invalid credentials
**Telemetry emitted:** `auth.login_success` or `auth.login_failed`

---

### `POST /api/admin/logout`
Invalidate refresh token. Clears refresh cookie.

**Auth:** Bearer token required.
**Response 204:** No content.

---

### `POST /api/admin/refresh`
Issue a new access token via refresh cookie.

**Auth:** Refresh cookie (no Bearer needed).
**Response 200:** Same shape as `/api/admin/login` response (new `admin_access_token`).

**Errors:** `401` — Refresh token invalid/expired
**Telemetry emitted:** `auth.parent_session_started`

---

## Child Profile Endpoints

### `GET /api/admin/children`
List child profiles in this household.

**Auth:** Parent JWT.
**Response 200:**
```json
{
  "children": [
    {
      "child_id": "uuid",
      "display_name": "Mia",
      "avatar_id": "dino_blue",
      "preferred_mode": "practice",
      "accessibility_skip_hints": false,
      "stars_balance": 42,
      "created_at": "..."
    }
  ]
}
```

---

### `POST /api/admin/children`
Create a child profile.

**Auth:** Parent JWT.

**Request:**
```json
{ "display_name": "Mia", "avatar_id": "dino_blue" }
```

**Response 201:**
```json
{ "child_id": "uuid", "display_name": "Mia", "avatar_id": "dino_blue", "household_id": "uuid", "preferred_mode": null, "accessibility_skip_hints": false, "stars_balance": 0, "created_at": "..." }
```

---

### `PUT /api/admin/children/{child_id}`
Update display name, avatar, or accessibility settings.

**Auth:** Parent JWT.

**Request (all fields optional):**
```json
{ "display_name": "Mia B.", "avatar_id": "dino_red", "accessibility_skip_hints": true }
```

**Response 200:** Updated child object.

---

### `GET /api/children`
List child profiles for avatar picker (child-facing, no auth — household inferred from device network).

**Auth:** None (open; returns minimal fields only).
**Response 200:**
```json
{ "children": [{ "child_id": "uuid", "display_name": "Mia", "avatar_id": "dino_blue" }] }
```

---

### `POST /api/children/select`
Child selects their profile by avatar. Issues a child session token.

**Auth:** None.

**Request:**
```json
{ "child_id": "uuid" }
```

**Response 200:**
```json
{ "child_session_token": "jwt...", "child_id": "uuid", "household_id": "uuid", "expires_in": 14400 }
```

**Telemetry emitted:** `child.profile_selected`, `child.session_started`

---

## Session Lifecycle Endpoints

### `POST /api/sessions/start`
Start a new session and create a `LearningBundle`. The bundle is constructed with zero LLM calls.

**Auth:** Child JWT.

**Request:**
```json
{
  "skill_id": "cvc-blending",
  "mode": "talk",
  "world_id": "phonics"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `skill_id` | string | ✅ | Must be in household's enabled worlds |
| `mode` | `"talk" \| "practice" \| "play"` | ✅ | Initial TriadMode; default `"talk"` |
| `world_id` | string | | If omitted, inferred from skill's `scope_tags` |

**Response 201:**
```json
{
  "session_id": "uuid",
  "bundle_id": "uuid",
  "current_mode": "talk",
  "bundle": {
    "bundle_id": "uuid",
    "skill_id": "cvc-blending",
    "world_id": "phonics",
    "talk_plan_id": "talk-plan-cvc-001",
    "practice_set_ids": ["cvc-tap-001", "cvc-tap-002"],
    "play_config": { "engine_type": "MICRO_SKILL_DRILL", "template_id": "tap_choice", "params": { "item_count": 5, "difficulty_level": 1 } },
    "constraints_hash": "sha256...",
    "created_at": "..."
  },
  "initial_prompt": { "...PromptPayload..." },
  "triad_offer_text": "Want to talk, practice, or play CVC Blending?"
}
```

**Soft denial (policy violation):** `200` with `DenialResponse`:
```json
{
  "denied": true,
  "denial_reason_code": "WORLD_NOT_ENABLED",
  "safe_alternatives": [
    { "skill_id": "sight-words-k", "world_id": "reading", "display_label": "Sight Words" },
    { "skill_id": "rhyming-words", "world_id": "reading", "display_label": "Rhyming" }
  ],
  "approval_id": "uuid"
}
```

**Hard errors:** `409` — Active session exists, `400` — Invalid skill_id
**Telemetry emitted:** `bundle.created`, `session.mode_offered`, `session.mode_selected`
**On denial:** `policy.request_denied`, `policy.safe_alternatives_generated`, `approval.request_created`

---

### `GET /api/sessions/{id}`
Get full session state (for resume).

**Auth:** Child JWT. Child may only access their own sessions.

**Response 200:**
```json
{
  "session_id": "uuid",
  "child_id": "uuid",
  "skill_id": "cvc-blending",
  "current_mode": "practice",
  "bundle_id": "uuid",
  "status": "active",
  "engine_state": { "...opaque engine state..." },
  "started_at": "...",
  "stats": { "items_attempted": 4, "items_correct": 3, "accuracy": 0.75, "hints_used": 1, "stars_earned": 3, "mastery_achieved": false }
}
```

---

### `GET /api/sessions/{id}/bundle`
Return the current `LearningBundle` for a session.

**Auth:** Child JWT.

**Response 200:** Full `LearningBundle` object (same shape as inside `POST /api/sessions/start` response).

---

### `POST /api/sessions/{id}/switch-mode`
Switch TriadMode within an active session. **Does not** create a new bundle.

**Auth:** Child JWT.

**Request:**
```json
{ "mode": "practice" }
```

**Response 200:**
```json
{
  "session_id": "uuid",
  "bundle_id": "uuid",
  "previous_mode": "talk",
  "current_mode": "practice",
  "next_prompt": { "...PromptPayload..." }
}
```

**Errors:** `400` — Invalid mode, `404` — Session not found
**Telemetry emitted:** `session.mode_switched` (includes `bundle_id`, `from_mode`, `to_mode`)

---

### `POST /api/sessions/{id}/interact`
Submit a child interaction for scoring. Engine scores and updates state server-side.

**Auth:** Child JWT.

**Request:**
```json
{
  "content_id": "cvc-tap-001",
  "interaction_type": "tap",
  "value": { "type": "tap", "choice_id": "B" },
  "response_time_ms": 1420
}
```

**Response 200:** `ScoreResult`
```json
{
  "is_correct": false,
  "stars_earned": 0,
  "streak": { "current": 0, "best": 2, "multiplier": 1 },
  "mastery_status": { "state": "in_progress", "accuracy": 0.6, "items_completed": 5, "items_remaining": 5 },
  "sound_effect": null
}
```

**Telemetry emitted:** Interaction logged to `session_events`; `flag.misconception_loop` if ≥3 consecutive on same pattern

---

### `POST /api/sessions/{id}/hint`
Request the next hint rung for the current item. Increments `hint_level` server-side.

**Auth:** Child JWT.

**Response 200:** `HintPayload`
```json
{
  "hint_text": "Try sounding out each letter slowly: the first sound, then the middle sound, then the last sound.",
  "hint_style": "text",
  "hint_audio_key": null,
  "hints_remaining": 3,
  "hint_level": 1,
  "rung_name": "nudge",
  "near_transfer_scheduled": false
}
```

**Response when bottom-out is reached (rung 5):**
```json
{
  "hint_text": "The answer is 'cat'. Let's try a similar word next!",
  "hint_style": "show_example",
  "hints_remaining": 0,
  "hint_level": 5,
  "rung_name": "bottom_out",
  "near_transfer_scheduled": true,
  "near_transfer_content_id": "cvc-tap-002"
}
```

**Errors:** `400` (code `NO_HINTS_REMAINING`) — Hint cap reached; `404` — Session not found
**Telemetry emitted:** `hint.requested`, `hint.rung_served`, on rung 5: `hint.bottom_out_reached` + `hint.near_transfer_scheduled`

---

### `POST /api/sessions/{id}/pause`
Snapshot `engine_state` to DB. Session enters `paused` status.

**Auth:** Child JWT.

**Response 200:**
```json
{ "status": "paused", "paused_at": "2026-02-27T14:30:00Z" }
```

---

### `POST /api/sessions/{id}/end`
End a session (completed or abandoned).

**Auth:** Child JWT.

**Request:**
```json
{ "reason": "completed" }
```

**Response 200:** Final session stats
```json
{
  "session_id": "uuid",
  "status": "completed",
  "duration_seconds": 840,
  "stats": { "items_attempted": 18, "items_correct": 15, "accuracy": 0.83, "hints_used": 3, "stars_earned": 17, "mastery_achieved": false }
}
```

**Telemetry emitted:** `session.summary_created`

---

## Voice Endpoints

### `WebSocket /ws/voice`
Real-time voice relay: Mirror Core proxies to/from OpenAI Realtime API. All voice tool calls are policy-checked before execution.

**Auth:** Child JWT (passed as query param: `?token={child_session_token}`).

**Child → Server:**
```json
{ "type": "audio_chunk", "data": "<base64 PCM audio>" }
{ "type": "end_turn" }
```

**Server → Child:**
```json
{ "type": "audio_chunk", "data": "<base64>" }
{ "type": "transcript", "text": "Which picture starts with C?", "is_final": true }
{ "type": "function_result", "name": "switch_mode", "result": { "current_mode": "practice" } }
{ "type": "denial", "denial_reason_code": "WORLD_NOT_ENABLED", "safe_alternatives": [...] }
{ "type": "error", "message": "..." }
```

**Policy check:** Any tool call returned by Realtime API triggers `checkPolicy()` before execution. Denied calls return a `denial` frame; **approval is never granted via voice alone**.

---

### `POST /api/voice/intent`
Text fallback: submit transcript for intent routing without voice.

**Auth:** Child JWT.

**Request:**
```json
{ "transcript": "I want to play the cat game", "session_id": "uuid" }
```

**Response 200 — allowed:**
```json
{
  "intent": "start_session",
  "confidence": 0.93,
  "action": { "skill_id": "cvc-blending", "mode": "play" },
  "denied": false,
  "safe_alternatives": []
}
```

**Response 200 — denied:**
```json
{
  "intent": "start_session",
  "confidence": 0.87,
  "denied": true,
  "denial_reason_code": "WORLD_NOT_ENABLED",
  "safe_alternatives": [
    { "skill_id": "sight-words-k", "world_id": "reading", "display_label": "Reading" }
  ],
  "approval_id": "uuid"
}
```

**Telemetry emitted:** `talk.answer_given`; on denial: `talk.out_of_scope_blocked`, `policy.request_denied`, `policy.safe_alternatives_generated`

---

## Worlds Endpoints

### `GET /api/admin/worlds`
List all worlds with per-household enabled status.

**Auth:** Parent JWT.

**Response 200:**
```json
{
  "worlds": [
    {
      "world_id": "reading",
      "name": "Reading Realm",
      "icon": "icon_world_reading",
      "enabled_globally": true,
      "enabled_for_household": true,
      "skill_ids": ["short-comprehension", "sight-words-k", "rhyming-words", "word-picture-match"],
      "scope_tags": ["reading", "comprehension", "sight_words", "vocabulary"]
    },
    {
      "world_id": "phonics",
      "name": "Phonics Forest",
      "icon": "icon_world_phonics",
      "enabled_globally": true,
      "enabled_for_household": true,
      "skill_ids": ["cvc-blending"],
      "scope_tags": ["phonics"]
    },
    {
      "world_id": "numbers",
      "name": "Numbers Kingdom",
      "icon": "icon_world_numbers",
      "enabled_globally": true,
      "enabled_for_household": false,
      "skill_ids": [],
      "scope_tags": ["math"]
    }
  ]
}
```

**Telemetry emitted:** none

---

### `PUT /api/admin/worlds/{world_id}/enabled`
Enable or disable a world for this household.

**Auth:** Parent JWT.

**Request:**
```json
{ "enabled": false }
```

**Response 200:**
```json
{ "world_id": "numbers", "enabled_for_household": false }
```

**Telemetry emitted:** `worlds.enabled_changed`

---

## Admin Dashboard Endpoints

### `GET /api/admin/dashboard/flags`
List flagged moments requiring parent attention.

**Auth:** Parent JWT.

**Query params:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `child_id` | uuid | | Filter to specific child |
| `flag_type` | `misconception_loop \| out_of_scope \| safety_event` | | Filter by type |
| `from` | ISO 8601 | 7 days ago | Start of time range |
| `to` | ISO 8601 | now | End of time range |
| `limit` | integer | 50 | Max results |

**Response 200:**
```json
{
  "flags": [
    {
      "event_id": "uuid",
      "event_name": "flag.misconception_loop",
      "child_id": "uuid",
      "occurred_at": "2026-02-27T13:00:00Z",
      "payload": {
        "skill_id": "cvc-blending",
        "pattern": "confuses_b_d",
        "consecutive_count": 4
      }
    }
  ],
  "total": 1
}
```

---

### `GET /api/admin/dashboard/sessions`
Session history for all children in the household.

**Auth:** Parent JWT.

**Query params:** `child_id`, `from`, `to`, `limit` (all optional).

**Response 200:**
```json
{
  "sessions": [
    {
      "session_id": "uuid",
      "child_id": "uuid",
      "skill_id": "cvc-blending",
      "current_mode": "practice",
      "status": "completed",
      "duration_seconds": 720,
      "stats": { "accuracy": 0.85, "stars_earned": 12, "hints_used": 2, "mastery_achieved": false },
      "started_at": "...",
      "ended_at": "..."
    }
  ]
}
```

---

## Approval Endpoints

### `GET /api/admin/approvals`
List pending approval cards.

**Auth:** Parent JWT.

**Query params:** `status` = `requested` (default) | `all`

**Response 200:**
```json
{
  "approvals": [
    {
      "approval_id": "uuid",
      "child_id": "uuid",
      "child_display_name": "Mia",
      "request_type": "scope_change",
      "status": "requested",
      "denial_reason_code": "WORLD_NOT_ENABLED",
      "request_details": { "requested_scope_tag": "math", "child_message": null },
      "safe_alternatives": [...],
      "requested_at": "..."
    }
  ]
}
```

---

### `POST /api/admin/approvals/{id}/approve`
Approve a request. Creates a new session with the approved scope.

**Auth:** Parent JWT.

**Request:**
```json
{ "parent_note": "OK for today" }
```

**Response 200:**
```json
{ "approval_id": "uuid", "status": "approved", "resulting_session_id": "uuid", "resolved_at": "..." }
```

**Telemetry emitted:** Push `approval_resolved` to child via WebSocket `/ws/updates`

---

### `POST /api/admin/approvals/{id}/deny`
Deny a request. Child is notified with `safe_alternatives[]`.

**Auth:** Parent JWT.

**Response 200:**
```json
{ "approval_id": "uuid", "status": "denied", "resolved_at": "..." }
```

---

## Policy Endpoints

### `GET /api/admin/policies`
List all policies for the household and its children.

**Auth:** Parent JWT.

**Response 200:**
```json
{
  "policies": [
    { "policy_id": "uuid", "child_id": "uuid", "policy_type": "DAILY_GAME_TIME_LIMIT_MINUTES", "value": 30, "updated_at": "..." },
    { "policy_id": "uuid", "child_id": "uuid", "policy_type": "HINT_MAX_PER_ITEM", "value": 5, "updated_at": "..." }
  ]
}
```

---

### `PUT /api/admin/policies`
Update one or more policies.

**Auth:** Parent JWT.

**Request:**
```json
{ "policies": [{ "child_id": "uuid", "policy_type": "DAILY_GAME_TIME_LIMIT_MINUTES", "value": 45 }] }
```

**Response 200:** Array of updated Policy objects.

---

## WebSocket: Real-Time Updates

### `WebSocket /ws/updates`
Push events to both child and parent apps.

**Auth:** Token in query param: `?token={jwt}`

**Child receives:**
```json
{ "type": "approval_resolved", "approval_id": "uuid", "status": "approved", "resulting_session_id": "uuid" }
{ "type": "time_warning", "minutes_remaining": 5, "mode": "play" }
{ "type": "time_expired", "mode": "play" }
```

**Parent receives:**
```json
{ "type": "approval_requested", "approval": { "approval_id": "uuid", "child_id": "uuid", "child_display_name": "Mia", "requested_at": "..." } }
{ "type": "session_flag", "flag_type": "misconception_loop", "child_id": "uuid", "skill_id": "cvc-blending" }
```

---

## Telemetry Catalog by Endpoint

| Endpoint | Events Emitted |
|---|---|
| `POST /api/admin/register` | `auth.parent_registered` |
| `POST /api/admin/login` | `auth.login_success` or `auth.login_failed` |
| `POST /api/admin/refresh` | `auth.parent_session_started` |
| `POST /api/children/select` | `child.profile_selected`, `child.session_started` |
| `POST /api/sessions/start` (allowed) | `bundle.created`, `session.mode_offered`, `session.mode_selected` |
| `POST /api/sessions/start` (denied) | `policy.request_denied`, `policy.safe_alternatives_generated`, `approval.request_created` |
| `POST /api/sessions/{id}/switch-mode` | `session.mode_switched` |
| `POST /api/sessions/{id}/interact` | *(interaction written to session_events)*; `flag.misconception_loop` if ≥3 consecutive |
| `POST /api/sessions/{id}/hint` (rungs 1–4) | `hint.requested`, `hint.rung_served` |
| `POST /api/sessions/{id}/hint` (rung 5) | `hint.requested`, `hint.rung_served`, `hint.bottom_out_reached`, `hint.near_transfer_scheduled` |
| `POST /api/sessions/{id}/end` | `session.summary_created` |
| `POST /api/voice/intent` (allowed) | `talk.answer_given` |
| `POST /api/voice/intent` (denied) | `talk.out_of_scope_blocked`, `policy.request_denied`, `policy.safe_alternatives_generated` |
| `PUT /api/admin/worlds/{id}/enabled` | `worlds.enabled_changed` |
| `POST /api/admin/approvals/{id}/approve` | push to child WebSocket |
| Child preferred_mode update (background) | `child.preferred_mode_updated`, `child.mode_bias_applied` |
| Misconception loop ≥3 consecutive | `flag.misconception_loop` |
| Out-of-scope voice request | `flag.out_of_scope` |
| Safety filter trigger | `flag.safety_event` |
| Stars earned on interaction | `reward.stars_earned` |
| Mastery bonus awarded | `reward.mastery_bonus` |
| Unlockable earned | `reward.unlockable_earned` |
| Badge earned | `reward.badge_earned` |

> Full telemetry schema definitions are in `packages/schemas/src/index.ts` (`TelemetryEvent` discriminated union).
