---
allowed_tools:
  - "Task"
  - "TodoWrite"
  - "Read(*)"
  - "Write(*)"
  - "Edit(*)"
  - "Glob(*)"
  - "Grep(*)"
  # File operations (autonomous - NO rm for safety)
  - "Bash(mv:*)"
  - "Bash(cp:*)"
  - "Bash(mkdir:*)"
  - "Bash(touch:*)"
  - "Bash(ls:*)"
  - "Bash(cd:*)"
  - "Bash(cat:*)"
  # Dev tools
  - "Bash(git:*)"
  - "Bash(python3:*)"
  - "Bash(pnpm:*)"
  - "Bash(npm:*)"
  - "Bash(npx:*)"
  - "Bash(cargo:*)"
  - "Bash(~/.cargo/bin/cargo:*)"
---

# iKanban Full-Stack Development

Work on: $ARGUMENTS

---

> [!IMPORTANT]
> ## GitHub Actions Adaptation
> 
> **If running in GitHub Actions (via `claude-code-action`):**
> 
> 1. **Single-agent mode** - You cannot spawn Task() subagents
> 2. **No MCP** - Skip MCP task management, use the issue metadata instead
> 3. **No local paths** - Use relative paths from repo root
> 4. **Run validations sequentially** - Not in parallel
> 5. **Create feature branch, push, create PR** - NEVER merge to main
> 6. **Post results as issue comment** - Let user know what you did
> 
> **Adapted workflow for GitHub:**
> ```
> 1. Read context files (.claude/FILE-MAP.md, etc.)
> 2. Classify task (QUICK vs FEATURE)
> 3. Create feature branch
> 4. Implement the fix/feature
> 5. Run validation gates sequentially
> 6. Commit and push to feature branch
> 7. Post summary comment on the issue
> ```

---

## MCP Task Management

### Priority Order
1. **ikanban-local** (preferred) - Use MCP tools like `mcp__ikanban-local__ikanban_*`
2. **ikanban-remote** (fallback) - If local fails, use remote MCP
3. **ikanban.py CLI** (last resort) - Direct script if MCP unavailable

### Using MCP Tools (Preferred)

**First, try the local MCP tools:**
```
mcp__ikanban-local__ikanban_list_issues(team="IKA")
mcp__ikanban-local__ikanban_create_issue(team="IKA", title="...", description="...", status="inprogress")
mcp__ikanban-local__ikanban_update_task(task_id="...", status="done")
```

**If local MCP fails, try remote MCP (same tool names, automatically routes).**

### Fallback: CLI Script

If MCP is unavailable, use the CLI script with `VIBE_API_TOKEN`:

```bash
# Load token
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)

# List tasks
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py issues IKA

# Create task
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "title" -s inprogress -d "description"

# Update task status
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py update IKA-XX -s done
```

### Troubleshooting: "project does not belong to this team"

If you get this error when creating tasks, the `teams-config.json` may have outdated project IDs.

**Fix: Fetch actual project IDs from the API:**
```bash
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)

# Get IKA team projects (team_id from teams-config.json)
curl -s -H "Authorization: Bearer $VIBE_API_TOKEN" \
  "https://api.scho1ar.com/api/teams/a263e43f-43d3-4af7-a947-5f70e6670921/projects" | python3 -m json.tool

# Then use the correct project ID explicitly:
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "title" \
  --project <actual-project-uuid> -s inprogress -d "description"
```

**Full documentation:** `/Users/rupeshpanwar/Downloads/docs/common-mcp/how-to-use-ikanban-mcp.txt`

---

## Remote MCP Server Setup (for team members)

**Generate Your API Key:**
1. Go to **Settings → API Keys** at `app.scho1ar.com/settings/api-keys`
2. Click **+ Create API Key**
3. Copy the generated `vk_...` key

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

### Security Features
- **Per-user keys**: Each team member has their own API key
- **Database validation**: Keys validated against backend (not env vars)
- **Token caching**: 5-minute cache to reduce backend load

---

## STEP 0: READ FILE-MAP.md FIRST (MANDATORY)

**BEFORE doing ANYTHING, read this file to find exact paths:**
```
Read(.claude/FILE-MAP.md)
```

This file contains:
- Exact file paths for all pages, components, routes
- Quick lookup by feature
- NO exploration/grep needed - just look up the path

**Token savings: ~15-20K by eliminating exploration**

---

## STEP 1: Detect Task Type

Analyze the request and classify:

| Type | Keywords | Skips | Keeps |
|------|----------|-------|-------|
| **QUICK** | fix, typo, bug, update, tweak | Plan + TDD agents | Task + Validation + Git |
| **FEATURE** | add, implement, create, build, new | Nothing | All agents |

**Decision rule:** QUICK skips planning/TDD but **ALWAYS runs validation gates** (Quality, Test, Review, Security)

---

## QUICK WORKFLOW (Skip Plan + TDD + Exploration)

For simple fixes - **NO exploration agents, NO context gathering:**
- Skip planning docs
- Skip TDD cycle
- Skip codebase exploration (context is already in `.claude/`)
- KEEP security/quality gates

### 1. Create Task + Feature Branch (Direct Bash - ~500 tokens)

**DO NOT spawn Task agent.** Run these Bash commands directly:

**Title Format:** `{EPIC}-P{PHASE}-{TASK#}: {Description}`
- EPIC = Feature/module being worked on (derive from the task context):
  - `FRONTEND` - UI components, pages, styling
  - `BACKEND` - API routes, services, database
  - `AGENT` - AI agent features
  - `PROJECTS` - Project management features
  - `DOCUMENTS` - Document handling
  - `TEAMS` - Team/workspace features
  - `AUTH` - Authentication/authorization
  - `INFRA` - Infrastructure, deployment
- PHASE = Implementation phase (P1 = Foundation, P2 = Core, P3 = Polish)
- TASK# = Two-digit number (01, 02, etc.)

```bash
# Step 1: Load token and create the task
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "{EPIC}-P{PHASE}-{##}: {title}" -s inprogress -d "{description}"

# Step 2: Parse IKA-XX from output, then create branch
git checkout -b fix/IKA-XX-<kebab-case-name>
```

**Description Template:**
```
## Schema (if applicable)
- Field/table changes required

## Implementation
- Step-by-step guidance

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Files to Modify
- path/to/file1.ts
- path/to/file2.rs

## Reference
- Link to strategy/design doc
```

**Example:**
```bash
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "UI-P1-01: Fix button alignment on mobile" -s inprogress -d "## Implementation
Fix CSS flexbox alignment for submit button on mobile viewport

## Acceptance Criteria
- [ ] Button properly aligned on all screen sizes
- [ ] No layout shift on mobile (<768px)

## Files to Modify
- vibe-frontend/src/components/forms/SubmitButton.tsx

## Reference
- Design spec: docs-ikanban/ui/mobile-responsive.md"

# Output: Created IKA-143
git checkout -b fix/IKA-143-button-alignment
```

### 2. You Fix Directly (NO exploration, NO agents)

**CRITICAL - DO NOT:**
- ❌ Spawn Task/Explore agents to understand the codebase
- ❌ Do multi-file searches to "gather context"
- ❌ Read documentation files to "understand the structure"

**DO:**
- ✅ Read `.claude/CODING-GUIDELINES.md` first (lint rules, file size limits)
- ✅ Read `.claude/PATTERNS.md` if you need code patterns
- ✅ Read `.claude/TECHSTACK.md` if fix involves imports/dependencies
- ✅ Read the SPECIFIC file mentioned in the request directly with `Read`
- ✅ Use `Grep` only for the exact symbol/string you need to change
- ✅ Make the fix using `Edit` tool immediately

**Context files (read in order):**
```
1. .claude/FILE-MAP.md           ← ALWAYS FIRST (find file paths - NO exploration!)
2. .claude/CODING-GUIDELINES.md  ← ALWAYS (lint, file size rules)
3. .claude/PATTERNS.md           ← If need code patterns
4. .claude/TECHSTACK.md          ← If fix involves imports
```

**Key point:** FILE-MAP.md tells you exactly where to find files. DO NOT use Grep/Glob to search.

### 3. Validation Agents (PARALLEL - MANDATORY)
**These ALWAYS run - never skip security/quality gates:**

Spawn ALL 4 in ONE message:
```
# Quality
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Quality check",
  prompt: "In /Users/rupeshpanwar/Downloads/Projects/iKanban run: cd vibe-frontend && pnpm lint --fix && pnpm format && pnpm check; cd ../vibe-backend && cargo fmt --all && cargo check --workspace && cargo clippy --workspace -- -D warnings. Fix issues. Report PASS/FAIL."
)

# Test
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Run tests",
  prompt: "cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-testing && npx playwright test. Report pass/fail count."
)

# Review
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Code review",
  prompt: "Review git diff in /Users/rupeshpanwar/Downloads/Projects/iKanban. Check: DRY, error handling, React hooks, Rust Result types. Report only issues found."
)

# Security
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Security scan",
  prompt: "In /Users/rupeshpanwar/Downloads/Projects/iKanban: cd vibe-frontend && pnpm audit; grep -rn 'password=\\|secret=' --include='*.ts' --include='*.rs' vibe-frontend/src vibe-backend/crates 2>/dev/null || echo 'No secrets'. Report PASS/FAIL."
)
```

### 4. Git Agent (haiku)
```
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Git merge",
  prompt: "In /Users/rupeshpanwar/Downloads/Projects/iKanban: git add . && git commit -m 'fix: IKA-XX <desc>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>' && git push -u origin fix/IKA-XX-<name> && git checkout main && git pull && git merge fix/IKA-XX-<name> && git push && git branch -d fix/IKA-XX-<name>. Then: export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2) && python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py update IKA-XX -s done"
)
```

---

## FEATURE WORKFLOW (Full SDLC)

For new features, spawn agents with haiku where possible:

### 1. Create Task + Feature Branch (Direct Bash - ~500 tokens)

**DO NOT spawn Task agent.** Run these Bash commands directly:

**Title Format:** `{EPIC}-P{PHASE}-{TASK#}: {Description}`
- EPIC = Feature/module being worked on (derive from the task context):
  - `FRONTEND` - UI components, pages, styling
  - `BACKEND` - API routes, services, database
  - `AGENT` - AI agent features
  - `PROJECTS` - Project management features
  - `DOCUMENTS` - Document handling
  - `TEAMS` - Team/workspace features
  - `AUTH` - Authentication/authorization
  - `INFRA` - Infrastructure, deployment
  - `TENANCY` - Multi-tenancy features
- PHASE = Implementation phase (P1 = Foundation, P2 = Core, P3 = Polish)
- TASK# = Two-digit number (01, 02, etc.)

```bash
# Step 1: Load token and create the task (extract title from $ARGUMENTS)
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "{EPIC}-P{PHASE}-{##}: {title}" -s inprogress -d "{description}"

# Step 2: Parse IKA-XX from output, then create branch
git checkout -b feature/IKA-XX-<kebab-case-name>
```

**Description Template (FEATURE tasks require all sections):**
```
## Schema (if applicable)
- New tables/columns required
- Migration steps

## Implementation
- Phase breakdown with steps
- Architecture decisions

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Files to Create/Modify
- path/to/new-file.ts (create)
- path/to/existing-file.rs (modify)

## Reference
- Strategy doc: docs-ikanban/feature/strategy.md
- Design spec: docs-ikanban/feature/design.md
```

**Example:**
```bash
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "THEME-P1-01: Add dark mode toggle to settings" -s inprogress -d "## Schema
- Add 'theme_preference' column to user_settings table (enum: light, dark, system)

## Implementation
1. Create ThemeContext provider
2. Add toggle component to settings page
3. Persist selection to localStorage + backend
4. Apply CSS variables based on theme

## Acceptance Criteria
- [ ] Toggle visible in settings page
- [ ] Theme persists across sessions
- [ ] All components respect theme variables
- [ ] System preference detected on first load

## Files to Create/Modify
- vibe-frontend/src/contexts/ThemeContext.tsx (create)
- vibe-frontend/src/components/settings/ThemeToggle.tsx (create)
- vibe-frontend/src/pages/Settings.tsx (modify)
- vibe-backend/crates/api/src/user_settings.rs (modify)

## Reference
- Strategy: docs-ikanban/ui/theme-strategy.md"

# Output: Created IKA-144
git checkout -b feature/IKA-144-dark-mode-toggle
```

### 2. Plan Agent (haiku)
```
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Create plan docs",
  prompt: "For IKA-XX create in /Users/rupeshpanwar/Downloads/docs/docs-ikanban/<frontend|backend>/: 1) IKA-XX-flow.md with ASCII diagram 2) IKA-XX-plan.md with files to change, implementation steps, test scenarios. Task: $ARGUMENTS"
)
```

### 3. TDD Agent (sonnet - needs code generation)
```
Task(
  subagent_type: "general-purpose",
  description: "TDD implementation",
  prompt: "Implement IKA-XX with TDD in /Users/rupeshpanwar/Downloads/Projects/iKanban:
(Branch already created in Step 1 - verify you're on feature/IKA-XX-<name>)
1. Write failing test in vibe-testing/tests/IKA-XX.spec.ts
2. Implement minimal code to pass (frontend: vibe-frontend, backend: vibe-backend)
3. Refactor, keep tests green
4. Run: pnpm lint && cargo check --workspace
Read .claude/PATTERNS.md for code patterns. Task: $ARGUMENTS"
)
```

### 4. Validation Agents (PARALLEL - all haiku)

Spawn ALL 4 in ONE message:

```
# Quality
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Quality check",
  prompt: "In /Users/rupeshpanwar/Downloads/Projects/iKanban run: cd vibe-frontend && pnpm lint --fix && pnpm format && pnpm check; cd ../vibe-backend && cargo fmt --all && cargo check --workspace && cargo clippy --workspace -- -D warnings. Fix issues. Report PASS/FAIL."
)

# Test
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Run tests",
  prompt: "cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-testing && npx playwright test. Report pass/fail count."
)

# Review
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Code review",
  prompt: "Review git diff in /Users/rupeshpanwar/Downloads/Projects/iKanban. Check: DRY, error handling, React hooks, Rust Result types. Report only issues found."
)

# Security
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Security scan",
  prompt: "In /Users/rupeshpanwar/Downloads/Projects/iKanban: cd vibe-frontend && pnpm audit; grep -rn 'password=\\|secret=' --include='*.ts' --include='*.rs' vibe-frontend/src vibe-backend/crates 2>/dev/null || echo 'No secrets'. Report PASS/FAIL."
)
```

### 5. Git Agent (haiku)
```
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Git merge",
  prompt: "In /Users/rupeshpanwar/Downloads/Projects/iKanban: git add . && git commit -m 'feat: IKA-XX <desc>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>' && git push -u origin feature/IKA-XX-<name> && git checkout main && git pull && git merge feature/IKA-XX-<name> && git push && git branch -d feature/IKA-XX-<name>. Then: export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2) && python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py update IKA-XX -s done"
)
```

---

## Workflow Summary

```
$ARGUMENTS
    │
    ▼
┌─────────────────────────────────┐
│  STEP 0: Read FILE-MAP.md       │  ← MANDATORY! Find file paths
│  (Saves 15-20K tokens)          │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  STEP 1: Detect Type            │
│  fix/bug/typo → QUICK           │
│  add/implement/new → FEATURE    │
└─────────────────────────────────┘
    │
    ├── QUICK ────────────────────────────────────────┐
    │   1. Task + Branch (Bash) ─── ~500              │  ← DIRECT BASH!
    │   2. You fix directly ─────── ~3K               │  ← NO EXPLORATION
    │   3. Quality+Test+Review+Security (haiku) ─ ~5K │  ← NEVER SKIPPED
    │   4. Git Agent (haiku) ────── ~2K               │
    │   Total: ~10K tokens                            │
    │                                                 │
    └── FEATURE ──────────────────────────────────────┤
        1. Task + Branch (Bash) ─── ~500              │  ← DIRECT BASH!
        2. Plan Agent (haiku) ───── ~3K               │
        3. TDD Agent (sonnet) ───── ~20K              │
        4. Quality+Test+Review+Security (haiku) ─ ~5K │  ← NEVER SKIPPED
        5. Git Agent (haiku) ─────── ~2K              │
        Total: ~30K tokens                            │
                                                      │
                                    ◄─────────────────┘
                                    │
                                    ▼
                              Task Complete
```

---

## SDLC Gates (ALWAYS ENFORCED)

| Gate | Agent | Purpose | Skippable? |
|------|-------|---------|------------|
| Quality | haiku | Lint, type check, format | **NO** |
| Test | haiku | Run Playwright tests | **NO** |
| Review | haiku | Code review | **NO** |
| Security | haiku | Audit, secrets scan | **NO** |

**Every change goes through all 4 validation gates before merge.**

---

## Token Budget

| Workflow | Task Creation | Agents | Validation Gates | Total Tokens |
|----------|--------------|--------|------------------|--------------|
| **QUICK** | Direct Bash (~500) | 5 (haiku) | ✅ All 4 | ~10K |
| **FEATURE** | Direct Bash (~500) | 6 (5 haiku + 1 sonnet) | ✅ All 4 | ~30K |

Previously: ~100K+ tokens per task
After Task agent optimization: Saved ~1.5K tokens by using direct Bash instead of Task agent

---

## Rules

1. **Always classify first** - QUICK vs FEATURE
2. **QUICK = skip Plan + TDD + Exploration** - Use prepared context in `.claude/`, no Task/Explore agents
3. **FEATURE = full workflow** - Plan → TDD → Validate → Git
4. **NEVER skip validation** - Quality, Test, Review, Security run for ALL changes
5. **Parallel validation** - Spawn all 4 validation agents together
6. **No merge without gates passing** - All 4 must PASS before Git agent runs
7. **Context is prepared** - Read directly from `.claude/` in order:
   1. `FILE-MAP.md` (ALWAYS FIRST) - exact file paths, NO exploration needed
   2. `CODING-GUIDELINES.md` (always) - lint, file size
   3. `PATTERNS.md` (if need patterns)
   4. `TECHSTACK.md` (if imports involved)

---

## Project Paths (Reference)

```
/Users/rupeshpanwar/Downloads/Projects/iKanban/
├── vibe-frontend/     # React/TypeScript
├── vibe-backend/      # Rust
├── vibe-testing/      # Playwright tests
├── (mcp moved to /Users/rupeshpanwar/Downloads/docs/common-mcp/)
└── .claude/           # Context files (READ THESE, don't explore!)
    ├── CODING-GUIDELINES.md  # 1. Rules
    ├── FILE-MAP.md           # 2. File locations
    ├── PATTERNS.md           # 3. Code patterns
    ├── TECHSTACK.md          # 4. Imports
    ├── PROJECT.md            # Project info
    └── API.md                # API endpoints
```
