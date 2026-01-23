# SCRATCHPAD - iKanban Development Notes

## Current Focus
**Date:** 2026-01-23
**Issue:** Local-to-Remote Task Sync - 404 errors on task sub-endpoints

---

## Notes

### 2026-01-23: Migration Local → Remote Analysis

**Problem:**
- Tasks created locally are NOT synced to the remote `shared_tasks` table
- When frontend calls `/api/tasks/{id}/comments|tags|links`, the `ensure_task_access` function fails
- Railway logs show: "shared task not found for access check" for task IDs like `0b561a6e-538c-49c7-a8c5-27320c3f0b0c`

**Root Cause:**
- `ensure_task_access` in `organization_members.rs` queries `shared_tasks` table
- Tasks exist only in LOCAL SQLite but never migrated to remote PostgreSQL
- All Phase 1 endpoints (comments, tags, links) depend on this access check

**Effort Estimate:**
| Work Item | Estimate |
|-----------|----------|
| Task Sync Mechanism (local→remote) | 2-3 days |
| Fix ensure_task_access (dual lookup) | 0.5 days |
| Testing & Validation | 1-2 days |
| Frontend Error Handling | 0.5 days |
| **TOTAL** | **4-6 days (~1 week)** |

**Reference:** `/Users/rupeshpanwar/Downloads/docs/docs-ikanban/migration/migration-local-2-remote.md`

**Screenshot Evidence:** Railway HTTP logs showing 404s with "shared task not found for access check"

---

## TODO
- [ ] Create Playwright tests for comments/tags/links endpoints
- [ ] Verify frontend handles 404s gracefully
- [ ] Deploy and verify fix on production

---

## Completed
- [x] Phase 1.5: Stub endpoints for task-attempts and repositories (local-only features)
- [x] Phase 2: Documents & Folders migration
- [x] Phase 3: Inbox, enhanced projects, team roles
- [x] Frontend .split() crash fix (optional chaining)
- [x] **Fix 404 on task sub-endpoints (2026-01-23)**
  - Root cause: `ensure_task_access` only checked `shared_tasks` table, but frontend tasks come from `tasks` table
  - Solution: Modified `ensure_task_access` to fall back to `tasks` table lookup via team → tenant_workspace relationship
  - Files changed:
    - `crates/remote/src/db/tasks.rs` - Added `organization_id_from_tasks_table()` function
    - `crates/remote/src/routes/organization_members.rs` - Updated `ensure_task_access()` with fallback
  - SQLx cache regenerated
