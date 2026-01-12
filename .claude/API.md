# iKanban API Reference

Backend API endpoints at `https://api.scho1ar.com` (prod) or `http://localhost:3001` (dev).

## Authentication

All protected endpoints require Clerk JWT in Authorization header:
```
Authorization: Bearer <clerk_jwt_token>
```

---

## Public Routes (No Auth Required)

### Health & Config
```
GET    /health                      # Health check
GET    /info                        # User system info (OS, config, capabilities)
PUT    /config                      # Update system config
GET    /sounds/{sound}              # Get sound file
GET    /mcp-config                  # Get MCP servers configuration
POST   /mcp-config                  # Update MCP servers configuration
GET    /profiles                    # Get executor profiles
PUT    /profiles                    # Update executor profiles
GET    /editors/check-availability  # Check editor availability
GET    /agents/check-availability   # Check agent availability
```

### OAuth & Authentication
```
POST   /auth/handoff/init           # Initiate OAuth handoff
GET    /auth/handoff/complete       # Complete OAuth handoff callback
POST   /auth/logout                 # Logout
GET    /auth/status                 # Get login status
GET    /auth/token                  # Get current access token
GET    /auth/user                   # Get current user info
GET    /oauth/github/authorize      # Initiate GitHub OAuth flow
GET    /oauth/github/callback       # GitHub OAuth callback
```

---

## Protected Routes (Auth Required)

### Teams
```
GET    /teams                                    # List all teams
POST   /teams                                    # Create team
GET    /teams/{team_id}                          # Get team details
PUT    /teams/{team_id}                          # Update team
DELETE /teams/{team_id}                          # Delete team
POST   /teams/{team_id}/migrate-tasks            # Migrate tasks from project
GET    /teams/{team_id}/dashboard                # Get team dashboard
POST   /teams/{team_id}/validate-storage-path    # Validate storage path
```

### Team Members
```
GET    /teams/{team_id}/members                  # List team members
POST   /teams/{team_id}/members                  # Add member
PUT    /teams/{team_id}/members/{member_id}      # Update member role
DELETE /teams/{team_id}/members/{member_id}      # Remove member
GET    /teams/{team_id}/members/{member_id}/project-access   # Get project access
POST   /teams/{team_id}/members/{member_id}/project-access   # Set project access
POST   /teams/{team_id}/sync-clerk-members       # Sync Clerk members
```

### Team Invitations
```
GET    /teams/{team_id}/invitations                          # List invitations
POST   /teams/{team_id}/invitations                          # Send invitation
PUT    /teams/{team_id}/invitations/{invitation_id}          # Update invitation
DELETE /teams/{team_id}/invitations/{invitation_id}          # Delete invitation
POST   /teams/{team_id}/invitations/{invitation_id}/accept   # Accept invitation
```

### Team GitHub Integration
```
GET    /teams/{team_id}/github                   # Get GitHub connection
POST   /teams/{team_id}/github                   # Create GitHub connection
PUT    /teams/{team_id}/github                   # Update GitHub connection
DELETE /teams/{team_id}/github                   # Delete GitHub connection
GET    /teams/{team_id}/github/repos             # Get linked repos
GET    /teams/{team_id}/github/repos/available   # Get available repos
POST   /teams/{team_id}/github/repos             # Link repository
DELETE /teams/{team_id}/github/repos/{repo_id}   # Unlink repository
```

### Projects
```
GET    /projects                                 # List all projects
POST   /projects                                 # Create project
GET    /projects/{project_id}                    # Get project details
POST   /projects/{project_id}/link-existing      # Link to existing remote
POST   /projects/{project_id}/create-and-link-remote  # Create and link remote
POST   /projects/{project_id}/unlink             # Unlink from remote
GET    /projects/{project_id}/remote-members     # Get remote members
GET    /projects/stream/ws                       # Stream projects (WebSocket)
```

### Tasks
```
GET    /tasks?project_id={id}                    # List tasks for project
POST   /tasks                                    # Create task
POST   /tasks/create-and-start                   # Create and start attempt
GET    /tasks/{task_id}                          # Get task details
PUT    /tasks/{task_id}                          # Update task
DELETE /tasks/{task_id}                          # Delete task (202 Accepted)
POST   /tasks/{task_id}/move                     # Move to different project
POST   /tasks/{task_id}/share                    # Share task
GET    /tasks/stream/ws                          # Stream tasks (WebSocket)
```

### Task Comments
```
GET    /tasks/{task_id}/comments                 # List comments
POST   /tasks/{task_id}/comments                 # Create comment
PUT    /tasks/{task_id}/comments/{comment_id}    # Update comment
DELETE /tasks/{task_id}/comments/{comment_id}    # Delete comment
```

### Task Links (Documents)
```
GET    /tasks/{task_id}/links                    # Get linked documents
POST   /tasks/{task_id}/links                    # Link documents
DELETE /tasks/{task_id}/links/{document_id}      # Unlink document
```

### Shared Tasks
```
POST   /shared-tasks/{shared_task_id}/assign     # Assign shared task
DELETE /shared-tasks/{shared_task_id}            # Delete shared task
POST   /shared-tasks/link-to-local               # Link to local instance
```

### Task Attempts (Workspaces)
```
GET    /task-attempts                            # Get all attempts
GET    /task-attempts/{workspace_id}             # Get specific attempt
POST   /task-attempts/{workspace_id}/start       # Start attempt
POST   /task-attempts/{workspace_id}/stop        # Stop attempt
POST   /task-attempts/{workspace_id}/rebase      # Rebase attempt
POST   /task-attempts/{workspace_id}/abort-conflicts  # Abort merge conflicts
GET    /task-attempts/{workspace_id}/stream/ws   # Stream attempt (WebSocket)
GET    /task-attempts/{workspace_id}/diff/stream/ws   # Stream diff (WebSocket)
```

### Pull Requests
```
GET    /task-attempts/{workspace_id}/pr          # Get PR info
POST   /task-attempts/{workspace_id}/pr          # Create PR
POST   /task-attempts/{workspace_id}/merge       # Merge PR
```

### IDE Setup
```
POST   /task-attempts/{workspace_id}/codex-setup    # Setup Codex
POST   /task-attempts/{workspace_id}/cursor-setup   # Setup Cursor
POST   /task-attempts/{workspace_id}/gh-cli-setup   # Setup GitHub CLI
```

### Execution Processes
```
GET    /execution-processes                      # List processes
GET    /execution-processes/{exec_id}            # Get process details
GET    /execution-processes/{exec_id}/logs/raw/ws        # Stream raw logs (WS)
GET    /execution-processes/{exec_id}/logs/normalized/ws # Stream normalized logs (WS)
```

### Chat & Conversations
```
GET    /conversations?team_id={id}               # List conversations
POST   /conversations/direct                     # Create direct conversation
POST   /conversations/group                      # Create group conversation
GET    /conversations/{conversation_id}          # Get conversation
GET    /conversations/{conversation_id}/messages # List messages
POST   /conversations/{conversation_id}/messages # Send message
PUT    /messages/{message_id}                    # Update message
DELETE /messages/{message_id}                    # Delete message
```

### Documents & Folders
```
GET    /teams/{team_id}/folders                  # List folders
GET    /teams/{team_id}/folders/{folder_id}      # Get folder
POST   /teams/{team_id}/folders                  # Create folder
PUT    /teams/{team_id}/folders/{folder_id}      # Update folder
DELETE /teams/{team_id}/folders/{folder_id}      # Delete folder
GET    /teams/{team_id}/documents                # List documents
POST   /teams/{team_id}/documents                # Create document
GET    /teams/{team_id}/documents/{doc_id}       # Get document
PUT    /teams/{team_id}/documents/{doc_id}       # Update document
DELETE /teams/{team_id}/documents/{doc_id}       # Delete document
POST   /teams/{team_id}/documents/{doc_id}/upload    # Upload file
GET    /teams/{team_id}/documents/{doc_id}/download  # Download file
GET    /teams/{team_id}/documents/{doc_id}/metadata  # Get metadata
```

### Tags
```
GET    /tags                                     # List all tags
POST   /tags                                     # Create tag
PUT    /tags/{tag_id}                            # Update tag
DELETE /tags/{tag_id}                            # Delete tag
```

### Inbox
```
GET    /inbox                                    # List all items
GET    /inbox/unread                             # Get unread items
GET    /inbox/summary                            # Get summary (counts)
POST   /inbox                                    # Create item
GET    /inbox/{inbox_item_id}                    # Get item details
POST   /inbox/{inbox_item_id}/read               # Mark as read
DELETE /inbox/{inbox_item_id}                    # Delete item
POST   /inbox/read-all                           # Mark all as read
```

### Tenant Workspaces
```
GET    /tenant-workspaces                        # List user's workspaces
GET    /tenant-workspaces/ensure-default         # Ensure default workspace
POST   /tenant-workspaces                        # Create workspace
GET    /tenant-workspaces/{workspace_id}         # Get workspace
PUT    /tenant-workspaces/{workspace_id}         # Update workspace
DELETE /tenant-workspaces/{workspace_id}         # Delete workspace
GET    /tenant-workspaces/{workspace_id}/members # List members
POST   /tenant-workspaces/{workspace_id}/members # Add member
PUT    /tenant-workspaces/{workspace_id}/members/{member_id}    # Update role
DELETE /tenant-workspaces/{workspace_id}/members/{member_id}    # Remove member
```

### Organizations
```
GET    /organizations                            # List organizations
POST   /organizations                            # Create organization
GET    /organizations/{id}                       # Get organization
PATCH  /organizations/{id}                       # Update organization
DELETE /organizations/{id}                       # Delete organization
GET    /organizations/{org_id}/projects          # List org projects
POST   /organizations/{org_id}/invitations       # Create invitation
GET    /organizations/{org_id}/invitations       # List invitations
POST   /organizations/{org_id}/invitations/revoke    # Revoke invitation
GET    /invitations/{token}                      # Get invitation by token
POST   /invitations/{token}/accept               # Accept invitation
GET    /organizations/{org_id}/members           # List members
DELETE /organizations/{org_id}/members/{user_id} # Remove member
PATCH  /organizations/{org_id}/members/{user_id}/role  # Update role
```

### Admin Dashboard
```
GET    /admin/{workspace_id}/stats               # Get statistics
GET    /admin/{workspace_id}/activity            # Get recent activity
GET    /admin/{workspace_id}/users               # List users
PUT    /admin/{workspace_id}/users/{user_id}/status  # Update user status
PUT    /admin/{workspace_id}/users/{user_id}/role    # Update user role
DELETE /admin/{workspace_id}/users/{user_id}     # Remove user
```

### Admin Invitations
```
GET    /admin/{workspace_id}/invitations                     # List invitations
POST   /admin/{workspace_id}/invitations                     # Create invitation
POST   /admin/{workspace_id}/invitations/{id}/resend         # Resend invitation
DELETE /admin/{workspace_id}/invitations/{id}                # Revoke invitation
```

### Admin Configuration
```
GET    /admin/{workspace_id}/permissions                     # Get permissions
PUT    /admin/{workspace_id}/permissions/{permission_id}     # Update permission
GET    /admin/{workspace_id}/features                        # Get feature toggles
PUT    /admin/{workspace_id}/features/{feature_id}           # Update feature
GET    /admin/{workspace_id}/configuration                   # Get config
PUT    /admin/{workspace_id}/configuration                   # Update config
```

### AI Provider Keys
```
GET    /ai-keys                                  # List AI keys
POST   /ai-keys                                  # Create/update key
DELETE /ai-keys/{provider}                       # Delete key
POST   /ai-keys/{provider}/test                  # Test key
```

### API Keys
```
GET    /api-keys                                 # List API keys
POST   /api-keys                                 # Create key
POST   /api-keys/{key_id}/revoke                 # Revoke key
DELETE /api-keys/{key_id}                        # Delete key
```

### GitHub Workspace Settings
```
GET    /settings/github                          # Get connection
POST   /settings/github                          # Create connection
PUT    /settings/github                          # Update connection
DELETE /settings/github                          # Delete connection
GET    /settings/github/repos                    # Get linked repos
GET    /settings/github/repos/available          # Get available repos
POST   /settings/github/repos                    # Link repo
DELETE /settings/github/repos/{repo_id}          # Unlink repo
```

### Images
```
POST   /images                                   # Upload image
GET    /images/{image_id}                        # Get metadata
GET    /images/{image_id}/download               # Download image
```

### User Registrations
```
GET    /registrations/me                         # Get current registration
POST   /registrations                            # Create registration
GET    /registrations                            # List registrations
GET    /registrations/{registration_id}          # Get registration
POST   /registrations/{registration_id}/approve  # Approve
POST   /registrations/{registration_id}/reject   # Reject
```

### Repositories
```
POST   /repos                                    # Register repository
POST   /repos/init                               # Initialize repository
GET    /repos/{repo_id}/branches                 # Get branches
```

### Scratch (Temporary Notes)
```
GET    /scratch                                  # List all items
GET    /scratch/{type}/{id}                      # Get item
POST   /scratch/{type}/{id}                      # Create item
PUT    /scratch/{type}/{id}                      # Update item (upsert)
DELETE /scratch/{type}/{id}                      # Delete item
```

### Storage (Cloud Providers)
```
GET    /storage                                  # List connections
POST   /storage/{provider}                       # Create connection
GET    /storage/{provider}                       # Get connection
PUT    /storage/{provider}                       # Update connection
DELETE /storage/{provider}                       # Delete connection
GET    /storage/{provider}/buckets               # List buckets
POST   /storage/{provider}/upload                # Upload file
GET    /storage/{provider}/files                 # List files
DELETE /storage/{provider}/files/{file_id}       # Delete file
```

### Containers
```
GET    /containers/attempt-context?ref={ref}     # Get context by reference
```

### Events
```
GET    /events/                                  # SSE stream for all events
```

### Approvals
```
POST   /approvals/{id}/respond                   # Respond to approval
```

---

## Request/Response Examples

### Create Task
```bash
curl -X POST https://api.scho1ar.com/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "abc123",
    "title": "Fix login bug",
    "description": "Users cannot login on mobile",
    "status": "todo",
    "priority": 1
  }'
```

### Create Team
```bash
curl -X POST https://api.scho1ar.com/api/teams \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering",
    "description": "Core engineering team"
  }'
```

### Send Chat Message
```bash
curl -X POST https://api.scho1ar.com/api/conversations/{id}/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello team!"}'
```

---

## Status Values

### Task Status
```
todo        # Not started
inprogress  # Being worked on
review      # In review
done        # Completed
blocked     # Blocked by something
```

### Priority Values
```
1  # Critical
2  # High
3  # Medium
4  # Low
```

---

## Error Responses

```json
{
  "error": "Not found",
  "code": "NOT_FOUND",
  "status": 404
}
```

### Common Error Codes
- `400` - Bad request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (no permission)
- `404` - Not found
- `429` - Rate limited
- `500` - Internal server error

---

## WebSocket Endpoints

Real-time streaming via WebSocket:
```
/projects/stream/ws          # Project updates
/tasks/stream/ws             # Task updates
/task-attempts/{id}/stream/ws    # Attempt updates
/task-attempts/{id}/diff/stream/ws   # Diff updates
/execution-processes/{id}/logs/raw/ws        # Raw logs
/execution-processes/{id}/logs/normalized/ws # Normalized logs
```
