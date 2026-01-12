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

## Backend (Rust)

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
| **No direct API calls in useEffect** | N/A | Code review |
| **useQuery uses global defaults (don't override)** | N/A | Code review |
| **invalidateQueries uses refetchType: 'none'** | N/A | Code review |
| **Components handle isLoading state** | N/A | Code review |
| **Components handle isError state** | N/A | Code review |
| **Components handle empty/null data** | N/A | Code review |
| **No unsafe data access (use `?.`)** | N/A | Code review |
| **URL params resolved before API calls** | N/A | Code review |

---

## Lessons Learned (IKA-76, IKA-77, IKA-83, IKA-84)

### Rate Limiting Issues (IKA-76, IKA-77, IKA-83)

**Issue:** 429 rate limiting blocked entire team from using app.

**Root Cause #1 (IKA-76):** Direct `teamsApi.getProjects()` call in `useEffect` bypassed TanStack Query, causing duplicate requests on every render.

**Root Cause #2 (IKA-77):** 30+ files had `invalidateQueries()` calls without `refetchType: 'none'`, causing cascade refetches that triggered 429 errors.

**Root Cause #3 (IKA-83):** Global QueryClient defaults had `retry: 2` which retried 429 errors, amplifying rate limiting. Individual hooks were inconsistently adding rate limit protections.

**Fix (IKA-76):** Replace with `useTeamProjects()` hook.

**Fix (IKA-77):** Add `refetchType: 'none'` to ALL `invalidateQueries()` calls (100+ instances across 30+ files).

**Fix (IKA-83):** Centralized rate limit handling in `main.tsx` QueryClient global defaults:
- Added `isRateLimitError()` helper function
- Modified `retry` to skip 429 errors globally
- Added `refetchOnReconnect: false` to prevent burst on network restore
- Removed redundant rate limit code from individual hooks

**Prevention:**
1. Always use TanStack Query hooks for API calls. Never use direct API calls in useEffect.
2. Always add `refetchType: 'none'` to `invalidateQueries()` calls - this marks queries as stale without triggering immediate refetch cascades.
3. **Use global defaults** - don't add rate limit handling to individual hooks. The `main.tsx` QueryClient already handles it for all queries.
4. **Don't override** `retry`, `refetchOnWindowFocus`, or `refetchOnReconnect` in individual hooks unless you have a specific reason.

---

### URL Slug vs UUID Issues (IKA-84)

**Issue:** 400 Bad Request errors when viewing tasks via slug URLs.

**Root Cause (IKA-84):** `useTaskAttempts(taskId)` was called with the raw URL parameter which could be a slug (e.g., `create-secure-and-ordered-data-storage-for-admin-data`) instead of a UUID. The API endpoint `/api/task-attempts?task_id=` expects a valid UUID.

**Code Location:** `ProjectTasks.tsx` line 230-235

```typescript
// BEFORE (broken):
const { taskId } = useParams();
const { data } = useTaskAttempts(taskId, { enabled: !!taskId && isLatest });

// AFTER (fixed):
const { taskId } = useParams();
const selectedTask = resolveTaskFromParam(taskId, tasks, tasksById);
const { data } = useTaskAttempts(selectedTask?.id, { enabled: !!selectedTask && isLatest });
```

**Fix (IKA-84):** Use `selectedTask?.id` (resolved UUID) instead of raw `taskId` (could be slug).

**Prevention:**
1. **Never pass raw URL params to API calls** - always resolve to entity first using `resolveXFromParam()`.
2. **Update `enabled` conditions** - check the resolved entity exists, not just the URL param.
3. **Use resolver functions** from `lib/url-utils.ts`:
   - `resolveTaskFromParam(param, tasks, tasksById)`
   - `resolveProjectFromParam(param, projects, projectsById)`
   - `resolveTeamFromParam(param, teams, teamsById)`
4. **Remember:** URL params can be either UUIDs or slugs. APIs always expect UUIDs.
