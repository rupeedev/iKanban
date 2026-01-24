---
allowed_tools:
  # Dev tools
  - "Bash(pnpm:*)"
  - "Bash(npm:*)"
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
  - "Edit(*)"
  - "Glob(*)"
  - "Grep(*)"
  - "TodoWrite"
---

# iKanban Quality Agent

Work on: $ARGUMENTS

---

## Purpose

Ensure code quality through linting, type checking, and formatting.

---

## Project Structure

```
/Users/rupeshpanwar/Downloads/Projects/iKanban/
├── vibe-frontend/     # React/TypeScript → pnpm
└── vibe-backend/      # Rust → cargo
```

---

## Checks

### Frontend (vibe-frontend/)

```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-frontend

# 1. Lint
pnpm lint

# 2. Type check
pnpm check

# 3. Format check
pnpm format --check
```

**Auto-fix:**
```bash
pnpm lint --fix
pnpm format
```

### Backend (vibe-backend/)

```bash
cd /Users/rupeshpanwar/Downloads/Projects/iKanban/vibe-backend

# 1. Compile check
cargo check --workspace

# 2. Clippy (linter)
cargo clippy --workspace -- -D warnings

# 3. Format check
cargo fmt --all --check
```

**Auto-fix:**
```bash
cargo fmt --all
```

---

## Quality Standards

| Check | Standard | Auto-fix |
|-------|----------|----------|
| ESLint | Zero errors, zero warnings | `pnpm lint --fix` |
| TypeScript | No type errors | Manual fix |
| Prettier | Formatted | `pnpm format` |
| Cargo check | Compiles | Manual fix |
| Clippy | Zero warnings | Manual fix |
| Rustfmt | Formatted | `cargo fmt` |

---

## Checklist

- [ ] Frontend lint passes (`pnpm lint`)
- [ ] Frontend types pass (`pnpm check`)
- [ ] Frontend formatted (`pnpm format --check`)
- [ ] Backend compiles (`cargo check --workspace`)
- [ ] Backend clippy passes (`cargo clippy --workspace -- -D warnings`)
- [ ] Backend formatted (`cargo fmt --all --check`)

---

## Common Issues

| Issue | Fix |
|-------|-----|
| Unused imports | Remove them |
| Missing types | Add TypeScript types |
| Unused variables | Prefix with `_` or remove |
| Missing error handling | Add Result/Option handling |
| Console.log in code | Remove or use proper logging |

---

## Output

Report quality status:
```
Quality Check Complete

Frontend (vibe-frontend/):
- Lint: PASS (0 errors, 0 warnings)
- Types: PASS
- Format: PASS

Backend (vibe-backend/):
- Check: PASS
- Clippy: PASS (0 warnings)
- Format: PASS

Overall: PASS / FAIL
Issues fixed: <list any auto-fixed issues>
Remaining issues: <list any manual fixes needed>
```
