# Acceptance Criteria Matrix
**PRD v2.1 — Feature → Tests → Telemetry**

> **Test framework:** Vitest (unit + integration). Test files live in `packages/engine-runtime/src/__tests__/` and `services/mirror-core/src/__tests__/`.
> **Telemetry:** Events are emitted by Mirror Core to `session_events` (append-only). Proposed event names follow `domain.action` dot-notation. Full payload shape is in §Telemetry Schema at the bottom of this document.

---

## Feature Area Matrix

| # | Feature Area | Acceptance Criteria (Done = all ✓) | Vitest Test IDs / Descriptions | Telemetry Events Emitted |
|---|---|---|---|---|
| **1** | **Household Account Model** | ✓ Parent can register with email + password. ✓ TOTP enrollment optional at setup; skippable. ✓ Passkey enrollment optional at setup; skippable. ✓ At least one child profile must exist before child mode is accessible. ✓ `sessions.child_id` is always set; sessions without a `child_id` are rejected by API. | `auth.parent-registration.creates-account` `auth.parent-registration.stores-password-hash` `auth.mfa.totp-enrollment-optional` `auth.mfa.passkey-enrollment-optional` `sessions.create.rejects-missing-child-id` | `auth.parent_registered` `auth.mfa_enrolled` `auth.login_success` `auth.login_failed` |
| **2** | **Child Profile Selection** | ✓ Child profile has no password or PIN field. ✓ Avatar picker returns a valid `child_session_token` scoped to that `child_id`. ✓ `child_session_token` cannot call any `/admin/*` endpoint (returns 403). ✓ Token includes `child_id` and `household_id` claims. | `auth.child-session.created-on-avatar-select` `auth.child-session.cannot-reach-admin-endpoints` `auth.child-session.token-contains-child-id` | `child.session_started` `child.profile_selected` |
| **3** | **Parent Mode Lock** | ✓ Parent Mode entry always triggers fresh auth challenge regardless of prior state. ✓ Parent session expires after ≤15 min of inactivity (configurable). ✓ After timeout, child-mode UI is accessible without re-auth; parent mode requires login. ✓ Admin endpoints validate JWT expiry server-side; expired tokens return 401. | `auth.parent-session.expires-after-inactivity` `auth.parent-session.timeout-returns-401` `auth.parent-session.child-mode-survives-timeout` `auth.parent-session.fresh-challenge-always-required` | `auth.parent_session_started` `auth.parent_session_expired` `auth.parent_session_timeout` |
| **4** | **Core Loop: Talk-first Triad** | ✓ Session starts in Talk mode by default. ✓ Within first interaction cycle, child is offered all 3 modes. ✓ All 3 modes remain selectable throughout the session. ✓ Mode switch preserves `skill_id` and `bundle_id` (LearningBundle not replaced on mode switch). ✓ `preferred_mode` for that child is updated after each mode selection. | `session.start.default-mode-is-talk` `session.triad-offer.offered-on-first-interaction` `session.triad.all-modes-remain-selectable` `session.mode-switch.preserves-bundle-context` `session.mode-switch.updates-preferred-mode` | `session.mode_offered` `session.mode_selected` `session.mode_switched` |
| **5** | **Preference Learning** | ✓ `preferred_mode` is stored per child, not per device or household. ✓ After N mode selections (configurable, default 3), initial offer biases toward `preferred_mode`. ✓ Biased offer still includes all 3 modes in the response. ✓ Preference resets are available via parent portal. | `preference.stored-per-child-not-household` `preference.bias-triggered-after-n-selections` `preference.biased-offer-still-includes-all-modes` | `child.preferred_mode_updated` `child.mode_bias_applied` |
| **6** | **Talk Mode: Bounded Answers** | ✓ Talk responses are ≤3 sentences in child mode. ✓ Talk cannot invoke content outside allowed `scope_tags` for this child. ✓ If request is for a drillable skill, response includes a Practice offer. ✓ Talk never enters freeform lecture mode (no response > configurable word ceiling). | `talk.response.bounded-to-three-sentences` `talk.response.scoped-to-allowed-tags` `talk.response.offers-practice-when-drillable` `talk.response.word-ceiling-enforced` | `talk.answer_given` `talk.practice_offered` `talk.out_of_scope_blocked` |
| **7** | **Hint Ladder** | ✓ `hint_level` starts at 0 per content instance attempt and is stored in `engine_state`. ✓ Each hint request increments `hint_level` by exactly 1. ✓ `render_hints()` returns rung at `hint_level` index, never skipping. ✓ After rung 5 (bottom-out), engine schedules a near-transfer follow-up item (`skill_id` same, `content_id` different). ✓ Near-transfer item is the very next item in the queue. ✓ Skipping to bottom-out only allowed when `accessibility_skip_hints` policy flag is `true`. ✓ `hints_remaining` in `HintPayload` reflects policy cap minus `hint_level`. | `hint.level.starts-at-zero` `hint.level.increments-exactly-one` `hint.rung.deterministic-by-level` `hint.bottom-out.schedules-near-transfer` `hint.near-transfer.different-content-id-same-skill` `hint.skip.only-with-accessibility-flag` `hint.remaining.reflects-cap-minus-level` | `hint.requested` `hint.rung_served` `hint.bottom_out_reached` `hint.near_transfer_scheduled` |
| **8** | **LearningBundle (Triad Artifact)** | ✓ Bundle is created at session start bound to a `skill_id`. ✓ Bundle contains `talk_plan_id`, `practice_set_ids[]`, and `play_config`. ✓ Mode switches within a session reuse the same `bundle_id` (no new bundle). ✓ `constraints_hash` in bundle matches hash of skill spec generator rules used. ✓ Bundle creation does not require a live LLM call at runtime. | `bundle.create.contains-all-triad-fields` `bundle.create.constraints-hash-matches-spec` `bundle.mode-switch.reuses-bundle` `bundle.create.no-llm-required-at-runtime` | `bundle.created` `bundle.mode_reused` |
| **9** | **Worlds Layer** | ✓ `worlds` table is seeded at first-run migration. ✓ Each world has at least one `skill_id` and one `scope_tag`. ✓ `household_enabled_worlds` is populated with defaults on household creation. ✓ Policy engine uses only enabled worlds when computing `safe_alternatives[]`. | `worlds.seed.populates-on-migration` `worlds.household.defaults-on-creation` `worlds.safe-alternatives.only-uses-enabled-worlds` | `worlds.enabled_changed` |
| **10** | **Out-of-scope Redirect** | ✓ Any denied request returns exactly 2–3 entries in `safe_alternatives[]`. ✓ Each alternative is anchored to an enabled world + valid `skill_id`. ✓ Redirect is computed without LLM call (deterministic from enabled worlds + policy). ✓ An `ApprovalRequest` is created in the background. ✓ Child UI receives alternatives in the same response as the denial. ✓ Denial message passes tone check (no error codes, no "forbidden" language surfaced). | `policy.deny.returns-two-to-three-alternatives` `policy.deny.alternatives-anchored-to-enabled-worlds` `policy.deny.no-llm-required` `policy.deny.creates-approval-request` `policy.deny.alternatives-in-same-response` | `policy.request_denied` `policy.safe_alternatives_generated` `approval.request_created` |
| **11** | **Rewards: Stars + Unlockables** | ✓ Stars are credited to `stars_ledger` on correct answer (per `skill_spec.stars_per_correct`). ✓ Mastery bonus stars credited at mastery gate (per `skill_spec.stars_mastery_bonus`). ✓ Unlockables are earned by learning actions only; no time-based or streak-based unlock paths exist. ✓ Streak count is tracked but carries no negative consequence on reset. ✓ Badge strip slot fill event is emitted on badge earn. | `rewards.stars.credited-on-correct` `rewards.stars.mastery-bonus-credited` `rewards.unlockables.no-time-based-unlock` `rewards.streak.no-penalty-on-reset` `rewards.badge.strip-slot-fill-event` | `reward.stars_earned` `reward.mastery_bonus` `reward.unlockable_earned` `reward.badge_earned` |
| **12** | **Parent Observability** | ✓ Each completed session produces a summary record with: skills, time-on-task, accuracy, mastery gates reached. ✓ Repeated misconception (≥3 consecutive same-pattern wrong) creates a flagged moment. ✓ Out-of-scope request creates a flagged moment. ✓ Safety/content-filter event creates a flagged moment. ✓ Parent portal returns flagged moments list; does NOT return full transcript. | `observability.summary.created-on-session-end` `observability.flag.repeated-misconception` `observability.flag.out-of-scope-request` `observability.flag.safety-event` `observability.portal.no-transcript-in-response` | `session.summary_created` `flag.misconception_loop` `flag.out_of_scope` `flag.safety_event` |

---

## Telemetry Schema

All events are stored as rows in `session_events` and may optionally be streamed to the parent portal via WebSocket.

```typescript
// Base event shape (all events extend this)
interface TelemetryEvent {
  event_id: string;         // UUID
  event_name: string;       // dot-notation: domain.action
  session_id: string | null;// null for auth events outside a session
  child_id: string | null;
  household_id: string;
  occurred_at: string;      // ISO 8601
  payload: Record<string, unknown>;
}
```

### Proposed Event Catalog

| Event Name | Key Payload Fields |
|---|---|
| `auth.parent_registered` | `household_id` |
| `auth.mfa_enrolled` | `mfa_type: 'totp' \| 'passkey'` |
| `auth.login_success` | `role: 'parent'`, `mfa_used: boolean` |
| `auth.login_failed` | `reason: string` |
| `auth.parent_session_started` | `token_expiry_at` |
| `auth.parent_session_expired` | `idle_seconds` |
| `auth.parent_session_timeout` | — |
| `child.session_started` | `child_id`, `profile_avatar_id` |
| `child.profile_selected` | `child_id` |
| `child.preferred_mode_updated` | `child_id`, `new_mode`, `selection_count` |
| `child.mode_bias_applied` | `child_id`, `biased_toward` |
| `session.mode_offered` | `modes: ['talk','practice','play']` |
| `session.mode_selected` | `mode`, `is_initial_selection: boolean` |
| `session.mode_switched` | `from_mode`, `to_mode`, `bundle_id` |
| `talk.answer_given` | `skill_id`, `word_count`, `scope_valid: boolean` |
| `talk.practice_offered` | `skill_id`, `drillable: true` |
| `talk.out_of_scope_blocked` | `requested_scope_tag` |
| `hint.requested` | `content_id`, `hint_level_before` |
| `hint.rung_served` | `content_id`, `rung: 1-5`, `rung_name`, `hint_level_after` |
| `hint.bottom_out_reached` | `content_id`, `skill_id` |
| `hint.near_transfer_scheduled` | `original_content_id`, `near_transfer_content_id`, `skill_id` |
| `bundle.created` | `bundle_id`, `skill_id`, `world_id \| null` |
| `bundle.mode_reused` | `bundle_id`, `mode` |
| `policy.request_denied` | `denial_reason_code`, `requested_scope_tag \| skill_id` |
| `policy.safe_alternatives_generated` | `alternatives: [{skill_id, world_id}]` |
| `approval.request_created` | `approval_id`, `request_type`, `denial_reason_code` |
| `reward.stars_earned` | `amount`, `reason`, `balance_after` |
| `reward.mastery_bonus` | `skill_id`, `amount` |
| `reward.unlockable_earned` | `unlockable_id`, `category` |
| `reward.badge_earned` | `badge_id`, `strip_slot_index` |
| `session.summary_created` | `session_id`, `duration_seconds`, `accuracy`, `stars_earned`, `mastery_achieved` |
| `flag.misconception_loop` | `child_id`, `skill_id`, `pattern`, `consecutive_count` |
| `flag.out_of_scope` | `child_id`, `requested_scope_tag`, `approval_id` |
| `flag.safety_event` | `child_id`, `filter_type`, `content_id \| null` |
| `worlds.enabled_changed` | `household_id`, `world_id`, `enabled` |
