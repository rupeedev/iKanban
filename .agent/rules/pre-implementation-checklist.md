---
description: Pre-implementation checklist to enforce proactive thinking before coding
---

# Pre-Implementation Checklist

> [!CAUTION]
> **RULE #0 - NON-NEGOTIABLE**: Before ANY implementation work, you MUST:
> 1. Read [ikanban-fullstack-dev.md](../workflows/ikanban-fullstack-dev.md)
> 2. Follow it EXACTLY - no shortcuts, no skipping steps
> 3. Create iKanban task FIRST, then feature branch

**FAILURE TO FOLLOW THE WORKFLOW = WASTED EFFORT**

---

## 0. Workflow Enforcement (MANDATORY FIRST STEP)

Before writing ANY code:

```bash
# Step 1: Create task in iKanban
export VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)
python3 /Users/rupeshpanwar/Downloads/docs/common-mcp/ikanban.py create IKA "{EPIC}-P{PHASE}-{##}: {title}" -s inprogress -d "{description}"

# Step 2: Create feature branch with IKA-XX reference
git checkout -b fix/IKA-XX-kebab-case-name  # or feature/IKA-XX-...
```

**NO CODE CHANGES ARE ALLOWED UNTIL TASK IS CREATED AND BRANCH IS CHECKED OUT**


## 1. Schema Analysis (5 min)

Before implementing any feature that touches the database:

- [ ] **Query ALL relevant tables** - Use SQL to see actual column names, types, and nullability
- [ ] **Document field formats** - Does `path` store URLs or `owner/repo`? Is it a UUID or slug?
- [ ] **Check both tables** - Data might be in `tasks` OR `shared_tasks`, `repos` OR `github_repositories`
- [ ] **Note foreign keys** - What table does `author_id` reference? `users` or `team_members`?

```sql
-- Example: Before implementing Claude assignment
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name IN ('tasks', 'shared_tasks', 'repos', 'github_repositories');
```

---

## 2. Data Flow Mapping (3 min)

Before implementing any feature with multiple steps:

- [ ] **Draw the flow** - Input → Transform 1 → Transform 2 → Output
- [ ] **Identify each transformation** - What changes at each step?
- [ ] **Note where user input appears** - Does `@claude` get stripped or preserved?

```
Example flow for Claude assignment:
Comment "@claude fix bug" 
  → Parse mention (extract @claude) 
  → Lookup task (which table?) 
  → Fetch repo (path or display_name?) 
  → Create GitHub issue (does prompt include @claude already?)
```

---

## 3. Edge Cases Specification (3 min)

For EVERY feature, identify these edge cases:

| Question | Example |
|----------|---------|
| **Null/Missing values** | What if `task.description` is null? |
| **Dual locations** | What if data is in `tasks` not `shared_tasks`? |
| **Format variations** | What if input is UUID vs slug vs URL? |
| **Duplicate data** | What if user input already contains what we're adding? |
| **Empty results** | What if query returns no rows? |

---

## 4. Type/Error Checking (2 min)

Before writing Rust code:

- [ ] **Check ApiError variants** - `grep "enum ApiError" crates/*/src/error.rs`
- [ ] **Check RequestContext fields** - `ctx.user.id` not `ctx.user_id`
- [ ] **Use FILE-MAP.md** - Don't explore, read the documented paths

---

## 5. Input/Output Contract (2 min)

Before implementing any function:

- [ ] **Define input format** - What exactly does the caller pass?
- [ ] **Define output format** - What exactly does the function return/create?
- [ ] **Document transformations** - If input is `@claude fix it`, output should be `fix it`

---

## Quick Reference: Lessons Learned

| Past Bug | Root Cause | Prevention |
|----------|-----------|------------|
| "Task not found" | Only checked `shared_tasks` | Check both `tasks` AND `shared_tasks` |
| "Invalid repo path" | Used `repos.path` (URL) instead of `display_name` | Query table first, note field formats |
| Duplicate `@claude` | Template added @claude, prompt already had it | Define input/output contract |
| Wrong migration dir | Used `crates/db/` instead of `crates/remote/` | Always use `crates/remote/migrations/` |
| ApiError::Internal | Assumed variant exists | Check error.rs before using |

---

## Template: Pre-Implementation Notes

Copy this template into your scratchpad before coding:

```markdown
## Feature: [Name]

### Schema Analysis
- Tables: 
- Key fields and formats:

### Data Flow
Input → ... → Output

### Edge Cases
1. 
2. 
3. 

### Input/Output Contract
- Input: 
- Output: 
- Transformations:
```
