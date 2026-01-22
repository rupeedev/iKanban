# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ MANDATORY - READ BEFORE ANY TASK

**These documents MUST be read before starting any work:**

| Priority | Document | Path | Contains |
|----------|----------|------|----------|
| **1** | **FILE-MAP.md** | `.claude/FILE-MAP.md` | **Exact file paths - ELIMINATES exploration** |
| **2** | **CODING-GUIDELINES.md** | `.claude/CODING-GUIDELINES.md` | File size limits, lint rules, pre-commit checks |
| **3** | **WORKFLOW.md** | `.claude/WORKFLOW.md` | 8-phase TDD workflow, task management, git process |

### Critical: FILE-MAP.md Eliminates Exploration
- **DO NOT** use Grep/Glob to find files - paths are in FILE-MAP.md
- **DO NOT** spawn Explore agents - read FILE-MAP.md instead
- **SAVES 15-20K tokens** per task by avoiding codebase exploration

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
| **`FILE-MAP.md`** | **Exact file paths - NO exploration needed** | **READ FIRST** |
| **`CODING-GUIDELINES.md`** | **File limits, lint rules, pre-commit** | **READ FIRST** |
| **`WORKFLOW.md`** | **8-phase TDD process, task management** | **READ FIRST** |
| **`GITHUB-AGENT-WORKFLOW.md`** | **For GitHub Actions Claude agent** | **GitHub only** |
| `PROJECT.md` | Project structure, paths, commands | When starting |
| `TECHSTACK.md` | Package versions, imports, env vars | When coding |
| `PATTERNS.md` | Component, hook, handler patterns | When coding |
| `API.md` | All API endpoints with examples | Backend tasks |

### Environment-Specific Workflows

| Environment | Workflow File | Key Differences |
|-------------|---------------|-----------------|
| **Local CLI** | `WORKFLOW.md` + `/ikanban-fullstack-dev` skill | Can spawn subagents for parallel validation |
| **GitHub Actions** | `GITHUB-AGENT-WORKFLOW.md` | Single-agent, sequential validation, no merge to main |

**GitHub Agent Rules:**
- Create feature branch, push changes
- NEVER merge to main (let PR process handle it)
- Deployment triggers automatically on main merge

### Quick Reference Files (READ when coding)

```
.claude/FILE-MAP.md     → EXACT file paths, find any file WITHOUT exploration
.claude/PROJECT.md      → Project structure, directory layout, build commands
.claude/TECHSTACK.md    → Package versions, correct imports, env variables
.claude/PATTERNS.md     → Component patterns, hooks, API handlers
.claude/API.md          → All API endpoints with request/response examples
```

## Project Documentation

**Location:** `/Users/rupeshpanwar/Downloads/docs/docs-ikanban/`

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

---

## ⚠️ DATABASE MIGRATIONS - CRITICAL

**ALWAYS create PostgreSQL migrations in `crates/remote/migrations/`**

```
vibe-backend/crates/remote/migrations/   ← CORRECT (Production PostgreSQL)
vibe-backend/crates/db/migrations/       ← WRONG (Local SQLite only)
```

### Migration Directory Reference

| Directory | Database | Server | When to Use |
|-----------|----------|--------|-------------|
| `crates/remote/migrations/` | **PostgreSQL** | Remote (Railway) | **ALL production migrations** |
| `crates/db/migrations/` | SQLite | Local desktop app | Legacy local-only features |

### Creating a New Migration

```bash
# 1. Generate timestamp
date +%Y%m%d%H%M%S

# 2. Create migration file in CORRECT directory
touch vibe-backend/crates/remote/migrations/20260122XXXXXX_your_migration.sql

# 3. After writing SQL, regenerate SQLx cache
cd vibe-backend/crates/remote && cargo sqlx prepare
```

### Why This Matters

On 2026-01-22, we discovered **37 migrations were in the wrong directory** and never ran on production. This caused:
- `superadmins` table missing → superadmin features broken
- `tenant_workspaces` table missing → multi-tenancy broken
- `api_keys` table missing → MCP authentication broken
- 25+ other tables missing

**See `.claude/lessons-learned.md` → "Migrations in Wrong Directory" for full incident details.**

---

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
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "title" -s inprogress -d "what, why, acceptance criteria"

# List tasks
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py issues IKA

# Add completion summary (use COMMENT, not description update)
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py comment IKA-XX "Summary: what was done, key changes, test status"

# Mark done (do NOT use -d flag here)
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py update IKA-XX --status done
```

**Important:** Description is set at creation. Use comments for completion summaries.

Teams: `IKA` (frontend), `SCH` (backend)

## Detailed Rules (read when needed)

`.agent/rules/`: Agent.md, SQLxQueryCache.md, Migration.md, ui-components.md, authentication-clerk.md

## Architecture

**Backend crates:** `server`, `db`, `services`, `executors`, `deployment`, `local-deployment`, `remote`, `review`

**Frontend:** React 18, Vite, TailwindCSS v4, Zustand, TanStack Query v5

**Deploy:** GitHub Actions → Docker Hub → Railway

## MCP Server Configuration

### Priority Order

1. **ikanban-local** (preferred) - Uses local stdio, faster, works offline
2. **ikanban-remote** (fallback) - Uses HTTPS, requires API key, works anywhere

### Local MCP Server (ikanban-local)

Requires `VIBE_API_TOKEN` from `.env`:
```bash
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)
```

### Remote MCP Server (ikanban-remote)

The remote MCP server at `https://mcp.scho1ar.com/sse` requires API key authentication.

**Generate Your API Key:**
1. Go to **Settings → API Keys** at `app.scho1ar.com/settings/api-keys`
2. Click **+ Create API Key**
3. Name it (e.g., "my-laptop", "work-macbook")
4. Copy the generated `vk_...` key

**Client Configuration** - Add to `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "ikanban-remote": {
      "type": "http",
      "url": "https://mcp.scho1ar.com/sse",
      "authorizationToken": "vk_your_personal_key_here"
    }
  }
}
```

### Security Features (IKA-161, IKA-164)

- **Per-user API keys**: Each team member generates their own key in Settings
- **Database validation**: Keys validated against backend database (not env vars)
- **Token caching**: 5-minute cache to reduce backend load
- **Bearer token auth**: `authorizationToken` automatically sends as Bearer token
- **Health endpoint bypass**: `/health` requires no auth (for Railway health checks)

## Troubleshooting

**When encountering issues, ALWAYS check `.claude/lessons-learned.md` first.**

| Issue Type | Reference |
|------------|-----------|
| **Migration not running on prod** | **Use `crates/remote/migrations/` NOT `crates/db/migrations/`** |
| Backend deployment not working | `.claude/lessons-learned.md` → IKA-87 (Railway image pull) |
| New API endpoint returns 404 | `.claude/lessons-learned.md` → IKA-87 (Railway image pull) |
| SQLx migration errors | `.claude/lessons-learned.md` → VIB-70 (SQLx migrations) |
| API returns 400 Bad Request | `.claude/lessons-learned.md` → IKA-84 (URL slug vs UUID) |
| New table missing on production | `.claude/lessons-learned.md` → Migrations in Wrong Directory |

**Quick deployment fix:**
```bash
# If new backend code isn't deployed, force fresh image pull:
gh workflow run quick-deploy-backend.yml --ref main -f image_tag=latest
```
