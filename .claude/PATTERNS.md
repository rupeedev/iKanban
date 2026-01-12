# iKanban Code Patterns

Common patterns and conventions used in this codebase.

---

## Frontend Patterns

### Component Structure
```tsx
// src/components/feature/FeatureName.tsx
import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useFeatureQuery } from "@/hooks/useFeature";

interface FeatureNameProps {
  id: string;
  onComplete?: () => void;
}

export function FeatureName({ id, onComplete }: FeatureNameProps) {
  const { data, isLoading } = useFeatureQuery(id);

  // Memoize derived state
  const displayItems = useMemo(() => {
    if (!data?.items) return [];
    return data.items.map(transformItem);
  }, [data]);

  // Stable callback refs
  const handleAction = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  if (isLoading) return <Skeleton />;

  return (
    <div className="flex flex-col gap-4">
      {/* content */}
    </div>
  );
}
```

### Discriminated Union Props Pattern
```tsx
// For components with multiple modes
export type TaskFormDialogProps =
  | { mode: 'create'; projectId: string; teamId?: string }
  | { mode: 'edit'; projectId: string; task: Task }
  | { mode: 'duplicate'; projectId: string; initialTask: Task }
  | { mode: 'subtask'; projectId: string; parentTaskAttemptId: string };
```

---

## Query Patterns (TanStack Query v5)

### Query Key Factory
```tsx
// src/hooks/useFeature.ts
export const featureKeys = {
  all: ['feature'] as const,
  lists: () => [...featureKeys.all, 'list'] as const,
  list: (filters: Filters) => [...featureKeys.lists(), filters] as const,
  details: () => [...featureKeys.all, 'detail'] as const,
  detail: (id: string) => [...featureKeys.details(), id] as const,
};
```

### Query Hook with Conditional Fetching
```tsx
export function useFeature(id: string | undefined) {
  return useQuery({
    queryKey: featureKeys.detail(id || ''),
    queryFn: () => api.getFeature(id!),
    enabled: !!id,
    staleTime: 30000,
  });
}
```

### Mutation Hook with Optimistic Updates
```tsx
export function useUpdateFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => api.updateFeature(id, data),
    onSuccess: (result, { id }) => {
      // Update cache optimistically
      queryClient.setQueryData(featureKeys.detail(id), result);
      // Invalidate but don't refetch immediately (prevents 429)
      queryClient.invalidateQueries({
        queryKey: featureKeys.lists(),
        refetchType: 'none',
      });
    },
  });
}
```

### Grouped Mutations Hook
```tsx
// Return related mutations together
export function useTaskMutations(projectId?: string) {
  const queryClient = useQueryClient();

  const createTask = useMutation({ ... });
  const updateTask = useMutation({ ... });
  const deleteTask = useMutation({ ... });

  return { createTask, updateTask, deleteTask };
}
```

---

## Zustand Store Pattern

### Minimal UI State Store
```tsx
// src/stores/featureStore.ts
import { create } from "zustand";

interface FeatureState {
  isOpen: boolean;
  activeId: string | null;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveId: (id: string | null) => void;
}

export const useFeatureStore = create<FeatureState>((set) => ({
  isOpen: false,
  activeId: null,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, activeId: null }),
  setActiveId: (id) => set({ activeId: id }),
}));
```

### Generic Expandable Store
```tsx
// For collapsible sections
interface ExpandableState {
  expanded: Record<string, boolean>;
  setKey: (key: string, value: boolean) => void;
  toggleKey: (key: string, fallback?: boolean) => void;
}

export const useExpandableStore = create<ExpandableState>((set) => ({
  expanded: {},
  setKey: (key, value) => set((s) => ({
    expanded: { ...s.expanded, [key]: value }
  })),
  toggleKey: (key, fallback = false) => set((s) => ({
    expanded: { ...s.expanded, [key]: !(s.expanded[key] ?? fallback) }
  })),
}));

// Hook wrapper
export function useExpandable(key: string, defaultValue = false) {
  const value = useExpandableStore((s) => s.expanded[key] ?? defaultValue);
  const toggle = useExpandableStore((s) => s.toggleKey);
  return [value, () => toggle(key, defaultValue)] as const;
}
```

---

## Modal Pattern (Nice Modal React)

### Modal Definition Helper
```tsx
// src/lib/modals.ts
import NiceModal, { useModal } from "@ebay/nice-modal-react";

export type Modalized<P, R> = React.ComponentType<P> & {
  show: (props?: P) => Promise<R>;
  hide: () => void;
  remove: () => void;
};

export function defineModal<P, R>(
  component: React.ComponentType<P>
): Modalized<P, R> {
  const c = component as Modalized<P, R>;
  c.show = (props) => NiceModal.show(component, props) as Promise<R>;
  c.hide = () => NiceModal.hide(component);
  c.remove = () => NiceModal.remove(component);
  return c;
}
```

### Modal Implementation
```tsx
// src/components/dialogs/FeatureDialog.tsx
import NiceModal, { useModal } from "@ebay/nice-modal-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { defineModal } from "@/lib/modals";

interface FeatureDialogProps {
  id: string;
}

const FeatureDialogImpl = NiceModal.create<FeatureDialogProps>(({ id }) => {
  const modal = useModal();

  const handleComplete = (result: FeatureResult) => {
    modal.resolve(result);
    modal.hide();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={modal.hide}>
      <DialogContent>
        {/* form content */}
        <Button onClick={() => handleComplete(data)}>Save</Button>
      </DialogContent>
    </Dialog>
  );
});

export const FeatureDialog = defineModal<FeatureDialogProps, FeatureResult>(
  FeatureDialogImpl
);

// Usage:
const result = await FeatureDialog.show({ id: "123" });
```

---

## API Pattern

### API Namespace Organization
```tsx
// src/lib/api.ts
const API_URL = import.meta.env.VITE_API_URL;

export const tasksApi = {
  list: async (projectId: string): Promise<Task[]> => {
    const res = await makeRequest(`/api/tasks?project_id=${projectId}`);
    return handleApiResponse<Task[]>(res);
  },

  getById: async (id: string): Promise<Task> => {
    const res = await makeRequest(`/api/tasks/${id}`);
    return handleApiResponse<Task>(res);
  },

  create: async (data: CreateTask): Promise<Task> => {
    const res = await makeRequest(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(res);
  },

  update: async (id: string, data: UpdateTask): Promise<Task> => {
    const res = await makeRequest(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(res);
  },

  delete: async (id: string): Promise<void> => {
    const res = await makeRequest(`/api/tasks/${id}`, { method: 'DELETE' });
    return handleApiResponse<void>(res);
  },
};

export const teamsApi = { ... };
export const projectsApi = { ... };
// 27 API namespaces total
```

### Request Queue (Rate Limit Prevention)
```tsx
class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private activeCount = 0;
  private readonly MAX_CONCURRENT = 2;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount < this.MAX_CONCURRENT) {
      this.activeCount++;
      try {
        return await fn();
      } finally {
        this.activeCount--;
        this.processNext();
      }
    }
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); }
        catch (e) { reject(e); }
      });
    });
  }
}

const globalQueue = new RequestQueue();
```

### Auth Header Integration
```tsx
async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await authTokenGetter?.();
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}
```

---

## Context Pattern

### Provider with TanStack Query + localStorage
```tsx
// src/contexts/WorkspaceContext.tsx
const STORAGE_KEY = 'current-workspace-id';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const queryClient = useQueryClient();

  // Persist selection to localStorage
  const [currentId, setCurrentId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  const setCurrentWorkspaceId = useCallback((id: string | null) => {
    setCurrentId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Fetch with TanStack Query
  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: () => api.listWorkspaces(),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select first
  useEffect(() => {
    if (!isLoading && workspaces.length > 0 && !currentId) {
      setCurrentWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, currentId, isLoading]);

  const value = useMemo(() => ({
    currentWorkspaceId: currentId,
    workspaces,
    isLoading,
    setCurrentWorkspaceId,
  }), [currentId, workspaces, isLoading]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
```

---

## Backend Patterns

### Axum Handler Pattern
```rust
// crates/server/src/routes/feature.rs
use axum::{extract::{Path, State}, Json};

pub async fn get_feature(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    claims: Claims,  // Extracted by auth middleware
) -> Result<Json<Feature>, AppError> {
    let feature = db::get_feature(&pool, id, claims.user_id).await?;
    Ok(Json(feature))
}

pub async fn create_feature(
    State(pool): State<PgPool>,
    claims: Claims,
    Json(payload): Json<CreateFeatureRequest>,
) -> Result<Json<Feature>, AppError> {
    let feature = db::create_feature(&pool, claims.user_id, payload).await?;
    Ok(Json(feature))
}
```

### SQLx Query Pattern
```rust
// crates/db/src/features.rs
pub async fn get_feature(
    pool: &PgPool,
    id: Uuid,
    user_id: String,
) -> Result<Feature, sqlx::Error> {
    sqlx::query_as!(
        Feature,
        r#"
        SELECT
            id as "id!: Uuid",
            name,
            created_at as "created_at!: DateTime<Utc>",
            updated_at as "updated_at!: DateTime<Utc>"
        FROM features
        WHERE id = $1 AND user_id = $2
        "#,
        id,
        user_id
    )
    .fetch_one(pool)
    .await
}
```

### Error Handling Pattern
```rust
// crates/server/src/error.rs
use axum::{http::StatusCode, response::IntoResponse, Json};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Not found")]
    NotFound,
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Forbidden")]
    Forbidden,
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "Forbidden"),
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
```

### Router Pattern
```rust
// crates/server/src/routes/mod.rs
use axum::{routing::{get, post, put, delete}, Router};

pub fn feature_routes() -> Router<AppState> {
    Router::new()
        .route("/features", get(list_features).post(create_feature))
        .route("/features/:id", get(get_feature).put(update_feature).delete(delete_feature))
}
```

---

## File Naming Conventions

### Frontend
```
src/
├── components/
│   ├── ui/              # shadcn components (kebab-case)
│   │   └── button.tsx
│   ├── dialogs/         # Modal dialogs by feature
│   │   ├── tasks/       # Task dialogs
│   │   ├── global/      # App-wide dialogs
│   │   └── teams/       # Team dialogs
│   ├── chat/            # Chat components (PascalCase)
│   │   └── TeamChatPanel.tsx
│   └── tasks/           # Task components (PascalCase)
│       └── TaskCard.tsx
├── hooks/               # Custom hooks (camelCase with use prefix)
│   └── useFeature.ts
├── stores/              # Zustand stores (camelCase)
│   └── featureStore.ts
├── contexts/            # React contexts (PascalCase)
│   └── WorkspaceContext.tsx
├── lib/                 # Utilities (camelCase)
│   ├── api.ts           # API namespaces
│   └── modals.ts        # Modal helpers
└── types/               # Type definitions (camelCase)
    └── feature.ts
```

### Backend
```
crates/
├── server/src/
│   ├── routes/          # Route handlers (snake_case)
│   │   └── feature.rs
│   └── middleware/      # Middleware (snake_case)
│       └── auth.rs
├── db/src/
│   └── features.rs      # DB operations (snake_case)
└── services/src/
    └── feature.rs       # Business logic (snake_case)
```

---

## Key Conventions

1. **No Props Spreading** - Props are explicit and typed
2. **useCallback for Stability** - Event handlers maintain referential equality
3. **useMemo for Derived State** - Computed values are memoized
4. **Query Keys Factored** - Each domain has a key factory
5. **Error Logging** - All mutations log errors to console
6. **Loading States** - Track create/update/delete separately
7. **No Inline Objects** - Event handlers don't create new objects in JSX
8. **Ref Forwarding** - Components forward refs when needed
9. **i18n Ready** - User-facing strings use translation keys
10. **Type Safety** - Use shared/types imports for end-to-end safety
11. **Max 400 Lines** - Split components if exceeding limit
12. **refetchType: 'none'** - Prevent 429 errors on cache invalidation
