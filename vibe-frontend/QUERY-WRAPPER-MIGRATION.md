# QueryWrapper Migration Guide

This guide shows how to migrate pages from manual loading/error/empty state handling to the standardized `QueryWrapper` component.

## Why Migrate?

**Before**: Manual handling is inconsistent and error-prone
```tsx
function TeamProjects() {
  const { projects, isLoading, error } = useTeamProjects(teamId);

  if (isLoading) {
    return <Loader message="Loading..." />;
  }

  if (error) {
    return <Alert>{error.message}</Alert>;
  }

  if (!projects || projects.length === 0) {
    return <div>No projects found</div>;
  }

  return projects.map(p => <ProjectCard project={p} />);
}
```

**After**: QueryWrapper standardizes all states
```tsx
function TeamProjects() {
  const query = useTeamProjects(teamId);

  return (
    <QueryWrapper
      query={query}
      skeleton={<ProjectListSkeleton />}
      errorTitle="Failed to load projects"
      emptyMessage="No projects yet"
    >
      {(projects) => projects.map(p => <ProjectCard project={p} />)}
    </QueryWrapper>
  );
}
```

## Benefits

1. **Consistency**: All pages handle states the same way
2. **Type Safety**: Children receive correctly typed data (no null checks needed)
3. **Resilience**: Standardized error cards with retry functionality
4. **Less Code**: 15 lines → 8 lines
5. **Accessibility**: Built-in data-testid attributes for testing

## Migration Steps

### Step 1: Identify the Pattern

Look for this pattern in your component:
```tsx
const { data, isLoading, error } = useQuery(...);

if (isLoading) return <Loader />;
if (error) return <Alert>{error.message}</Alert>;
if (!data) return <EmptyState />;

return <ActualContent data={data} />;
```

### Step 2: Import QueryWrapper

```tsx
import { QueryWrapper } from '@/components/ui/query-wrapper';
```

### Step 3: Wrap Your Content

Replace the manual checks with QueryWrapper:

```tsx
// BEFORE
function MyComponent() {
  const { data, isLoading, error } = useMyData(id);

  if (isLoading) {
    return <Loader message="Loading data..." size={32} />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  return (
    <div>
      {data.map(item => <ItemCard key={item.id} item={item} />)}
    </div>
  );
}

// AFTER
function MyComponent() {
  const query = useMyData(id);

  return (
    <QueryWrapper
      query={query}
      skeleton={<Skeleton className="h-32 w-full" />}
      errorTitle="Failed to load data"
      emptyMessage="No data available"
      data-testid="my-data"
    >
      {(data) => (
        <div>
          {data.map(item => <ItemCard key={item.id} item={item} />)}
        </div>
      )}
    </QueryWrapper>
  );
}
```

### Step 4: Customize States (Optional)

```tsx
<QueryWrapper
  query={query}

  // Custom loading skeleton
  skeleton={<ProjectListSkeleton />}

  // Custom error messaging
  errorTitle="Failed to load projects"

  // Custom empty state
  emptyTitle="No projects"
  emptyMessage="Create your first project to get started"

  // Custom empty check (for complex data structures)
  isEmpty={(data) => !data || data.items.length === 0}

  // Test identifiers
  data-testid="projects-list"
>
  {(data) => /* typed data is guaranteed here */}
</QueryWrapper>
```

## Real-World Examples

### Example 1: TeamProjects.tsx Migration

**File**: `src/pages/TeamProjects.tsx`

**Before** (Lines 441-479):
```tsx
if (isLoading) {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">Loading projects...</span>
    </div>
  );
}

// ... more manual checks
```

**After**:
```tsx
export function TeamProjects() {
  const { teamId } = useParams<{ teamId: string }>();
  const projectsQuery = useTeamProjects(teamId);
  const membersQuery = useTeamMembers(teamId);
  const issuesQuery = useTeamIssues(teamId);
  const teamsQuery = useTeams();

  return (
    <div className="h-full flex flex-col">
      <QueryWrapper
        query={projectsQuery}
        skeleton={<TeamProjectsSkeleton />}
        errorTitle="Failed to load projects"
        emptyMessage="No projects in this team yet"
        data-testid="team-projects"
      >
        {(projects) => (
          <QueryWrapper
            query={membersQuery}
            skeleton={<Skeleton className="h-20" />}
            errorTitle="Failed to load team members"
            data-testid="team-members"
          >
            {(members) => (
              <TeamProjectsTable
                projects={projects}
                members={members}
                issues={issuesQuery.data ?? []}
                teams={teamsQuery.data ?? []}
              />
            )}
          </QueryWrapper>
        )}
      </QueryWrapper>
    </div>
  );
}
```

### Example 2: TeamIssues.tsx Migration

**File**: `src/pages/TeamIssues.tsx`

**Before** (Lines 290-324):
```tsx
if (error) {
  return (
    <div className="p-4">
      <Alert>
        <AlertTitle className="flex items-center gap-2">
          <AlertTriangle size="16" />
          {t('common:states.error')}
        </AlertTitle>
        <AlertDescription>
          {error.message || 'Failed to load team issues'}
        </AlertDescription>
      </Alert>
    </div>
  );
}

if (isLoading) {
  return <Loader message={t('loading')} size={32} className="py-8" />;
}

if (!team) {
  return (
    <div className="p-4">
      <Alert>
        <AlertTitle className="flex items-center gap-2">
          <AlertTriangle size="16" />
          Team not found
        </AlertTitle>
        <AlertDescription>
          The team you're looking for doesn't exist.
        </AlertDescription>
      </Alert>
    </div>
  );
}
```

**After**:
```tsx
export function TeamIssues() {
  const { t } = useTranslation(['tasks', 'common']);
  const { teamId } = useParams<{ teamId: string }>();
  const dashboardQuery = useTeamDashboard(teamId);

  return (
    <QueryWrapper
      query={dashboardQuery}
      skeleton={<TeamIssuesSkeleton />}
      errorTitle={t('common:states.error')}
      emptyTitle="Team not found"
      emptyMessage="The team you're looking for doesn't exist"
      data-testid="team-issues"
    >
      {({ team, members, projects, issues, issuesById }) => (
        <TeamIssuesContent
          team={team}
          members={members}
          projects={projects}
          issues={issues}
          issuesById={issuesById}
        />
      )}
    </QueryWrapper>
  );
}
```

### Example 3: Nested QueryWrappers

When you need multiple queries, nest QueryWrappers:

```tsx
function ProjectDetail() {
  const projectQuery = useProject(projectId);
  const tasksQuery = useTasks(projectId);

  return (
    <QueryWrapper
      query={projectQuery}
      skeleton={<ProjectHeaderSkeleton />}
      errorTitle="Failed to load project"
      data-testid="project-detail"
    >
      {(project) => (
        <>
          <ProjectHeader project={project} />
          <QueryWrapper
            query={tasksQuery}
            skeleton={<TaskListSkeleton />}
            errorTitle="Failed to load tasks"
            emptyMessage="No tasks in this project"
            data-testid="project-tasks"
          >
            {(tasks) => <TaskList tasks={tasks} />}
          </QueryWrapper>
        </>
      )}
    </QueryWrapper>
  );
}
```

## Custom Skeletons

Create reusable skeleton components for consistent loading states:

```tsx
// src/components/skeletons/TeamProjectsSkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton';

export function TeamProjectsSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
```

## Testing with QueryWrapper

QueryWrapper adds `data-testid` attributes automatically:

```tsx
<QueryWrapper query={query} data-testid="projects">
  {(data) => <Content />}
</QueryWrapper>

// Generates these test IDs:
// - projects-loading (during loading)
// - projects-error (on error)
// - projects-empty (when empty)
```

Playwright tests:

```ts
test('shows loading state', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('[data-testid="projects-loading"]')).toBeVisible();
});

test('shows error state', async ({ page }) => {
  await page.route('**/api/projects', route => route.abort());
  await page.goto('/projects');
  await expect(page.locator('[data-testid="projects-error"]')).toBeVisible();
  await expect(page.getByText('Retry')).toBeVisible();
});

test('shows empty state', async ({ page }) => {
  await page.route('**/api/projects', route => {
    route.fulfill({ status: 200, body: JSON.stringify([]) });
  });
  await page.goto('/projects');
  await expect(page.locator('[data-testid="projects-empty"]')).toBeVisible();
});
```

## Common Patterns

### Pattern: Complex Empty Check

```tsx
<QueryWrapper
  query={query}
  isEmpty={(data) => {
    // Custom logic for what counts as "empty"
    return !data || data.items.length === 0 || data.total === 0;
  }}
>
  {(data) => <Content data={data} />}
</QueryWrapper>
```

### Pattern: Partial States

If you need access to loading/error states while rendering:

```tsx
function MyComponent() {
  const query = useMyData(id);

  return (
    <div>
      {query.isFetching && <RefreshIndicator />}
      <QueryWrapper query={query}>
        {(data) => (
          <>
            <Header />
            <Content data={data} />
            {query.isError && <WarningBanner />}
          </>
        )}
      </QueryWrapper>
    </div>
  );
}
```

### Pattern: Action in Empty State

```tsx
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

<QueryWrapper
  query={query}
  emptyMessage="No projects found"
>
  {(data) => data.length > 0 ? (
    <ProjectList projects={data} />
  ) : (
    <EmptyState
      title="No projects"
      message="Create your first project to get started"
      action={<Button onClick={handleCreate}>Create Project</Button>}
    />
  )}
</QueryWrapper>
```

## Migration Checklist

- [ ] Remove manual `if (isLoading)` checks
- [ ] Remove manual `if (error)` checks
- [ ] Remove manual `if (!data)` checks
- [ ] Import `QueryWrapper` from `@/components/ui/query-wrapper`
- [ ] Pass the entire query result (not destructured)
- [ ] Provide custom skeleton if needed
- [ ] Set appropriate `errorTitle` and `emptyMessage`
- [ ] Add `data-testid` for testing
- [ ] Update Playwright tests to use new test IDs
- [ ] Remove unused imports (`Loader`, `Alert`, etc.)

## Pages Ready for Migration

High-traffic pages that would benefit from QueryWrapper:

1. ✅ **TeamIssues.tsx** (src/pages/TeamIssues.tsx)
   - Lines 290-324: Manual loading/error/empty checks
   - Priority: High (most visited page)

2. ✅ **TeamProjects.tsx** (src/pages/TeamProjects.tsx)
   - Lines 441-479: Manual loading/error checks
   - Priority: High (frequent access)

3. ✅ **TeamProjectDetail.tsx** (src/pages/TeamProjectDetail.tsx)
   - Check for similar patterns
   - Priority: Medium

4. ✅ **MyIssues.tsx** (src/pages/MyIssues.tsx)
   - Check for similar patterns
   - Priority: Medium

5. ✅ **TeamMembers.tsx** (src/pages/TeamMembers.tsx)
   - Check for similar patterns
   - Priority: Low

## Support

For questions or issues with migration:
- Reference: `.claude/CODING-GUIDELINES.md` (Component Resilience section)
- Examples: This document
- Tests: `vibe-testing/tests/IKA-23-error-boundaries.spec.ts`
