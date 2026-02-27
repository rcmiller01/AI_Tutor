# Project Brief — Magic Mirror Tutor + Locked Learning Games

## Product Summary

A **voice-first tutoring + learning-game system** for kids (6–8) who get bored easily or don't respond well to classical learning styles. The system is "ambient" when idle (mirror/window display), wakes via voice, and runs learning through **three deterministic engines**. A parent portal controls policies, approvals, and limits so the child cannot override constraints.

> **Core principle:** Deterministic runtime + strict rails. The LLM is a constrained content generator, not the runtime brain.

---

## Target Users

### Primary
Children (6–8) needing tutoring; boredom-prone; better response to rapid feedback + game loops.

### Secondary
Parents/guardians who want enforceable limits, approvals, and clear progress visibility — without turning the home into a surveillance lab.

---

## Goals

- Make practice feel like play; keep attention via micro-rewards and quick loops.
- Keep learning focused (no tangents) via deterministic engines and parent approval flow.
- Enforce limits: game time budgets, allowed topics/levels — child cannot override.
- Cloud-grade quality and speed for reasoning and content generation (internet required).
- Store content and analytics locally in DB; parent portal reads local DB.

## Non-Goals (Day 1)

- Fully offline operation (cloud-only LLM for MVP).
- Bank-grade biometric security (voice identity helps but isn't sole gate).
- Complex "open world" games.

---

## The 3 Engines (build once, reuse forever)

### Engine 1 — Micro-Skill Drill Engine (SplashLearn core)
**Loop:** 1-sentence instruction → 1 interaction (tap/drag/type) → instant feedback → repeat variation → small reward → mastery gate every N

**Parameterized by:** `skill_id`, difficulty ladder (1–5), misconception handlers, interaction type.

### Engine 2 — Match / Sort / Classify Engine (ABCya core)
**Loop:** present items + bins/pairs → drag item → feedback → streak bonuses → quick reset

**Parameterized by:** `item_set` (words/images/audio), bins/pairs, rule text + examples, distractor strategy.

### Engine 3 — Story + Micro-Tasks Engine (storybook games)
**Structure:** short text page + read-aloud + highlighting → tap-word helpers → micro-task every 1–2 pages → final comprehension check

**Parameterized by:** reading level, allowed vocab list, theme/character pack, question templates (literal/inference/vocab).

---

## Core Loop: Talk-first Triad

**Default entry mode = Talk.**
After the child speaks or taps to start, the tutor begins in Talk and then offers a mode choice:
*"Want to talk, practice, or play?"*

Triad always available in-session:
- **Talk**: conversational Q&A, guided learning
- **Practice**: micro-items (3–7) aligned to detected skill
- **Play**: short game session aligned to same skill

**Preference learning (per child):**
- Track a `preferred_mode` per child.
- The system may bias the initial suggestion over time (e.g., *"Want to play or practice?"*) but must always keep all 3 modes accessible.

### Talk vs Practice Policy
- Talk is allowed to answer questions directly, but must remain:
  - concise, age-appropriate, scoped
  - aligned with allowed skills/worlds.
- If a request is drillable, Talk should offer Practice (*"Want to try a few together?"*).
- Practice may be delivered conversationally (same content objects, talk wrapper).

---

## "Locked Tutor" Rules (Anti-Chaos Contract)

### Deterministic runtime decides:
- Active `skill_id`
- Allowed interactions
- Correctness logic and scoring
- Hint eligibility and limits
- Escalation triggers (approval required)

### LLM is allowed to generate ONLY:
- Story text within vocab/level constraints
- Item variations inside known templates
- Short kid-friendly hints constrained to a style guide
- **No freeform tutoring essays in child mode.**

### Out-of-scope Handling
When a child request is denied, the system must immediately offer 2–3 allowed alternatives that are relevant (*"I can help with spelling, addition, or reading—pick one."*). The goal is smooth redirection, not dead ends.

---

## Pedagogy Requirement: Hint Ladder

When the child is incorrect or stuck, the system uses a deterministic hint ladder (default 3–5 levels, configurable in parent/admin):
1. **Nudge**
2. **Strategy reminder**
3. **Worked example** (near transfer)
4. **Partial fill-in**
5. **Bottom-out** (answer/step) + immediate near-transfer attempt

**Rule:** Must not skip straight to bottom-out except by policy (e.g., accessibility setting).

---

## Parent Approval Flow

- Any request outside current allowed scope (topic, skill, grade band, time budget) generates a **Parent Approval Card**.
- Approval happens **only** in the Parent Portal.
- If approved, it becomes a **new session** (`skill_id` change), not a tangent inside the current loop.

---

## Parent Observability

Parent portal shows:
- **Session summaries** (skills, time, progress signals)
- **Flagged moments:**
  - repeated misconception / stuck loops
  - out-of-scope requests
  - safety/policy events
- **Transcripts** are not shown by default (optional later if desired).

---

## Identity, Roles & Enforcement

### Household Account Model (v1)
- **Parent account:** email/password login.
- **Parent security options:** Authenticator app (TOTP) and/or Passkeys (optional but supported).
- **Child profiles:** no password/PIN, selected via avatar/name at start.

**Rationale / UX goal:** Simplest onboarding for non-technical households while keeping parent controls gated.

**Constraints:** Child profiles operate within strictly scoped educational content + policy rails; parent approval flow remains the guard for any scope change.

| Role | Permissions |
|---|---|
| **Parent (Admin)** | Policies, approvals, limits, dashboard |
| **Child (Standard)** | Can request sessions, cannot change policies |

- Parent portal requires login created at setup.
- Child device sessions run with local "child role" by default (multi-child profiles included in v1).
- Optional local speaker recognition (voice fingerprinting) can suggest who is speaking, but **all policy changes stay in parent portal**.

---

## Input Methods

- Touchscreen
- Controller
- Voice
- *(Mouse/keyboard not required)*

---

## Rewards & Motivation

- **Default screen** includes a child-selected companion character (v1: "cute dinosaur").
- **Unlockables** (cosmetics) earned through learning actions.
- **Badge strip** with empty slots that fill.
- **No streak penalties.** Rewards emphasize progress and mastery.

---

## MVP Slice (Reading-First)

- CVC blending + sight words + short comprehension
- Story engine stories: 100–200 words, controlled vocabulary
- Tap word helpers (definition + sound-it-out)
- Micro-tasks: match word→picture, rhyming, sequence 3 events
- Dashboard: word taps, rereads, misses, stuck skills

---

## Success Metrics

| Metric | What it measures |
|---|---|
| Session completion rate | Kids finish loops |
| Time-on-task | Engagement in learning sessions |
| Mastery progression | Progress per `skill_id` |
| Parent approvals | Frequency + reasons |
| Game time enforcement | No overruns |
| Latency | Wake→first response; interaction→feedback |

---

## Roadmap / Milestones

- [ ] Phase 0: Implementation-ready artifacts (JSON schemas, OpenAPI spec, engine state machines, DB migrations, prompt contracts)
- [ ] Phase 1: Repo scaffolding, Mirror Core backend, DB setup
- [ ] Phase 2: Engine 1 (Micro-Skill Drill) — reading MVP
- [ ] Phase 3: Engine 3 (Story + Micro-Tasks) — reading MVP
- [ ] Phase 4: Engine 2 (Match/Sort/Classify) — reading MVP
- [ ] Phase 5: Parent portal + approval flow
- [ ] Phase 6: Voice-first integration (OpenAI Realtime API)
- [ ] Phase 7: Ambient display (mirror/window idle mode)
- [ ] Phase 8: Android build + cross-platform testing
- [ ] Phase 9: Polish, metrics dashboard, success tracking

---

## Key Decisions

| Decision | Rationale |
|---|---|
| **TypeScript** backend (Node.js) | Shared language with frontend, type safety for deterministic engines |
| **React** frontend | Largest ecosystem, proven with Tauri, rich component libraries |
| **Tauri** desktop shell | Small footprint (~3MB), native webview, best for always-on mirror + future Pi |
| **pnpm** workspaces monorepo | Fast, strict, industry standard |
| **OpenAI Realtime API** for voice (MVP) | Low-latency speech-in/speech-out, interrupt handling |
| Cloud-only LLM for MVP | Speed + quality; offline fallback deferred |
| Deterministic engines, not LLM-driven runtime | Predictability, safety, no tangents |
| Local DB (PostgreSQL + pgvector) | Privacy, parent reads local data |
| **Stars** as reward currency | Earned by child, parent defines real-world rewards redeemable for Stars |
| Child selects game/level via AI | Agency within guardrails; parent sets curriculum, child chooses within it |

---

## References

- [Decisions Log](file:///c:/Users/rober/Documents/AI_Tutor/DECISIONS.md)
- [Architecture Spec v1](file:///c:/Users/rober/Documents/AI_Tutor/ARCHITECTURE.md)
- [Planning Review](file:///c:/Users/rober/Documents/AI_Tutor/PLANNING_REVIEW.md)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- Phi-3-mini technical report (future offline fallback candidate)
- SplashLearn / ABCya (engine inspiration, not code dependencies)
