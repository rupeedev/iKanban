---
allowed_tools:
  # Dev tools
  - "Bash(npx:*)"
  - "Bash(pnpm:*)"
  - "Bash(npm:*)"
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
  - "Glob(*)"
  - "Grep(*)"
  - "TodoWrite"
---

# iKanban Test Agent

Work on: $ARGUMENTS

---

## Purpose

Run comprehensive test suites and verify coverage.

---

## Test Location

```
/Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-testing/
└── tests/
    ├── IKA-XX-<feature>.spec.ts   # Feature-specific tests
    ├── auth.spec.ts                # Authentication tests
    ├── *.spec.ts                   # Other E2E tests
```

---

## Commands

### Run All Tests

```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-testing
npx playwright test
```

### Run Specific Test File

```bash
npx playwright test tests/IKA-XX-<feature>.spec.ts
```

### Run Tests with Browser Visible

```bash
npx playwright test --headed
```

### Run Tests with UI Debugger

```bash
npx playwright test --ui
```

### Run Tests with HTML Report

```bash
npx playwright test --reporter=html
```

### Run Tests in Specific Browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

---

## Test Categories

| Category | Pattern | Purpose |
|----------|---------|---------|
| Feature | `IKA-XX-*.spec.ts` | New feature tests |
| Auth | `auth.spec.ts` | Authentication flows |
| Smoke | `smoke.spec.ts` | Critical path tests |
| Regression | `*.spec.ts` | All tests |

---

## Expected Output

```
Running 15 tests using 4 workers

  ✓ [chromium] › tests/auth.spec.ts:5:1 › should login (2s)
  ✓ [chromium] › tests/IKA-XX-feature.spec.ts:10:1 › should do X (1s)
  ...

  15 passed (30s)
```

---

## Debugging Failures

### 1. View Test Report
```bash
npx playwright show-report
```

### 2. Run with Trace
```bash
npx playwright test --trace on
```

### 3. Run Single Test
```bash
npx playwright test -g "test name"
```

### 4. Debug Mode
```bash
npx playwright test --debug
```

---

## Coverage Requirements

| Metric | Minimum |
|--------|---------|
| All tests pass | 100% |
| Feature tests | All scenarios covered |
| Error handling | Tested |
| Edge cases | Tested |

---

## Checklist

- [ ] All tests pass
- [ ] Feature-specific tests exist (`IKA-XX-*.spec.ts`)
- [ ] Happy path tested
- [ ] Error cases tested
- [ ] No flaky tests (run 3x if unsure)

---

## Output

Report test results:
```
Test Run Complete

Summary:
- Total: 15 tests
- Passed: 15
- Failed: 0
- Skipped: 0

Feature Tests (IKA-XX):
- IKA-XX-feature.spec.ts: 5/5 passed

Duration: 45s
Browsers: chromium, firefox, webkit

Status: PASS / FAIL
```
