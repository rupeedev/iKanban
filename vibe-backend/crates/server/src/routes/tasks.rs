use std::path::PathBuf;

use anyhow;
use axum::{
    Extension, Json, Router,
    extract::{
        Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::{delete, get, post, put},
};
use db::models::{
    copilot_assignment::{CopilotAssignment, CreateCopilotAssignment},
    github_connection::GitHubConnection,
    image::TaskImage,
    project::{Project, ProjectError},
    project_repo::ProjectRepo,
    repo::Repo,
    task::{CreateTask, Task, TaskWithAttemptStatus, UpdateTask},
    task_comment::{CreateTaskComment, TaskComment, UpdateTaskComment},
    task_document_link::{LinkDocumentsRequest, LinkedDocument, TaskDocumentLink},
    task_tag::{AddTagRequest, TaskTag, TaskTagWithDetails},
    workspace::{CreateWorkspace, Workspace},
    workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
};
use deployment::Deployment;
use executors::profile::ExecutorProfileId;
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService, share::ShareError, workspace_manager::WorkspaceManager,
};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::{api::oauth::LoginStatus, response::ApiResponse};
use uuid::Uuid;

use crate::{
    DeploymentImpl, error::ApiError, middleware::load_task_middleware,
    routes::task_attempts::WorkspaceRepoInput,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskQuery {
    pub project_id: Uuid,
}

pub async fn get_tasks(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskWithAttemptStatus>>>, ApiError> {
    let tasks =
        Task::find_by_project_id_with_attempt_status(&deployment.db().pool, query.project_id)
            .await?;

    Ok(ResponseJson(ApiResponse::success(tasks)))
}

pub async fn stream_tasks_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_tasks_ws(socket, deployment, query.project_id).await {
            tracing::warn!("tasks WS closed: {}", e);
        }
    })
}

async fn handle_tasks_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    project_id: Uuid,
) -> anyhow::Result<()> {
    // Get the raw stream and convert LogMsg to WebSocket messages
    let mut stream = deployment
        .events()
        .stream_tasks_raw(project_id)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break; // client disconnected
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

pub async fn get_task(
    Extension(task): Extension<Task>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(task)))
}

pub async fn create_task(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    let id = Uuid::new_v4();

    tracing::debug!(
        "Creating task '{}' in project {}",
        payload.title,
        payload.project_id
    );

    let task = Task::create(&deployment.db().pool, &payload, id).await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
            "task_id": task.id.to_string(),
            "project_id": payload.project_id,
            "has_description": task.description.is_some(),
            "has_images": payload.image_ids.is_some(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(task)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateAndStartTaskRequest {
    pub task: CreateTask,
    pub executor_profile_id: ExecutorProfileId,
    pub repos: Vec<WorkspaceRepoInput>,
}

pub async fn create_task_and_start(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateAndStartTaskRequest>,
) -> Result<ResponseJson<ApiResponse<TaskWithAttemptStatus>>, ApiError> {
    if payload.repos.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one repository is required".to_string(),
        ));
    }

    let pool = &deployment.db().pool;

    let task_id = Uuid::new_v4();
    let task = Task::create(pool, &payload.task, task_id).await?;

    if let Some(image_ids) = &payload.task.image_ids {
        TaskImage::associate_many_dedup(pool, task.id, image_ids).await?;
    }

    deployment
        .track_if_analytics_allowed(
            "task_created",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": task.project_id,
                "has_description": task.description.is_some(),
                "has_images": payload.task.image_ids.is_some(),
            }),
        )
        .await;

    let project = Project::find_by_id(pool, task.project_id)
        .await?
        .ok_or(ProjectError::ProjectNotFound)?;

    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_workspace(&attempt_id, &task.title)
        .await;

    let agent_working_dir = project
        .default_agent_working_dir
        .as_ref()
        .filter(|dir: &&String| !dir.is_empty())
        .cloned();

    let workspace = Workspace::create(
        pool,
        &CreateWorkspace {
            branch: git_branch_name,
            agent_working_dir,
        },
        attempt_id,
        task.id,
    )
    .await?;

    let workspace_repos: Vec<CreateWorkspaceRepo> = payload
        .repos
        .iter()
        .map(|r| CreateWorkspaceRepo {
            repo_id: r.repo_id,
            target_branch: r.target_branch.clone(),
        })
        .collect();
    WorkspaceRepo::create_many(&deployment.db().pool, workspace.id, &workspace_repos).await?;

    let is_attempt_running = deployment
        .container()
        .start_workspace(&workspace, payload.executor_profile_id.clone())
        .await
        .inspect_err(|err| tracing::error!("Failed to start task attempt: {}", err))
        .is_ok();
    deployment
        .track_if_analytics_allowed(
            "task_attempt_started",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "executor": &payload.executor_profile_id.executor,
                "variant": &payload.executor_profile_id.variant,
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    let task = Task::find_by_id(pool, task.id)
        .await?
        .ok_or(ApiError::Database(SqlxError::RowNotFound))?;

    tracing::info!("Started attempt for task {}", task.id);
    Ok(ResponseJson(ApiResponse::success(TaskWithAttemptStatus {
        task,
        has_in_progress_attempt: is_attempt_running,
        last_attempt_failed: false,
        executor: Some(payload.executor_profile_id.executor.to_string()),
    })))
}

pub async fn update_task(
    Extension(existing_task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,

    Json(payload): Json<UpdateTask>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    ensure_shared_task_auth(&existing_task, &deployment).await?;

    // Use existing values if not provided in update
    let title = payload.title.unwrap_or(existing_task.title);
    let description = match payload.description {
        Some(s) if s.trim().is_empty() => None, // Empty string = clear description
        Some(s) => Some(s),                     // Non-empty string = update description
        None => existing_task.description,      // Field omitted = keep existing
    };
    let status = payload.status.unwrap_or(existing_task.status);
    let parent_workspace_id = payload
        .parent_workspace_id
        .or(existing_task.parent_workspace_id);
    let priority = payload.priority.or(existing_task.priority);
    let due_date = payload.due_date.or(existing_task.due_date);
    let assignee_id = payload.assignee_id.or(existing_task.assignee_id);

    let task = Task::update(
        &deployment.db().pool,
        existing_task.id,
        existing_task.project_id,
        title,
        description,
        status,
        parent_workspace_id,
        priority,
        due_date,
        assignee_id,
    )
    .await?;

    if let Some(image_ids) = &payload.image_ids {
        TaskImage::delete_by_task_id(&deployment.db().pool, task.id).await?;
        TaskImage::associate_many_dedup(&deployment.db().pool, task.id, image_ids).await?;
    }

    // If task has been shared, broadcast update
    if task.shared_task_id.is_some() {
        let Ok(publisher) = deployment.share_publisher() else {
            return Err(ShareError::MissingConfig("share publisher unavailable").into());
        };
        publisher.update_shared_task(&task).await?;
    }

    Ok(ResponseJson(ApiResponse::success(task)))
}

async fn ensure_shared_task_auth(
    existing_task: &Task,
    deployment: &local_deployment::LocalDeployment,
) -> Result<(), ApiError> {
    if existing_task.shared_task_id.is_some() {
        match deployment.get_login_status().await {
            LoginStatus::LoggedIn { .. } => return Ok(()),
            LoginStatus::LoggedOut => {
                return Err(ShareError::MissingAuth.into());
            }
        }
    }
    Ok(())
}

pub async fn delete_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    ensure_shared_task_auth(&task, &deployment).await?;

    // Validate no running execution processes
    if deployment
        .container()
        .has_running_processes(task.id)
        .await?
    {
        return Err(ApiError::Conflict("Task has running execution processes. Please wait for them to complete or stop them first.".to_string()));
    }

    let pool = &deployment.db().pool;

    // Gather task attempts data needed for background cleanup
    let attempts = Workspace::fetch_all(pool, Some(task.id))
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch task attempts for task {}: {}", task.id, e);
            ApiError::Workspace(e)
        })?;

    let repositories = WorkspaceRepo::find_unique_repos_for_task(pool, task.id).await?;

    // Collect workspace directories that need cleanup
    let workspace_dirs: Vec<PathBuf> = attempts
        .iter()
        .filter_map(|attempt| attempt.container_ref.as_ref().map(PathBuf::from))
        .collect();

    if let Some(shared_task_id) = task.shared_task_id {
        let Ok(publisher) = deployment.share_publisher() else {
            return Err(ShareError::MissingConfig("share publisher unavailable").into());
        };
        publisher.delete_shared_task(shared_task_id).await?;
    }

    // Use a transaction to ensure atomicity: either all operations succeed or all are rolled back
    let mut tx = pool.begin().await?;

    // Nullify parent_workspace_id for all child tasks before deletion
    // This breaks parent-child relationships to avoid foreign key constraint violations
    let mut total_children_affected = 0u64;
    for attempt in &attempts {
        let children_affected =
            Task::nullify_children_by_workspace_id(&mut *tx, attempt.id).await?;
        total_children_affected += children_affected;
    }

    // Delete task from database (FK CASCADE will handle task_attempts)
    let rows_affected = Task::delete(&mut *tx, task.id).await?;

    if rows_affected == 0 {
        return Err(ApiError::Database(SqlxError::RowNotFound));
    }

    // Commit the transaction - if this fails, all changes are rolled back
    tx.commit().await?;

    if total_children_affected > 0 {
        tracing::info!(
            "Nullified {} child task references before deleting task {}",
            total_children_affected,
            task.id
        );
    }

    deployment
        .track_if_analytics_allowed(
            "task_deleted",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": task.project_id.to_string(),
                "attempt_count": attempts.len(),
            }),
        )
        .await;

    let task_id = task.id;
    let pool = pool.clone();
    tokio::spawn(async move {
        tracing::info!(
            "Starting background cleanup for task {} ({} workspaces, {} repos)",
            task_id,
            workspace_dirs.len(),
            repositories.len()
        );

        for workspace_dir in &workspace_dirs {
            if let Err(e) = WorkspaceManager::cleanup_workspace(workspace_dir, &repositories).await
            {
                tracing::error!(
                    "Background workspace cleanup failed for task {} at {}: {}",
                    task_id,
                    workspace_dir.display(),
                    e
                );
            }
        }

        match Repo::delete_orphaned(&pool).await {
            Ok(count) if count > 0 => {
                tracing::info!("Deleted {} orphaned repo records", count);
            }
            Err(e) => {
                tracing::error!("Failed to delete orphaned repos: {}", e);
            }
            _ => {}
        }

        tracing::info!("Background cleanup completed for task {}", task_id);
    });

    // Return 202 Accepted to indicate deletion was scheduled
    Ok((StatusCode::ACCEPTED, ResponseJson(ApiResponse::success(()))))
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct MoveTaskRequest {
    pub project_id: Uuid,
}

pub async fn move_task(
    Extension(existing_task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<MoveTaskRequest>,
) -> Result<ResponseJson<ApiResponse<Task>>, ApiError> {
    ensure_shared_task_auth(&existing_task, &deployment).await?;

    // Validate that the new project exists
    let pool = &deployment.db().pool;
    let new_project = Project::find_by_id(pool, payload.project_id)
        .await?
        .ok_or(ProjectError::ProjectNotFound)?;

    // Move the task to the new project
    let task = Task::move_to_project(pool, existing_task.id, new_project.id).await?;

    deployment
        .track_if_analytics_allowed(
            "task_moved",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "from_project_id": existing_task.project_id.to_string(),
                "to_project_id": new_project.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(task)))
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ShareTaskResponse {
    pub shared_task_id: Uuid,
}

pub async fn share_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ShareTaskResponse>>, ApiError> {
    let Ok(publisher) = deployment.share_publisher() else {
        return Err(ShareError::MissingConfig("share publisher unavailable").into());
    };
    let profile = deployment
        .auth_context()
        .cached_profile()
        .await
        .ok_or(ShareError::MissingAuth)?;
    let shared_task_id = publisher.share_task(task.id, profile.user_id).await?;

    let props = serde_json::json!({
        "task_id": task.id,
        "shared_task_id": shared_task_id,
    });
    deployment
        .track_if_analytics_allowed("start_sharing_task", props)
        .await;

    Ok(ResponseJson(ApiResponse::success(ShareTaskResponse {
        shared_task_id,
    })))
}

// ============ COMMENT HANDLERS ============

/// Get all comments for a task
pub async fn get_task_comments(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskComment>>>, ApiError> {
    let comments = TaskComment::find_by_task_id(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(comments)))
}

/// Create a new comment on a task
pub async fn create_task_comment(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskComment>,
) -> Result<ResponseJson<ApiResponse<TaskComment>>, ApiError> {
    let comment = TaskComment::create(&deployment.db().pool, task.id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(comment)))
}

#[derive(Debug, Deserialize)]
pub struct CommentPath {
    pub comment_id: Uuid,
}

/// Update a comment
pub async fn update_task_comment(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(path): axum::extract::Path<CommentPath>,
    Json(payload): Json<UpdateTaskComment>,
) -> Result<ResponseJson<ApiResponse<TaskComment>>, ApiError> {
    // Verify comment belongs to this task
    let existing = TaskComment::find_by_id(&deployment.db().pool, path.comment_id)
        .await?
        .ok_or(ApiError::NotFound("Comment not found".to_string()))?;

    if existing.task_id != task.id {
        return Err(ApiError::NotFound("Comment not found".to_string()));
    }

    let comment = TaskComment::update(&deployment.db().pool, path.comment_id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(comment)))
}

/// Delete a comment
pub async fn delete_task_comment(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(path): axum::extract::Path<CommentPath>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    // Verify comment belongs to this task
    let existing = TaskComment::find_by_id(&deployment.db().pool, path.comment_id)
        .await?
        .ok_or(ApiError::NotFound("Comment not found".to_string()))?;

    if existing.task_id != task.id {
        return Err(ApiError::NotFound("Comment not found".to_string()));
    }

    let rows = TaskComment::delete(&deployment.db().pool, path.comment_id).await?;
    if rows == 0 {
        return Err(ApiError::NotFound("Comment not found".to_string()));
    }

    Ok((StatusCode::OK, ResponseJson(ApiResponse::success(()))))
}

// ============ DOCUMENT LINK HANDLERS ============

/// Get all linked documents for a task
pub async fn get_task_links(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<LinkedDocument>>>, ApiError> {
    let links =
        TaskDocumentLink::find_by_task_id_with_details(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(links)))
}

/// Link documents to a task
pub async fn link_documents_to_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LinkDocumentsRequest>,
) -> Result<ResponseJson<ApiResponse<Vec<LinkedDocument>>>, ApiError> {
    // Link the documents
    TaskDocumentLink::link_documents(&deployment.db().pool, task.id, &payload.document_ids).await?;

    // Return updated list with details
    let links =
        TaskDocumentLink::find_by_task_id_with_details(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(links)))
}

#[derive(Debug, Deserialize)]
pub struct DocumentLinkPath {
    pub document_id: Uuid,
}

/// Unlink a document from a task
pub async fn unlink_document_from_task(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(path): axum::extract::Path<DocumentLinkPath>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    let rows =
        TaskDocumentLink::unlink_document(&deployment.db().pool, task.id, path.document_id).await?;

    if rows == 0 {
        return Err(ApiError::NotFound("Document link not found".to_string()));
    }

    Ok((StatusCode::OK, ResponseJson(ApiResponse::success(()))))
}

// ============ TASK TAG HANDLERS ============

/// Get all tags for a task
pub async fn get_task_tags(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTagWithDetails>>>, ApiError> {
    let tags = TaskTag::find_by_task_id(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(tags)))
}

/// Add a tag to a task
pub async fn add_task_tag(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AddTagRequest>,
) -> Result<ResponseJson<ApiResponse<TaskTag>>, ApiError> {
    let task_tag = TaskTag::add_tag(&deployment.db().pool, task.id, payload.tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(task_tag)))
}

#[derive(Debug, Deserialize)]
pub struct TaskTagPath {
    pub tag_id: Uuid,
}

/// Remove a tag from a task
pub async fn remove_task_tag(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(path): axum::extract::Path<TaskTagPath>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    let rows = TaskTag::remove_tag(&deployment.db().pool, task.id, path.tag_id).await?;

    if rows == 0 {
        return Err(ApiError::NotFound("Task tag not found".to_string()));
    }

    Ok((StatusCode::OK, ResponseJson(ApiResponse::success(()))))
}

// ============ COPILOT ASSIGNMENT HANDLERS ============

/// Request to assign a task to Copilot
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct AssignToCopilotRequest {
    pub prompt: String,
}

/// GitHub API response for issue creation
#[derive(Debug, Deserialize)]
struct GitHubIssueResponse {
    id: i64,
    number: i64,
    html_url: String,
}

/// Parsed GitHub repository info from a URL path
#[derive(Debug, Clone)]
struct ParsedGitHubRepo {
    owner: String,
    name: String,
}

/// Parse GitHub owner/name from a repo path (URL or local path)
/// Supports formats:
/// - https://github.com/owner/repo
/// - https://github.com/owner/repo.git
/// - git@github.com:owner/repo.git
fn parse_github_repo_from_path(path: &std::path::Path) -> Option<ParsedGitHubRepo> {
    let path_str = path.to_string_lossy();

    // Try HTTPS URL format: https://github.com/owner/repo
    if path_str.contains("github.com") {
        // Remove .git suffix if present
        let clean_path = path_str.trim_end_matches(".git");

        // Parse URL-style path
        if let Some(github_path) = clean_path.split("github.com/").nth(1) {
            let parts: Vec<&str> = github_path.split('/').collect();
            if parts.len() >= 2 {
                return Some(ParsedGitHubRepo {
                    owner: parts[0].to_string(),
                    name: parts[1].to_string(),
                });
            }
        }

        // Parse git@ style: git@github.com:owner/repo.git
        if let Some(github_path) = clean_path.split("github.com:").nth(1) {
            let parts: Vec<&str> = github_path.split('/').collect();
            if parts.len() >= 2 {
                return Some(ParsedGitHubRepo {
                    owner: parts[0].to_string(),
                    name: parts[1].to_string(),
                });
            }
        }
    }

    None
}

/// Get all copilot assignments for a task
pub async fn get_copilot_assignments(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<CopilotAssignment>>>, ApiError> {
    let assignments = CopilotAssignment::find_by_task_id(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(assignments)))
}

/// Assign a task to Copilot - creates GitHub issue and triggers Copilot Workspace
pub async fn assign_task_to_copilot(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AssignToCopilotRequest>,
) -> Result<ResponseJson<ApiResponse<CopilotAssignment>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get GitHub connection for access token (workspace-level)
    let connection = GitHubConnection::find_workspace_connection(pool)
        .await?
        .ok_or_else(|| {
            ApiError::BadRequest(
                "No GitHub connection configured. Please connect GitHub in Settings > Projects > Repositories first.".to_string(),
            )
        })?;

    // Get repos linked to the task's project
    let project_repos = ProjectRepo::find_repos_for_project(pool, task.project_id).await?;
    if project_repos.is_empty() {
        return Err(ApiError::BadRequest(
            "No repository linked to this project. Please add a GitHub repository in Settings > Projects > Repositories.".to_string(),
        ));
    }

    // Find first GitHub repo by parsing the path URL
    let github_repo = project_repos
        .iter()
        .find_map(|repo| parse_github_repo_from_path(&repo.path))
        .ok_or_else(|| {
            ApiError::BadRequest(
                "No GitHub repository found in project. Please add a GitHub repository (e.g., https://github.com/owner/repo) in Settings > Projects > Repositories.".to_string(),
            )
        })?;

    // Create the assignment with repo info
    let create_payload = CreateCopilotAssignment {
        prompt: payload.prompt.clone(),
        github_issue_id: None,
        github_issue_url: None,
        github_repo_owner: Some(github_repo.owner.clone()),
        github_repo_name: Some(github_repo.name.clone()),
        status: "pending".to_string(),
    };

    let assignment = CopilotAssignment::create(pool, task.id, &create_payload).await?;

    // Spawn background task to create GitHub issue
    let pool_clone = pool.clone();
    let assignment_id = assignment.id;
    let task_title = task.title.clone();
    let task_description = task.description.clone();
    let prompt = payload.prompt.clone();
    let access_token = connection.access_token.clone();
    let repo_owner = github_repo.owner.clone();
    let repo_name = github_repo.name.clone();

    tokio::spawn(async move {
        if let Err(e) = create_github_issue_for_copilot(
            &pool_clone,
            assignment_id,
            &task_title,
            task_description.as_deref(),
            &prompt,
            &access_token,
            &repo_owner,
            &repo_name,
        )
        .await
        {
            tracing::error!("Failed to create GitHub issue for copilot: {}", e);
        }
    });

    deployment
        .track_if_analytics_allowed(
            "copilot_assignment_created",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "assignment_id": assignment.id.to_string(),
                "repo": format!("{}/{}", github_repo.owner, github_repo.name),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(assignment)))
}

/// Background task to create GitHub issue for Copilot
///
/// This function is spawned as a background task and uses Result<(), String>
/// to allow clean error handling without blocking the main handler.
#[allow(clippy::too_many_arguments)]
async fn create_github_issue_for_copilot(
    pool: &sqlx::PgPool,
    assignment_id: Uuid,
    task_title: &str,
    task_description: Option<&str>,
    prompt: &str,
    access_token: &str,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), String> {
    use db::models::copilot_assignment::UpdateCopilotAssignment;

    // Build issue title and body
    let issue_title = format!("[Copilot] Task: {}", task_title);
    let issue_body = format!(
        "## Task\n{}\n\n## Description\n{}\n\n## Copilot Instructions\n{}\n\n---\n*Created by iKanban @copilot integration*",
        task_title,
        task_description.unwrap_or("No description provided"),
        prompt
    );

    // Build GitHub API URL
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues",
        repo_owner, repo_name
    );

    // Build request body
    let body = serde_json::json!({
        "title": issue_title,
        "body": issue_body,
        "labels": ["copilot", "automated"]
    });

    tracing::info!(
        "Creating GitHub issue for assignment {} in {}/{}",
        assignment_id,
        repo_owner,
        repo_name
    );

    // Make GitHub API request
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "iKanban-Copilot")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Failed to call GitHub API: {}", e);
            format!("GitHub API request failed: {}", e)
        })?;

    // Handle response
    if response.status().is_success() {
        let issue_response: GitHubIssueResponse =
            response.json::<GitHubIssueResponse>().await.map_err(|e| {
                tracing::error!("Failed to parse GitHub response: {}", e);
                "Failed to parse GitHub response".to_string()
            })?;

        tracing::info!(
            "Created GitHub issue #{} for assignment {}",
            issue_response.number,
            assignment_id
        );

        // Update assignment with issue details
        CopilotAssignment::update(
            pool,
            assignment_id,
            &UpdateCopilotAssignment {
                github_issue_id: Some(issue_response.id),
                github_issue_url: Some(issue_response.html_url),
                github_repo_owner: Some(repo_owner.to_string()),
                github_repo_name: Some(repo_name.to_string()),
                status: Some("issue_created".to_string()),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| format!("Failed to update assignment: {}", e))?;

        Ok(())
    } else {
        let status = response.status();
        let error_body: String = response.text().await.unwrap_or_default();

        tracing::error!(
            "GitHub API error ({}): {} for assignment {}",
            status,
            error_body,
            assignment_id
        );

        // Parse GitHub error message if possible
        let error_message =
            if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_body) {
                error_json["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string()
            } else {
                format!("GitHub API error: {}", status)
            };

        // Update assignment with error
        CopilotAssignment::update(
            pool,
            assignment_id,
            &UpdateCopilotAssignment {
                status: Some("failed".to_string()),
                error_message: Some(error_message.clone()),
                ..Default::default()
            },
        )
        .await
        .ok(); // Don't fail on error update

        Err(error_message)
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_actions_router = Router::new()
        .route("/", put(update_task))
        .route("/", delete(delete_task))
        .route("/share", post(share_task))
        .route("/move", post(move_task))
        // Comment routes
        .route(
            "/comments",
            get(get_task_comments).post(create_task_comment),
        )
        .route(
            "/comments/{comment_id}",
            put(update_task_comment).delete(delete_task_comment),
        )
        // Document link routes
        .route("/links", get(get_task_links).post(link_documents_to_task))
        .route("/links/{document_id}", delete(unlink_document_from_task))
        // Task tag routes
        .route("/tags", get(get_task_tags).post(add_task_tag))
        .route("/tags/{tag_id}", delete(remove_task_tag))
        // Copilot assignment routes
        .route(
            "/copilot",
            get(get_copilot_assignments).post(assign_task_to_copilot),
        );

    let task_id_router = Router::new()
        .route("/", get(get_task))
        .merge(task_actions_router)
        .layer(from_fn_with_state(deployment.clone(), load_task_middleware));

    let inner = Router::new()
        .route("/", get(get_tasks).post(create_task))
        .route("/stream/ws", get(stream_tasks_ws))
        .route("/create-and-start", post(create_task_and_start))
        .nest("/{task_id}", task_id_router);

    // mount under /projects/:project_id/tasks
    Router::new().nest("/tasks", inner)
}
