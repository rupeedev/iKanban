---
allowed_tools:
  - "Read(*)"
  - "Glob(*)"
  - "Grep(*)"
  - "TodoWrite"
---

# iKanban Review Agent

Work on: $ARGUMENTS

---

## Purpose

Perform thorough code review to ensure quality, maintainability, and adherence to project standards.

---

## Review Areas

### 1. Code Quality

| Principle | Check |
|-----------|-------|
| DRY | No duplicate code |
| SRP | Each function does one thing |
| KISS | Simple solutions preferred |
| Naming | Clear, descriptive names |
| Comments | Only where necessary |

### 2. Architecture

**Frontend (React/TypeScript):**
- [ ] Components are small and focused
- [ ] Hooks follow rules of hooks
- [ ] State management is appropriate
- [ ] Props are properly typed
- [ ] No prop drilling (use context where needed)

**Backend (Rust):**
- [ ] Proper error handling with Result/Option
- [ ] No unwrap() in production code
- [ ] Async code is properly handled
- [ ] Database queries are efficient
- [ ] API responses are properly typed

### 3. Error Handling

| Language | Pattern |
|----------|---------|
| TypeScript | try/catch, error boundaries |
| Rust | Result<T, E>, Option<T>, ? operator |

### 4. Performance

- [ ] No N+1 queries
- [ ] Proper use of useMemo/useCallback
- [ ] No unnecessary re-renders
- [ ] Efficient database queries
- [ ] No blocking operations in async code

### 5. Testing

- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Tests are readable
- [ ] No test duplication

---

## Review Checklist

### Files to Review

Read these context files first:
- `/Users/rupeshpanwar/Downloads/Projects/iKanban/.claude/PATTERNS.md`
- `/Users/rupeshpanwar/Downloads/Projects/iKanban/.claude/CODING-GUIDELINES.md`

### Frontend Review

```
/Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-frontend/
├── src/
│   ├── components/    # Check: composition, props
│   ├── hooks/         # Check: rules of hooks
│   ├── pages/         # Check: routing, layout
│   └── lib/           # Check: utilities
```

### Backend Review

```
/Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-backend/
├── crates/
│   ├── api/           # Check: endpoint handlers
│   ├── db/            # Check: queries, models
│   └── common/        # Check: shared utilities
```

---

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| Critical | Security issue, data loss risk | MUST fix |
| High | Bug, incorrect behavior | MUST fix |
| Medium | Code smell, maintainability | SHOULD fix |
| Low | Style, minor improvement | NICE to fix |

---

## Review Template

```markdown
## Code Review: IKA-XX

### Summary
<Brief overview of changes reviewed>

### Findings

#### Critical
- None / <list items>

#### High
- None / <list items>

#### Medium
- None / <list items>

#### Low
- None / <list items>

### Positives
- <What was done well>

### Recommendations
- <Suggestions for improvement>

### Verdict
APPROVED / NEEDS CHANGES / BLOCKED
```

---

## Output

```
Code Review Complete: IKA-XX

Files Reviewed: 8
Lines Changed: 245

Findings:
- Critical: 0
- High: 0
- Medium: 2
- Low: 3

Details:
[Medium] src/components/Button.tsx:25 - Consider extracting repeated styles
[Medium] crates/api/src/handlers.rs:42 - Missing error logging
[Low] src/hooks/useData.ts:10 - Could use more descriptive variable name
[Low] src/pages/Home.tsx:5 - Unused import
[Low] crates/db/src/queries.rs:18 - Consider adding doc comment

Verdict: APPROVED with suggestions
```
