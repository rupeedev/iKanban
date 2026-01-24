---
allowed_tools:
  # Dev tools
  - "Bash(git:*)"
  - "Bash(pnpm:*)"
  - "Bash(npm:*)"
  - "Bash(npx:*)"
  - "Bash(cargo:*)"
  - "Bash(~/.cargo/bin/cargo:*)"
  # File operations (autonomous - NO rm for safety)
  - "Bash(mv:*)"
  - "Bash(cp:*)"
  - "Bash(mkdir:*)"
  - "Bash(touch:*)"
  - "Bash(ls:*)"
  - "Bash(cd:*)"
  - "Bash(cat:*)"
  # Tools
  - "Read(*)"
  - "Write(*)"
  - "Edit(*)"
  - "Glob(*)"
  - "Grep(*)"
  - "TodoWrite"
---

# iKanban TDD Agent

Work on: $ARGUMENTS

---

## Purpose

Implement features using strict Test-Driven Development (RED → GREEN → REFACTOR).

---

## Project Structure

```
/Users/rupeshpanwar/Downloads/Projects/iKanban/
├── vibe-frontend/          # React/TypeScript
├── vibe-backend/           # Rust API
└── vibe-testing/           # Playwright E2E tests
    └── tests/              # Test files here
```

---

## Steps

### 1. Create Feature Branch

```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban
git checkout main
git pull origin main
git checkout -b feature/IKA-XX-<feature-name>
```

### 2. Read Implementation Plan

Load the plan created by Plan Agent:
- `/Users/rupeshpanwar/Downloads/docs/docs-ikanban/<type>/IKA-XX-<feature>-plan.md`

### 3. RED Phase - Write Failing Tests

**Create test file:**
```bash
touch /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-testing/tests/IKA-XX-<feature>.spec.ts
```

**Test template:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('IKA-XX: <Feature Name>', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('should <expected behavior>', async ({ page }) => {
    // Arrange
    // Act
    // Assert
    await expect(page.locator('[data-testid="..."]')).toBeVisible();
  });

  test('should handle error case', async ({ page }) => {
    // Test error handling
  });
});
```

**Run tests (MUST FAIL):**
```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-testing
npx playwright test tests/IKA-XX-<feature>.spec.ts
```

### 4. GREEN Phase - Minimal Implementation

Implement the minimum code to make tests pass.

**Frontend changes (vibe-frontend/):**
```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-frontend
pnpm lint
pnpm check
```

**Backend changes (vibe-backend/):**
```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-backend
cargo check --workspace
cargo clippy --workspace
```

**Database changes (if needed):**
```bash
# Edit schema
# /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-backend/schema/schema.pg.ts

# Generate migration
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-backend/schema
npm run generate

# Update SQLx cache
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-backend/crates/db
cargo sqlx prepare
```

**Run tests (MUST PASS):**
```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-testing
npx playwright test tests/IKA-XX-<feature>.spec.ts
```

### 5. REFACTOR Phase

- Remove duplication
- Improve naming
- Simplify logic
- Keep tests green

**Run tests after each refactor:**
```bash
npx playwright test tests/IKA-XX-<feature>.spec.ts
```

---

## TDD Cycle Visualization

```
┌─────────────────────────────────────────────┐
│                TDD CYCLE                     │
├─────────────────────────────────────────────┤
│                                             │
│     ┌───────────┐                           │
│     │    RED    │ ← Write failing test      │
│     │  (fail)   │                           │
│     └─────┬─────┘                           │
│           │                                 │
│           ▼                                 │
│     ┌───────────┐                           │
│     │   GREEN   │ ← Minimal code to pass    │
│     │  (pass)   │                           │
│     └─────┬─────┘                           │
│           │                                 │
│           ▼                                 │
│     ┌───────────┐                           │
│     │ REFACTOR  │ ← Clean up, tests stay    │
│     │  (pass)   │   green                   │
│     └─────┬─────┘                           │
│           │                                 │
│           └──────── Repeat ─────────────────┤
│                                             │
└─────────────────────────────────────────────┘
```

---

## Rules

1. **Tests MUST fail first** - If test passes before implementation, test is wrong
2. **Minimal implementation** - Only write code to pass the test
3. **One test at a time** - Don't write multiple tests before implementing
4. **Keep tests green during refactor** - Run after each change
5. **Follow patterns** - Use patterns from `.claude/PATTERNS.md`

---

## Output

Report implementation status:
```
TDD Complete for IKA-XX

RED Phase:
- Created: vibe-testing/tests/IKA-XX-<feature>.spec.ts
- Tests: 3 (all failing initially)

GREEN Phase:
- Modified: <list of files>
- Tests: 3 passing

REFACTOR Phase:
- Improvements: <what was cleaned up>
- Tests: 3 still passing

Branch: feature/IKA-XX-<feature-name>
```
