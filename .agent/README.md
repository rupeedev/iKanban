# iKanban Project Guidelines & Tech Stack

This directory contains the operational rules, workflows, and technical standards for the iKanban project.

## 🚀 Tech Stack Overview

### Backend (Rust)
- **Framework**: Axum (web server).
- **Crates**:
    - `remote`: The main API server (`api.scho1ar.com`).
    - `db`: Database utilities (legacy).
    - `executors` / `services`: Core business logic.
- **Database**: PostgreSQL (hosted on Supabase).
- **ORM/Query**: SQLx with offline metadata support.

### Frontend (React)
- **Build Tool**: Vite.
- **Styling**: TailwindCSS v4 + Vanilla CSS.
- **UI Components**: strictly **shadcn/ui** only.
- **State Management**: Zustand (local) + TanStack Query v5 (server state).
- **Authentication**: Clerk (modal-based).

### Testing & Quality
- **Framework**: Playwright (located in `vibe-testing/`).
- **Linter**: `pnpm lint` (frontend), `cargo clippy` (backend).
- **CI/CD**: GitHub Actions → Docker Hub → Railway.

---

## 🛠️ Critical Rules & Workflows

### 1. Database Migrations
**MANDATORY**: All migrations must be placed in:
`vibe-backend/crates/remote/migrations/`
*Do NOT use `crates/db/migrations/` (legacy/ignored).*

### 2. SQLx Offline Sync
After any change to SQL queries or migrations, you **MUST** regenerate the query cache:
```bash
cd vibe-backend/crates/remote
cargo sqlx prepare
```
Ensure the `.sqlx/` directory is committed; the CI relies on it for offline validation.

### 3. Agent Documentation (`.claude/`)
Always reference these files to reduce token usage and ensure accuracy:
- `FILE-MAP.md`: Exact file paths (prevents manual exploration).
- `CODING-GUIDELINES.md`: Max 400 lines per file, zero-warning policy.
- `API.md`: Current endpoint definitions.
- `lessons-learned.md`: History of past deployment and configuration issues.

### 4. Git & Branching
1. Always work in a **feature branch** (`feature/IKA-XX` or `fix/IKA-XX`).
2. Run `cargo check` and `pnpm lint` before pushing.
3. Merge to `main` only after local verification.

### 5. Task Management
Use the provided workflows in `.agent/workflows/` and keep progress tracked in:
- `SCRATCHPAD.md`: For temporary notes and focus.
- `task.md` / `implementation_plan.md`: For structured work tracking.
