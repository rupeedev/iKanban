//! Copilot and Claude assignment route handlers
//!
//! Handles @copilot and @claude mentions in task comments to create GitHub issues.

use axum::{
    Json,
    extract::{Extension, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::json;
use tracing::instrument;
use uuid::Uuid;

use super::{error::ApiResponse, organization_members::ensure_task_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        copilot_assignments::CopilotAssignmentRepository,
        github_connections::{GitHubConnectionRepository, GitHubRepositoryOps},
        task_comments::{CreateTaskComment, TaskCommentRepository},
        tasks::SharedTaskRepository,
    },
};

/// Request to assign a task to Copilot
#[derive(Debug, Clone, Deserialize)]
pub struct AssignToCopilotRequest {
    pub prompt: String,
}

/// Request to assign a task to Claude
#[derive(Debug, Clone, Deserialize)]
pub struct AssignToClaudeRequest {
    pub prompt: String,
}

/// Request to assign a task to Gemini
#[derive(Debug, Clone, Deserialize)]
pub struct AssignToGeminiRequest {
    pub prompt: String,
}

/// GitHub API response for issue creation
#[derive(Debug, Deserialize)]
struct GitHubIssueResponse {
    id: i64,
    number: i64,
    html_url: String,
    node_id: String,
}

#[instrument(
    name = "copilot.get_assignments",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id)
)]
pub async fn get_copilot_assignments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_task_access(pool, ctx.user.id, task_id).await {
        return error.into_response();
    }

    match CopilotAssignmentRepository::find_copilot_by_task_id(pool, task_id).await {
        Ok(assignments) => (StatusCode::OK, ApiResponse::success(assignments)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to load copilot assignments");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to load copilot assignments"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "claude.get_assignments",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id)
)]
pub async fn get_claude_assignments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_task_access(pool, ctx.user.id, task_id).await {
        return error.into_response();
    }

    // Claude assignments use the same table as Copilot
    match CopilotAssignmentRepository::find_copilot_by_task_id(pool, task_id).await {
        Ok(assignments) => (StatusCode::OK, ApiResponse::success(assignments)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to load claude assignments");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to load claude assignments"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "gemini.get_assignments",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id)
)]
pub async fn get_gemini_assignments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_task_access(pool, ctx.user.id, task_id).await {
        return error.into_response();
    }

    // Gemini assignments use the same table as Copilot
    match CopilotAssignmentRepository::find_copilot_by_task_id(pool, task_id).await {
        Ok(assignments) => (StatusCode::OK, ApiResponse::success(assignments)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to load gemini assignments");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to load gemini assignments"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "copilot.assign_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id)
)]
pub async fn assign_task_to_copilot(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AssignToCopilotRequest>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_task_access(pool, ctx.user.id, task_id).await {
        return error.into_response();
    }

    // Get task details for the GitHub issue
    let repo = SharedTaskRepository::new(pool);
    let task = match repo.find_any_task_by_id(task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"success": false, "message": "task not found"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to load task");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to load task"})),
            )
                .into_response();
        }
    };

    // Get workspace GitHub connection for access token
    let connection = match GitHubConnectionRepository::find_workspace_connection(pool).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "message": "No GitHub connection configured. Please connect GitHub in Settings first."
                })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to get GitHub connection");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to get GitHub connection"})),
            )
                .into_response();
        }
    };

    // Get repositories linked to this connection
    let repos = match GitHubRepositoryOps::find_by_connection_id(pool, connection.id).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!(?e, "failed to get GitHub repositories");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to get GitHub repositories"})),
            )
                .into_response();
        }
    };

    let github_repo = match repos.first() {
        Some(r) => r,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "message": "No GitHub repository linked. Please add a repository in Settings."
                })),
            )
                .into_response();
        }
    };

    // Create the assignment record
    let assignment = match CopilotAssignmentRepository::create_copilot(
        pool,
        task_id,
        &payload.prompt,
        Some(&github_repo.repo_owner),
        Some(&github_repo.repo_name),
    )
    .await
    {
        Ok(a) => a,
        Err(e) => {
            tracing::error!(?e, "failed to create copilot assignment");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to create assignment"})),
            )
                .into_response();
        }
    };

    // Spawn background task to create GitHub issue
    let pool_clone = pool.clone();
    let assignment_id = assignment.id;
    let task_title = task.title.clone();
    let task_description = task.description.clone();
    let prompt = payload.prompt.clone();
    let access_token = connection.access_token.clone();
    let repo_owner = github_repo.repo_owner.clone();
    let repo_name = github_repo.repo_name.clone();

    tokio::spawn(async move {
        if let Err(e) = create_github_issue_for_copilot(
            &pool_clone,
            assignment_id,
            task_id,
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

    (StatusCode::CREATED, ApiResponse::success(assignment)).into_response()
}

/// Trigger a Copilot assignment from a prompt
pub async fn trigger_copilot_assignment(
    pool: &sqlx::PgPool,
    task_id: Uuid,
    _user_id: Uuid,
    prompt: String,
) -> Result<crate::db::copilot_assignments::CopilotAssignment, String> {
    use crate::db::{project_repos::ProjectRepoRepository};

    // Deduplication: Check if an active assignment already exists for this task
    if let Ok(Some(existing)) = CopilotAssignmentRepository::find_active_by_task_id(pool, task_id).await {
        tracing::info!(
            "Skipping Copilot assignment - active assignment {} already exists for task {} (status: {:?})",
            existing.id, task_id, existing.status
        );
        return Ok(existing);
    }

    let repo = SharedTaskRepository::new(pool);
    let task = repo
        .find_any_task_by_id(task_id)
        .await
        .map_err(|e| format!("database error: {}", e))?
        .ok_or_else(|| "task not found".to_string())?;

    // Step 1: Get Access Token (Workspace Level)
    let connection = GitHubConnectionRepository::find_workspace_connection(pool)
        .await
        .map_err(|e| format!("database error: {}", e))?
        .ok_or_else(|| "No GitHub connection configured".to_string())?;

    // Step 2: Determine Repository (Project Level > Workspace Level)
    let (repo_owner, repo_name) = match ProjectRepoRepository::list_by_project(pool, task.project_id).await {
        Ok(repos) if !repos.is_empty() => {
            // Use the first linked project repo - display_name is in 'owner/repo' format
            let repo = &repos[0];
            let parts: Vec<&str> = repo.display_name.split('/').collect();
            if parts.len() != 2 {
                return Err(format!("Invalid repo display_name format: {}", repo.display_name));
            }
            (parts[0].to_string(), parts[1].to_string())
        }
        _ => {
            // Fallback to workspace connection repos
            let repos = GitHubRepositoryOps::find_by_connection_id(pool, connection.id)
                .await
                .map_err(|e| format!("database error: {}", e))?;

            let github_repo = repos
                .first()
                .ok_or_else(|| "No GitHub repository linked".to_string())?;
            
            (github_repo.repo_owner.clone(), github_repo.repo_name.clone())
        }
    };

    let assignment = CopilotAssignmentRepository::create_copilot(
        pool,
        task_id,
        &prompt,
        Some(&repo_owner),
        Some(&repo_name),
    )
    .await
    .map_err(|e| format!("failed to create assignment: {}", e))?;

    let pool_clone = pool.clone();
    let assignment_id = assignment.id;
    let task_title = task.title.clone();
    let task_description = task.description.clone();
    let prompt = prompt.clone();
    let access_token = connection.access_token.clone();

    tokio::spawn(async move {
        if let Err(e) = create_github_issue_for_copilot(
            &pool_clone,
            assignment_id,
            task_id,
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

    Ok(assignment)
}

#[instrument(
    name = "claude.assign_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id)
)]
pub async fn assign_task_to_claude(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AssignToClaudeRequest>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_task_access(pool, ctx.user.id, task_id).await {
        return error.into_response();
    }

    match trigger_claude_assignment(pool, task_id, ctx.user.id, payload.prompt).await {
        Ok(assignment) => (StatusCode::CREATED, ApiResponse::success(assignment)).into_response(),
        Err(e) => {
            tracing::error!("failed to trigger claude assignment: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": e})),
            )
                .into_response()
        }
    }
}

/// Trigger a Claude assignment from a prompt
pub async fn trigger_claude_assignment(
    pool: &sqlx::PgPool,
    task_id: Uuid,
    _user_id: Uuid,
    prompt: String,
) -> Result<crate::db::copilot_assignments::CopilotAssignment, String> {
    use crate::db::{project_repos::ProjectRepoRepository};

    // Deduplication: Check if an active assignment already exists for this task
    if let Ok(Some(existing)) = CopilotAssignmentRepository::find_active_by_task_id(pool, task_id).await {
        tracing::info!(
            "Skipping Claude assignment - active assignment {} already exists for task {} (status: {:?})",
            existing.id, task_id, existing.status
        );
        return Ok(existing);
    }

    let repo = SharedTaskRepository::new(pool);
    let task = repo
        .find_any_task_by_id(task_id)
        .await
        .map_err(|e| format!("database error: {}", e))?
        .ok_or_else(|| "task not found".to_string())?;

    // Step 1: Get Access Token (Workspace Level)
    let connection = GitHubConnectionRepository::find_workspace_connection(pool)
        .await
        .map_err(|e| format!("database error: {}", e))?
        .ok_or_else(|| "No GitHub connection configured".to_string())?;

    // Step 2: Determine Repository (Project Level > Workspace Level)
    let (repo_owner, repo_name) = match ProjectRepoRepository::list_by_project(pool, task.project_id).await {
        Ok(repos) if !repos.is_empty() => {
            // Use the first linked project repo - display_name is in 'owner/repo' format
            let repo = &repos[0];
            let parts: Vec<&str> = repo.display_name.split('/').collect();
            if parts.len() != 2 {
                return Err(format!("Invalid repo display_name format: {}", repo.display_name));
            }
            (parts[0].to_string(), parts[1].to_string())
        }
        _ => {
            // Fallback to workspace connection repos
            let repos = GitHubRepositoryOps::find_by_connection_id(pool, connection.id)
                .await
                .map_err(|e| format!("database error: {}", e))?;

            let github_repo = repos
                .first()
                .ok_or_else(|| "No GitHub repository linked".to_string())?;
            
            (github_repo.repo_owner.clone(), github_repo.repo_name.clone())
        }
    };

    let assignment = CopilotAssignmentRepository::create_copilot(
        pool,
        task_id,
        &prompt,
        Some(&repo_owner),
        Some(&repo_name),
    )
    .await
    .map_err(|e| format!("failed to create assignment: {}", e))?;

    let pool_clone = pool.clone();
    let assignment_id = assignment.id;
    let task_title = task.title.clone();
    let task_description = task.description.clone();
    let prompt = prompt.clone();
    let access_token = connection.access_token.clone();

    tokio::spawn(async move {
        if let Err(e) = create_github_issue_for_claude(
            &pool_clone,
            assignment_id,
            task_id,
            &task_title,
            task_description.as_deref(),
            &prompt,
            &access_token,
            &repo_owner,
            &repo_name,
        )
        .await
        {
            tracing::error!("Failed to create GitHub issue for Claude: {}", e);
        }
    });

    Ok(assignment)
}

#[instrument(
    name = "gemini.assign_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id)
)]
pub async fn assign_task_to_gemini(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AssignToGeminiRequest>,
) -> Response {
    let pool = state.pool();

    if let Err(error) = ensure_task_access(pool, ctx.user.id, task_id).await {
        return error.into_response();
    }

    match trigger_gemini_assignment(pool, task_id, ctx.user.id, payload.prompt).await {
        Ok(assignment) => (StatusCode::OK, ApiResponse::success(assignment)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to assign task to Gemini");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": e})),
            )
                .into_response()
        }
    }
}

/// Trigger a Gemini assignment from a prompt
pub async fn trigger_gemini_assignment(
    pool: &sqlx::PgPool,
    task_id: Uuid,
    _user_id: Uuid,
    prompt: String,
) -> Result<crate::db::copilot_assignments::CopilotAssignment, String> {
    use crate::db::{project_repos::ProjectRepoRepository};

    // Deduplication: Check if an active assignment already exists for this task
    if let Ok(Some(existing)) = CopilotAssignmentRepository::find_active_by_task_id(pool, task_id).await {
        tracing::info!(
            "Skipping Gemini assignment - active assignment {} already exists for task {} (status: {:?})",
            existing.id, task_id, existing.status
        );
        return Ok(existing);
    }

    let repo = SharedTaskRepository::new(pool);
    let task = repo
        .find_any_task_by_id(task_id)
        .await
        .map_err(|e| format!("database error: {}", e))?
        .ok_or_else(|| "task not found".to_string())?;

    // Step 1: Get Access Token (Workspace Level)
    let connection = GitHubConnectionRepository::find_workspace_connection(pool)
        .await
        .map_err(|e| format!("database error: {}", e))?
        .ok_or_else(|| "No GitHub connection configured. Please add a GitHub connection in Settings.".to_string())?;

    // Step 2: Determine Repository (Project Level > Workspace Level)
    let (repo_owner, repo_name) = match ProjectRepoRepository::list_by_project(pool, task.project_id).await {
        Ok(repos) if !repos.is_empty() => {
            // Use the first linked project repo - display_name is in 'owner/repo' format
            let repo = &repos[0];
            let parts: Vec<&str> = repo.display_name.split('/').collect();
            if parts.len() != 2 {
                return Err(format!("Invalid repo display_name format: {}", repo.display_name));
            }
            (parts[0].to_string(), parts[1].to_string())
        }
        _ => {
            // Fallback to workspace connection repos
            let repos = GitHubRepositoryOps::find_by_connection_id(pool, connection.id)
                .await
                .map_err(|e| format!("database error: {}", e))?;

            let github_repo = repos
                .first()
                .ok_or_else(|| "No GitHub repository linked. Please add a repository in Settings → GitHub.".to_string())?;
            
            (github_repo.repo_owner.clone(), github_repo.repo_name.clone())
        }
    };

    let assignment = CopilotAssignmentRepository::create_copilot(
        pool,
        task_id,
        &prompt,
        Some(&repo_owner),
        Some(&repo_name),
    )
    .await
    .map_err(|e| format!("failed to create assignment: {}", e))?;

    let pool_clone = pool.clone();
    let assignment_id = assignment.id;
    let task_title = task.title.clone();
    let task_description = task.description.clone();
    let prompt = prompt.clone();
    let access_token = connection.access_token.clone();

    tokio::spawn(async move {
        if let Err(e) = create_github_issue_for_gemini(
            &pool_clone,
            assignment_id,
            task_id,
            &task_title,
            task_description.as_deref(),
            &prompt,
            &access_token,
            &repo_owner,
            &repo_name,
        )
        .await
        {
            tracing::error!("Failed to create GitHub issue for Gemini: {}", e);
        }
    });

    Ok(assignment)
}

// ─────────────────────────────────────────────────────────────────────────────
// Background Tasks for GitHub Issue Creation
// ─────────────────────────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn create_github_issue_for_copilot(
    pool: &sqlx::PgPool,
    assignment_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    task_description: Option<&str>,
    prompt: &str,
    access_token: &str,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), String> {
    let issue_title = format!("[Copilot] Task: {}", task_title);
    let issue_body = format!(
        "## Task\n{}\n\n## Description\n{}\n\n## Copilot Instructions\n{}\n\n---\n\
        *Created by iKanban @copilot integration*\n\n\
        <!-- ikanban-metadata\ntask_id: {}\nassignment_id: {}\n-->",
        task_title,
        task_description.unwrap_or("No description provided"),
        prompt,
        task_id,
        assignment_id
    );

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues",
        repo_owner, repo_name
    );

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
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if response.status().is_success() {
        let issue_response: GitHubIssueResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

        tracing::info!(
            "Created GitHub issue #{} for assignment {}",
            issue_response.number,
            assignment_id
        );

        CopilotAssignmentRepository::update_with_issue(
            pool,
            assignment_id,
            issue_response.id,
            &issue_response.html_url,
            "issue_created",
        )
        .await
        .map_err(|e| format!("Failed to update assignment: {}", e))?;

        if let Err(e) = assign_issue_to_copilot(
            issue_response.number as u64,
            repo_owner,
            repo_name,
            access_token,
        )
        .await
        {
            tracing::warn!(
                "Failed to assign issue #{} to Copilot: {}",
                issue_response.number,
                e
            );
        }

        let comment_content = format!(
            "🎫 **GitHub Issue Created**\n\n\
            Agent: Copilot\n\
            Issue: [#{number}]({url})\n\
            Repository: {owner}/{name}\n\
            Status: Waiting for Copilot to start work",
            number = issue_response.number,
            url = issue_response.html_url,
            owner = repo_owner,
            name = repo_name
        );

        let create_data = CreateTaskComment {
            content: comment_content,
            is_internal: false,
            author_name: "GitHub Integration".to_string(),
            author_email: None,
            author_id: None,
        };

        if let Err(e) = TaskCommentRepository::create(pool, task_id, &create_data).await {
            tracing::warn!("Failed to post callback comment: {}", e);
        }

        Ok(())
    } else {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();

        tracing::error!("GitHub API error ({}): {}", status, error_body);

        let error_message =
            if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_body) {
                error_json["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string()
            } else {
                format!("GitHub API error: {}", status)
            };

        CopilotAssignmentRepository::update_with_error(pool, assignment_id, &error_message)
            .await
            .ok();

        Err(error_message)
    }
}

#[allow(clippy::too_many_arguments)]
async fn create_github_issue_for_claude(
    pool: &sqlx::PgPool,
    assignment_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    task_description: Option<&str>,
    prompt: &str,
    access_token: &str,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), String> {
    // Strip @claude mention from prompt to avoid duplication in issue body
    // Case-insensitive replacement using simple string manipulation
    let clean_prompt = {
        let lower = prompt.to_lowercase();
        if let Some(pos) = lower.find("@claude") {
            let before = &prompt[..pos];
            let after = &prompt[pos + 7..]; // "@claude" is 7 chars
            format!("{}{}", before, after.trim_start())
        } else {
            prompt.to_string()
        }
    }.trim().to_string();
    
    let issue_title = format!("[Claude] Task: {}", task_title);
    let issue_body = format!(
        "## Task\n{}\n\n## Description\n{}\n\n## Claude Instructions\n@claude {}\n\n---\n\
        *Created by iKanban @claude integration*\n\n\
        <!-- ikanban-metadata\ntask_id: {}\nassignment_id: {}\n-->",
        task_title,
        task_description.unwrap_or("No description provided"),
        clean_prompt,
        task_id,
        assignment_id
    );

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues",
        repo_owner, repo_name
    );

    let body = serde_json::json!({
        "title": issue_title,
        "body": issue_body,
        "labels": ["claude", "automated"]
    });

    tracing::info!(
        "Creating GitHub issue for Claude assignment {} in {}/{}",
        assignment_id,
        repo_owner,
        repo_name
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "iKanban-Claude")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if response.status().is_success() {
        let issue_response: GitHubIssueResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

        tracing::info!(
            "Created GitHub issue #{} for Claude assignment {}",
            issue_response.number,
            assignment_id
        );

        CopilotAssignmentRepository::update_with_issue(
            pool,
            assignment_id,
            issue_response.id,
            &issue_response.html_url,
            "issue_created",
        )
        .await
        .map_err(|e| format!("Failed to update assignment: {}", e))?;

        if let Err(e) =
            assign_issue_to_claude(&issue_response.node_id, repo_owner, repo_name, access_token)
                .await
        {
            tracing::warn!(
                "Failed to assign issue #{} to Claude: {}",
                issue_response.number,
                e
            );
        }

        let comment_content = format!(
            "🎫 **GitHub Issue Created**\n\n\
            Agent: Claude\n\
            Issue: [#{number}]({url})\n\
            Repository: {owner}/{name}\n\
            Status: Waiting for Claude to start work",
            number = issue_response.number,
            url = issue_response.html_url,
            owner = repo_owner,
            name = repo_name
        );

        let create_data = CreateTaskComment {
            content: comment_content,
            is_internal: false,
            author_name: "GitHub Integration".to_string(),
            author_email: None,
            author_id: None,
        };

        if let Err(e) = TaskCommentRepository::create(pool, task_id, &create_data).await {
            tracing::warn!("Failed to post callback comment: {}", e);
        }

        Ok(())
    } else {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();

        tracing::error!("GitHub API error ({}): {}", status, error_body);

        let error_message =
            if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_body) {
                error_json["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string()
            } else {
                format!("GitHub API error: {}", status)
            };

        CopilotAssignmentRepository::update_with_error(pool, assignment_id, &error_message)
            .await
            .ok();

        Err(error_message)
    }
}

#[allow(clippy::too_many_arguments)]
async fn create_github_issue_for_gemini(
    pool: &sqlx::PgPool,
    assignment_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    task_description: Option<&str>,
    prompt: &str,
    access_token: &str,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), String> {
    // Strip @gemini mention from prompt to avoid duplication in issue body
    let clean_prompt = {
        let lower = prompt.to_lowercase();
        if let Some(pos) = lower.find("@gemini") {
            let before = &prompt[..pos];
            let after = &prompt[pos + 7..]; // "@gemini" is 7 chars
            format!("{}{}", before, after.trim_start())
        } else {
            prompt.to_string()
        }
    }.trim().to_string();
    
    let issue_title = format!("[Gemini] Task: {}", task_title);
    let issue_body = format!(
        "## Task\n{}\n\n## Description\n{}\n\n## Gemini Instructions\n@gemini {}\n\n---\n\
        *Created by iKanban @gemini integration*\n\n\
        <!-- ikanban-metadata\ntask_id: {}\nassignment_id: {}\n-->",
        task_title,
        task_description.unwrap_or("No description provided"),
        clean_prompt,
        task_id,
        assignment_id
    );

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues",
        repo_owner, repo_name
    );

    let body = serde_json::json!({
        "title": issue_title,
        "body": issue_body,
        "labels": ["gemini", "automated"]
    });

    tracing::info!(
        "Creating GitHub issue for Gemini assignment {} in {}/{}",
        assignment_id,
        repo_owner,
        repo_name
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "iKanban-Gemini")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if response.status().is_success() {
        let issue_response: GitHubIssueResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

        tracing::info!(
            "Created GitHub issue #{} for Gemini assignment {}",
            issue_response.number,
            assignment_id
        );

        CopilotAssignmentRepository::update_with_issue(
            pool,
            assignment_id,
            issue_response.id,
            &issue_response.html_url,
            "issue_created",
        )
        .await
        .map_err(|e| format!("Failed to update assignment: {}", e))?;

        let comment_content = format!(
            "🎫 **GitHub Issue Created**\n\n\
            Agent: Gemini\n\
            Issue: [#{number}]({url})\n\
            Repository: {owner}/{name}\n\
            Status: Waiting for Gemini to start work",
            number = issue_response.number,
            url = issue_response.html_url,
            owner = repo_owner,
            name = repo_name
        );

        let create_data = CreateTaskComment {
            content: comment_content,
            is_internal: false,
            author_name: "GitHub Integration".to_string(),
            author_email: None,
            author_id: None,
        };

        if let Err(e) = TaskCommentRepository::create(pool, task_id, &create_data).await {
            tracing::warn!("Failed to post callback comment: {}", e);
        }

        Ok(())
    } else {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();

        tracing::error!("GitHub API error ({}): {}", status, error_body);

        let error_message =
            if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_body) {
                error_json["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string()
            } else {
                format!("GitHub API error: {}", status)
            };

        CopilotAssignmentRepository::update_with_error(pool, assignment_id, &error_message)
            .await
            .ok();

        Err(error_message)
    }
}

async fn assign_issue_to_copilot(
    issue_number: u64,
    repo_owner: &str,
    repo_name: &str,
    access_token: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues/{}/assignees",
        repo_owner, repo_name, issue_number
    );

    let payload = serde_json::json!({
        "assignees": ["copilot-swe-agent[bot]"],
        "agent_assignment": {
            "target_repo": format!("{}/{}", repo_owner, repo_name),
            "base_branch": "main"
        }
    });

    tracing::info!(
        "Assigning issue #{} to Copilot in {}/{}",
        issue_number,
        repo_owner,
        repo_name
    );

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "iKanban-Copilot")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to call GitHub REST API: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Copilot assignment failed ({}): {}", status, body));
    }

    tracing::info!("Successfully assigned issue #{} to Copilot", issue_number);
    Ok(())
}

async fn assign_issue_to_claude(
    issue_node_id: &str,
    repo_owner: &str,
    repo_name: &str,
    access_token: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let actor_query = serde_json::json!({
        "query": r#"
            query($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                    suggestedActors(first: 20, capabilities: [CAN_BE_ASSIGNED]) {
                        nodes { login id }
                    }
                }
            }
        "#,
        "variables": { "owner": repo_owner, "name": repo_name }
    });

    let actor_response = client
        .post("https://api.github.com/graphql")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "iKanban-Claude")
        .json(&actor_query)
        .send()
        .await
        .map_err(|e| format!("Failed to query GitHub GraphQL: {}", e))?;

    if !actor_response.status().is_success() {
        return Err(format!("GraphQL query failed: {}", actor_response.status()));
    }

    let actor_data: serde_json::Value = actor_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse actor response: {}", e))?;

    let actors = actor_data["data"]["repository"]["suggestedActors"]["nodes"]
        .as_array()
        .ok_or("No suggested actors found")?;

    let claude_actor = actors
        .iter()
        .find(|actor| {
            actor["login"]
                .as_str()
                .map(|l| l == "claude[bot]" || l == "claude-code[bot]" || l.starts_with("claude"))
                .unwrap_or(false)
        })
        .ok_or("Claude bot not found. Ensure Claude Code Action is configured.")?;

    let claude_actor_id = claude_actor["id"]
        .as_str()
        .ok_or("Claude actor ID not found")?;

    tracing::info!(
        "Found Claude actor ID: {} for {}/{}",
        claude_actor_id,
        repo_owner,
        repo_name
    );

    let assign_mutation = serde_json::json!({
        "query": r#"
            mutation($assignableId: ID!, $actorIds: [ID!]!) {
                replaceActorsForAssignable(input: {
                    assignableId: $assignableId, actorIds: $actorIds
                }) {
                    assignable { ... on Issue { id number } }
                }
            }
        "#,
        "variables": { "assignableId": issue_node_id, "actorIds": [claude_actor_id] }
    });

    let assign_response = client
        .post("https://api.github.com/graphql")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "iKanban-Claude")
        .json(&assign_mutation)
        .send()
        .await
        .map_err(|e| format!("Failed to call assignment mutation: {}", e))?;

    if !assign_response.status().is_success() {
        return Err(format!(
            "Assignment mutation failed: {}",
            assign_response.status()
        ));
    }

    let assign_data: serde_json::Value = assign_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse assignment response: {}", e))?;

    if let Some(errors) = assign_data.get("errors") {
        return Err(format!("GraphQL errors: {}", errors));
    }

    Ok(())
}

// ============================================================================
// PR Registration Endpoint
// ============================================================================

/// Request to register a PR for an assignment
#[derive(Debug, Clone, Deserialize)]
pub struct RegisterPrRequest {
    pub pr_number: i64,
    pub pr_url: String,
}

/// Register a PR for a copilot/claude assignment
/// Called by Claude Code Action after creating a PR
#[instrument(
    name = "assignments.register_pr",
    skip(state, payload),
    fields(task_id = %task_id, assignment_id = %assignment_id)
)]
pub async fn register_pr(
    State(state): State<AppState>,
    Path((task_id, assignment_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<RegisterPrRequest>,
) -> Response {
    let pool = state.pool();

    tracing::info!(
        task_id = %task_id,
        assignment_id = %assignment_id,
        pr_number = payload.pr_number,
        pr_url = %payload.pr_url,
        "Registering PR for assignment"
    );

    // Update the assignment with PR info
    if let Err(e) = CopilotAssignmentRepository::update_with_pr(
        pool,
        assignment_id,
        payload.pr_number,
        &payload.pr_url,
    )
    .await
    {
        tracing::error!(?e, "Failed to update assignment with PR info");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"success": false, "message": "Failed to register PR"})),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "message": "PR registered successfully",
            "assignment_id": assignment_id,
            "pr_number": payload.pr_number
        })),
    )
        .into_response()
}
