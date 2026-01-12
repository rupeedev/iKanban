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

// If no hook exists, CREATE ONE with proper configuration:
export function useMyData(id: string | undefined) {
  return useQuery({
    queryKey: ['mydata', id],
    queryFn: () => api.getData(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,      // 5 minutes - prevents re-fetching
    gcTime: 15 * 60 * 1000,        // 15 minutes cache retention
    refetchOnWindowFocus: false,   // Don't refetch on tab focus
    refetchOnReconnect: false,     // Don't refetch on reconnect
    retry: (failureCount, error) => {
      // NEVER retry 429 errors - it amplifies the problem
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,             // 60 seconds if retry needed
  });
}
```

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

### Rule 4: Rate Limit Error Handling

```typescript
// Helper function - use in all hooks
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

// In useQuery options:
retry: (failureCount, error) => {
  if (isRateLimitError(error)) return false;  // NEVER retry 429
  return failureCount < 1;
},
```

### Common Patterns That Cause 429 Errors

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `useEffect` + direct API call | Bypasses cache | Use `useQuery` hook |
| Multiple components fetching same data | Duplicate requests | Share query via hook |
| `invalidateQueries()` without `refetchType` | Cascade refetch | Add `refetchType: 'none'` |
| Retrying 429 errors | Amplifies problem | Check `isRateLimitError()` |
| Missing `staleTime` | Refetches too often | Set to 5+ minutes |
| `refetchOnWindowFocus: true` | Unexpected refetches | Set to `false` |

### Quick Reference: Safe API Call Pattern

```typescript
// 1. Check if hook exists in src/hooks/
// 2. If not, create hook with this template:

import { useQuery } from '@tanstack/react-query';
import { myApi } from '@/lib/api';

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

export function useMyHook(id: string | undefined) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () => myApi.get(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });
}

// 3. Use in component:
const { data, isLoading, error } = useMyHook(id);
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
| **useQuery hooks have staleTime** | N/A | Code review |
| **invalidateQueries uses refetchType** | N/A | Code review |

---

## Lessons Learned (IKA-76, IKA-77)

**Issue:** 429 rate limiting blocked entire team from using app.

**Root Cause #1 (IKA-76):** Direct `teamsApi.getProjects()` call in `useEffect` bypassed TanStack Query, causing duplicate requests on every render.

**Root Cause #2 (IKA-77):** 30+ files had `invalidateQueries()` calls without `refetchType: 'none'`, causing cascade refetches that triggered 429 errors.

**Fix (IKA-76):** Replace with `useTeamProjects()` hook.

**Fix (IKA-77):** Add `refetchType: 'none'` to ALL `invalidateQueries()` calls (100+ instances across 30+ files).

**Prevention:**
1. Always use TanStack Query hooks for API calls. Never use direct API calls in useEffect.
2. Always add `refetchType: 'none'` to `invalidateQueries()` calls - this marks queries as stale without triggering immediate refetch cascades.
