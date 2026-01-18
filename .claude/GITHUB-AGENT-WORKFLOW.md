# GitHub Agent Workflow

**For Claude Code running in GitHub Actions** (single-agent, no subagent spawning)

This workflow mirrors the local `/ikanban-fullstack-dev` skill but adapted for single-agent execution.

---

## Quick Reference

```
GitHub Issue/PR with @claude mention
         │
         ▼
┌─────────────────────────────────────────┐
│  1. DETECT TASK TYPE                    │
│     - fix/bug/typo → QUICK workflow     │
│     - add/implement/new → FEATURE       │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  2. READ CONTEXT FILES (in order)       │
│     - .claude/FILE-MAP.md (find paths)  │
│     - .claude/CODING-GUIDELINES.md      │
│     - .claude/PATTERNS.md (if coding)   │
│     - .claude/TECHSTACK.md (if imports) │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  3. IMPLEMENT (TDD for FEATURE)         │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  4. VALIDATION GATES (ALL MANDATORY)    │
│     - Quality: lint + type check        │
│     - Test: Playwright tests            │
│     - Review: Code review checklist     │
│     - Security: audit + secrets scan    │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  5. COMMIT & PR (never deploy)          │
│     - Create feature branch             │
│     - Push changes                      │
│     - Deployment happens on main merge  │
└─────────────────────────────────────────┘
```

---

## Task Classification

**QUICK** (skip planning, go straight to fix):
- Keywords: fix, bug, typo, update, tweak, patch
- Single file or small changes
- Clear, specific issue

**FEATURE** (full TDD workflow):
- Keywords: add, implement, create, build, new
- Multi-file changes
- New functionality

---

## Step 1: Read Context Files (MANDATORY)

Before ANY code changes, read these files in order:

```bash
# 1. Find file paths (ALWAYS FIRST - eliminates exploration)
Read .claude/FILE-MAP.md

# 2. Understand coding rules
Read .claude/CODING-GUIDELINES.md

# 3. If writing code, get patterns
Read .claude/PATTERNS.md

# 4. If imports involved
Read .claude/TECHSTACK.md
```

**DO NOT use Grep/Glob to explore the codebase** - FILE-MAP.md has all paths.

---

## Step 2: Create Feature Branch

```bash
git checkout -b <type>/IKA-XX-<description>
```

Types:
- `fix/` - Bug fixes
- `feature/` - New features
- `refactor/` - Code improvements
- `docs/` - Documentation

---

## Step 3: Implementation

### For QUICK fixes:
1. Read the specific file mentioned
2. Make the minimal change needed
3. Run validation gates

### For FEATURE work (TDD):

**3.1 Write failing test first:**
```bash
# Create test file
# Path: vibe-testing/tests/IKA-XX-<feature>.spec.ts
```

**3.2 Implement minimal code to pass:**
- Frontend: `vibe-frontend/src/`
- Backend: `vibe-backend/crates/`

**3.3 Refactor while keeping tests green**

---

## Step 4: Validation Gates (ALL MANDATORY)

Run these sequentially. **ALL must pass before commit.**

### 4.1 Quality Gate

```bash
# Frontend
cd vibe-frontend
pnpm lint --fix
pnpm format
pnpm check

# Backend
cd vibe-backend
cargo fmt --all
cargo check --workspace
cargo clippy --workspace -- -D warnings
```

**Must have ZERO warnings.**

### 4.2 Test Gate

```bash
cd vibe-testing
npx playwright test
```

**All tests must pass.**

### 4.3 Review Gate (Self-Review Checklist)

Before committing, verify:
- [ ] No unused imports or variables
- [ ] Error handling for all API calls
- [ ] React hooks follow rules (deps, no conditionals)
- [ ] Rust uses Result types appropriately
- [ ] No hardcoded secrets or credentials
- [ ] File size under 400 lines
- [ ] Code follows existing patterns

### 4.4 Security Gate

```bash
# Audit dependencies
cd vibe-frontend && pnpm audit

# Check for secrets in code
grep -rn 'password=\|secret=\|api_key=' --include='*.ts' --include='*.rs' vibe-frontend/src vibe-backend/crates || echo "No secrets found"
```

---

## Step 5: Commit & Push

### Commit Format

```bash
git add .
git commit -m "$(cat <<'EOF'
<type>: <description> (IKA-XX)

- <change 1>
- <change 2>

Co-Authored-By: Claude <claude@anthropic.com>
EOF
)"
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Push to Feature Branch

```bash
git push -u origin <branch-name>
```

---

## Important: NO Deployment from Feature Branches

**GitHub Agent should NEVER:**
- Merge directly to main
- Trigger deployment workflows
- Push to main branch

**Deployment happens automatically when:**
1. PR is reviewed and approved
2. PR is merged to main
3. GitHub Actions deploy workflows trigger on main push

---

## Validation Gate Summary

| Gate | Commands | Pass Criteria |
|------|----------|---------------|
| Quality | `pnpm lint`, `cargo check`, `cargo clippy` | Zero warnings |
| Test | `npx playwright test` | All tests pass |
| Review | Self-review checklist | All items checked |
| Security | `pnpm audit`, grep for secrets | No high vulnerabilities, no secrets |

**If ANY gate fails:** Fix the issue before committing. Do not skip gates.

---

## Files Changed Summary

When completing work, provide a summary:

```markdown
## Changes Made

**Files Modified:**
- `path/to/file.ts` - Description of change

**Tests Added:**
- `vibe-testing/tests/IKA-XX.spec.ts` - Test descriptions

**Validation Results:**
- Quality: PASS
- Tests: X passed
- Review: PASS
- Security: PASS
```

---

## Error Handling

If you encounter errors during validation:

1. **Lint errors:** Fix them, don't disable rules
2. **Type errors:** Fix types, don't use `any`
3. **Test failures:** Fix code or test, don't skip
4. **Security issues:** Report to user, don't commit

---

## MCP Task Management (if available)

If iKanban MCP is configured, use it for task updates:

```bash
# List tasks
mcp__ikanban-local__ikanban_list_issues(team="IKA")

# Update task status
mcp__ikanban-local__ikanban_update_task(task_id="...", status="inprogress")

# Add comment
mcp__ikanban-local__ikanban_add_comment(task_id="...", content="...")
```

Otherwise, work without task management - the PR description serves as documentation.
