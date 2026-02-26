# Technical Decisions Log

> Decisions made 2026-02-25. This is the authoritative record of settled technology and design choices.

---

## Tech Stack

| Layer | Decision | Rationale |
|---|---|---|
| **Backend** | TypeScript (Node.js) | Shared language with frontend, strong type safety for deterministic engine logic, good WebSocket support |
| **Backend framework** | TBD (Fastify or Hono) | To be decided during Phase 0 scaffolding |
| **Frontend** | React | Largest ecosystem, proven with Tauri, rich component library ecosystem |
| **Desktop shell** | Tauri | Smallest footprint (~3MB), native webview, good security, best fit for always-on mirror device + future Pi evaluation |
| **Mobile** | Android WebView wrapper | Connects to Mirror Core over LAN |
| **Monorepo** | pnpm workspaces | Fast, strict, industry standard for monorepos |
| **Database** | PostgreSQL + pgvector (local) | System of record — content, telemetry, policies, embeddings |
| **Cloud AI (voice)** | OpenAI Realtime API | Low-latency speech-in/speech-out for voice interaction |
| **Cloud AI (content gen)** | Mercury2 (Inception Labs) | ~1000 tok/s diffusion LLM for fast content generation |
| **Embedding model** | TBD (likely OpenAI text-embedding-3-small) | For pgvector content retrieval |

---

## Voice

| Decision | Detail |
|---|---|
| **MVP voice mode** | OpenAI Realtime API for voice conversation (speech-in/speech-out) |
| **Content generation** | Mercury2 (Inception Labs) for fast text content generation |
| **Architecture** | Hybrid — Realtime API handles voice UX, Mercury2 handles content generation jobs |
| **Modular pipeline (Mode B)** | Deferred post-MVP |
| **Backend role** | Relay/proxy — all cloud traffic flows through Mirror Core |

---

## Reward & Gamification Model

| Element | Description |
|---|---|
| **Stars** | Primary currency — earned per correct answer / streak / mastery gate. Visible to child and parent. |
| **Parent rewards** | Parents can define real-world rewards redeemable for Stars (e.g., "50 Stars = screen time", "100 Stars = toy"). Set in Parent Portal. |
| **Sound effects** | Chimes, celebrations, streak sounds — instant audio feedback on correct/incorrect/streak/mastery. |
| **Unlockables** | Themes, characters, or visual customizations earned at Star milestones. Keeps engagement beyond individual sessions. |
| **Streak bonuses** | Multiplier on Stars for consecutive correct answers. Resets on incorrect. |

---

## Child Interaction Model

| Decision | Detail |
|---|---|
| **Game/level selection** | Child interacts with AI (voice or touch) to choose what to play, within parent-set guardrails. |
| **AI role in selection** | AI presents allowed options, helps child pick based on interests/preferences, but cannot offer anything outside parent scope. |
| **Parent role** | Sets curriculum, learning goals, allowed topics, grade bands, and time limits. Does NOT pick individual sessions. |

> This is a refinement of the original architecture: the child has agency to choose *within bounds*, rather than being assigned a fixed session. The AI acts as a friendly guide, but the Policy Engine enforces the bounds.

---

## Child Placement

| Decision | Detail |
|---|---|
| **Strategy** | Child interacts with AI at onboarding — conversational placement within parent-set grade band. AI assesses through natural interaction, not a formal quiz. |
| **Parent input** | Parent sets grade band and curriculum goals at setup. |
| **Engine behavior** | Engines start at difficulty 1 within the assessed band, auto-advance on mastery. |

---

## Decisions Still TBD

| Item | When to decide |
|---|---|
| Backend framework (Fastify vs Hono vs other) | Phase 0 scaffolding |
| Embedding model | Phase 0 (DB schema) |
| State management (React) | Phase 1 (frontend scaffolding) |
| CI/CD pipeline | Phase 1 |
| Tauri vs Electron final validation | Phase 1 (build a hello-world in Tauri first) |

---

## Mercury2 Research (2026-02-25)

### What is it?

Mercury2 is a **diffusion-based LLM** by [Inception Labs](https://inceptionlabs.ai). Instead of generating tokens one-by-one (autoregressive), it produces a rough sketch of the entire output and refines it in parallel — enabling dramatically higher throughput.

### Key specs

| Spec | Value |
|---|---|
| **Throughput** | ~1,000–1,196 tok/s |
| **Speed comparison** | ~10x Claude 4.5 Haiku (~89 tok/s), ~10x GPT 5.2 Mini (~71 tok/s) |
| **Context window** | 128,000 tokens |
| **Pricing** | $0.25/M input, $0.75/M output, $0.025/M cached input |
| **API compatibility** | OpenAI-compatible (`v1/chat/completions`) |
| **Free tier** | 10M tokens for new accounts |
| **Capabilities** | Structured JSON output, tool/function calling, complex reasoning |

### Critical finding: NOT native speech-to-speech

Mercury2 is a **text-only LLM**. It does not handle audio input or output. It requires separate STT and TTS services for any voice interaction.

### Architectural implication: Hybrid approach

This means our voice architecture becomes a **two-model system**:

| Use Case | Provider | Why |
|---|---|---|
| **Voice conversation** (child talks, system responds) | OpenAI Realtime API | Native speech-in/speech-out, low latency, interrupt handling |
| **Content generation** (stories, items, hints) | Mercury2 | ~10x faster text generation, OpenAI-compatible, cheaper |
| **Embeddings** | OpenAI text-embedding-3-small | Proven, cheap |

The OpenAI Realtime API remains the **voice interface** — the child hears and speaks through it. But when the engine needs to generate a batch of content objects (stories, drill items, match sets), Mercury2 handles that workload ~10x faster and cheaper.

### Why this is better than single-provider

- **Voice UX stays seamless** — Realtime API is purpose-built for this
- **Content pools fill faster** — Mercury2's speed means pre-generation is near-instant
- **Cost reduction** — Mercury2 is significantly cheaper for bulk text generation
- **Risk isolation** — if one provider has issues, the other still works

---

## Agreed Risk Mitigations (2026-02-25)

| Risk | Mitigation | Status |
|---|---|---|
| Android-over-LAN latency | Optimistic rendering — client shows instant visual feedback, backend confirms | ✅ Agreed |
| Realtime API + deterministic rails tension | Mirror Core as WebSocket relay, strict system prompts, function-only LLM responses, voice sandbox testing | ✅ Agreed |
| Content cold-start | Ship curated seed content for every MVP skill (min 20 items/skill) | ✅ Agreed |
| Content validation latency | Pre-generate content pools in background, engine pulls from ready pool | ✅ Agreed |
