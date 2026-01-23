//! GitHub settings routes - Workspace-level GitHub connection management

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
    db::github_connections::{
        CreateGitHubConnection, GitHubConnection, GitHubConnectionRepository,
        GitHubConnectionWithRepos, GitHubRepository, GitHubRepositoryOps, LinkGitHubRepository,
        UpdateGitHubConnection,
    },
};

/// A GitHub repository from the API (not yet linked)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepoInfo {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub default_branch: Option<String>,
    pub private: bool,
    pub description: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/settings/github", get(get_workspace_github_connection))
        .route("/settings/github", post(create_workspace_github_connection))
        .route("/settings/github", put(update_workspace_github_connection))
        .route(
            "/settings/github",
            delete(delete_workspace_github_connection),
        )
        .route("/settings/github/repos", get(get_workspace_repositories))
        .route(
            "/settings/github/repos/available",
            get(get_available_github_repos),
        )
        .route("/settings/github/repos", post(link_workspace_repository))
        .route(
            "/settings/github/repos/{repo_id}",
            delete(unlink_workspace_repository),
        )
}

/// GET /settings/github - Get workspace-level GitHub connection
#[instrument(name = "github_settings.get_connection", skip(state, ctx))]
async fn get_workspace_github_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<Option<GitHubConnectionWithRepos>>>, ErrorResponse> {
    tracing::debug!(user_id = %ctx.user.id, "getting workspace GitHub connection");

    let connection = GitHubConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get GitHub connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    match connection {
        Some(conn) => {
            let repositories = GitHubRepositoryOps::find_by_connection_id(state.pool(), conn.id)
                .await
                .map_err(|error| {
                    tracing::error!(?error, "failed to get repositories");
                    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
                })?;

            Ok(ApiResponse::success(Some(GitHubConnectionWithRepos {
                connection: conn,
                repositories,
            })))
        }
        None => Ok(ApiResponse::success(None)),
    }
}

/// POST /settings/github - Create workspace-level GitHub connection
#[instrument(name = "github_settings.create_connection", skip(state, ctx, payload))]
async fn create_workspace_github_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateGitHubConnection>,
) -> Result<Json<ApiResponse<GitHubConnection>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, "creating workspace GitHub connection");

    // Check if connection already exists
    let existing = GitHubConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to check existing connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    if existing.is_some() {
        return Err(ErrorResponse::new(
            StatusCode::CONFLICT,
            "workspace GitHub connection already exists. Use PUT to update.",
        ));
    }

    let connection = GitHubConnectionRepository::create_workspace_connection(state.pool(), &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create connection")
        })?;

    tracing::info!(connection_id = %connection.id, "GitHub connection created");
    Ok(ApiResponse::success(connection))
}

/// PUT /settings/github - Update workspace-level GitHub connection
#[instrument(name = "github_settings.update_connection", skip(state, ctx, payload))]
async fn update_workspace_github_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<UpdateGitHubConnection>,
) -> Result<Json<ApiResponse<GitHubConnection>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, "updating workspace GitHub connection");

    let existing = GitHubConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(StatusCode::NOT_FOUND, "workspace GitHub connection not found")
        })?;

    let updated = GitHubConnectionRepository::update(state.pool(), existing.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update connection")
        })?;

    tracing::info!(connection_id = %updated.id, "GitHub connection updated");
    Ok(ApiResponse::success(updated))
}

/// DELETE /settings/github - Delete workspace-level GitHub connection
#[instrument(name = "github_settings.delete_connection", skip(state, ctx))]
async fn delete_workspace_github_connection(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, "deleting workspace GitHub connection");

    let rows_affected = GitHubConnectionRepository::delete_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete connection")
        })?;

    if rows_affected == 0 {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "workspace GitHub connection not found",
        ));
    }

    tracing::info!("GitHub connection deleted");
    Ok(ApiResponse::success(()))
}

/// GET /settings/github/repos - Get linked repositories
#[instrument(name = "github_settings.get_repos", skip(state, ctx))]
async fn get_workspace_repositories(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<Vec<GitHubRepository>>>, ErrorResponse> {
    tracing::debug!(user_id = %ctx.user.id, "getting linked repositories");

    let connection = GitHubConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(StatusCode::NOT_FOUND, "workspace GitHub connection not found")
        })?;

    let repositories = GitHubRepositoryOps::find_by_connection_id(state.pool(), connection.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get repositories");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    Ok(ApiResponse::success(repositories))
}

/// GET /settings/github/repos/available - Fetch available repos from GitHub API
#[instrument(name = "github_settings.get_available_repos", skip(state, ctx))]
async fn get_available_github_repos(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<Vec<GitHubRepoInfo>>>, ErrorResponse> {
    tracing::debug!(user_id = %ctx.user.id, "fetching available GitHub repos");

    let connection = GitHubConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(StatusCode::NOT_FOUND, "workspace GitHub connection not found")
        })?;

    // Fetch repos from GitHub API
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/user/repos")
        .header("Authorization", format!("Bearer {}", connection.access_token))
        .header("User-Agent", "ikanban")
        .query(&[("per_page", "100"), ("sort", "updated")])
        .send()
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to fetch repos from GitHub");
            ErrorResponse::new(StatusCode::BAD_GATEWAY, "failed to fetch repos from GitHub")
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::error!(%status, %body, "GitHub API error");
        return Err(ErrorResponse::new(
            StatusCode::BAD_GATEWAY,
            format!("GitHub API error ({})", status),
        ));
    }

    let repos: Vec<GitHubRepoInfo> = response.json().await.map_err(|error| {
        tracing::error!(?error, "failed to parse GitHub response");
        ErrorResponse::new(StatusCode::BAD_GATEWAY, "failed to parse GitHub response")
    })?;

    Ok(ApiResponse::success(repos))
}

/// POST /settings/github/repos - Link a repository
#[instrument(name = "github_settings.link_repo", skip(state, ctx, payload))]
async fn link_workspace_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<LinkGitHubRepository>,
) -> Result<Json<ApiResponse<GitHubRepository>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, repo = %payload.repo_full_name, "linking repository");

    let connection = GitHubConnectionRepository::find_workspace_connection(state.pool())
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(StatusCode::NOT_FOUND, "workspace GitHub connection not found")
        })?;

    let repository = GitHubRepositoryOps::link(state.pool(), connection.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to link repository");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to link repository")
        })?;

    tracing::info!(repo_id = %repository.id, "repository linked");
    Ok(ApiResponse::success(repository))
}

/// DELETE /settings/github/repos/{repo_id} - Unlink a repository
#[instrument(name = "github_settings.unlink_repo", skip(state, ctx))]
async fn unlink_workspace_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(repo_id): Path<Uuid>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    tracing::info!(user_id = %ctx.user.id, %repo_id, "unlinking repository");

    let rows_affected = GitHubRepositoryOps::unlink(state.pool(), repo_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to unlink repository");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to unlink repository")
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
