---
allowed_tools:
  - "Bash(git:*)"
  - "Bash(python3:*)"
  - "Read(*)"
  - "TodoWrite"
---

# iKanban Git Agent

Work on: $ARGUMENTS

---

## Purpose

Complete git workflow: commit, push, merge, and mark task done.

---

## Prerequisites

Before running Git Agent, ensure:
- [ ] All tests pass (Test Agent)
- [ ] All quality checks pass (Quality Agent)
- [ ] No security issues (Security Agent)
- [ ] Code review approved (Review Agent)

---

## Workflow

### 1. Pre-flight Checks

```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban

# Verify tests pass
cd vibe-testing && npx playwright test

# Verify frontend lints
cd ../vibe-frontend && pnpm lint && pnpm check

# Verify backend lints
cd ../vibe-backend && cargo check --workspace && cargo clippy --workspace
```

### 2. Stage Changes

```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban
git status
git add <specific files>
# OR
git add .
```

### 3. Commit

```bash
git commit -m "$(cat <<'EOF'
feat: <description> (IKA-XX)

- <Change 1>
- <Change 2>
- Added Playwright tests
- Docs: <type>/IKA-XX-<feature>-flow.md, IKA-XX-<feature>-plan.md

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Commit Types:**
| Type | Use For |
|------|---------|
| feat | New feature |
| fix | Bug fix |
| refactor | Code restructure |
| test | Test additions |
| docs | Documentation |
| style | Formatting |
| chore | Maintenance |

### 4. Push Feature Branch

```bash
git push -u origin feature/IKA-XX-<feature-name>
```

### 5. Merge to Main

```bash
git checkout main
git pull origin main
git merge feature/IKA-XX-<feature-name>
git push origin main
```

### 6. Cleanup Branch

```bash
git branch -d feature/IKA-XX-<feature-name>
git push origin --delete feature/IKA-XX-<feature-name>
```

### 7. Attach Documentation

```bash
python3 /Users/rupeshpanwar/Downloads/Projects/iKanban/mcp/ikanban.py comment IKA-XX "Planning docs: <type>/IKA-XX-<feature>-flow.md, <type>/IKA-XX-<feature>-plan.md"
```

### 8. Add Summary Comment

```bash
python3 /Users/rupeshpanwar/Downloads/Projects/iKanban/mcp/ikanban.py comment IKA-XX "IKA-XX Complete: <Feature Title>

<Brief description>

What changed:
1. <Category 1>
   - Detail
2. <Category 2>
   - Detail

Technical: <key implementation details>

Tests: <test summary>"
```

### 9. Mark Task Done

```bash
python3 /Users/rupeshpanwar/Downloads/Projects/iKanban/mcp/ikanban.py update IKA-XX -s done
```

---

## Git Rules

| Rule | Reason |
|------|--------|
| Never push to main directly | Use feature branches |
| Never force push | Preserves history |
| Never skip hooks | Ensures quality |
| Always pull before merge | Prevents conflicts |
| Clean up branches | Keeps repo tidy |

---

## Conflict Resolution

If merge conflicts occur:

```bash
# View conflicts
git status

# Edit conflicting files
# Look for <<<<<<< HEAD markers

# After resolving
git add <resolved-files>
git commit -m "resolve: merge conflicts in <files>"
```

---

## Checklist

- [ ] Pre-flight checks pass
- [ ] Changes committed with proper message
- [ ] Feature branch pushed
- [ ] Merged to main
- [ ] Main pushed
- [ ] Feature branch deleted (local)
- [ ] Feature branch deleted (remote)
- [ ] Docs attached to task (comment)
- [ ] Summary comment added
- [ ] Task marked done

---

## Output

```
Git Workflow Complete: IKA-XX

Commit: abc123f
Message: feat: Add dark mode toggle (IKA-75)

Branch: feature/IKA-75-dark-mode
- Pushed: YES
- Merged to main: YES
- Deleted local: YES
- Deleted remote: YES

Task Update:
- Docs attached: YES
- Summary added: YES
- Status: done

Repository: clean, on main branch
```
