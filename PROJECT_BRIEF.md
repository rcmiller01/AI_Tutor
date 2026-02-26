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
- Full multi-child/group features (future).
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

---

## Parent Approval Flow

- Any request outside current allowed scope (topic, skill, grade band, time budget) generates a **Parent Approval Card**.
- Approval happens **only** in the Parent Portal.
- If approved, it becomes a **new session** (`skill_id` change), not a tangent inside the current loop.

---

## Identity, Roles & Enforcement

| Role | Permissions |
|---|---|
| **Parent (Admin)** | Policies, approvals, limits, dashboard |
| **Child (Standard)** | Can request sessions, cannot change policies |
| *(Future)* | Multiple children + group mode |

- Parent portal requires login created at setup.
- Child device sessions run with local "child role" by default.
- Optional local speaker recognition (voice fingerprinting) can suggest who is speaking, but **all policy changes stay in parent portal**.

---

## Input Methods

- Touchscreen
- Controller
- Voice
- *(Mouse/keyboard not required)*

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
