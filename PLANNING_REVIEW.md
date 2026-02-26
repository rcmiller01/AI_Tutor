# Planning Review: Open Questions & Architecture Assessment

## Architecture Verdict

> **The architecture is solid.** The deterministic spine, locked tutor rules, and engine/policy separation are well-conceived. No fundamental redesign needed. But there are **7 decisions** requiring your input, **6 design gaps** to fill, and **4 subtle risks** to address before we start building.

---

## 1) Decisions Needed (Your Call)

These are forks in the road — I need your preference before scaffolding.

### 1.1 Backend Language + Framework

The single biggest undecided choice. Affects engine runtime, API layer, ecosystem, and dev velocity.

| Option | Pros | Cons |
|---|---|---|
| **Python (FastAPI)** | Rich AI/ML ecosystem, great for LLM integrations, async support, rapid development | Slower runtime, type safety requires discipline, not ideal for real-time WebSocket heavy apps |
| **TypeScript (Fastify or Hono)** | Shared language with frontend, excellent type safety, fast, great WebSocket support | AI/ML library ecosystem less mature than Python |
| **TypeScript (Node) + Python (AI sidecar)** | Best of both — TS for the core runtime, Python for LLM/embedding jobs | Two runtimes to manage, more operational complexity |

> **My lean:** TypeScript for Mirror Core (engines are deterministic logic, great fit for TS type safety), with Python as a thin sidecar only if we need ML tooling later. But this is your call.

### 1.2 Frontend Framework

Affects UI component library, monorepo setup, and the whole dev experience.

| Option | Why it fits |
|---|---|
| **React** | Largest ecosystem, most component libraries, easiest hiring. Proven with Electron/Tauri. |
| **Svelte (SvelteKit)** | Lighter bundles (good for WebView/Pi), less boilerplate, built-in animations. |
| **Vue** | Middle ground, good ecosystem, great for smaller teams. |

> **My lean:** React (market depth + Electron/Tauri ecosystem support) or Svelte (lighter for constrained devices). Your preference?

### 1.3 Desktop Shell

| Option | Pros | Cons |
|---|---|---|
| **Tauri** | Tiny bundle (~3MB), Rust security, native webview | Younger ecosystem, Rust knowledge for plugins |
| **Electron** | Mature, massive ecosystem, Chromium guarantees | Heavy (~150MB), high RAM, poor for Pi |
| **Browser kiosk** | Zero packaging, just serve a URL | No kiosk lockdown, no offline launch |

> **My lean:** Tauri. Smaller footprint is better for always-on "mirror" device + future Pi. But Electron is the safe bet if you want max ecosystem.

### 1.4 Monorepo Tooling

The file layout (section 15) has `/apps/`, `/services/`, `/packages/` — this is a monorepo.

| Option | Notes |
|---|---|
| **pnpm workspaces** | Fast, strict, great for monorepos. Most common modern choice. |
| **Turborepo + pnpm** | Adds build caching + task orchestration on top. Good if builds get slow. |
| **npm workspaces** | Simpler, no extra tooling. Fine for smaller projects. |

> **My lean:** pnpm workspaces (possibly adding Turborepo later if needed).

### 1.5 Voice Mode for MVP

The architecture defines Mode A (Realtime API) and Mode B (modular STT→LLM→TTS pipeline). Building both doubles voice integration work.

> **Recommendation:** Pick **one** for MVP. Mode A (Realtime API) is lower-latency and more natural for voice-first. Mode B is more controllable. Which is more important to you?

### 1.6 Reward / Gamification Model

The PRD mentions "micro-rewards" and "small rewards" but the architecture doesn't define what these are. I need to know the reward vocabulary for the engines.

Options to consider:
- **Streak counters** (3 in a row → animation)
- **Stars / points per correct answer**
- **Level progression** (visual level bar per skill)
- **Sound effects** (chimes, celebrations)
- **Unlockable themes / characters** (harder, but very engaging)
- **Combination of the above**

> What does "reward" look like for your kid? This directly shapes the UI component library.

### 1.7 Child Placement Strategy

When a new child starts, how do we determine their starting difficulty level?

| Option | Notes |
|---|---|
| **Parent selects** | Parent picks grade level at setup, system starts there |
| **Start at floor** | Always start at difficulty 1, engine auto-advances on mastery |
| **Quick assessment** | Short placement quiz (5-10 questions) on first launch |

> **My lean:** Parent selects grade band at setup + start at difficulty 1 within that band. But "quick assessment" is more accurate for a boredom-prone kid who'd get frustrated being too low.

---

## 2) Architecture Gaps (Need Design, Not Preference)

These are missing pieces I'll design once the decisions above are settled.

### 2.1 Session Lifecycle Edge Cases
**Missing:** No pause/resume, no session timeout, no "app closed mid-session" handling.
**Needed:** `POST /api/sessions/{id}/pause`, auto-timeout after N minutes idle, session state snapshot for resume.

### 2.2 Content Cold-Start Problem
**Risk:** On first use of a new skill, there are zero stored content objects. If LLM generation is slow/fails, the child sees nothing.
**Fix:** Ship curated seed content for every MVP skill. LLM generation supplements the pool over time, never replaces the seed.

### 2.3 Connectivity Resilience (MVP)
**Risk:** Internet drops mid-session. Engines work without LLM (given stored content), but what about voice, new content requests, hint generation?
**Fix:** Cache sufficient content objects per skill for ~20 items ahead. If internet drops, engine runs from cache. Voice gracefully degrades to touch-only with a friendly message.

### 2.4 Embedding Model Choice
**Question:** Which model generates the pgvector embeddings for content retrieval?
**Recommendation:** OpenAI `text-embedding-3-small` (1536 dim, cheap, good quality). Embeddings generated on content creation, stored alongside content objects.

### 2.5 Logging & Observability
**Missing:** No structured logging strategy for Mirror Core.
**Needed:** Structured JSON logging, log levels, request/response tracing, voice pipeline latency tracking.

### 2.6 Developer Workflow
**Missing:** How does a dev run the full stack locally?
**Needed:** Docker Compose for Postgres + a dev script for Mirror Core + Vite dev server for frontend. Document before Phase 1 scaffolding.

---

## 3) Subtle Risks to Watch

### 3.1 Android-over-LAN Latency
Every child interaction is a server round-trip. Localhost = <5ms. WiFi/LAN = 20-100ms. For a 6-year-old tapping rapidly, this could feel laggy.
**Mitigation:** Consider "optimistic rendering" — client shows instant visual feedback (button press animation, highlight) while the backend confirms. This doesn't violate "client never decides correctness" since the backend is still source of truth.

### 3.2 Realtime API + Deterministic Rails Tension
OpenAI's Realtime API is built for open-ended conversation. Constraining it to "content generation only" requires careful system prompt + tool/function calling to prevent freeform responses. The backend must be a relay/proxy in the middle, not just a config sender.
**Mitigation:** Backend proxies all Realtime API traffic. System prompt + function definitions strictly scoped. No direct client-to-OpenAI connection.

### 3.3 Single → Multi-Child Migration
Day 1 is single child profile. But if we design `child_profile` as truly single-row and don't FK sessions/telemetry/policies to a `child_id`, the multi-child migration will be painful.
**Mitigation:** Design the schema with `child_id` FKs from Day 1, even though there's only one row. Migration cost = near zero.

### 3.4 Content Validation Latency
LLM generates content → validation pipeline checks it → retry on failure → fallback to curated. If this happens synchronously during a session, the child waits.
**Mitigation:** Pre-generate content pools asynchronously. Engine pulls from pool, pool refills in background. The child never waits for generation.

---

## 4) Remaining Documents / Systems Before Implementation

| # | Document | Purpose | When |
|---|---|---|---|
| 1 | **Tech Stack Decision Doc** | Record decisions from section 1 above | Now (this conversation) |
| 2 | **JSON Schemas** | SkillSpec, ContentObject, InteractionEvent, ScoreResult, ApprovalRequest | Phase 0 |
| 3 | **DB Schema (full DDL)** | All tables with columns, types, constraints, indexes | Phase 0 |
| 4 | **Engine State Machines** | Formal state diagrams for each engine type | Phase 0 |
| 5 | **API Specification** | OpenAPI or typed request/response schemas for all endpoints | Phase 0 |
| 6 | **Prompt Contracts** | System prompts + output schemas for each LLM content generation job | Phase 0 |
| 7 | **Seed Skill Specs** | 3-5 concrete reading skills for MVP (CVC blending, sight words, comprehension) | Phase 0 |
| 8 | **UI Wireframes / Component Specs** | What do the engine UIs actually look like? | Phase 0 or early Phase 1 |
| 9 | **Developer Setup Guide** | How to run the full stack locally | Phase 1 |
