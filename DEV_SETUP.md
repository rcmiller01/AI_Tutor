# Developer Setup Guide

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Node.js** | ≥ 20 | [nodejs.org](https://nodejs.org) |
| **pnpm** | ≥ 8 | `npm install -g pnpm` |
| **Docker** | Latest | [docker.com](https://docker.com) |
| **Rust** _(optional, for Tauri)_ | Latest | [rustup.rs](https://rustup.rs) |

## Quick Start

```bash
# 1. Install all dependencies
pnpm install

# 2. Start Postgres (first time creates DB + runs migrations)
pnpm db:up

# 3. Start all dev servers (backend + both frontends)
pnpm dev
```

## Individual Services

```bash
# Backend only (http://localhost:3000)
pnpm dev:backend

# Child UI only (http://localhost:5173)
pnpm dev:child

# Parent Portal only (http://localhost:5174)
pnpm dev:parent
```

## Database

```bash
# Start Postgres container
pnpm db:up

# Stop Postgres container
pnpm db:down

# Connect to database
docker exec -it mirror-postgres psql -U mirror -d mirror_tutor

# Re-run migrations (destructive — drops and recreates)
pnpm db:migrate
```

## Build

```bash
# Build all packages
pnpm build

# Build shared schemas first (other packages depend on it)
pnpm build:schemas
```

## Project Structure

```
magic-mirror-tutor/
├── apps/
│   ├── child-ui/          # React child-facing app (Vite)
│   └── parent-portal/     # React parent admin portal (Vite)
├── services/
│   └── mirror-core/       # TypeScript backend (Fastify)
├── packages/
│   └── schemas/           # Shared TypeScript types
├── content/
│   └── skill-specs/       # Seed skill spec JSON files
├── docs/
│   ├── schemas/           # JSON Schema reference files
│   ├── engines/           # Engine state machine docs
│   ├── api/               # API specification
│   └── prompts/           # LLM prompt contracts
├── infra/
│   ├── db/                # SQL migrations
│   └── docker-compose.yml # Postgres dev container
├── ARCHITECTURE.md
├── DECISIONS.md
├── PROJECT_BRIEF.md
└── DEV_SETUP.md           # ← You are here
```

## Environment Variables

Copy the template and fill in your API keys:

```bash
cp infra/.env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | For voice | OpenAI Realtime API key |
| `OPENROUTER_API_KEY` | For content gen | OpenRouter API key |
| `DATABASE_URL` | Auto-set | Postgres connection string |
