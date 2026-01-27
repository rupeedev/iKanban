# Codebase Gaps Analysis

**Last Updated:** 2026-01-25
**Context:** Identified during IKA-280 (Team Issues Move Functionality)

---

## Frontend Gaps

### 1. Mock Data in Production Code

**Location:** `vibe-frontend/src/components/dialogs/issues/IssueFormDialog.tsx:91-107`

```typescript
// CURRENT - Mock data hardcoded
const MOCK_TEAM_MEMBERS: TeamMember[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'John Doe', email: 'john@example.com' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Jane Smith', email: 'jane@example.com' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Bob Johnson', email: 'bob@example.com' },
];
```

**Should Be:** Fetching real team members from API

```typescript
// CORRECT - Fetch from API
const { data: teamMembers } = useQuery({
  queryKey: ['team-members', teamId],
  queryFn: () => teamsApi.getMembers(teamId),
  enabled: !!teamId,
});
```

**Impact:** Assignee dropdown shows fake users instead of real team members.

---

### 2. Wrong API Endpoints for Team Issues

**Problem:** Frontend was calling wrong endpoints for team issues.

| Operation | Was Calling (WRONG) | Should Call (CORRECT) |
|-----------|---------------------|----------------------|
| Update assignee | `PUT /api/tasks/{id}` | `PATCH /api/teams/{team_id}/issues/{id}` |
| Update priority | `PUT /api/tasks/{id}` | `PATCH /api/teams/{team_id}/issues/{id}` |
| Update status | `PUT /api/tasks/{id}` | `PATCH /api/teams/{team_id}/issues/{id}` |
| Move to project | `POST /api/tasks/{id}/move` | `PATCH /api/teams/{team_id}/issues/{id}` with `project_id` |
| Create issue | `POST /api/tasks` | `POST /api/teams/{team_id}/issues` |

**Root Cause:** Two different task tables exist:
- `shared_tasks` - accessed via `/api/tasks/`
- `tasks` - accessed via `/api/teams/{id}/issues/`

**Fixed In:** IKA-279, IKA-280

---

### 3. No Error Handling UI

**Location:** Throughout `vibe-frontend/src/hooks/useIssueUpdateHandlers.ts`

```typescript
// CURRENT - Errors only logged to console
} catch (err) {
  console.error('Failed to update assignee:', err);
}
```

**Should Be:** User-visible error feedback

```typescript
// CORRECT - Show toast notification
} catch (err) {
  console.error('Failed to update assignee:', err);
  toast.error('Failed to update assignee. Please try again.');
}
```

**Impact:** Users see no feedback when operations fail.

---

### 4. Inconsistent API Response Handling

**Problem:** Some API calls expect different response formats.

```typescript
// Format 1: Wrapped response
{ success: true, data: [...] }

// Format 2: Direct data
[...]

// Format 3: Error response
{ error: "message" }
```

**Should Be:** Consistent response format across all endpoints.

---

## Backend Gaps

### 0. Missing GET /tasks/{id} Endpoint (IKA-312)

**Location:** `vibe-backend/crates/remote/src/routes/tasks.rs:42-45`

**Problem:** The `/tasks/{task_id}` endpoint only supports PUT and DELETE, not GET.

```rust
// CURRENT - No GET handler
.route(
    "/tasks/{task_id}",
    put(update_shared_task),  // Only PUT
)
.route("/tasks/{task_id}", delete(delete_shared_task))  // And DELETE

// MISSING - Should also have GET
.route("/tasks/{task_id}", get(get_shared_task))
```

**Impact:**
- CLI `task IKA-XX` command fails with HTTP 405
- Cannot retrieve single task details via API
- Must use workaround: `issues IKA` and filter

**Workaround:**
```bash
# Instead of (fails with 405):
python3 ikanban.py task IKA-298

# Use this (works):
python3 ikanban.py issues IKA --json | jq '.[] | select(.identifier == "IKA-298")'
```

**Fix Required:** Add `get_shared_task` handler to tasks.rs routes.

---

### 1. Field Naming Inconsistencies

**Location:** `vibe-backend/crates/services/src/services/share/publisher.rs`

```rust
// WAS USING (WRONG)
let payload = CreateSharedTaskRequest {
    assignee_user_id: Some(user_id),  // Field doesn't exist!
};

// CORRECT FIELD NAME
let payload = CreateSharedTaskRequest {
    assignee_id: Some(user_id),
};
```

**Impact:** Compilation errors, runtime failures.

**Fixed In:** IKA-280

---

### 2. Incomplete Struct Field Coverage

**Location:** `vibe-backend/crates/services/src/services/share/publisher.rs`

```rust
// WAS (Missing required fields)
let payload = CreateSharedTaskRequest {
    project_id: remote_project_id,
    title: task.title.clone(),
    description: task.description.clone(),
    assignee_user_id: Some(user_id),
    // Missing: status, priority, due_date, parent_workspace_id, image_ids, shared_task_id, team_id
};

// CORRECT (All fields provided)
let payload = CreateSharedTaskRequest {
    project_id: remote_project_id,
    title: task.title.clone(),
    description: task.description.clone(),
    status: None,
    priority: task.priority,
    due_date: None,
    assignee_id: Some(user_id),
    parent_workspace_id: None,
    image_ids: None,
    shared_task_id: None,
    team_id: None,
};
```

**Fixed In:** IKA-280

---

### 3. Two Separate Task Systems

**Architecture Issue:** Two different tables serve similar purposes.

| Table | Purpose | API Prefix | Used By |
|-------|---------|------------|---------|
| `shared_tasks` | Remote/shared tasks | `/api/tasks/` | Shared workspaces |
| `tasks` | Team issues | `/api/teams/{id}/issues/` | Team boards |

**Problems:**
- Confusing for developers
- Easy to call wrong endpoint
- Duplicate code paths
- Different field sets

**Recommendation:** Either consolidate or clearly document separation in API.md.

---

### 4. Missing Cross-Team Validation

**Location:** `vibe-backend/crates/remote/src/db/teams.rs:update_issue()`

```rust
// CURRENT - No validation that project belongs to team
project_id = COALESCE($9, project_id),

// SHOULD ADD - Validate project ownership
// Before update, verify: SELECT 1 FROM projects WHERE id = $9 AND team_id = $2
```

**Impact:** Could potentially move issues to projects in other teams.

---

## Architecture Gaps

### 1. No API Contract/OpenAPI Spec

**Problem:** No automated type generation between Rust and TypeScript.

**Current State:**
- Rust structs defined in `crates/remote/src/routes/`
- TypeScript types manually defined in `shared/types/`
- Manual synchronization leads to drift

**Should Have:**
- OpenAPI spec generated from Rust
- TypeScript types generated from OpenAPI
- CI check for type drift

---

### 2. Missing Integration Tests

**Problem:** No tests for team issue CRUD operations.

**Should Exist:**
```
vibe-backend/crates/remote/tests/
  - team_issues_test.rs
    - test_create_team_issue()
    - test_update_team_issue()
    - test_move_team_issue()
    - test_delete_team_issue()
```

---

### 3. No API Testing in CI

**Problem:** PRs merged without API verification.

**Should Add to CI:**
```yaml
- name: API Integration Tests
  run: |
    cargo test --package remote --test integration
```

---

## Process Gaps

### 1. No Pre-Merge API Testing

**Problem:** Changes deployed without curl verification.

**Recommendation:** Add to PR checklist:
```markdown
## API Testing Checklist
- [ ] Tested endpoint with curl
- [ ] Verified response format
- [ ] Checked error cases
```

---

### 2. No Frontend-Backend Contract Testing

**Problem:** TypeScript types not generated from Rust structs.

**Recommendation:**
1. Generate OpenAPI from Rust with `utoipa`
2. Generate TypeScript from OpenAPI with `openapi-typescript`
3. Add CI step to verify types match

---

## Quick Reference: Correct API Patterns

### Team Issues (use these for Team Issues page)

```bash
# List issues
GET /api/teams/{team_id}/issues

# Create issue
POST /api/teams/{team_id}/issues
Body: { project_id, title, description?, status?, priority?, due_date?, assignee_id? }

# Update issue (including move)
PATCH /api/teams/{team_id}/issues/{issue_id}
Body: { title?, description?, status?, priority?, due_date?, assignee_id?, project_id? }

# Get team members (for assignee dropdown)
GET /api/teams/{team_id}/members
```

### Shared Tasks (use these for shared/remote tasks)

```bash
# List tasks
GET /api/projects/{project_id}/tasks

# Create task
POST /api/tasks
Body: { project_id, title, ... }

# Update task
PATCH /api/tasks/{task_id}
Body: { title?, description?, status?, ... }
```

---

## Priority Fixes

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| **P0** | **Add GET /tasks/{id} endpoint** | **Low** | **High** |
| P1 | Replace mock team members | Low | High |
| P1 | Add cross-team validation for move | Low | High |
| P2 | Add error toast notifications | Low | Medium |
| P2 | Add integration tests | Medium | High |
| P3 | Generate OpenAPI spec | High | High |
| P3 | Consolidate task tables | High | High |

---

## Related Tasks

- IKA-279: Fixed update handlers to use correct API
- IKA-280: Fixed create issue and move functionality
- TODO: Create tasks for remaining gaps
