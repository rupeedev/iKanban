use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{delete, get, post, put},
    Json, Router,
};
use db::models::gitlab_connection::{
    CreateGitLabConnection, GitLabConnection, GitLabConnectionWithRepos, GitLabRepository,
    LinkGitLabRepository, UpdateGitLabConnection,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{error::ApiError, DeploymentImpl};

/// A GitLab project from the API (not yet linked)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitLabProjectInfo {
    pub id: i64,
    pub name: String,
    pub path_with_namespace: String,
    pub web_url: String,
    pub default_branch: Option<String>,
    #[serde(rename = "visibility")]
    pub visibility: String,
    pub description: Option<String>,
    pub namespace: GitLabNamespace,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitLabNamespace {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub full_path: String,
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        // Workspace-level GitLab connection endpoints
        .route("/settings/gitlab", get(get_workspace_gitlab_connection))
        .route("/settings/gitlab", post(create_workspace_gitlab_connection))
        .route("/settings/gitlab", put(update_workspace_gitlab_connection))
        .route(
            "/settings/gitlab",
            delete(delete_workspace_gitlab_connection),
        )
        // Workspace-level repository endpoints
        .route("/settings/gitlab/repos", get(get_workspace_repositories))
        .route(
            "/settings/gitlab/repos/available",
            get(get_available_gitlab_repos),
        )
        .route("/settings/gitlab/repos", post(link_workspace_repository))
        .route(
            "/settings/gitlab/repos/{repo_id}",
            delete(unlink_workspace_repository),
        )
}

/// Get workspace-level GitLab connection (with linked repositories)
pub async fn get_workspace_gitlab_connection(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Option<GitLabConnectionWithRepos>>>, ApiError> {
    let connection = GitLabConnection::find_workspace_connection(&deployment.db().pool).await?;

    match connection {
        Some(conn) => {
            let repositories =
                GitLabRepository::find_by_connection_id(&deployment.db().pool, conn.id).await?;
            Ok(ResponseJson(ApiResponse::success(Some(
                GitLabConnectionWithRepos {
                    connection: conn,
                    repositories,
                },
            ))))
        }
        None => Ok(ResponseJson(ApiResponse::success(None))),
    }
}

/// Create a workspace-level GitLab connection
pub async fn create_workspace_gitlab_connection(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateGitLabConnection>,
) -> Result<ResponseJson<ApiResponse<GitLabConnection>>, ApiError> {
    // Check if workspace connection already exists
    let existing = GitLabConnection::find_workspace_connection(&deployment.db().pool).await?;
    if existing.is_some() {
        return Err(ApiError::BadRequest(
            "Workspace GitLab connection already exists. Use PUT to update.".to_string(),
        ));
    }

    let connection =
        GitLabConnection::create_workspace_connection(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workspace_gitlab_connection_created",
            serde_json::json!({}),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(connection)))
}

/// Update the workspace-level GitLab connection
pub async fn update_workspace_gitlab_connection(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateGitLabConnection>,
) -> Result<ResponseJson<ApiResponse<GitLabConnection>>, ApiError> {
    let existing = GitLabConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitLab connection not found".to_string()))?;

    let updated = GitLabConnection::update(&deployment.db().pool, existing.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workspace_gitlab_connection_updated",
            serde_json::json!({}),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated)))
}

/// Delete the workspace-level GitLab connection
pub async fn delete_workspace_gitlab_connection(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected =
        GitLabConnection::delete_workspace_connection(&deployment.db().pool).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound(
            "Workspace GitLab connection not found".to_string(),
        ));
    }

    deployment
        .track_if_analytics_allowed(
            "workspace_gitlab_connection_deleted",
            serde_json::json!({}),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Get linked GitLab repositories for workspace connection
pub async fn get_workspace_repositories(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitLabRepository>>>, ApiError> {
    let connection = GitLabConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitLab connection not found".to_string()))?;

    let repositories =
        GitLabRepository::find_by_connection_id(&deployment.db().pool, connection.id).await?;

    Ok(ResponseJson(ApiResponse::success(repositories)))
}

/// Fetch available GitLab projects from the user's account
pub async fn get_available_gitlab_repos(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<GitLabProjectInfo>>>, ApiError> {
    let connection = GitLabConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitLab connection not found".to_string()))?;

    // Construct the GitLab API URL (support self-hosted instances)
    let base_url = connection.gitlab_url.trim_end_matches('/');
    let api_url = format!("{}/api/v4/projects", base_url);

    // Fetch projects from GitLab API
    let client = reqwest::Client::new();
    let response = client
        .get(&api_url)
        .header("PRIVATE-TOKEN", &connection.access_token)
        .header("User-Agent", "vibe-kanban")
        .query(&[
            ("membership", "true"),
            ("per_page", "100"),
            ("order_by", "last_activity_at"),
        ])
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to fetch projects: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ApiError::BadRequest(format!(
            "GitLab API error ({}): {}",
            status, body
        )));
    }

    let projects: Vec<GitLabProjectInfo> = response
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to parse projects: {}", e)))?;

    Ok(ResponseJson(ApiResponse::success(projects)))
}

/// Link a GitLab repository to workspace connection
pub async fn link_workspace_repository(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LinkGitLabRepository>,
) -> Result<ResponseJson<ApiResponse<GitLabRepository>>, ApiError> {
    let connection = GitLabConnection::find_workspace_connection(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace GitLab connection not found".to_string()))?;

    let repository = GitLabRepository::link(&deployment.db().pool, connection.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workspace_gitlab_repository_linked",
            serde_json::json!({
                "repo_full_name": payload.repo_full_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(repository)))
}

/// Unlink a GitLab repository from workspace connection
pub async fn unlink_workspace_repository(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = GitLabRepository::unlink(&deployment.db().pool, repo_id).await?;
    if rows_affected == 0 {
        return Err(ApiError::NotFound("GitLab repository not found".to_string()));
    }

    deployment
        .track_if_analytics_allowed(
            "workspace_gitlab_repository_unlinked",
            serde_json::json!({
                "repo_id": repo_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}
