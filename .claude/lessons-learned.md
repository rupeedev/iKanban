# Lessons Learned - Critical Incidents

This document captures critical lessons from past incidents to prevent future mistakes.

---

## Incident: VIB-70 SQLx Migration Disaster (2026-01-04)

### What Happened

While working on VIB-70 (project member allocation), multiple critical mistakes were made that caused hours of debugging and data loss:

1. **Modified an existing migration file** instead of creating a new one
2. **Fixed the wrong database** - spent hours fixing `~/Library/Application Support/` when dev mode uses `dev_assets/db.sqlite`
3. **Deleted database multiple times** causing data loss
4. **Renamed migration file** which made things worse (VersionMissing vs VersionMismatch errors)

### Root Causes

#### 1. Modifying Existing Migration Files

**NEVER modify an existing migration file.** SQLx embeds migration checksums at compile time. If you modify a migration:
- The checksum in the compiled binary won't match the file on disk
- You get `VersionMismatch` errors
- The only "fix" is deleting the database or complex manual repairs

**Correct approach:** Always create a NEW migration file to alter tables:
```sql
-- 20260105000000_fix_project_members.sql (NEW FILE)
ALTER TABLE project_members ADD COLUMN new_field TEXT;
-- or recreate table with new schema
```

#### 2. Not Understanding Dev vs Release Database Paths

In this project, the database location depends on build mode:

| Build Mode | Database Location |
|------------|-------------------|
| **Debug** (`cargo build`) | `dev_assets/db.sqlite` |
| **Release** (`cargo build --release`) | `~/Library/Application Support/ai.bloop.vibe-kanban/db.sqlite` |

This is defined in `crates/utils/src/assets.rs`:
```rust
pub fn asset_dir() -> std::path::PathBuf {
    if cfg!(debug_assertions) {
        // Debug mode - uses dev_assets/
        std::path::PathBuf::from(PROJECT_ROOT).join("../../dev_assets")
    } else {
        // Release mode - uses Application Support
        ProjectDirs::from("ai", "bloop", "vibe-kanban")...
    }
}
```

**Always verify which database you're working with!**

#### 3. Database Shared Across Git Branches

The `dev_assets/db.sqlite` file is NOT in `.gitignore` and persists across branch switches. This causes problems:

- Branch A creates migration 123 → runs → recorded in db
- Switch to Branch B (doesn't have migration 123)
- Backend fails: `VersionMissing(123)`

**Solutions:**
- Use separate databases per feature branch, OR
- Before switching branches, note what migrations were added and be prepared to clean them

### How to Fix Migration Issues

#### Error: `VersionMismatch(XXXXXX)`
The migration file content changed after it was applied.

```bash
# Option 1: Remove migration record (keeps other data)
sqlite3 dev_assets/db.sqlite "DELETE FROM _sqlx_migrations WHERE version = XXXXXX;"
sqlite3 dev_assets/db.sqlite "DROP TABLE IF EXISTS <table_created_by_migration>;"

# Option 2: Start fresh (loses all data)
rm dev_assets/db.sqlite
```

#### Error: `VersionMissing(XXXXXX)`
The database has a migration recorded that doesn't exist in the codebase.

```bash
# Remove the orphaned migration record
sqlite3 dev_assets/db.sqlite "DELETE FROM _sqlx_migrations WHERE version = XXXXXX;"
sqlite3 dev_assets/db.sqlite "DROP TABLE IF EXISTS <table_created_by_migration>;"
```

#### After Fixing Database
```bash
# Rebuild to ensure clean state
cargo clean -p db -p server
pnpm run prepare-db
cargo build --bin server
make restart
```

### Prevention Checklist

Before working on database migrations:

- [ ] **NEVER modify existing migration files**
- [ ] **Always create NEW migration files for schema changes**
- [ ] **Know your database location**: `dev_assets/db.sqlite` in debug mode
- [ ] **Before switching branches**: Check `_sqlx_migrations` table for branch-specific migrations
- [ ] **Test migrations on a copy first** if unsure

### STRICT POLICY - Database Protection

**The following actions are FORBIDDEN without explicit user approval:**

| Action | Consequence |
|--------|-------------|
| `rm db.sqlite` | Session termination |
| `DROP TABLE` | Session termination |
| `DELETE FROM _sqlx_migrations` | Session termination |
| `DELETE FROM <table>` without WHERE | Session termination |

**Correct behavior when encountering database errors:**
1. **STOP** - Do not attempt to fix by deleting
2. **REPORT** - Show exact error to user
3. **ASK** - Request permission for any modification
4. **WAIT** - Let user decide

**This policy exists because:**
- VIB-70 incident: Database was deleted 3+ times causing hours of debugging
- User lost data and had to restore from backups
- Application was down for extended period due to repeated failed "fixes"

### Commands Reference

```bash
# Check which migrations are in the database
sqlite3 dev_assets/db.sqlite "SELECT version, description FROM _sqlx_migrations ORDER BY version DESC LIMIT 10;"

# Check which migration files exist
ls crates/db/migrations/ | tail -10

# Remove a specific migration record
sqlite3 dev_assets/db.sqlite "DELETE FROM _sqlx_migrations WHERE version = XXXXXX;"

# Full database reset (CAUTION: loses all data)
rm dev_assets/db.sqlite && make restart
```

---

## Incident: IKA-84 URL Slug vs UUID API Errors (2026-01-12)

### What Happened

The console was flooded with 400 Bad Request errors when viewing tasks via slug URLs:
```
GET https://api.scholar.com/api/task-attempts?task_id=create-secure-and-ordered-data-storage-for-admin-data
400 (Bad Request)
```

The API endpoint expects a UUID but was receiving a URL slug.

### Root Cause

In `ProjectTasks.tsx`, `useTaskAttempts()` was called with the raw URL parameter `taskId` from `useParams()`:

```typescript
// BROKEN CODE:
const { taskId } = useParams();  // taskId = "create-secure-and-ordered-data-storage-for-admin-data"
const { data } = useTaskAttempts(taskId, { enabled: !!taskId && isLatest });
// API called with slug → 400 error
```

URL parameters can be either:
- **UUID**: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Slug**: `create-secure-and-ordered-data-storage-for-admin-data`

The API only accepts UUIDs, but the code was passing whatever came from the URL.

### How It Was Fixed

Use the resolved task entity instead of the raw URL param:

```typescript
// FIXED CODE:
const { taskId } = useParams();
const selectedTask = resolveTaskFromParam(taskId, tasks, tasksById);  // Resolves slug → entity
const { data } = useTaskAttempts(selectedTask?.id, { enabled: !!selectedTask && isLatest });
// API called with UUID → 200 OK
```

The `resolveTaskFromParam()` function (from `lib/url-utils.ts`) handles both UUIDs and slugs:
1. If param is a UUID → looks up directly in `tasksById`
2. If param is a slug → finds task by matching `generateSlug(task.title)`

### Prevention Checklist

Before passing any URL param to an API call:

- [ ] **NEVER pass raw `useParams()` values to API hooks**
- [ ] **Always resolve to entity first** using `resolveXFromParam()`:
  - `resolveTaskFromParam(taskId, tasks, tasksById)`
  - `resolveProjectFromParam(projectId, projects, projectsById)`
  - `resolveTeamFromParam(teamId, teams, teamsById)`
- [ ] **Update `enabled` conditions** to check resolved entity, not raw param
- [ ] **Use `isUUID()` function** if you need to check param format

### URL Parameter Flow

```
URL: /projects/my-project/tasks/my-task-slug
                                     │
                                     ▼
                          useParams() → taskId = "my-task-slug"
                                     │
                                     ▼
                    resolveTaskFromParam(taskId, tasks, tasksById)
                                     │
                                     ▼
                          task = { id: "uuid-here", title: "My Task Slug" }
                                     │
                                     ▼
                          useTaskAttempts(task?.id)  ← Always UUID!
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/url-utils.ts` | Resolver functions (`resolveTaskFromParam`, etc.) |
| `pages/ProjectTasks.tsx` | Where the bug was fixed |
| `hooks/useTaskAttempts.ts` | Hook that makes the API call |

---

## Incident: IKA-87 Railway Not Pulling New Docker Image (2026-01-12)

### What Happened

After adding the `/api/teams/{id}/dashboard` endpoint (IKA-83), the production API returned 404 for this route even though:
- The code was correct and compiled
- The Docker image was successfully pushed to Docker Hub
- The GitHub Actions deployment workflow reported success

Other endpoints like `/api/teams/{id}/issues` worked fine, but `/dashboard` returned 404 with 1ms response time (indicating route not found, not a database issue).

### Root Cause

**Railway's `redeploy` command doesn't force a new Docker image pull.**

The deployment workflow was:
1. ✅ Build Rust binary with new code
2. ✅ Push Docker image to Docker Hub with `:latest` tag
3. ❌ `railway redeploy` - Just restarts container with CACHED image

Railway was using an old cached Docker image that didn't have the `/dashboard` route. The `railway redeploy` command only restarts the existing deployment - it doesn't pull a fresh image from Docker Hub.

### How It Was Fixed

**Immediate fix:** Used `quick-deploy-backend.yml` workflow which uses `railway up` with a proxy Dockerfile to force fresh image pull.

**Permanent fix:** Updated `deploy-backend.yml` to use `railway up` instead of `railway redeploy`:

```yaml
# OLD (broken) - didn't pull new images:
railway redeploy --service $SERVICE_ID --yes

# NEW (fixed) - creates proxy Dockerfile and forces fresh pull:
echo "FROM rupeedev/ikanban-backend:${{ github.sha }}" > Dockerfile
railway up --service $SERVICE_ID
```

Also fixed a token mismatch in quick-deploy workflow:
```yaml
# BROKEN:
RAILWAY_TOKEN: ${{ secrets.RAILWAY_BACKEND_TOKEN }}

# FIXED:
RAILWAY_TOKEN: ${{ secrets.RAILWAY_GITHUB_BACKEND_TOKEN }}
```

### Railway Deployment Commands Comparison

| Command | Behavior | Use Case |
|---------|----------|----------|
| `railway redeploy` | Restarts container with current/cached image | Quick restart, no code changes |
| `railway up` (with Dockerfile) | Builds and deploys fresh | Force new image pull |

### Prevention Checklist

When deploying backend changes to Railway:

- [x] **Fixed**: `deploy-backend.yml` now uses `railway up` instead of `railway redeploy`
- [ ] **Verify deployment**: Test new endpoints directly with curl after deploy
- [ ] **Check response time**: 1ms 404 = route doesn't exist; longer 404 = route exists but returns 404
- [ ] **If issues persist**: Run `quick-deploy-backend.yml` manually as backup

### Debugging Tips

**Symptom**: New endpoint returns 404, other endpoints work

**Diagnosis**:
```bash
# Test with UUID (bypasses any identifier lookup issues)
curl -s "https://api.scho1ar.com/api/teams/{uuid}/dashboard" -H "Authorization: Bearer $TOKEN"

# If 404 with 1ms response → route doesn't exist in deployed code
# If 404 with longer response → route exists but something else is wrong
```

**Fix**:
```bash
# Trigger quick-deploy to force new image
gh workflow run quick-deploy-backend.yml --ref main -f image_tag=latest
```

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-backend.yml` | Main deploy (uses `railway redeploy`) |
| `.github/workflows/quick-deploy-backend.yml` | Force deploy (uses `railway up`) |
| `vibe-backend/railway.toml` | Railway configuration |

---

## Incident: IKA-148 Agent Settings Data Lost on Refresh (2026-01-18)

### What Happened

Users reported that Agent Settings configurations were lost after page refresh:
1. User saves configuration → success message shows
2. User refreshes page
3. Saved data appears to be gone

The data was actually being saved to the server, but the UI showed different data after refresh.

### Root Cause

**The mutation's `onSuccess` handler was optimistically updating the cache with what was SENT, not what the server SAVED.**

```typescript
// BROKEN CODE:
const { mutateAsync: saveMutation } = useMutation({
  mutationFn: (content: string) => profilesApi.save(content),
  onSuccess: (_, content) => {
    // content = what was SENT, not what server saved
    queryClient.setQueryData(['profiles'], (old) => ({ ...old, content }));
  },
});
```

The backend only saves **overrides** (differences from defaults), not the full config:
1. Frontend sends full config (defaults + user changes)
2. Backend computes overrides (only parts different from defaults)
3. Backend saves overrides to `profiles.json`
4. Backend returns success message (NOT the saved content)
5. Frontend optimistically sets cache to full config that was sent

On page refresh:
1. GET /api/profiles returns merged config (defaults + overrides from file)
2. If overrides are empty (nothing changed from defaults), this looks different from what was sent

### How It Was Fixed

Changed the mutation to **invalidate and refetch** instead of optimistic update:

```typescript
// FIXED CODE:
const { mutateAsync: saveMutation } = useMutation({
  mutationFn: (content: string) => profilesApi.save(content),
  onSuccess: async () => {
    // Invalidate and refetch to get the server's merged view
    await queryClient.invalidateQueries({ queryKey: ['profiles'] });
  },
});
```

This ensures the UI always shows what the server actually has (defaults + saved overrides).

### Prevention Checklist

When using TanStack Query mutations with server-computed responses:

- [ ] **Don't use optimistic updates if server transforms data**
- [ ] **Invalidate and refetch when server response differs from request**
- [ ] **Only use optimistic updates when server echoes back exactly what was sent**
- [ ] **Check what the backend actually saves** - it may compute/transform the input

### When to Use Each Pattern

| Pattern | Use When |
|---------|----------|
| **Optimistic Update** | Server saves exactly what you send (e.g., simple CRUD) |
| **Invalidate + Refetch** | Server transforms/computes data (e.g., saves diffs, adds timestamps) |
| **Return Updated Data** | Server returns the actual saved state (best of both worlds) |

### Backend Save Flow for Profiles

```
Frontend sends: { executors: { CLAUDE_CODE: { DEFAULT: {...}, CUSTOM: {...} } } }
                                    │
                                    ▼
                         Backend: compute_overrides()
                                    │
                    Compares against default_profiles.json
                                    │
                                    ▼
              Only saves: { executors: { CLAUDE_CODE: { CUSTOM: {...} } } }
              (DEFAULT wasn't different, so not saved)
                                    │
                                    ▼
                         On reload/GET:
              defaults + overrides = full merged config
```

### Key Files

| File | Purpose |
|------|---------|
| `vibe-frontend/src/hooks/useProfiles.ts` | Where the mutation was fixed |
| `vibe-backend/crates/executors/src/profile.rs` | `compute_overrides()` - saves only diffs |
| `vibe-backend/crates/server/src/routes/config.rs` | GET/PUT /api/profiles endpoints |

---

## Incident: IKA-215 Context Compaction Delay (2026-01-21)

### What Happened

A task that was essentially complete took 40+ minutes after context compaction because:
1. Re-ran `cargo sqlx prepare` when SQLx cache was already generated
2. Waited on `TaskOutput` for background tasks that had already completed
3. Re-validated code that had already passed all checks

### Root Causes

1. **Not reading context compaction summary carefully** - Summary clearly stated validation had passed
2. **Ignoring task notifications** - Multiple `<task-notification>` showed `status: completed`
3. **Blocking on TaskOutput** - Waited for background tasks instead of checking notifications
4. **Cargo process locks** - Multiple cargo processes competing for same lock file

### How It Was Fixed

1. Killed stuck processes
2. Checked `git status` to see actual state
3. Proceeded directly to commit and merge

### Prevention

Added "Context Compaction Recovery" section to `.claude/WORKFLOW.md`:
- Check task notifications first
- Trust the summary - don't re-run completed phases
- Check `git status` immediately to see actual state
- Don't block on TaskOutput if notifications show completion

---

## Incident: IKA-229 Slow Implementation Due to Avoidable Errors (2026-01-22)

### What Happened

A task that should have taken 15-20 minutes took 43 minutes due to:
1. Multiple compile errors from incorrect type/field assumptions
2. Running slow clippy instead of faster cargo check
3. Rust toolchain compile times
4. Context gathering that could have been avoided

### Root Causes

#### 1. Wrong ApiError Variant
**Assumed `ApiError::Internal` existed, but it doesn't.**

```rust
// BROKEN - ApiError::Internal doesn't exist:
return Err(ApiError::Internal("message".to_string()));

// FIXED - Use BadRequest or map to existing variant:
return Err(ApiError::BadRequest("message".to_string()));
```

**Prevention:** Check `crates/server/src/error.rs` for available `ApiError` variants before using them.

#### 2. Wrong RequestContext Field Access
**Assumed `ctx.user_id` existed, but it's actually `ctx.user.id` (a UUID, not String).**

```rust
// BROKEN - user_id doesn't exist on RequestContext:
let user_id = ctx.user_id;

// FIXED - Access nested user.id (which is UUID):
let user_id = ctx.user.id;  // This is a Uuid, not a String!
```

**Additional issue:** The user.id is a UUID, but workspace members use `clerk_user_id` (String). Had to create a UUID variant function that looks up clerk_user_id via oauth_accounts table.

**Prevention:**
- Check `crates/remote/src/auth.rs` for `RequestContext` structure
- Remember: `ctx.user.id` = internal UUID, need oauth_accounts lookup for clerk_user_id

#### 3. Running Clippy Instead of Cargo Check
**Clippy takes 3-5x longer than cargo check.**

| Command | Time | Use Case |
|---------|------|----------|
| `cargo check -p crate` | ~1 min | Verify code compiles |
| `cargo clippy --all-targets` | 5+ min | Full lint (run once at end) |

**Prevention:** Use `cargo check -p <crate>` during iteration. Run clippy only once before commit.

#### 4. SQLx Cache Regeneration
**Each crate takes 3-4 minutes. Run in parallel.**

```bash
# SLOW - Sequential:
cd crates/db && cargo sqlx prepare
cd crates/remote && cargo sqlx prepare

# FAST - Parallel (use background tasks):
# Run both simultaneously, check notifications for completion
```

**Prevention:** Always run SQLx prepare for multiple crates in parallel using background tasks.

#### 5. Excessive Context Gathering
**Read 6+ files when FILE-MAP.md had the paths.**

**Prevention:**
- Read FILE-MAP.md first - it has exact paths
- Use targeted reads, not exploration
- For billing/limits code: `crates/remote/src/middleware/usage_limits.rs`

### Quick Reference - Remote Crate Types

| Type | Location | Notes |
|------|----------|-------|
| `RequestContext` | `crates/remote/src/auth.rs` | Has `user: User` not `user_id` |
| `User` | `crates/remote/src/auth.rs` | Has `id: Uuid`, `clerk_id: String` |
| `AppState` | `crates/remote/src/lib.rs` | Use `state.pool()` for database |
| `UsageLimitError` | `crates/remote/src/middleware/usage_limits.rs` | For limit check errors |

### Quick Reference - Server Crate Types

| Type | Location | Notes |
|------|----------|-------|
| `ApiError` | `crates/server/src/error.rs` | Variants: BadRequest, NotFound, Forbidden, Database, etc. (NO Internal!) |
| `DeploymentImpl` | `crates/server/src/lib.rs` | Use `deployment.db().pool` for database |

### Prevention Checklist

Before implementing billing/limits features:

- [ ] **Check ApiError variants** in `crates/server/src/error.rs`
- [ ] **Check RequestContext structure** in `crates/remote/src/auth.rs`
- [ ] **Use `cargo check -p <crate>`** not clippy during iteration
- [ ] **Run SQLx prepare in parallel** for multiple crates
- [ ] **Read FILE-MAP.md** instead of exploring codebase

### Time Breakdown (What Went Wrong)

| Activity | Time | Should Be |
|----------|------|-----------|
| Context gathering | 10 min | 2 min (use FILE-MAP.md) |
| Implementation | 8 min | 8 min |
| Error fixes (ApiError, ctx.user) | 8 min | 0 min (know the types) |
| Cargo check/clippy | 10 min | 3 min (use check, not clippy) |
| SQLx cache | 7 min | 4 min (run parallel) |
| **Total** | **43 min** | **17 min** |

---

## Incident: Migrations in Wrong Directory (2026-01-22)

### What Happened

The superadmin link wasn't appearing in the sidebar even though the user was supposed to be a superadmin. Investigation revealed:

1. The `superadmins` table didn't exist on production
2. 37 migrations from January 2026 were never run on production
3. Many features (tenant workspaces, billing, trust profiles, API keys, etc.) were broken

### Root Cause

**Migrations were added to the wrong directory.**

The codebase has two migration directories:
- `crates/db/migrations/` - **NOT used by the server** (contains old local SQLite migrations)
- `crates/remote/migrations/` - **USED by the server** (PostgreSQL migrations for remote deployment)

The server's migration code in `crates/remote/src/db/mod.rs`:
```rust
pub(crate) async fn migrate(pool: &PgPool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await  // <- Relative to crates/remote/
}
```

All 2026 migrations were added to `crates/db/migrations/` instead of `crates/remote/migrations/`, so they never ran on the production PostgreSQL database.

### How It Was Fixed

Moved all 37 migrations from `crates/db/migrations/` to `crates/remote/migrations/`:

```bash
for f in vibe-backend/crates/db/migrations/20260*.sql; do
  mv "$f" vibe-backend/crates/remote/migrations/
done
```

### Prevention

**When creating PostgreSQL migrations for the remote server:**

- [ ] **ALWAYS place migrations in `crates/remote/migrations/`** - NOT `crates/db/migrations/`
- [ ] **The `crates/db/` crate is for local SQLite** - different database entirely
- [ ] **Check deployment** - After adding migrations, verify they run on production
- [ ] **Add to FILE-MAP.md** - Document the correct migration path

### Migration Directory Reference

| Directory | Database | Server | Usage |
|-----------|----------|--------|-------|
| `crates/remote/migrations/` | PostgreSQL | Remote (Railway) | Production migrations |
| `crates/db/migrations/` | SQLite | Local | Local desktop app (not remote server) |

### Tables That Were Missing on Production

Due to this bug, the following tables didn't exist on production:
- `superadmins` - App-level admins
- `tenant_workspaces` - Multi-tenant workspace support
- `api_keys` - User API keys for MCP auth
- `plan_limits` - Billing plan constraints
- `workspace_usage` - Usage tracking
- `trust_profiles`, `abuse_signals` - Trust & safety
- `chat_messages`, `chat_sessions` - Chat feature
- `agent_configs` - Agent configuration
- And ~25 more tables

---

## Incident: Claude Code Action SDK Crash (2026-01-24)

### What Happened

The GitHub Actions Claude workflow started failing immediately after starting. All runs after January 21st crashed within ~700ms with exit code 1, while the last successful run (Issue #17) worked correctly.

**Symptoms:**
- Workflow starts, "Run Claude Code" step begins
- Crashes within 700ms with SDK error
- `is_error: true`, `num_turns: 1`, `duration_ms: 691`
- No actual work performed (no branch created, no PR, no comments)

### Root Cause

**The `claude_args` parameter with `--allowedTools` flag was crashing the claude-code-action SDK.**

On January 21st at 11:01, commit `605ffb32a` added this parameter to the workflow:

```yaml
# BROKEN - causes SDK crash:
- name: Run Claude Code
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    claude_args: |
      --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,TodoWrite"
    prompt: |
      ...
```

The working version (commit `2a73cd1cc` from January 18th) did NOT have this parameter:

```yaml
# WORKING - no claude_args:
- name: Run Claude Code
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    prompt: |
      ...
```

### Timeline

| Date/Time | Commit | Change | Result |
|-----------|--------|--------|--------|
| Jan 18 22:02 | `2a73cd1cc` | Original workflow (no claude_args) | ✅ Works |
| Jan 21 03:03 | - | Issue #17 runs successfully | ✅ 23 turns, $0.47 |
| Jan 21 10:59 | `c7ef7607b` | Added `allowed_tools` (invalid param) | ❌ Likely failed |
| Jan 21 11:01 | `605ffb32a` | Changed to `claude_args: --allowedTools` | ❌ Breaks SDK |
| Jan 24 07:00+ | - | All subsequent runs | ❌ SDK crash in 700ms |
| Jan 24 10:28 | `49d4e6ab3` | Removed `claude_args` | ✅ Fixed |

### Comparison: Successful vs Failed Runs

| Metric | Successful (Jan 21) | Failed (Jan 24) |
|--------|---------------------|-----------------|
| Duration | 108,122ms (~2 min) | 691ms |
| Turns | 23 | 1 |
| is_error | false | true |
| Cost | $0.47 | $0 |
| Result | Analyzed issue, posted comment | Immediate crash |

### How It Was Fixed

Removed the `claude_args` parameter from `.github/workflows/claude.yml`:

```yaml
# Commit 49d4e6ab3 - FIXED:
- name: Run Claude Code
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    prompt: |
      IMPORTANT: Before starting any work, read and follow IN ORDER:
      ...
```

The action works correctly without explicit tool permissions - they are granted by default or through other means.

### Investigation Process

1. **Noticed pattern:** Recent workflows all failing, earlier ones succeeded
2. **Compared logs:** Successful run showed `duration_ms: 108122`, failed showed `duration_ms: 691`
3. **Found successful run:** Issue #17 on Jan 21 03:03 worked perfectly
4. **Checked git history:** `git log --oneline -- .github/workflows/claude.yml`
5. **Identified culprit:** Commit `605ffb32a` added `claude_args` after the successful run
6. **Verified fix:** Removed parameter, new run continued past the crash point

### Prevention Checklist

When modifying the Claude Code GitHub Action:

- [ ] **Test locally first** if possible, or create a test issue
- [ ] **Don't add undocumented parameters** without verifying they work
- [ ] **Compare with working version** if things break
- [ ] **Check run duration** - instant crash (< 1 second) indicates configuration issue
- [ ] **The action works fine with defaults** - don't add tool permissions unless necessary

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/claude.yml` | Claude Code workflow configuration |
| Issue #17 run logs | Example of successful run |
| Commit `605ffb32a` | Where the breaking change was introduced |
| Commit `49d4e6ab3` | The fix |

### Debugging GitHub Action Failures

**Symptom:** Claude Code action crashes immediately

**Diagnosis:**
```bash
# Check recent runs
gh run list --repo rupeedev/iKanban --workflow="Claude Code" --limit 10

# Compare successful vs failed run logs
gh run view <successful_run_id> --repo rupeedev/iKanban --log | grep -E "duration_ms|is_error|num_turns"
gh run view <failed_run_id> --repo rupeedev/iKanban --log | grep -E "duration_ms|is_error|num_turns"

# Check git history for recent workflow changes
git log --oneline -- .github/workflows/claude.yml
```

**Quick fix if workflow breaks:**
```bash
# Revert to last known working version
git show <working_commit>:.github/workflows/claude.yml > .github/workflows/claude.yml
git commit -m "fix: revert workflow to working version"
git push
```

---

## Template for Future Incidents

### Incident: [Title] (Date)

**What Happened:**
- Brief description

**Root Causes:**
- List of causes

**How It Was Fixed:**
- Steps taken

**Prevention:**
- What to do differently next time
