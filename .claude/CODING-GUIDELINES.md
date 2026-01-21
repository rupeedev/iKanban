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
| **Mutation cache strategy matches server behavior** | N/A | Code review |
| **Components handle isLoading state** | N/A | Code review |
| **Components handle isError state** | N/A | Code review |
| **Components handle empty/null data** | N/A | Code review |
| **No unsafe data access (use `?.`)** | N/A | Code review |
| **URL params resolved before API calls** | N/A | Code review |
| **Tooltip wrapped in TooltipProvider** | N/A | Code review |

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
| **VIB-70** | Migration file modified | Never modify existing migrations |

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
