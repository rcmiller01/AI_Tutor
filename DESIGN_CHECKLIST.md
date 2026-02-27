# Design Checklist Pack v0.2

> **Purpose:** Implementation-time checklist for designers and engineers. Each item is a concrete "done means done" requirement — not an aspiration. Check against this before shipping any screen or flow.

---

## 1) Identity & Simplicity

### Parent Onboarding
- [ ] Email + password required at first launch (no skippable steps).
- [ ] Authenticator app (TOTP) offered as optional second factor during setup.
- [ ] Passkey registration offered as optional alternative to password at setup.
- [ ] Neither TOTP nor passkey is required — parent may skip both.
- [ ] Setup cannot be bypassed to reach child mode without completing parent account creation.

### Child Start
- [ ] Child sees an avatar/name picker at session start — no password, no PIN, no other auth step.
- [ ] Avatar picker is touch-friendly (large tap targets) and requires no keyboard.
- [ ] Selecting an avatar immediately begins the child session (no confirmation screen).
- [ ] If only one child profile exists, avatar auto-highlights but child still taps to confirm (avoids accidental wrong-child identity).

### 🔒 Parent Mode Lock — Critical Gotcha
> **Why this matters:** Children have no auth barrier at session start. A curious child finding a visible "Settings" or "Parent" button will eventually tap it. The Parent Mode entry must be actively defended.

- [ ] A "Parent Mode" entry point exists in the UI (e.g., discreet lock icon or hidden corner tap).
- [ ] Tapping Parent Mode entry always triggers the parent login flow — **no exceptions**, regardless of prior parent session state on the device.
- [ ] Parent session tokens have a **short timeout** (suggested: 10–15 minutes of inactivity) after which re-authentication is required.
- [ ] After timeout or logout, returning to the child-facing UI requires no parent re-authentication (child mode is the default).
- [ ] Parent Mode entry is **not prominently labeled** in child-visible UI (e.g., no "Settings" text, uses an icon or subtle affordance).
- [ ] Admin endpoints on the backend **always** validate an active, non-expired parent session token — no client-side-only guards.

---

## 2) Modes

### Default Entry
- [ ] Default mode when a session starts is **Talk**.
- [ ] Talk mode begins immediately after child selection — no mode picker shown first.

### Triad Offer
- [ ] Within the first interaction (first child utterance or first tap), the tutor asks:
  *"Want to talk, practice, or play?"*
- [ ] All three options (Talk, Practice, Play) are presented, never hidden or disabled during a session.
- [ ] Mode switch is available at any point in the session, not just at the initial offer.
- [ ] Switching modes does **not** lose the current skill context (LearningBundle persists).

---

## 3) Preference Learning

- [ ] `preferred_mode` is stored **per child profile** (not per household or device).
- [ ] The system tracks mode choices over time and may bias the *initial suggestion* toward the child's preferred mode (e.g., *"Want to play or practice?"* instead of the default triad).
- [ ] Biasing the suggestion never removes or hides the third option — all 3 modes remain reachable.
- [ ] Preference data is visible (read-only) in the Parent Portal session summaries.

---

## 4) Talk Mode

### Content Rules
- [ ] Talk answers are always **short** (target: 1–3 sentences for a 6–8 year old).
- [ ] Answers are **scoped** to the active skill and world — no free-range tutoring.
- [ ] Vocabulary and complexity are **age-appropriate** (grade band from policy).
- [ ] Talk mode does not lecture; it answers, then prompts.

### Practice Bridge
- [ ] When a question is drillable (a skill item exists for it), Talk **offers Practice**:
  *"Want to try a few together?"*
- [ ] The offer is a soft suggestion — child can decline and stay in Talk.
- [ ] If child accepts the bridge, a Practice session starts on the same `skill_id` (no new LearningBundle needed).

---

## 5) Hints

### Ladder Enforcement
- [ ] Engine state tracks `hint_level` per content instance attempt (starts at 0, increments per hint request).
- [ ] `render_hints()` selects the rung **deterministically** — no random or LLM-chosen hints at runtime.
- [ ] Default ladder depth: **3–5 rungs** (configurable per child in parent settings, within allowed range).
- [ ] Ladder rungs in order:
  1. Nudge
  2. Strategy reminder
  3. Worked example (near transfer)
  4. Partial fill-in
  5. Bottom-out (answer revealed)

### Bottom-out Behavior
- [ ] After bottom-out, the engine **immediately schedules a near-transfer follow-up item** (same `skill_id`, different surface form — e.g., different digits, different word).
- [ ] The near-transfer item is presented without comment; it is not announced as a "retry."
- [ ] Skipping to bottom-out without exhausting higher rungs is **only allowed** if an accessibility policy flag is set on the child profile by the parent.

---

## 6) Rewards

### Home Screen
- [ ] A child-selectable **companion character** (v1: cute dinosaur) is visible on the home/default screen.
- [ ] Companion reacts to session events (simple animation, not intrusive).

### Unlockables
- [ ] Unlockable cosmetic items (characters, themes, accessories) are earned through **learning actions** only — not by time-on-device or streaks.
- [ ] Unlock events are celebrated with a contained animation (not a full-screen interrupt mid-session).

### Badge Strip
- [ ] A **badge strip** is visible on the home screen with a fixed number of visible badge slots.
- [ ] Empty slots are shown (as outlines or ghost icons) so the child can see what is earnable.
- [ ] Earned badges fill their slot with a reveal animation.

### No Streak Penalties
- [ ] The system tracks streaks for display only — **no punishment, lock-out, or negative feedback** for missing a day.
- [ ] Badge and reward copy uses progress/mastery language, not streak language (*"You learned 5 new words!"* not *"3-day streak!"*).

---

## 7) Parent View

### Session Summaries
- [ ] Parent Portal shows a summary per session: skills practiced, time on task, progress signals (accuracy, mastery gates reached).
- [ ] Summaries load for all child profiles under the household account.

### Flagged Moments
- [ ] The following event types are automatically flagged and surfaced in the Parent Portal:
  - [ ] Repeated misconception or stuck loop (same item failed N times — configurable threshold).
  - [ ] Out-of-scope request (child asked for content outside allowed scope).
  - [ ] Safety/policy event (content filter triggered, admin-only detail).
- [ ] Flagged moments are shown as a list with timestamp and brief description — **not** a raw transcript.

### Transcripts
- [ ] Full session transcripts are **not shown by default**.
- [ ] Transcript access is a future opt-in feature and is not implemented in v1.

---

## 8) Out-of-scope Handling

- [ ] When a child's request is denied by policy, the system **immediately** returns 2–3 allowed alternatives.
- [ ] Alternatives are **relevant** — anchored to enabled worlds and the child's recent skill context (e.g., *"I can help with spelling, addition, or reading — pick one."*).
- [ ] Alternatives are generated deterministically from `household_enabled_worlds` + current policy — **no LLM call required** for the redirect itself.
- [ ] The denial message is **friendly and non-punitive** — no error tone, no "you can't do that."
- [ ] After denial, the child is never left at a dead end. One of the alternatives must always be selectable immediately.
- [ ] An `ApprovalRequest` is created in the background so the parent sees the request — the child does not need to wait for approval to continue; they are redirected now.

---

## References

- [Project Brief](file:///c:/Users/rober/Documents/AI_Tutor/PROJECT_BRIEF.md)
- [Architecture Spec v1.1](file:///c:/Users/rober/Documents/AI_Tutor/ARCHITECTURE.md)
- [Decisions Log](file:///c:/Users/rober/Documents/AI_Tutor/DECISIONS.md)
