# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ MANDATORY - READ BEFORE ANY TASK

**These documents MUST be read before starting any work:**

| Priority | Document | Path | Contains |
|----------|----------|------|----------|
| **1** | **WORKFLOW.md** | `.claude/WORKFLOW.md` | 8-phase TDD workflow, task management, git process |
| **2** | **CODING-GUIDELINES.md** | `.claude/CODING-GUIDELINES.md` | File size limits, lint rules, pre-commit checks |

### Key Rules (from CODING-GUIDELINES.md):
- **Max 400 lines per file** - Split into multiple files if larger
- **Zero warnings** - `cargo check` + `pnpm lint` must pass before commit
- **No unused code** - Remove unused imports, variables, functions

**Do NOT skip these documents. Violations will cause CI failures and rework.**

---

## Context Commands

| Command | Purpose |
|---------|---------|
| `/context` | Full context: project state + techstack + tasks |
| `/techstack` | Package versions, imports, env vars |
| `/patterns` | Code conventions, component patterns |
| `/api` | API endpoints, request/response formats |
| `/docs <term>` | Search project documentation |

## Tech Context Files (in .claude/)

| File | Contents | Priority |
|------|----------|----------|
| **`WORKFLOW.md`** | **8-phase TDD process, task management** | **READ FIRST** |
| **`CODING-GUIDELINES.md`** | **File limits, lint rules, pre-commit** | **READ FIRST** |
| `PROJECT.md` | Project structure, paths, commands | When starting |
| `TECHSTACK.md` | Package versions, imports, env vars | When coding |
| `PATTERNS.md` | Component, hook, handler patterns | When coding |
| `API.md` | All API endpoints with examples | Backend tasks |

### Quick Reference Files (READ when coding)

```
.claude/PROJECT.md      → Project structure, directory layout, build commands
.claude/TECHSTACK.md    → Package versions, correct imports, env variables
.claude/PATTERNS.md     → Component patterns, hooks, API handlers
.claude/API.md          → All API endpoints with request/response examples
```

## Project Documentation

**Location:** `/Users/rupeshpanwar/Documents/docs/docs-ikanban/`

- `INDEX.md` - Documentation navigation
- `PROJECT-STATUS.md` - Current project state
- `architecture/` - System design docs

## Quick Reference

**Backend:** `cd vibe-backend && cargo run --bin server`
**Frontend:** `cd vibe-frontend && pnpm dev`
**SQLx cache:** `cd vibe-backend/crates/db && cargo sqlx prepare`
**Lint:** `cd vibe-frontend && pnpm lint`

## Core Rules

- **File size**: Max 400 lines per file. Split if larger.
- **No warnings**: `cargo check` and `pnpm lint` must pass with zero warnings
- **No unused code**: Remove unused imports, variables, functions before commit
- **UI**: shadcn/ui only (`npx shadcn-ui@latest add <component>`)
- **Auth**: Clerk only (modal sign-in, not full-page)
- **SQLx types**: `DateTime<Utc>` → `TIMESTAMPTZ`, `i64` → `bigint`
- **CI**: Commit `.sqlx/` cache files (CI uses `SQLX_OFFLINE=true`)

## Progress Tracking (Automated)

**Files:** `SCRATCHPAD.md` (notes) and `plan.md` (implementation plans)

### When Starting a Task:
1. Update `SCRATCHPAD.md` → "Current Focus" with task ID and description
2. If complex feature, create plan in `plan.md` with phases and acceptance criteria
3. Use `/project:focus IKA-XX description` to automate this

### While Working:
- Add discoveries, bugs, questions to `SCRATCHPAD.md` under Notes
- Use `/project:note <observation>` to add timestamped notes
- Keep TODO list updated with `- [ ]` checkboxes

### When Finishing:
1. Check off completed items in both files
2. Add completion summary to `SCRATCHPAD.md`
3. Use `/project:done` to automate cleanup

### Available Commands:
| Command | Purpose |
|---------|---------|
| `/project:plan-feature <desc>` | Create structured plan in plan.md |
| `/project:focus <task>` | Update current focus in SCRATCHPAD.md |
| `/project:note <text>` | Add timestamped note |
| `/project:done` | Mark complete, update both files |
| `/project:review` | Review current file for issues |
| `/project:test-gen` | Generate Playwright tests |
| `/project:api-check` | Check API endpoint |
| `/project:component-check` | Check React component |

---

## /full-stack-dev Workflow (8 Phases)

When `/full-stack-dev` is invoked, follow all 8 phases in order:

| Phase | Action | Key Points |
|-------|--------|------------|
| 1 | Task Setup | Create task with `-d "description"` |
| 2 | Planning Docs | Create flow.md + plan.md in docs-ikanban |
| 3 | Feature Branch | `git checkout -b feature/IKA-XX-name` |
| 4 | Implementation | Code + lint + type check |
| 5 | Write Tests | Playwright tests in vibe-testing |
| 6 | Run Tests | All tests must pass |
| 7 | Git Merge | Push, merge to main, cleanup branch |
| 8 | Task Done | Add summary comment, then mark done |

## Task Management

```bash
# Create task (ALWAYS include description!)
python3 mcp/ikanban.py create IKA "title" -s inprogress -d "what, why, acceptance criteria"

# List tasks
python3 mcp/ikanban.py issues IKA

# Add completion summary (use COMMENT, not description update)
python3 mcp/ikanban.py comment IKA-XX "Summary: what was done, key changes, test status"

# Mark done (do NOT use -d flag here)
python3 mcp/ikanban.py update IKA-XX --status done
```

**Important:** Description is set at creation. Use comments for completion summaries.

Teams: `IKA` (frontend), `SCH` (backend)

## Detailed Rules (read when needed)

`.agent/rules/`: Agent.md, SQLxQueryCache.md, Migration.md, ui-components.md, authentication-clerk.md

## Architecture

**Backend crates:** `server`, `db`, `services`, `executors`, `deployment`, `local-deployment`, `remote`, `review`

**Frontend:** React 18, Vite, TailwindCSS v4, Zustand, TanStack Query v5

**Deploy:** GitHub Actions → Docker Hub → Railway

## Troubleshooting

**When encountering issues, ALWAYS check `.claude/lessons-learned.md` first.**

| Issue Type | Reference |
|------------|-----------|
| Backend deployment not working | `.claude/lessons-learned.md` → IKA-87 (Railway image pull) |
| New API endpoint returns 404 | `.claude/lessons-learned.md` → IKA-87 (Railway image pull) |
| SQLx migration errors | `.claude/lessons-learned.md` → VIB-70 (SQLx migrations) |
| API returns 400 Bad Request | `.claude/lessons-learned.md` → IKA-84 (URL slug vs UUID) |

**Quick deployment fix:**
```bash
# If new backend code isn't deployed, force fresh image pull:
gh workflow run quick-deploy-backend.yml --ref main -f image_tag=latest
```
