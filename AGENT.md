# AGENT.md

This file provides guidance to Antigravity/Gemini agents when working with code in this repository.

This directory (`.agent/`) contains the operational rules, workflows, and technical standards for the iKanban project.

---

## 🚀 Tech Stack Overview

### Backend (Rust)
- **Framework**: Axum (web server)
- **Crates**: `remote` (main API), `db` (legacy), `executors`/`services` (business logic)
- **Database**: PostgreSQL (Supabase)
- **ORM/Query**: SQLx with offline metadata support

### Frontend (React)
- **Build Tool**: Vite
- **Styling**: TailwindCSS v4 + Vanilla CSS
- **UI Components**: **shadcn/ui only**
- **State**: Zustand (local) + TanStack Query v5 (server)
- **Auth**: Clerk (modal-based)

### Testing & Quality
- **Framework**: Playwright (`vibe-testing/`)
- **Linter**: `pnpm lint` (frontend), `cargo clippy` (backend)
- **CI/CD**: GitHub Actions → Docker Hub → Railway

## ⚠️ MANDATORY - READ & FOLLOW BEFORE ANY TASK

> [!CAUTION]
> **RULE #0 - NON-NEGOTIABLE**: Before ANY implementation work:
> 1. **Read** [.agent/workflows/ikanban-fullstack-dev.md](.agent/workflows/ikanban-fullstack-dev.md)
> 2. **Follow it EXACTLY** - no shortcuts, no skipping steps
> 3. **Create iKanban task FIRST**, then feature branch
>
> **FAILURE TO FOLLOW = WASTED EFFORT**

### Required Reading (in order)

| Priority | Document | Path | Contains |
|----------|----------|------|----------|
| **0** | **Workflow** | `.agent/workflows/ikanban-fullstack-dev.md` | Full SDLC workflow - FOLLOW THIS |
| **1** | **FILE-MAP.md** | `.claude/FILE-MAP.md` | Exact file paths - NO exploration |
| **2** | **Pre-Impl Checklist** | `.agent/rules/pre-implementation-checklist.md` | Schema, data flow, edge cases |
| **3** | **Lessons Learned** | `.claude/lessons-learned.md` | Past incidents - avoid repeating |

---

## Workflow Summary

```
1. Read ikanban-fullstack-dev.md
         ↓
2. Create iKanban task via CLI  →  IKA-XXX
         ↓
3. Create feature branch  →  fix/IKA-XXX-name
         ↓
4. Complete pre-implementation checklist
         ↓
5. Implement
         ↓
6. Run validation gates (Quality, Test, Review, Security)
         ↓
7. Commit with IKA-XXX reference
         ↓
8. Update task status to "done"
```

**NO STEP CAN BE SKIPPED.**

---

## Task Management

```bash
# Load token
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)

# Create task
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "{EPIC}-P{PHASE}-{##}: {title}" -s inprogress -d "{description}"

# Create branch
git checkout -b fix/IKA-XX-kebab-case-name

# Update task when done
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py update IKA-XX -s done
```

---

## Critical Rules

| Rule | Description |
|------|-------------|
| **Migrations** | Use `crates/remote/migrations/` NOT `crates/db/migrations/` |
| **SQLx cache** | Run `cargo sqlx prepare` after query changes, commit `.sqlx/` |
| **File size** | Max 400 lines per file |
| **Zero warnings** | `cargo check` + `pnpm lint` must pass |
| **No exploration** | Use FILE-MAP.md to find paths |

---

## Pre-Implementation Checklist (Summary)

Before writing code, verify:

- [ ] Schema analyzed (query tables, note field formats)
- [ ] Data flow mapped (input → transforms → output)
- [ ] Edge cases specified (null, dual tables, format variations)
- [ ] Types verified (ApiError variants, RequestContext fields)
- [ ] Input/output contract defined

---

## Quick Reference

```
Backend:    cd vibe-backend && cargo run --bin server
Frontend:   cd vibe-frontend && pnpm dev
SQLx:       cd vibe-backend/crates/remote && cargo sqlx prepare
Lint:       cd vibe-frontend && pnpm lint
```

---

## Detailed Documentation

| Topic | Location |
|-------|----------|
| Full workflow | `.agent/workflows/ikanban-fullstack-dev.md` |
| All rules | `.agent/rules/` |
| Code patterns | `.claude/PATTERNS.md` |
| API endpoints | `.claude/API.md` |
| Tech stack | `.claude/TECHSTACK.md` |
| Past incidents | `.claude/lessons-learned.md` |
