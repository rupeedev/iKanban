# FILE-MAP.md

**Purpose:** Eliminate exploration by providing exact file paths. Read this FIRST to find any file.

---

## Frontend Pages (vibe-frontend/src/pages/)

| Page | File Path | Key Components |
|------|-----------|----------------|
| Team Issues | `src/pages/TeamIssues.tsx` | TeamIssuesContent, InsightsPanel |
| Team Project Detail | `src/pages/TeamProjectDetail.tsx` | ProjectInsightsPanel, TaskKanbanBoard |
| Team Projects | `src/pages/TeamProjects.tsx` | ProjectList |
| Team Documents | `src/pages/TeamDocuments.tsx` | Document list |
| Team Members | `src/pages/TeamMembers.tsx` | MemberListItem |
| Team GitHub | `src/pages/TeamGitHub.tsx` | GitHub integration |
| Project Tasks | `src/pages/ProjectTasks.tsx` | TaskKanbanBoard |
| My Issues | `src/pages/MyIssues.tsx` | Personal issues view |
| Inbox | `src/pages/Inbox.tsx` | Notifications |
| Views | `src/pages/Views.tsx` | Custom views |

### Settings Pages (src/pages/settings/)

| Page | File Path |
|------|-----------|
| Settings Layout | `src/pages/settings/SettingsLayout.tsx` |
| General | `src/pages/settings/GeneralSettings.tsx` |
| Project | `src/pages/settings/ProjectSettings.tsx` |
| Organization | `src/pages/settings/OrganizationSettings.tsx` |
| Workspace | `src/pages/settings/WorkspaceSettings.tsx` |
| API Keys | `src/pages/settings/ApiKeysSettings.tsx` |
| AI Provider Keys | `src/pages/settings/AiProviderKeysSettings.tsx` |
| Agent | `src/pages/settings/AgentSettings.tsx` |
| MCP | `src/pages/settings/McpSettings.tsx` |

### Admin Pages (src/pages/admin/)

| Page | File Path |
|------|-----------|
| Admin Layout | `src/pages/admin/AdminLayout.tsx` |
| Dashboard | `src/pages/admin/AdminDashboard.tsx` |
| Users | `src/pages/admin/AdminUsers.tsx` |
| Permissions | `src/pages/admin/AdminPermissions.tsx` |
| Invitations | `src/pages/admin/AdminInvitations.tsx` |
| Configuration | `src/pages/admin/AdminConfiguration.tsx` |

### Auth Pages (src/pages/auth/)

| Page | File Path |
|------|-----------|
| Sign In | `src/pages/auth/SignInPage.tsx` |
| Sign Up | `src/pages/auth/SignUpPage.tsx` |

### Workspace Setup (src/pages/workspace/)

| Page | File Path |
|------|-----------|
| New Workspace | `src/pages/workspace/NewWorkspace.tsx` |
| Setup Details | `src/pages/workspace/SetupDetails.tsx` |
| Setup Teams | `src/pages/workspace/SetupTeams.tsx` |
| Setup Projects | `src/pages/workspace/SetupProjects.tsx` |
| Setup Invite | `src/pages/workspace/SetupInvite.tsx` |
| Setup Complete | `src/pages/workspace/SetupComplete.tsx` |

---

## Frontend Components (vibe-frontend/src/components/)

### Tasks (src/components/tasks/)

| Component | File Path | Purpose |
|-----------|-----------|---------|
| InsightsPanel | `src/components/tasks/InsightsPanel.tsx` | Side panel for issue insights |
| TaskCard | `src/components/tasks/TaskCard.tsx` | Individual task card |
| TaskKanbanBoard | `src/components/tasks/TaskKanbanBoard.tsx` | Kanban board view |
| TeamKanbanBoard | `src/components/tasks/TeamKanbanBoard.tsx` | Team-level kanban |
| TodoPanel | `src/components/tasks/TodoPanel.tsx` | Todo list panel |
| UserAvatar | `src/components/tasks/UserAvatar.tsx` | User avatar display |
| AgentSelector | `src/components/tasks/AgentSelector.tsx` | AI agent selection |
| BranchSelector | `src/components/tasks/BranchSelector.tsx` | Git branch picker |
| ProjectSelector | `src/components/tasks/ProjectSelector.tsx` | Project dropdown |
| RepoSelector | `src/components/tasks/RepoSelector.tsx` | Repository picker |
| ConfigSelector | `src/components/tasks/ConfigSelector.tsx` | Configuration selector |
| VariantSelector | `src/components/tasks/VariantSelector.tsx` | Variant picker |

### Projects (src/components/projects/)

| Component | File Path | Purpose |
|-----------|-----------|---------|
| ProjectList | `src/components/projects/ProjectList.tsx` | List of projects |
| ProjectDetail | `src/components/projects/ProjectDetail.tsx` | Project details view |
| ProjectInsightsPanel | `src/components/projects/ProjectInsightsPanel.tsx` | Project-level insights |
| FeatureTreeItem | `src/components/projects/FeatureTreeItem.tsx` | Feature tree node |
| FeatureTreeProgress | `src/components/projects/FeatureTreeProgress.tsx` | Progress indicator |

### Panels (src/components/panels/)

| Component | File Path | Purpose |
|-----------|-----------|---------|
| PreviewPanel | `src/components/panels/PreviewPanel.tsx` | Code preview |
| DiffsPanel | `src/components/panels/DiffsPanel.tsx` | Diff viewer |
| TaskAttemptPanel | `src/components/panels/TaskAttemptPanel.tsx` | Attempt details |
| SharedTaskPanel | `src/components/panels/SharedTaskPanel.tsx` | Shared task view |

### Layout (src/components/layout/)

| Component | File Path | Purpose |
|-----------|-----------|---------|
| TasksLayout | `src/components/layout/TasksLayout.tsx` | Main app layout |
| GlobalKeyboardShortcuts | `src/components/layout/GlobalKeyboardShortcuts.tsx` | Keyboard handlers |

### UI Components (src/components/ui/)

| Component | File Path |
|-----------|-----------|
| Card | `src/components/ui/card.tsx` |
| Dialog | `src/components/ui/dialog.tsx` |
| Tabs | `src/components/ui/tabs.tsx` |
| Select | `src/components/ui/select.tsx` |
| Dropdown Menu | `src/components/ui/dropdown-menu.tsx` |
| Popover | `src/components/ui/popover.tsx` |
| Tooltip | `src/components/ui/tooltip.tsx` |
| Checkbox | `src/components/ui/checkbox.tsx` |
| Switch | `src/components/ui/switch.tsx` |
| Label | `src/components/ui/label.tsx` |
| Textarea | `src/components/ui/textarea.tsx` |
| Alert | `src/components/ui/alert.tsx` |
| Loader | `src/components/ui/loader.tsx` |
| Empty State | `src/components/ui/empty-state.tsx` |
| Breadcrumb | `src/components/ui/breadcrumb.tsx` |
| WYSIWYG Editor | `src/components/ui/wysiwyg.tsx` |
| JSON Editor | `src/components/ui/json-editor.tsx` |
| Kanban | `src/components/ui/shadcn-io/kanban/index.tsx` |

---

## Frontend Core (vibe-frontend/src/)

| File | Path | Purpose |
|------|------|---------|
| Main Entry | `src/main.tsx` | App bootstrap |
| App Component | `src/App.tsx` | Root component |
| Router | `src/router.tsx` | Route definitions |
| Vite Config | `vite.config.ts` | Build config |
| Tailwind | `tailwind.config.ts` | Styling config |
| TypeScript Config | `tsconfig.json` | TS settings |

### Stores (src/stores/)

| Store | File Path | State Managed |
|-------|-----------|---------------|
| Auth Store | `src/stores/authStore.ts` | Authentication state |
| UI Store | `src/stores/uiStore.ts` | UI state (modals, panels) |
| Task Store | `src/stores/taskStore.ts` | Task state |
| Filter Store | `src/stores/filterStore.ts` | Filter settings |

### Hooks (src/hooks/)

| Hook | File Path | Purpose |
|------|-----------|---------|
| useAuth | `src/hooks/useAuth.ts` | Auth utilities |
| useTasks | `src/hooks/useTasks.ts` | Task operations |
| useProjects | `src/hooks/useProjects.ts` | Project operations |

### API (src/api/)

| File | Path | Endpoints |
|------|------|-----------|
| Tasks API | `src/api/tasks.ts` | Task CRUD |
| Projects API | `src/api/projects.ts` | Project CRUD |
| Organizations API | `src/api/organizations.ts` | Org management |
| Auth API | `src/api/auth.ts` | Authentication |

---

## Backend Crates (vibe-backend/crates/)

### Remote (crates/remote/) - **PRIMARY, ALL NEW DEVELOPMENT HERE**

| File | Path | Purpose |
|------|------|---------|
| App | `src/app.rs` | Axum app setup |
| Config | `src/config.rs` | Configuration |
| State | `src/state.rs` | Shared state |

#### Routes (crates/remote/src/routes/)

| Route | File Path |
|-------|-----------|
| Tasks | `src/routes/tasks.rs` |
| Projects | `src/routes/projects.rs` |
| Organizations | `src/routes/organizations.rs` |
| Organization Members | `src/routes/organization_members.rs` |
| OAuth | `src/routes/oauth.rs` |
| Identity | `src/routes/identity.rs` |
| Tokens | `src/routes/tokens.rs` |
| GitHub App | `src/routes/github_app.rs` |
| Review | `src/routes/review.rs` |
| Electric Proxy | `src/routes/electric_proxy.rs` |
| Error Handling | `src/routes/error.rs` |

#### Auth (crates/remote/src/auth/)

| File | Path | Purpose |
|------|------|---------|
| Middleware | `src/auth/middleware.rs` | Auth middleware |
| JWT | `src/auth/jwt.rs` | JWT handling |
| Provider | `src/auth/provider.rs` | Auth providers |
| OAuth Validator | `src/auth/oauth_token_validator.rs` | Token validation |
| Handoff | `src/auth/handoff.rs` | Auth handoff |

#### MCP Server (crates/remote/src/mcp/)

| File | Path | Purpose |
|------|------|---------|
| Module | `src/mcp/mod.rs` | MCP module exports |
| TaskServer | `src/mcp/task_server.rs` | Core MCP server, task/project tools |
| Types | `src/mcp/types.rs` | Shared request/response types |
| Teams | `src/mcp/teams.rs` | Team/issue tools (IKA-123 format) |
| Documents | `src/mcp/documents.rs` | Document CRUD tools |
| Folders | `src/mcp/folders.rs` | Folder CRUD tools |
| Comments | `src/mcp/comments.rs` | Comment tools |

#### MCP Binary (crates/server/src/bin/)

| File | Path | Purpose |
|------|------|---------|
| MCP Server | `src/bin/mcp_task_server.rs` | MCP server binary (stdio/SSE) |

#### DB (crates/remote/src/db/)

| File | Path | Purpose |
|------|------|---------|
| Users | `src/db/users.rs` | User queries |
| Organizations | `src/db/organizations.rs` | Org queries |
| Organization Members | `src/db/organization_members.rs` | Member queries |
| Tasks | `src/db/tasks.rs` | Task queries |
| OAuth | `src/db/oauth.rs` | OAuth storage |
| OAuth Accounts | `src/db/oauth_accounts.rs` | OAuth accounts |
| Invitations | `src/db/invitations.rs` | Invitation queries |
| Reviews | `src/db/reviews.rs` | Review queries |
| GitHub App | `src/db/github_app.rs` | GitHub app data |
| Auth | `src/db/auth.rs` | Auth helpers |

### DB Crate (crates/db/)

| File | Path | Purpose |
|------|------|---------|
| Migrations | `migrations/` | SQL migrations |
| SQLx Cache | `.sqlx/` | Offline query data |

### Executors (crates/executors/)

| File | Path | Purpose |
|------|------|---------|
| Claude | `src/executors/claude.rs` | Claude executor |
| ACP | `src/executors/acp/mod.rs` | ACP executor |
| Codex | `src/executors/codex.rs` | Codex executor |
| Cursor | `src/executors/cursor.rs` | Cursor executor |
| Gemini | `src/executors/gemini.rs` | Gemini executor |
| Copilot | `src/executors/copilot.rs` | Copilot executor |

### Server (crates/server/) - **DEPRECATED, DO NOT ADD NEW CODE**

| File | Path | Purpose |
|------|------|---------|
| MCP Binary | `src/bin/mcp_task_server.rs` | MCP server (uses remote::mcp) |
| DEPRECATED.md | `DEPRECATED.md` | Deprecation notice |

**Note:** All routes in `crates/server/src/routes/` are frozen. Use `crates/remote/src/routes/` instead.

---

## Testing (vibe-testing/)

| File | Path | Purpose |
|------|------|---------|
| Playwright Config | `playwright.config.ts` | Test configuration |
| Tests Directory | `tests/` | Test files |
| Fixtures | `tests/fixtures/` | Test fixtures |

---

## Quick Lookup by Feature

### Issue/Task Management
- List issues: `src/pages/TeamIssues.tsx`
- Issue card: `src/components/tasks/TaskCard.tsx`
- Kanban board: `src/components/tasks/TaskKanbanBoard.tsx`
- Insights panel: `src/components/tasks/InsightsPanel.tsx`

### Project Management
- Project list: `src/pages/TeamProjects.tsx`
- Project detail: `src/pages/TeamProjectDetail.tsx`
- Project insights: `src/components/projects/ProjectInsightsPanel.tsx`

### Settings
- All settings: `src/pages/settings/SettingsLayout.tsx`
- API keys: `src/pages/settings/ApiKeysSettings.tsx`

### Authentication
- Sign in: `src/pages/auth/SignInPage.tsx`
- Auth store: `src/stores/authStore.ts`
- Backend auth: `crates/remote/src/auth/middleware.rs`

### Backend API
- Tasks API: `crates/remote/src/routes/tasks.rs`
- DB queries: `crates/remote/src/db/tasks.rs`

### MCP Server
- Core MCP: `crates/remote/src/mcp/task_server.rs`
- Team/Issues: `crates/remote/src/mcp/teams.rs`
- Documents: `crates/remote/src/mcp/documents.rs`
- Binary: `crates/server/src/bin/mcp_task_server.rs`

---

## Common Patterns by Task Type

### "Fix X not showing"
1. Find page in Pages section above
2. Check component imports
3. Check CSS/layout (flex, position)

### "Add feature to settings"
1. Settings layout: `src/pages/settings/SettingsLayout.tsx`
2. Add route + page in settings folder

### "Fix API endpoint"
1. Route: `crates/remote/src/routes/<resource>.rs`
2. DB query: `crates/remote/src/db/<resource>.rs`

### "Fix authentication issue"
1. Frontend: `src/stores/authStore.ts`
2. Backend middleware: `crates/remote/src/auth/middleware.rs`
3. Token validation: `crates/remote/src/auth/oauth_token_validator.rs`
