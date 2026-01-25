# vibe-check

Quality checker for full-stack projects (Rust + TypeScript/React).

Auto-detects your stack and runs the appropriate linters, formatters, and type checkers.

## Installation

```bash
# From PyPI (when published)
pip install vibe-check

# From source
cd tools/vibe-check
pip install -e .
```

## Usage

```bash
# Run all quality checks (auto-detects stack)
vibe-check

# Run specific checks
vibe-check --frontend    # Only frontend (pnpm lint, pnpm check)
vibe-check --backend     # Only backend (cargo fmt, cargo check, cargo clippy)

# Fix issues automatically where possible
vibe-check --fix

# Check specific directory
vibe-check --path /path/to/project

# Verbose output
vibe-check -v
```

## Supported Stacks

### Frontend
- **pnpm** (detected via `pnpm-lock.yaml`)
- **npm** (detected via `package-lock.json`)
- **yarn** (detected via `yarn.lock`)

### Backend
- **Rust/Cargo** (detected via `Cargo.toml`)

## Checks Performed

### Frontend (TypeScript/React)
| Check | Command | Purpose |
|-------|---------|---------|
| Lint | `pnpm lint` | ESLint rules |
| Type Check | `pnpm check` | TypeScript compilation |
| Format | `pnpm format` | Prettier (with --fix) |

### Backend (Rust)
| Check | Command | Purpose |
|-------|---------|---------|
| Format | `cargo fmt --check` | Rustfmt |
| Compile | `cargo check` | Compilation errors |
| Lint | `cargo clippy -- -D warnings` | Clippy lints |

## Configuration

Create a `.vibecheck.toml` in your project root (optional):

```toml
[frontend]
path = "vibe-frontend"
package_manager = "pnpm"  # auto, pnpm, npm, yarn

[backend]
path = "vibe-backend"

[checks]
frontend = true
backend = true
fix = false
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | One or more checks failed |
| 2 | Configuration or detection error |

## License

MIT
