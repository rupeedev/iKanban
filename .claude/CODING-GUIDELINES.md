# Coding Guidelines

Standards to follow for all code changes. These are based on actual issues caught in CI/runtime.

---

## General Rules (All Code)

### File Size Limits
- **Maximum 400 lines per file**
- If approaching limit, split into multiple files by responsibility
- Each file should have a single, clear purpose

### Before Committing
- Run linters and fix all warnings
- Remove all unused code (imports, variables, functions)
- No `TODO` comments without a linked task ID

---

## System Consolidation (CRITICAL)

**iKanban has multiple parallel systems from different development phases. Use ONLY the systems marked as CURRENT.**

### Authentication Systems

| System | Status | Algorithm | When Used |
|--------|--------|-----------|-----------|
| **Clerk Direct JWT** | **CURRENT** | RS256 | All new code |
| Session-based OAuth | DEPRECATED | HS256 | Legacy - do not use |

**Implementation:**
- Frontend: Use `@clerk/clerk-react` hooks (`useAuth`, `useUser`)
- Backend: Use `require_clerk_session` middleware (verifies RS256 tokens)
- Never use HS256 validation or session-based auth

```rust
// GOOD - Clerk auth middleware
.layer(middleware::from_fn_with_state(state.clone(), require_clerk_session))

// BAD - Old session-based auth (do not use)
// .layer(middleware::from_fn_with_state(state.clone(), require_session))
```

### Workspace/Tenant Systems

| Table | Status | Purpose |
|-------|--------|---------|
| **`tenant_workspaces`** | **CURRENT** | Workspace definitions |
| **`tenant_workspace_members`** | **CURRENT** | User membership in workspaces |
| `organizations` | DEPRECATED | Legacy org definitions |
| `organization_member_metadata` | DEPRECATED | Legacy membership |

**Always use `workspace_id` parameter, NOT `organization_id`:**

```rust
// GOOD - Use workspace_id
#[derive(Deserialize)]
struct Query {
    workspace_id: Uuid,
}

// BAD - Frontend sends workspace_id, not organization_id
#[derive(Deserialize)]
struct Query {
    organization_id: Uuid,  // Will cause 400 Bad Request!
}
```

**Membership checks:**
```rust
// GOOD - Check tenant_workspace_members
let is_member = sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM tenant_workspace_members WHERE workspace_id = $1 AND user_id = $2)"
)
.bind(workspace_id)
.bind(user_id)
.fetch_one(pool)
.await?;

// BAD - Do not check organization_member_metadata
```

### API Response Format

**All API responses MUST use the `ApiResponse<T>` wrapper:**

```rust
use crate::routes::error::ApiResponse;

// GOOD - Frontend expects { success: true, data: {...} }
async fn get_data() -> Json<ApiResponse<MyData>> {
    ApiResponse::success(MyData { ... })
}

// BAD - Raw response breaks frontend
async fn get_data() -> Json<MyData> {
    Json(MyData { ... })  // Frontend shows blank page!
}
```

**Response format expected by frontend:**
```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "message": "Error description" }
```

### Quick Reference Table

| Aspect | Use This | NOT This |
|--------|----------|----------|
| **Auth** | Clerk RS256 | Session HS256 |
| **Middleware** | `require_clerk_session` | `require_session` |
| **Workspaces table** | `tenant_workspaces` | `organizations` |
| **Membership table** | `tenant_workspace_members` | `organization_member_metadata` |
| **Parameter name** | `workspace_id` | `organization_id` |
| **API response** | `ApiResponse::success(data)` | `Json(data)` directly |
| **Route syntax** | `{param}` | `:param` |

### CLI Configuration Note

The file `teams-config.json` in docs/common-mcp contains team/project IDs for CLI tools. These are **separate** from database IDs - they map to Jira/external systems, not to `tenant_workspaces`.

---

## Backend (Rust)

### Axum Route Syntax (v0.7+)

**Route parameters use `{param}` not `:param`** - This changed in Axum 0.7.

```rust
// BAD - Old Axum syntax (causes panic on startup)
.route("/users/:id", get(get_user))
.route("/teams/:team_id/members/:member_id", get(get_member))

// GOOD - Current Axum 0.7+ syntax
.route("/users/{id}", get(get_user))
.route("/teams/{team_id}/members/{member_id}", get(get_member))
```

**Error if wrong:** Server panics at startup with:
`Path segments must not start with ':'. For capture groups, use '{capture}'`

### Multi-Crate Route Parity

**If a route exists in `server` crate, it MUST also exist in `remote` crate** (and vice versa for production routes).

| Crate | Purpose | Routes Needed |
|-------|---------|---------------|
| `server` | Local Tauri app | All routes for desktop use |
| `remote` | Railway production | All routes frontend calls |

**Checklist when adding routes:**
- [ ] Route added to `server/src/routes/` (if needed locally)
- [ ] Route added to `remote/src/routes/` (if called by frontend)
- [ ] Route prefix matches frontend expectations (`/api/` or `/v1/`)

### Route Prefix Consistency

Frontend calls `/api/*` endpoints. Backend must serve them.

```rust
// GOOD - Serve routes under both prefixes for compatibility
let api_public = v1_public.clone();
let api_protected = v1_protected.clone();

Router::new()
    .nest("/v1", v1_public)
    .nest("/v1", v1_protected)
    .nest("/api", api_public)      // Frontend compatibility
    .nest("/api", api_protected)
```

### Imports
```rust
// BAD - unused imports cause warnings
use axum::{http::StatusCode, response::IntoResponse, Json};

// GOOD - only import what you use
use axum::Json;
```

### Variables
```rust
// BAD - unused variable warning
pub fn router(deployment: &DeploymentImpl) -> Router { ... }

// GOOD - prefix unused with underscore
pub fn router(_deployment: &DeploymentImpl) -> Router { ... }
```

### Struct Fields (Deserialization)
```rust
// BAD - dead_code warning for fields used only in deserialization
#[derive(Deserialize)]
struct ApiResponse {
    data: String,
    metadata: String,  // warning: field never read
}

// GOOD - allow dead_code for deserialization structs
#[derive(Deserialize)]
#[allow(dead_code)] // Fields required for API deserialization
struct ApiResponse {
    data: String,
    metadata: String,
}
```

### Unused Functions
```rust
// BAD - warning for unused function
async fn helper_function() { ... }

// OPTION 1: Remove if truly unused

// OPTION 2: Prefix with underscore if needed for future
#[allow(dead_code)]
async fn _helper_function() { ... }
```

### PostgreSQL Migration Idempotency (CRITICAL)

**All migrations MUST be idempotent** - they should succeed whether run once or multiple times.

```sql
-- BAD - Fails if run twice
CREATE TABLE users (...);
CREATE INDEX idx_users_email ON users(email);
ALTER TABLE users ADD CONSTRAINT valid_email CHECK (...);
CREATE TRIGGER users_updated_at ...;

-- GOOD - Idempotent patterns
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- For constraints (no IF NOT EXISTS in Postgres)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'valid_email' AND table_name = 'users'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT valid_email CHECK (...);
    END IF;
END
$$;

-- For triggers
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at ...;
```

**Common idempotent patterns:**

| DDL Operation | Idempotent Pattern |
|---------------|-------------------|
| CREATE TABLE | `CREATE TABLE IF NOT EXISTS` |
| CREATE INDEX | `CREATE INDEX IF NOT EXISTS` |
| ADD COLUMN | `ALTER TABLE x ADD COLUMN IF NOT EXISTS` |
| ADD CONSTRAINT | Wrap in DO block with existence check |
| CREATE TRIGGER | `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER` |
| INSERT data | Use `ON CONFLICT DO UPDATE` or `ON CONFLICT DO NOTHING` |

**Never use CONCURRENTLY with IF NOT EXISTS** - PostgreSQL doesn't support it:
```sql
-- BAD - Syntax error
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table(col);

-- GOOD - Use regular CREATE INDEX with IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_name ON table(col);
```

### Pre-Commit Checklist
```bash
cargo check --workspace    # Zero warnings
cargo clippy --workspace   # Zero warnings
cargo fmt --check          # Formatting correct
```

---

## Frontend (React/TypeScript)

### Imports
```typescript
// BAD - unused imports
import { useState, useEffect, useCallback } from 'react';
// only useState is used

// GOOD - only import what you use
import { useState } from 'react';
```

### Variables
```typescript
// BAD - declared but never used
const handleClick = () => { ... };
// handleClick never referenced

// GOOD - remove or use it
```

### Props
```typescript
// BAD - destructure unused props
const Component = ({ data, onChange, onDelete }: Props) => {
  return <div>{data}</div>; // onChange, onDelete unused
};

// GOOD - only destructure what you use
const Component = ({ data }: Props) => {
  return <div>{data}</div>;
};

// OR prefix with underscore if intentionally unused
const Component = ({ data, _onChange }: Props) => { ... };
```

### Type Definitions
```typescript
// BAD - unused type
type UnusedType = { ... };

// GOOD - remove unused types or export if for external use
```

### Pre-Commit Checklist
```bash
pnpm lint          # Zero errors, zero warnings
pnpm check         # TypeScript type check passes
```

---

## API Calls & TanStack Query (CRITICAL)

**These rules prevent 429 rate limiting errors that block the entire team.**

### Rule 1: NEVER Make Direct API Calls in useEffect

```typescript
// BAD - Direct API call bypasses TanStack Query caching
useEffect(() => {
  if (!teamId) return;
  teamsApi.getProjects(teamId).then(setData).catch(console.error);
}, [teamId]);

// GOOD - Use TanStack Query hook for automatic caching & deduplication
const { data } = useTeamProjects(teamId);
```

**Why this matters:**
- Direct API calls fire on EVERY render/dependency change
- No request deduplication (same request = multiple HTTP calls)
- No cache hits (staleTime protection doesn't apply)
- Causes 429 "Too Many Requests" errors under normal usage

### Rule 2: Always Use Existing Hooks or Create New Ones

Before making any API call, check if a hook already exists:

```typescript
// Check these locations for existing hooks:
// - src/hooks/useTeams.ts
// - src/hooks/useProjects.ts
// - src/hooks/useTeamMembers.ts
// - src/hooks/useTeamProjects.ts
// - src/hooks/useTeamIssues.ts

// If no hook exists, CREATE ONE - global defaults handle most protections:
export function useMyData(id: string | undefined) {
  return useQuery({
    queryKey: ['mydata', id],
    queryFn: () => api.getData(id!),
    enabled: !!id,
    // Only override staleTime if you need different behavior than global 30min default
    staleTime: 5 * 60 * 1000,  // Optional: shorter staleTime for frequently changing data
  });
}
```

**IMPORTANT:** Global defaults in `main.tsx` already provide:
- `staleTime: 30 minutes` - prevents excessive refetching
- `gcTime: 1 hour` - cache retention
- `refetchOnWindowFocus: false` - no refetch on tab focus
- `refetchOnReconnect: false` - no burst of requests on reconnect
- `retry` that skips 429 errors - never amplifies rate limiting

**Do NOT duplicate these in individual hooks** unless you need different behavior.

### Rule 3: Use Targeted Query Invalidation

```typescript
// BAD - Invalidates ALL queries, causes cascade of refetches
queryClient.invalidateQueries({ queryKey: ['teams'] });
queryClient.invalidateQueries({ queryKey: ['projects'] });
queryClient.invalidateQueries({ queryKey: ['issues'] });

// GOOD - Mark stale but don't trigger immediate refetch
queryClient.invalidateQueries({
  queryKey: ['teams'],
  refetchType: 'none'  // Refetch only when component needs data
});

// BETTER - Invalidate specific query
queryClient.invalidateQueries({
  queryKey: ['teams', specificTeamId, 'projects']
});
```

### Rule 4: Rate Limit Error Handling (Centralized)

**Rate limit handling is now GLOBAL** - defined once in `main.tsx`:

```typescript
// main.tsx - QueryClient global defaults (already configured)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30,      // 30 minutes
      gcTime: 1000 * 60 * 60,          // 1 hour
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (failureCount, error) => {
        if (isRateLimitError(error)) return false;  // NEVER retry 429
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});
```

**DO NOT add rate limit handling to individual hooks** - it's already inherited globally.

### Rule 5: Choose the Right Mutation Cache Update Strategy

When a mutation succeeds, you need to update the cache. Choose the right strategy based on what the server does:

| Server Behavior | Strategy | Example Use Cases |
|----------------|----------|-------------------|
| Echoes back exactly what you send | Optimistic update | Simple CRUD (create user, update title) |
| Transforms/computes data | Invalidate + refetch | Saves diffs, adds timestamps, merges with defaults |
| Returns the computed result | Use response data | Server generates IDs, computed fields |

```typescript
// BAD - Server computes/transforms data, but we cache what we SENT
// This causes data to appear different after page refresh!
const mutation = useMutation({
  mutationFn: (data) => api.save(data),
  onSuccess: (_, sentData) => {
    // sentData = what we sent, NOT what server saved
    queryClient.setQueryData(['key'], sentData);  // Mismatch on refresh!
  },
});

// GOOD - Server transforms data, so refetch to get actual saved state
const mutation = useMutation({
  mutationFn: (data) => api.save(data),
  onSuccess: async () => {
    // Let server be the source of truth
    await queryClient.invalidateQueries({ queryKey: ['key'] });
  },
});

// ALSO GOOD - Server returns the saved data in response
const mutation = useMutation({
  mutationFn: (data) => api.save(data),  // Returns saved data
  onSuccess: (savedData) => {
    // Use what server actually saved
    queryClient.setQueryData(['key'], savedData);
  },
});
```

**Real example from IKA-148:** The profiles API saves only *overrides* (differences from defaults), not the full config. Using optimistic update with the sent data caused the UI to show different data after refresh.

### Common Patterns That Cause 429 Errors

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `useEffect` + direct API call | Bypasses cache | Use `useQuery` hook |
| Multiple components fetching same data | Duplicate requests | Share query via hook |
| `invalidateQueries()` without `refetchType` | Cascade refetch | Add `refetchType: 'none'` |
| Overriding `retry` without 429 check | Amplifies problem | Use global default (don't override) |
| Overriding `staleTime` to low value | Refetches too often | Use global 30min default or justify |
| Overriding `refetchOnWindowFocus: true` | Unexpected refetches | Use global default (don't override) |

### Quick Reference: Safe API Call Pattern

```typescript
// 1. Check if hook exists in src/hooks/
// 2. If not, create a MINIMAL hook - global defaults handle protections:

import { useQuery } from '@tanstack/react-query';
import { myApi } from '@/lib/api';

export function useMyHook(id: string | undefined) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () => myApi.get(id!),
    enabled: !!id,
    // Optional: override staleTime only if data changes more frequently
    // staleTime: 5 * 60 * 1000,  // 5 min instead of global 30 min
  });
}

// 3. Use in component:
const { data, isLoading, error } = useMyHook(id);
```

**What you get automatically from global defaults (main.tsx):**
| Setting | Value | Effect |
|---------|-------|--------|
| `staleTime` | 30 min | Data considered fresh, no refetch |
| `gcTime` | 1 hour | Cache retained in memory |
| `refetchOnWindowFocus` | false | No refetch on tab switch |
| `refetchOnReconnect` | false | No burst on network restore |
| `retry` | Skips 429 | Never amplifies rate limiting |

**Only add options if you need DIFFERENT behavior than defaults.**

---

## Component Resilience (CRITICAL)

**These rules prevent the frontend from crashing when APIs fail.**

### Rule 1: ALWAYS Handle Loading, Error, and Empty States

```typescript
// BAD - Crashes if data is undefined
function ProjectList() {
  const { data } = useProjects();
  return data.map(p => <Card>{p.name}</Card>);  // TypeError!
}

// GOOD - Handle all states explicitly
function ProjectList() {
  const { data, isLoading, isError, error, refetch } = useProjects();

  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  if (isError) {
    return (
      <ErrorCard
        message={error?.message || 'Failed to load projects'}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState message="No projects yet" />;
  }

  return data.map(p => <Card>{p.name}</Card>);
}
```

### Rule 2: Defensive Data Access

```typescript
// BAD - Crashes on undefined
return data.items.map(item => <Item {...item} />);

// GOOD - Optional chaining + nullish coalescing
return data?.items?.map(item => <Item {...item} />) ?? null;

// BETTER - Explicit guard
if (!data?.items?.length) {
  return <EmptyState />;
}
return data.items.map(item => <Item {...item} />);
```

### Rule 3: Never Trust External Data

```typescript
// BAD - Assumes shape is correct
const userName = response.data.user.profile.name;

// GOOD - Defensive access
const userName = response?.data?.user?.profile?.name ?? 'Unknown';

// BETTER - Validate with Zod
const result = UserSchema.safeParse(response.data);
if (!result.success) {
  return <ErrorCard message="Invalid data received" />;
}
const userName = result.data.user.profile.name;
```

### Required State Handling Pattern

Every component using `useQuery` MUST follow this pattern:

```typescript
function MyComponent() {
  const query = useMyData(id);

  // 1. Loading state
  if (query.isLoading) {
    return <LoadingSkeleton />;
  }

  // 2. Error state
  if (query.isError) {
    return <ErrorCard error={query.error} onRetry={query.refetch} />;
  }

  // 3. Empty/null state
  if (!query.data) {
    return <EmptyState />;
  }

  // 4. Success state - safe to access data
  return <DataDisplay data={query.data} />;
}
```

### Common Patterns That Cause Crashes

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `data.items.map()` without guard | Crashes on undefined | Add `if (!data?.items)` check |
| Missing `isLoading` check | Renders with undefined data | Always check `isLoading` first |
| Missing `isError` check | Silent failures | Show error UI with retry |
| Assuming array has items | Crashes on empty array | Check `data.length > 0` |
| Deep property access | Crashes on missing nested data | Use optional chaining `?.` |

### Fallback UI Reference

| State | What to Show |
|-------|--------------|
| Loading | `<Skeleton />` or `<Spinner />` |
| Error (retryable) | Error card with Retry button |
| Error (permanent) | Error card with Support link |
| Empty data | Empty state with Create action |
| Partial data | Show what's available + loading indicator |

---

## URL Parameters & API Calls (CRITICAL)

**These rules prevent 400 Bad Request errors when using slug-based URLs.**

### Rule 1: NEVER Pass Raw URL Params to API Calls

URL parameters from `useParams()` can be either UUIDs or slugs (e.g., `my-task-title`). APIs expect UUIDs.

```typescript
// BAD - URL param might be a slug, API expects UUID
const { taskId } = useParams();
const { data } = useTaskAttempts(taskId);  // 400 error if taskId is a slug!

// GOOD - Resolve slug to entity first, then use the UUID
const { taskId } = useParams();
const selectedTask = resolveTaskFromParam(taskId, tasks, tasksById);
const { data } = useTaskAttempts(selectedTask?.id);  // Always UUID
```

### Rule 2: Use Resolver Functions for URL Params

Always use the appropriate resolver function from `lib/url-utils.ts`:

```typescript
import {
  resolveTaskFromParam,
  resolveProjectFromParam,
  resolveTeamFromParam,
  isUUID
} from '@/lib/url-utils';

// For tasks
const { taskId } = useParams();
const task = resolveTaskFromParam(taskId, tasks, tasksById);
// task?.id is always a UUID

// For projects
const { projectId } = useParams();
const project = resolveProjectFromParam(projectId, projects, projectsById);
// project?.id is always a UUID

// For teams
const { teamId } = useParams();
const team = resolveTeamFromParam(teamId, teams, teamsById);
// team?.id is always a UUID
```

### Rule 3: Update Hook `enabled` Conditions

When using resolved entities, update the `enabled` condition to check the resolved entity:

```typescript
// BAD - Checks raw param which might be a slug
const { data } = useTaskAttempts(taskId, {
  enabled: !!taskId && isLatest,
});

// GOOD - Checks resolved entity exists
const { data } = useTaskAttempts(selectedTask?.id, {
  enabled: !!selectedTask && isLatest,
});
```

### URL Parameter Flow

```
URL Param (slug or UUID)
        │
        ▼
  resolveXFromParam()  ──────► Entity Object { id: UUID, ... }
        │                              │
        ▼                              ▼
   Returns undefined             Use entity.id for API calls
   if not found
```

### Common Patterns That Cause 400 Errors

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `useQuery(urlParam)` directly | Slug passed to API | Resolve first, use `entity?.id` |
| `enabled: !!urlParam` | Enables with slug | Use `enabled: !!resolvedEntity` |
| Assuming URL param is UUID | 400 on slug URLs | Always use `resolveXFromParam()` |
| Not checking `isUUID()` | Mixed handling | Use resolver functions consistently |

### Quick Reference: Safe URL Param Pattern

```typescript
// 1. Get raw param from URL
const { taskId, projectId } = useParams();

// 2. Resolve to entity (handles both UUID and slug)
const selectedTask = useMemo(
  () => taskId ? resolveTaskFromParam(taskId, tasks, tasksById) : null,
  [taskId, tasks, tasksById]
);

// 3. Use entity.id for API calls
const { data } = useTaskAttempts(selectedTask?.id, {
  enabled: !!selectedTask,
});

// 4. Use entity for display
return <TaskPanel task={selectedTask} />;
```

---

## UI Components (shadcn/ui)

### Tooltip Requires Provider

Tooltip components MUST be wrapped in `TooltipProvider`. Missing this causes a runtime error:
`'Tooltip' must be used within 'TooltipProvider'`

```typescript
// BAD - Crashes at runtime with provider error
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

<Tooltip>
  <TooltipTrigger>Hover me</TooltipTrigger>
  <TooltipContent>Content</TooltipContent>
</Tooltip>

// GOOD - Always wrap with TooltipProvider
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>Hover me</TooltipTrigger>
    <TooltipContent>Content</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Other Provider-Required Components

Some shadcn/ui components require context providers:

| Component | Required Provider | Notes |
|-----------|------------------|-------|
| `Tooltip` | `TooltipProvider` | Wrap each tooltip or add globally in App |
| `Dialog` | None (self-contained) | Uses Radix portal |
| `DropdownMenu` | None (self-contained) | Uses Radix portal |
| `Popover` | None (self-contained) | Uses Radix portal |

---

## Container & Layout Overflow (CRITICAL)

**These rules prevent content from being cut off at viewport edges or causing unwanted scrollbars.**

### Rule 1: Fixed-Width Sidebars MUST Have Overflow Control

Any fixed-width container (sidebar, panel, TOC) MUST explicitly handle overflow:

```typescript
// BAD - Content can overflow and get cut off at viewport edge
<aside className="w-64 shrink-0 border-l">
  <nav>{items.map(item => <span>{item.text}</span>)}</nav>
</aside>

// GOOD - Overflow is contained within the sidebar
<aside className="w-64 shrink-0 border-l overflow-y-auto overflow-x-hidden">
  <nav>{items.map(item => <span className="truncate">{item.text}</span>)}</nav>
</aside>
```

### Rule 2: Text Truncation Requires Explicit Classes

The `truncate` utility may not work reliably in all contexts. Use explicit classes:

```typescript
// MAY NOT WORK - truncate alone in some flex/grid contexts
<button className="truncate">Long text here...</button>

// GOOD - Explicit truncation with all required properties
<button className="overflow-hidden text-ellipsis whitespace-nowrap">
  Long text here...
</button>

// ALSO GOOD - Add max-width constraint when in flex container
<button className="truncate max-w-full">Long text here...</button>
```

### Rule 3: Flex Containers Need min-w-0 for Truncation

Child elements in flex containers won't truncate without `min-w-0`:

```typescript
// BAD - Text overflows flex container
<div className="flex">
  <span className="truncate">{longText}</span>  // Won't truncate!
</div>

// GOOD - min-w-0 allows flex child to shrink below content size
<div className="flex">
  <span className="truncate min-w-0">{longText}</span>
</div>

// ALSO GOOD - Apply to the flex item wrapper
<div className="flex">
  <div className="min-w-0 flex-1">
    <span className="truncate">{longText}</span>
  </div>
</div>
```

### Fixed-Width Container Checklist

When creating sidebars, panels, or fixed-width sections:

| Property | Purpose | Required? |
|----------|---------|-----------|
| `overflow-y-auto` | Vertical scroll for tall content | Yes |
| `overflow-x-hidden` | Prevent horizontal overflow | Yes |
| `shrink-0` | Prevent flex shrinking | For sidebars |
| `min-w-0` | Allow children to truncate | For flex children |

### Common Patterns That Cause Layout Issues

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Fixed-width without `overflow-x-hidden` | Content clips at viewport | Add `overflow-x-hidden` |
| `truncate` without width constraint | Text doesn't truncate | Add `max-w-full` or explicit width |
| Flex child without `min-w-0` | Child can't shrink below content | Add `min-w-0` to flex child |
| Nested scrollable containers | Conflicting scroll behaviors | Only one container should scroll |
| Missing `shrink-0` on sidebar | Sidebar shrinks on small screens | Add `shrink-0` |

### IKA-331 Incident Summary

**Problem:** "On this page" TOC sidebar text was cut off at the viewport edge.

**Root Cause:**
1. Sidebar lacked `overflow-x-hidden` to contain horizontal overflow
2. `truncate` class wasn't working reliably

**Fix:**
1. Added `overflow-x-hidden` to the `<aside>` container
2. Used explicit `overflow-hidden text-ellipsis whitespace-nowrap` for text

**Prevention:** Always add overflow control to fixed-width containers and verify truncation works.

---

## Document Content Rendering (CRITICAL)

**These rules ensure documents display as formatted content, not raw Markdown syntax.**

### Rule 1: ALWAYS Render Text Content Through MarkdownViewer

All text-based document content MUST be rendered through the `MarkdownViewer` component, regardless of file extension.

```typescript
// BAD - Shows raw Markdown syntax (# heading, ## subheading, etc.)
{isText && content && (
  <pre className="...">
    {content.content}
  </pre>
)}

// GOOD - Renders formatted content (headings, tables, code blocks, links)
{isText && content && (
  <MarkdownViewer
    content={content.content || ''}
    showOutline={false}
    className="flex-1"
  />
)}
```

### Why This Matters

| Rendering Method | User Sees | Example |
|------------------|-----------|---------|
| Raw `<pre>` tag | `# Migration to Postgres` | Raw syntax characters |
| `MarkdownViewer` | **Migration to Postgres** (H1) | Formatted heading |

Without MarkdownViewer:
- Headings show as `# Title` instead of formatted H1
- Tables show as `| col | col |` instead of HTML tables
- Code blocks show as triple backticks instead of syntax-highlighted blocks
- Links show as `[text](url)` instead of clickable links

### What MarkdownViewer Handles

| Markdown Syntax | Rendered Output |
|-----------------|-----------------|
| `# Heading` | H1 styled heading |
| `## Subheading` | H2 styled heading |
| `**bold**` | **bold text** |
| `` `code` `` | Inline code styling |
| ` ```code block``` ` | Syntax-highlighted code block |
| `[link](url)` | Clickable hyperlink |
| `| table |` | HTML table with borders |
| `- list item` | Bulleted list |
| `> quote` | Styled blockquote |

### When to Use Each Viewer

| Content Type | Viewer | Why |
|--------------|--------|-----|
| `.md` / `.markdown` files | `MarkdownViewer` | Explicit Markdown |
| Text content (`content_type: 'text'`) | `MarkdownViewer` | May contain Markdown syntax |
| PDF text extraction | `MarkdownViewer` | May have structure |
| `.pdf` files | `PdfViewer` | Binary PDF rendering |
| `.csv` files | `CsvViewer` | Tabular data grid |
| Images | `ImageViewer` | Binary image rendering |

### IKA-307 Incident Summary

**Problem:** Documents showed raw Markdown syntax instead of formatted content.

**Root Cause:** Text content without `.md` extension was rendered in a `<pre>` tag instead of `MarkdownViewer`.

**Fix:** Changed all text content to render through `MarkdownViewer`:
- Markdown gracefully handles plain text (renders as paragraphs)
- If content has Markdown syntax, it's properly formatted
- Matches Claude API Docs behavior

**Prevention:** Always use `MarkdownViewer` for any text-based content, never raw `<pre>` tags for document display.

---

## File Organization

### When to Split Files

**Backend (Rust):**
```
// Instead of one large routes.rs (500+ lines)
routes/
├── mod.rs          # Router composition only
├── auth.rs         # Auth routes
├── users.rs        # User routes
├── teams.rs        # Team routes
└── storage/
    ├── mod.rs
    ├── s3.rs
    └── google_drive.rs
```

**Frontend (React):**
```
// Instead of one large Component.tsx (500+ lines)
components/
├── Dashboard/
│   ├── index.tsx           # Main component, exports
│   ├── DashboardHeader.tsx
│   ├── DashboardSidebar.tsx
│   ├── DashboardContent.tsx
│   └── hooks/
│       └── useDashboardData.ts
```

### Split Triggers
| Lines | Action |
|-------|--------|
| < 200 | Fine as-is |
| 200-400 | Consider splitting if multiple responsibilities |
| > 400 | **Must split** |

---

## Summary Checklist

| Check | Backend | Frontend |
|-------|---------|----------|
| No unused imports | `cargo check` | `pnpm lint` |
| No unused variables | `cargo check` | `pnpm lint` |
| No unused functions | `cargo clippy` | `pnpm lint` |
| File under 400 lines | Manual | Manual |
| Linter passes | `cargo clippy` | `pnpm lint` |
| Types pass | `cargo check` | `pnpm check` |
| **Route uses `{param}` not `:param`** | Code review | N/A |
| **Routes in both server + remote crates** | Code review | N/A |
| **Route prefix matches frontend (`/api/`)** | Code review | N/A |
| **Migrations use idempotent patterns** | Code review | N/A |
| **No direct API calls in useEffect** | N/A | Code review |
| **useQuery uses global defaults (don't override)** | N/A | Code review |
| **invalidateQueries uses refetchType: 'none'** | N/A | Code review |
| **Mutation cache strategy matches server behavior** | N/A | Code review |
| **Components handle isLoading state** | N/A | Code review |
| **Components handle isError state** | N/A | Code review |
| **Components handle empty/null data** | N/A | Code review |
| **No unsafe data access (use `?.`)** | N/A | Code review |
| **URL params resolved before API calls** | N/A | Code review |
| **Tooltip wrapped in TooltipProvider** | N/A | Code review |
| **Text content uses MarkdownViewer** | N/A | Code review |
| **Fixed-width containers have overflow control** | N/A | Code review |
| **Text truncation uses explicit classes** | N/A | Code review |

---

## Lessons Learned

**Full incident details:** See `.claude/lessons-learned.md`

### Quick Reference

| Incident | Issue | Key Prevention |
|----------|-------|----------------|
| **IKA-76** | Direct API call in useEffect | Use TanStack Query hooks |
| **IKA-77** | invalidateQueries cascade | Add `refetchType: 'none'` |
| **IKA-83** | Retry amplified 429 errors | Use global QueryClient defaults |
| **IKA-84** | URL slug passed to API | Resolve param to entity first |
| **IKA-148** | Optimistic update with server-computed data | Invalidate + refetch if server transforms data |
| **IKA-234** | Tooltip without TooltipProvider | Always wrap Tooltip in TooltipProvider |
| **IKA-307** | Raw Markdown syntax in documents | Use MarkdownViewer for all text content |
| **IKA-331** | TOC cut off at viewport edge | Add overflow-x-hidden to fixed-width containers |
| **VIB-70** | Migration file modified | Never modify existing migrations |
| **IKA-215** | Non-idempotent migrations | Use IF NOT EXISTS, DO blocks, DROP IF EXISTS |
| **IKA-215** | Axum `:param` syntax panic | Use `{param}` syntax (Axum 0.7+) |
| **IKA-215** | Route prefix mismatch (`/v1/` vs `/api/`) | Serve under both prefixes |
| **IKA-215** | Routes missing in remote crate | Ensure parity between server/remote crates |

### Rate Limiting Prevention (IKA-76, IKA-77, IKA-83)

1. Always use TanStack Query hooks for API calls
2. Always add `refetchType: 'none'` to `invalidateQueries()` calls
3. Use global defaults - don't override in individual hooks
4. Don't override `retry`, `refetchOnWindowFocus`, or `refetchOnReconnect`

### Mutation Cache Strategy (IKA-148)

1. Check if server transforms/computes data differently from what you send
2. If server echoes back exactly what you send → optimistic update OK
3. If server transforms data (saves diffs, merges defaults) → invalidate + refetch
4. If server returns the saved data → use the response to update cache

### URL Parameter Prevention (IKA-84)

1. Never pass raw `useParams()` values to API hooks
2. Always resolve to entity first using `resolveXFromParam()`
3. Update `enabled` conditions to check resolved entity
4. Remember: URL params can be slugs OR UUIDs, APIs expect UUIDs

### UI Component Providers (IKA-234)

1. Always wrap `Tooltip` components in `TooltipProvider`
2. Check shadcn/ui docs for provider requirements when using new components
3. Runtime errors like "X must be used within Y" indicate missing provider

### Document Content Rendering (IKA-307)

1. NEVER render text content with raw `<pre>` tags
2. ALWAYS use `MarkdownViewer` for document text content
3. Markdown handles plain text gracefully (renders as paragraphs)
4. If content has Markdown syntax, it's properly formatted
5. This applies regardless of file extension - check `content_type`, not just `file_type`

### Layout Overflow Prevention (IKA-331)

1. Fixed-width sidebars/panels MUST have `overflow-x-hidden`
2. Use `overflow-y-auto` for vertical scrolling
3. Text truncation needs explicit `overflow-hidden text-ellipsis whitespace-nowrap`
4. Flex children need `min-w-0` to allow truncation
5. Always test layouts at minimum supported viewport width

### Backend Deployment Prevention (IKA-215)

**Migration Idempotency:**
1. All migrations MUST use idempotent patterns
2. Use `IF NOT EXISTS` for tables, indexes, columns
3. Use DO blocks with existence checks for constraints
4. Use `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`
5. Use `ON CONFLICT` for INSERT statements

**Route Configuration:**
1. Use `{param}` not `:param` for route parameters (Axum 0.7+)
2. Serve routes under both `/v1/` and `/api/` prefixes
3. Ensure route modules exist in both `server` and `remote` crates
4. Verify new endpoints work after deployment: `curl https://api.scho1ar.com/api/your-endpoint`

**Deployment Verification Checklist:**
- [ ] `cargo check --workspace` passes
- [ ] Server starts locally without panics
- [ ] New endpoints respond correctly after deploy
- [ ] Frontend can reach all expected endpoints

---

## Backend API Design (CRITICAL)

**These rules prevent frontend/backend integration failures. Learned from IKA-216 (full day debugging auth + API mismatches).**

### Rule 1: Consistent Naming - Use `workspace_id` Everywhere

```rust
// BAD - Mixed terminology causes 400 Bad Request
struct ProjectsQuery {
    organization_id: Uuid,  // Frontend sends workspace_id!
}

// GOOD - Match frontend terminology
struct ProjectsQuery {
    workspace_id: Uuid,
}
```

**iKanban uses `workspace`, NOT `organization`:**
- Database: `tenant_workspaces` table
- Frontend: `workspace_id` parameter
- Backend: Must accept `workspace_id`

### Rule 2: API Contract First - Define Before Frontend Uses

**Never assume an endpoint exists. Define it explicitly:**

```rust
// BAD - Frontend calls /registrations/me but it doesn't exist
// Result: 404 or 403 errors, confused debugging

// GOOD - Define endpoint BEFORE frontend implements the call
/// User's own registration status (not superadmin)
pub fn user_router() -> Router<AppState> {
    Router::new()
        .route("/registrations/me", get(get_my_registration))
}
```

**Workflow:**
1. Frontend needs data → Document the endpoint contract
2. Backend implements endpoint → Test with curl
3. Frontend implements call → Integration works

### Rule 3: Auth Tested End-to-End

**Unit tests are not enough. Test the full auth flow:**

```bash
# Test public endpoints
curl https://api.scho1ar.com/v1/billing/plans
# Should return 200

# Test protected endpoints (with token)
curl -H "Authorization: Bearer $TOKEN" https://api.scho1ar.com/api/projects?workspace_id=xxx
# Should return 200

# Test protected endpoints (without token)
curl https://api.scho1ar.com/api/projects?workspace_id=xxx
# Should return 401
```

**Auth checklist:**
- [ ] Token validation works (correct algorithm: RS256 for Clerk)
- [ ] JWKS/secrets configured in production env vars
- [ ] Public endpoints accessible without auth
- [ ] Protected endpoints return 401 without token
- [ ] User context injected correctly into handlers

### Rule 4: Public vs Protected Clearly Separated

```rust
// BAD - Mixed in same router, confusing which needs auth
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/plans", get(get_plans))           // Should be public
        .route("/usage", get(get_usage))           // Needs auth
        .route("/registrations", get(list_all))    // Superadmin only
}

// GOOD - Explicit separation
pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/billing/plans", get(get_plans))  // No auth needed
}

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/billing/usage", get(get_usage))  // Requires auth
}

pub fn superadmin_router() -> Router<AppState> {
    Router::new()
        .route("/registrations", get(list_all))   // Requires superadmin
}
```

**In routes/mod.rs:**
```rust
let v1_public = Router::new()
    .merge(billing::public_router());    // No middleware

let v1_protected = Router::new()
    .merge(billing::protected_router())
    .layer(middleware::from_fn_with_state(state.clone(), require_clerk_session));

let v1_superadmin = Router::new()
    .merge(registrations::router())
    .layer(middleware::from_fn_with_state(state.clone(), require_superadmin));
```

### Rule 5: Frontend/Backend Developed Together

**Never make assumptions about what the other side sends/expects:**

| Scenario | Problem | Prevention |
|----------|---------|------------|
| Frontend assumes endpoint exists | 404/403 errors | Define contract first |
| Backend expects `organization_id` | 400 Bad Request | Check frontend code |
| Auth changed on frontend (Clerk) | 401 InvalidAlgorithm | Update backend auth |
| Endpoint needs auth but called before login | 401 on page load | Make it public or guard in frontend |

**Integration checklist before deploying:**
- [ ] All endpoints frontend calls exist in backend
- [ ] Parameter names match (workspace_id, not organization_id)
- [ ] Auth method matches (Clerk RS256, not HS256)
- [ ] Public pages don't call protected endpoints
- [ ] Error responses have consistent format

### Quick Reference: Endpoint Categories

| Category | Auth Required | Example Routes | Router |
|----------|---------------|----------------|--------|
| **Public** | No | `/billing/plans`, `/health` | `public_router()` |
| **Protected** | User token | `/projects`, `/tasks`, `/registrations/me` | `protected_router()` |
| **Superadmin** | Superadmin check | `/registrations` (list all), `/users/manage` | `superadmin_router()` |

### IKA-216 Incident Summary

**Full day of debugging caused by:**
1. Auth mismatch: Frontend sent Clerk RS256 tokens, backend expected HS256
2. Missing endpoint: `/registrations/me` didn't exist
3. Wrong router: Registrations in superadmin-only routes
4. Parameter mismatch: Backend expected `organization_id`, frontend sent `workspace_id`
5. Public endpoint in protected router: `/billing/plans` required auth but called on landing page

**All preventable with these 5 rules.**
