//! GitLab settings routes - Workspace-level GitLab connection management

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::error::{ApiResponse, ErrorResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::gitlab_connections::{
        CreateGitLabConnection, GitLabConnection, GitLabConnectionRepository,
        GitLabConnectionWithRepos, GitLabRepository, GitLabRepositoryOps, LinkGitLabRepository,
        UpdateGitLabConnection,
    },
};

/// A GitLab project from the API (not yet linked)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabProjectInfo {
    pub id: i64,
    pub name: String,
    pub path_with_namespace: String,
    pub web_url: String,
    pub default_branch: Option<String>,
    pub visibility: String,
    pub description: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/settings/gitlab", get(get_workspace_gitlab_connection))
        .route("/settings/gitlab", post(create_workspace_gitlab_connection))
        .route("/settings/gitlab", put(update_workspace_gitlab_connection))
        .route(
            "/settings/gitlab",
            delete(delete_workspace_gitlab_connection),
        )
        .route("/settings/gitlab/repos", get(get_workspace_repositories))
        .route(
            "/settings/gitlab/repos/available",
            get(get_available_gitlab_projects),
        )
        .route("/settings/gitlab/repos", post(link_workspace_repository))
        .route(
            "/settings/gitlab/repos/{repo_id}",
            delete(unlink_workspace_repository),
        )
}

/// GET /settings/gitlab - Get workspace-level GitLab connection
#[instrument(name = "gitlab_settings.get_connection", skip(state, ctx))]
async fn get_workspace_gitlab_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<Option<GitLabConnectionWithRepos>>>, ErrorResponse> {
    tracing::debug!(user_id = %ctx.user.id, "getting workspace GitLab connection");

    let connection = GitLabConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get GitLab connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    match connection {
        Some(conn) => {
            let repositories = GitLabRepositoryOps::find_by_connection_id(state.pool(), conn.id)
                .await
                .map_err(|error| {
                    tracing::error!(?error, "failed to get repositories");
                    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
                })?;

            Ok(ApiResponse::success(Some(GitLabConnectionWithRepos {
                connection: conn,
                repositories,
            })))
        }
        None => Ok(ApiResponse::success(None)),
    }
}

/// POST /settings/gitlab - Create workspace-level GitLab connection
#[instrument(name = "gitlab_settings.create_connection", skip(state, ctx, payload))]
async fn create_workspace_gitlab_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateGitLabConnection>,
) -> Result<Json<ApiResponse<GitLabConnection>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, "creating workspace GitLab connection");

    // Check if connection already exists
    let existing = GitLabConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to check existing connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    if existing.is_some() {
        return Err(ErrorResponse::new(
            StatusCode::CONFLICT,
            "workspace GitLab connection already exists. Use PUT to update.",
        ));
    }

    let connection =
        GitLabConnectionRepository::create_workspace_connection(state.pool(), &payload)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to create connection");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to create connection",
                )
            })?;

    tracing::info!(connection_id = %connection.id, "GitLab connection created");
    Ok(ApiResponse::success(connection))
}

/// PUT /settings/gitlab - Update workspace-level GitLab connection
#[instrument(name = "gitlab_settings.update_connection", skip(state, ctx, payload))]
async fn update_workspace_gitlab_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<UpdateGitLabConnection>,
) -> Result<Json<ApiResponse<GitLabConnection>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, "updating workspace GitLab connection");

    let existing = GitLabConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::NOT_FOUND,
                "workspace GitLab connection not found",
            )
        })?;

    let updated = GitLabConnectionRepository::update(state.pool(), existing.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update connection");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to update connection",
            )
        })?;

    tracing::info!(connection_id = %updated.id, "GitLab connection updated");
    Ok(ApiResponse::success(updated))
}

/// DELETE /settings/gitlab - Delete workspace-level GitLab connection
#[instrument(name = "gitlab_settings.delete_connection", skip(state, ctx))]
async fn delete_workspace_gitlab_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, "deleting workspace GitLab connection");

    let rows_affected = GitLabConnectionRepository::delete_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete connection");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete connection",
            )
        })?;

    if rows_affected == 0 {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "workspace GitLab connection not found",
        ));
    }

    tracing::info!("GitLab connection deleted");
    Ok(ApiResponse::success(()))
}

/// GET /settings/gitlab/repos - Get linked repositories
#[instrument(name = "gitlab_settings.get_repos", skip(state, ctx))]
async fn get_workspace_repositories(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<Vec<GitLabRepository>>>, ErrorResponse> {
    tracing::debug!(user_id = %ctx.user.id, "getting linked repositories");

    let connection = GitLabConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::NOT_FOUND,
                "workspace GitLab connection not found",
            )
        })?;

    let repositories = GitLabRepositoryOps::find_by_connection_id(state.pool(), connection.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get repositories");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    Ok(ApiResponse::success(repositories))
}

/// GET /settings/gitlab/repos/available - Fetch available projects from GitLab API
#[instrument(name = "gitlab_settings.get_available_projects", skip(state, ctx))]
async fn get_available_gitlab_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<Vec<GitLabProjectInfo>>>, ErrorResponse> {
    tracing::debug!(user_id = %ctx.user.id, "fetching available GitLab projects");

    let connection = GitLabConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::NOT_FOUND,
                "workspace GitLab connection not found",
            )
        })?;

    // Fetch projects from GitLab API
    let client = reqwest::Client::new();
    let api_url = format!(
        "{}/api/v4/projects",
        connection.gitlab_url.trim_end_matches('/')
    );

    let response = client
        .get(&api_url)
        .header("PRIVATE-TOKEN", &connection.access_token)
        .query(&[
            ("membership", "true"),
            ("per_page", "100"),
            ("order_by", "last_activity_at"),
        ])
        .send()
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to fetch projects from GitLab");
            ErrorResponse::new(
                StatusCode::BAD_GATEWAY,
                "failed to fetch projects from GitLab",
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::error!(%status, %body, "GitLab API error");
        return Err(ErrorResponse::new(
            StatusCode::BAD_GATEWAY,
            format!("GitLab API error ({})", status),
        ));
    }

    let projects: Vec<GitLabProjectInfo> = response.json().await.map_err(|error| {
        tracing::error!(?error, "failed to parse GitLab response");
        ErrorResponse::new(StatusCode::BAD_GATEWAY, "failed to parse GitLab response")
    })?;

    Ok(ApiResponse::success(projects))
}

/// POST /settings/gitlab/repos - Link a repository
#[instrument(name = "gitlab_settings.link_repo", skip(state, ctx, payload))]
async fn link_workspace_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<LinkGitLabRepository>,
) -> Result<Json<ApiResponse<GitLabRepository>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, repo = %payload.repo_full_name, "linking repository");

    let connection = GitLabConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::NOT_FOUND,
                "workspace GitLab connection not found",
            )
        })?;

    let repository = GitLabRepositoryOps::link(state.pool(), connection.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to link repository");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to link repository",
            )
        })?;

    tracing::info!(repo_id = %repository.id, "repository linked");
    Ok(ApiResponse::success(repository))
}

/// DELETE /settings/gitlab/repos/{repo_id} - Unlink a repository
#[instrument(name = "gitlab_settings.unlink_repo", skip(state, ctx))]
async fn unlink_workspace_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(repo_id): Path<Uuid>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, %repo_id, "unlinking repository");

    let rows_affected = GitLabRepositoryOps::unlink(state.pool(), repo_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to unlink repository");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to unlink repository",
            )
        })?;

    if rows_affected == 0 {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "repository not found",
        ));
    }

    tracing::info!(%repo_id, "repository unlinked");
    Ok(ApiResponse::success(()))
}
