---
allowed_tools:
  # Tools
  - "Read(*)"
  - "Write(/Users/rupeshpanwar/Downloads/docs/*)"
  - "Glob(*)"
  - "Grep(*)"
  - "TodoWrite"
  # File operations (autonomous - NO rm for safety)
  - "Bash(mv:*)"
  - "Bash(cp:*)"
  - "Bash(mkdir:*)"
  - "Bash(touch:*)"
  - "Bash(ls:*)"
  - "Bash(cd:*)"
  - "Bash(cat:*)"
---

# iKanban Plan Agent

Work on: $ARGUMENTS

---

## Purpose

Create planning documentation (flow diagram + implementation plan) before any code is written.

---

## Steps

### 1. Load Context

Read these files first:
- `/Users/rupeshpanwar/Downloads/Projects/iKanban/.claude/WORKFLOW.md`
- `/Users/rupeshpanwar/Downloads/Projects/iKanban/.claude/PATTERNS.md`
- `/Users/rupeshpanwar/Downloads/Projects/iKanban/.claude/PROJECT.md`

### 2. Determine Task Type

| Type | Folder | Characteristics |
|------|--------|-----------------|
| `frontend` | `docs-ikanban/frontend/` | React components, hooks, pages |
| `backend` | `docs-ikanban/backend/` | Rust API, endpoints, models |
| `integration` | `docs-ikanban/integration/` | Full-stack features |

### 3. Create Documentation Folder

```bash
mkdir -p /Users/rupeshpanwar/Downloads/docs/docs-ikanban/<type>
```

### 4. Create Flow Diagram

**Path:** `/Users/rupeshpanwar/Downloads/docs/docs-ikanban/<type>/IKA-XX-<feature>-flow.md`

**Template:**
```markdown
# IKA-XX: <Feature Name> - Flow

## TL;DR
<One line summary of the flow>

## Current State
<What exists now>

## Proposed Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Step 1 │────▶│  Step 2 │────▶│  Step 3 │
│         │     │         │     │         │
└─────────┘     └─────────┘     └─────────┘
```

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| | | |

## Sequence

1. User action → Component
2. Component → API call
3. API → Database
4. Response → UI update

## Error Handling

| Error | Handling |
|-------|----------|
| | |
```

### 5. Create Implementation Plan

**Path:** `/Users/rupeshpanwar/Downloads/docs/docs-ikanban/<type>/IKA-XX-<feature>-plan.md`

**Template:**
```markdown
# IKA-XX: <Feature Name> - Plan

## TL;DR
<One line summary>

## What We're Building

| Aspect | Detail |
|--------|--------|
| Feature | |
| User Benefit | |
| Technical Approach | |

## Files to Modify

| File | Change |
|------|--------|
| | |

## Implementation Steps

### Phase 1: Setup
- [ ] Step 1
- [ ] Step 2

### Phase 2: Core Implementation
- [ ] Step 3
- [ ] Step 4

### Phase 3: Integration
- [ ] Step 5
- [ ] Step 6

## Test Plan

| Test | Type | Expected Result |
|------|------|-----------------|
| | unit/integration/e2e | |

## Success Criteria

- [ ] Feature works as specified
- [ ] All tests pass
- [ ] No lint warnings
- [ ] Code review approved
```

---

## Rules

1. **NO CODE in planning docs** - Concepts only, not implementation
2. **Keep concise** - Flow: 50-80 lines, Plan: 60-100 lines
3. **Use tables** - Quick reference format
4. **ASCII diagrams required** - Visual flow representation
5. **Both docs required** - Flow AND plan before coding

---

## Output

Return paths to created documents:
```
Created:
- /Users/rupeshpanwar/Downloads/docs/docs-ikanban/<type>/IKA-XX-<feature>-flow.md
- /Users/rupeshpanwar/Downloads/docs/docs-ikanban/<type>/IKA-XX-<feature>-plan.md
```
