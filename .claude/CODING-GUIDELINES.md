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
