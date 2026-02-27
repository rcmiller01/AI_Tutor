# Goldens Plan: Hint Ladder + Triad Bundle Determinism

> **Scope:** Deterministic golden fixtures and test scenarios for (1) the Hint Ladder engine behavior and (2) LearningBundle assembly and mode-switch consistency.
> **Format:** Golden fixtures are JSON files in `content/skill-specs/` (for spec-level data) and `packages/engine-runtime/src/__tests__/goldens/` (for engine state inputs/outputs). Test files live in `packages/engine-runtime/src/__tests__/`.
> **Anchor skill spec:** `cvc-blending` (`content/skill-specs/cvc-blending.json`) — real file, already in repo. A stub `LearningBundle` fixture is defined below for Triad tests (no full bundle exists yet).
> **Test framework:** Vitest

---

## Part 1 — Hint Ladder Golden Scenarios

### 1.1 Fixture: Seed Content Objects (CVC Blending)

Two minimal `TapChoiceItem` content objects for CVC blending — used as the **primary item** and its **near-transfer follow-up**.

**File:** `packages/engine-runtime/src/__tests__/goldens/content/cvc-blending-tap-001.json`

```json
{
  "content_id": "cvc-tap-001",
  "skill_id": "cvc-blending",
  "engine_type": "MICRO_SKILL_DRILL",
  "template_id": "tap_choice",
  "version": 1,
  "source": "CURATED",
  "created_at": "2026-01-01T00:00:00Z",
  "constraints_hash": "abc123",
  "difficulty_level": 1,
  "payload": {
    "type": "tap_choice",
    "prompt_text": "Which word does c-a-t spell?",
    "choices": [
      { "choice_id": "A", "label": "cat" },
      { "choice_id": "B", "label": "bat" },
      { "choice_id": "C", "label": "hat" }
    ],
    "correct_choice_id": "A"
  }
}
```

**File:** `packages/engine-runtime/src/__tests__/goldens/content/cvc-blending-tap-002.json`

```json
{
  "content_id": "cvc-tap-002",
  "skill_id": "cvc-blending",
  "engine_type": "MICRO_SKILL_DRILL",
  "template_id": "tap_choice",
  "version": 1,
  "source": "CURATED",
  "created_at": "2026-01-01T00:00:00Z",
  "constraints_hash": "abc123",
  "difficulty_level": 1,
  "payload": {
    "type": "tap_choice",
    "prompt_text": "Which word does d-o-g spell?",
    "choices": [
      { "choice_id": "A", "label": "dog" },
      { "choice_id": "B", "label": "log" },
      { "choice_id": "C", "label": "fog" }
    ],
    "correct_choice_id": "A"
  }
}
```

> `cvc-tap-002` is the designated near-transfer follow-up for `cvc-tap-001`. It shares `skill_id = "cvc-blending"` and `difficulty_level = 1` but uses a different phonics family (`-og` vs `-at`).

---

### 1.2 Fixture: Engine State Snapshots

**File:** `packages/engine-runtime/src/__tests__/goldens/engine-state/hint-level-0.json`

```json
{
  "_description": "Initial engine state before any hints. Child has answered incorrectly once.",
  "session_id": "sess-golden-001",
  "skill_id": "cvc-blending",
  "engine_type": "MICRO_SKILL_DRILL",
  "current_content_id": "cvc-tap-001",
  "hint_level": 0,
  "items_attempted": 1,
  "items_correct": 0,
  "streak": 0,
  "misconception_pattern": "skips_middle_vowel",
  "near_transfer_scheduled": false,
  "near_transfer_content_id": null,
  "queue": ["cvc-tap-001"]
}
```

**File:** `packages/engine-runtime/src/__tests__/goldens/engine-state/hint-level-4-pre-bottom-out.json`

```json
{
  "_description": "Engine state after 4 hints served (rungs 1–4). Next hint call must trigger bottom-out (rung 5).",
  "session_id": "sess-golden-001",
  "skill_id": "cvc-blending",
  "engine_type": "MICRO_SKILL_DRILL",
  "current_content_id": "cvc-tap-001",
  "hint_level": 4,
  "items_attempted": 1,
  "items_correct": 0,
  "streak": 0,
  "misconception_pattern": "skips_middle_vowel",
  "near_transfer_scheduled": false,
  "near_transfer_content_id": null,
  "queue": ["cvc-tap-001"]
}
```

**File:** `packages/engine-runtime/src/__tests__/goldens/engine-state/hint-level-5-post-bottom-out.json`

```json
{
  "_description": "Engine state after bottom-out (rung 5) served. near_transfer_scheduled must now be true and queue must contain cvc-tap-002 as immediate next item.",
  "session_id": "sess-golden-001",
  "skill_id": "cvc-blending",
  "engine_type": "MICRO_SKILL_DRILL",
  "current_content_id": "cvc-tap-001",
  "hint_level": 5,
  "items_attempted": 1,
  "items_correct": 0,
  "streak": 0,
  "misconception_pattern": "skips_middle_vowel",
  "near_transfer_scheduled": true,
  "near_transfer_content_id": "cvc-tap-002",
  "queue": ["cvc-tap-001", "cvc-tap-002"]
}
```

---

### 1.3 Golden Test Scenarios

**File:** `packages/engine-runtime/src/__tests__/hint-ladder.golden.test.ts`

```
SCENARIO 1 — hint_level starts at 0
  Given: engine_state = hint-level-0.json
  When:  getHintLevel(engine_state)
  Then:  returns 0

SCENARIO 2 — first hint request serves rung 1 (Nudge)
  Given: engine_state = hint-level-0.json
         skill_spec   = cvc-blending.json
         max_hints    = 5 (policy default)
  When:  renderHints(engine_state, scoreResult(incorrect), skill_spec)
  Then:  HintPayload.hint_text  === cvc-blending.json misconceptions[skips_middle_vowel].hint_text
         HintPayload.hint_style  === "text"
         HintPayload.hints_remaining === 4
         engine_state (after) .hint_level === 1

SCENARIO 3 — subsequent hints advance rung monotonically
  Given: engine_state with hint_level = N  (for N in 1, 2, 3, 4)
  When:  renderHints(...)
  Then:  rung served = N+1  (names: Nudge, Strategy, WorkedExample, PartialFill, BottomOut)
         hint_level (after) = N+1

SCENARIO 4 — rung never skips (even if called multiple times quickly)
  Given: engine_state = hint-level-0.json
  When:  renderHints called 3 times in sequence (no reset between)
  Then:  rungs served in order: 1, 2, 3  (never 1, 1, 3 or 2, 3, ...)

SCENARIO 5 — bottom-out (rung 5) schedules near-transfer item
  Given: engine_state = hint-level-4-pre-bottom-out.json
         available near-transfer pool = [cvc-tap-002]  (same skill_id, different content_id)
  When:  renderHints(...)
  Then:  HintPayload rung = "BottomOut"
         engine_state (after) .near_transfer_scheduled === true
         engine_state (after) .near_transfer_content_id === "cvc-tap-002"
         engine_state (after) .queue[1] === "cvc-tap-002"   // near-transfer is immediate next

SCENARIO 6 — near-transfer item identity check
  Given: engine_state = hint-level-5-post-bottom-out.json  (matches expected output of Scenario 5)
  Then:  This fixture IS the golden output. Structural equality with computed state must pass.
         Specifically assert:
           near_transfer_content_id !== current_content_id   // "cvc-tap-002" !== "cvc-tap-001"
           near_transfer_skill_id === current_skill_id        // both "cvc-blending"

SCENARIO 7 — accessibility skip: jumps directly to bottom-out when flag is set
  Given: engine_state = hint-level-0.json
         child_policy.accessibility_skip_hints = true
  When:  renderHints(...)
  Then:  rung served = "BottomOut" (level 5) on first call
         near_transfer_scheduled = true
         near_transfer_content_id = "cvc-tap-002"

SCENARIO 8 — hint_level resets to 0 on new content item (not on misconception retry)
  Given: engine_state = hint-level-5-post-bottom-out.json
  When:  engine advances to next content item (cvc-tap-002 becomes current)
  Then:  engine_state.hint_level === 0
         engine_state.near_transfer_scheduled === false

SCENARIO 9 — hints_remaining reflects policy cap correctly
  Given: skill_spec.hint_policy.max_hints_per_item = 2  (sight-words-k uses this)
         engine_state.hint_level = 1
  When:  renderHints(...)
  Then:  HintPayload.hints_remaining === 0  (cap 2, used 1, one being served now)
         No further hints available after this call
```

---

## Part 2 — Triad Bundle Determinism Golden Scenarios

### 2.1 Fixture: Stub LearningBundle

**File:** `packages/engine-runtime/src/__tests__/goldens/bundles/cvc-bundle-001.json`

```json
{
  "bundle_id": "bundle-golden-001",
  "session_id": "sess-golden-001",
  "child_id": "child-golden-001",
  "skill_id": "cvc-blending",
  "world_id": null,
  "talk_plan_id": "talk-plan-cvc-001",
  "practice_set_ids": ["cvc-tap-001", "cvc-tap-002"],
  "play_config": {
    "engine_type": "MICRO_SKILL_DRILL",
    "template_id": "tap_choice",
    "params": {
      "item_count": 5,
      "difficulty_level": 1
    }
  },
  "constraints_hash": "abc123",
  "created_at": "2026-01-01T00:00:00Z"
}
```

> **`constraints_hash` derivation:** SHA-256 of the canonical JSON of `skill_spec.item_generator_rules`. For `cvc-blending`, this must be computed from the actual `item_generator_rules` object in `cvc-blending.json`. The hash `"abc123"` is a **placeholder** for the test fixture — the test must re-derive and assert equality.

---

### 2.2 Golden Test Scenarios

**File:** `packages/engine-runtime/src/__tests__/triad-bundle.golden.test.ts`

```
SCENARIO 1 — Bundle created at session start with all required fields
  Given: skill_id = "cvc-blending"
         child_id = "child-golden-001"
         session_id = "sess-golden-001"
  When:  createLearningBundle(session_id, child_id, skill_id, worldId=null)
  Then:  bundle.bundle_id              is a valid UUID
         bundle.skill_id               === "cvc-blending"
         bundle.talk_plan_id           is a non-empty string
         bundle.practice_set_ids       has length >= 1
         bundle.practice_set_ids       all items are content_ids where content.skill_id === "cvc-blending"
         bundle.play_config            is non-null
         bundle.play_config.engine_type is one of skill_spec.allowed_engine_types
         bundle.constraints_hash       === sha256(canonical(skill_spec.item_generator_rules))

SCENARIO 2 — constraints_hash matches skill spec generator rules
  Given: bundle     = cvc-bundle-001.json (with placeholder hash replaced by real hash)
         skill_spec = cvc-blending.json
  When:  verifyConstraintsHash(bundle.constraints_hash, skill_spec)
  Then:  returns true
         A bundle built from a *different* skill_spec returns false (hash mismatch)

SCENARIO 3 — Mode switch from Talk to Practice reuses same bundle_id
  Given: active session with bundle = cvc-bundle-001.json  (mode = Talk)
  When:  switchMode(session_id, "practice")
  Then:  session.bundle_id does NOT change  (still "bundle-golden-001")
         No new bundle is created
         session.current_mode === "practice"
         Telemetry: session.mode_switched event emitted with bundle_id = "bundle-golden-001"

SCENARIO 4 — Mode switch from Practice to Play reuses same bundle_id
  Given: active session with bundle = cvc-bundle-001.json  (mode = Practice)
  When:  switchMode(session_id, "play")
  Then:  session.bundle_id does NOT change
         play_config used is bundle.play_config  (engine_type "MICRO_SKILL_DRILL", template "tap_choice")

SCENARIO 5 — Mode switch from Play back to Talk reuses same bundle_id
  Given: active session with bundle = cvc-bundle-001.json  (mode = Play)
  When:  switchMode(session_id, "talk")
  Then:  session.bundle_id does NOT change
         talk_plan_id used is bundle.talk_plan_id

SCENARIO 6 — practice_set_ids in bundle all belong to correct skill
  Given: bundle = cvc-bundle-001.json
  When:  validatePracticeSetSkillAlignment(bundle, contentObjectStore)
  Then:  every content_id in bundle.practice_set_ids resolves to a ContentObject
         every ContentObject.skill_id === bundle.skill_id  ("cvc-blending")

SCENARIO 7 — play_config.engine_type is within allowed types for skill spec
  Given: bundle = cvc-bundle-001.json
         skill_spec = cvc-blending.json  (allowed_engine_types: ["MICRO_SKILL_DRILL"])
  When:  validatePlayConfig(bundle.play_config, skill_spec)
  Then:  returns valid
         A play_config with engine_type "STORY_MICROTASKS" returns invalid (not in allowed list)

SCENARIO 8 — Bundle creation does not make LLM call at runtime
  Given: LLM provider mock is set to throw on any call
         skill_spec = cvc-blending.json
         practice content exists in local DB (curated: cvc-tap-001, cvc-tap-002)
  When:  createLearningBundle(session_id, child_id, "cvc-blending", null)
  Then:  bundle is created successfully
         LLM mock was NOT called (0 invocations)
         bundle.practice_set_ids = ["cvc-tap-001", "cvc-tap-002"]

SCENARIO 9 — Bundle preferred_mode bias does not alter bundle structure
  Given: child.preferred_mode = "play"
         session started (Talk default)
  When:  createLearningBundle(...) with preferred_mode = "play" context
  Then:  bundle.talk_plan_id is still populated (not null)
         bundle.practice_set_ids is still populated
         bundle.play_config is still populated
         (Preferred mode only affects which mode is *offered first* — bundle structure is always complete)
```

---

## File Structure Summary

```
packages/engine-runtime/src/__tests__/
├── goldens/
│   ├── content/
│   │   ├── cvc-blending-tap-001.json      ← primary test content item
│   │   └── cvc-blending-tap-002.json      ← near-transfer follow-up item
│   ├── engine-state/
│   │   ├── hint-level-0.json              ← clean state before any hints
│   │   ├── hint-level-4-pre-bottom-out.json
│   │   └── hint-level-5-post-bottom-out.json  ← canonical output for bottom-out
│   └── bundles/
│       └── cvc-bundle-001.json            ← stub triad bundle for cvc-blending
├── hint-ladder.golden.test.ts             ← Scenarios 1–9 (Hint Ladder)
└── triad-bundle.golden.test.ts            ← Scenarios 1–9 (Triad Bundle)

content/skill-specs/
└── cvc-blending.json                      ← anchor skill spec (already in repo)
```

---

## Notes & Stub Callouts

| Item | Status | Note |
|---|---|---|
| `cvc-blending.json` | ✅ Real, in repo | Used as-is. `hint_policy.max_hints_per_item = 2` — note this means full 5-rung ladder requires a policy override in tests (set `max_hints = 5` in test fixture). |
| `cvc-tap-001`, `cvc-tap-002` | 🟡 Stub (define now) | Minimal curated items. Flesh out with more `difficulty_level` variants later. |
| `cvc-bundle-001.json` | 🟡 Stub (define now) | `constraints_hash` is placeholder; test must derive real hash. `talk_plan_id` is a string ref; full talk plan schema is deferred. |
| Near-transfer pool | 🟡 Requires seeding | Engine must have ≥1 alternative item in DB with same `skill_id` and `difficulty_level` to schedule near-transfer. Tests should seed `cvc-tap-002` into mock store. |
| `talk_plan_id` schema | 🔴 Deferred | Talk plan structure not yet defined. Golden tests use opaque string ref for now. |
| `world_id` in bundle | 🟡 Optional (null in stub) | Worlds layer required in model but Day-1 World-picker UI is deferred; `null` is valid. |

---

## References

- [Skill Spec: cvc-blending](file:///c:/Users/rober/Documents/AI_Tutor/content/skill-specs/cvc-blending.json)
- [Shared Schemas](file:///c:/Users/rober/Documents/AI_Tutor/packages/schemas/src/index.ts)
- [Architecture v1.1 §3 — Engine Plugin Contract + Hint Ladder](file:///c:/Users/rober/Documents/AI_Tutor/ARCHITECTURE.md)
- [Architecture v1.1 §4.4 — LearningBundle](file:///c:/Users/rober/Documents/AI_Tutor/ARCHITECTURE.md)
- [Acceptance Criteria Matrix](file:///c:/Users/rober/Documents/AI_Tutor/docs/ACCEPTANCE_CRITERIA_MATRIX.md)
