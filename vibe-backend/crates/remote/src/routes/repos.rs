//! Repository routes
//!
//! Handles repository-related operations like fetching branches.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use reqwest::header;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use crate::{
    db::{
        github_connections::GitHubConnectionRepository,
        repos::RepoRepository,
    },
    routes::error::ApiResponse,
    AppState,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub commit: BranchCommit,
    pub protected: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchCommit {
    pub sha: String,
    pub url: String,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/repos/{repo_id}/branches", get(get_repo_branches))
}

#[instrument(
    name = "repos.get_branches",
    skip(state),
    fields(repo_id = %repo_id)
)]
pub async fn get_repo_branches(
    State(state): State<AppState>,
    Path(repo_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    // 1. Fetch Repo
    let repo = match RepoRepository::find_by_id(pool, repo_id).await {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"success": false, "message": "Repo not found"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to load repo");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"success": false, "message": "Failed to load repo"})),
            )
                .into_response();
        }
    };

    // 2. Get Workspace GitHub Connection
    let connection = match GitHubConnectionRepository::find_workspace_connection(pool).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false, 
                    "message": "No GitHub connection configured"
                })),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to get GitHub connection");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false, 
                    "message": "Failed to get GitHub connection"
                })),
            )
                .into_response();
        }
    };

    // 3. Call GitHub API
    let (owner, name) = if repo.path.starts_with("http") {
        let parts: Vec<&str> = repo.path.split('/').collect();
        if parts.len() >= 2 {
            (parts[parts.len() - 2].to_string(), parts[parts.len() - 1].to_string())
        } else {
             return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"success": false, "message": format!("Invalid repo URL format: {}", repo.path)})),
            )
            .into_response();
        }
    } else {
        let parts: Vec<&str> = repo.path.split('/').collect();
        if parts.len() != 2 {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"success": false, "message": format!("Invalid repo path format: {}", repo.path)})),
            )
            .into_response();
        }
        (parts[0].to_string(), parts[1].to_string())
    };

    let url = format!("https://api.github.com/repos/{}/{}/branches", owner, name);
    let client = reqwest::Client::new();

    match client
        .get(&url)
        .header(header::AUTHORIZATION, format!("Bearer {}", connection.access_token))
        .header(header::USER_AGENT, "iKanban-Backend")
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
    {
        Ok(res) => {
            if !res.status().is_success() {
                let status = res.status();
                let body = res.text().await.unwrap_or_default();
                tracing::error!(%status, %body, "GitHub API error fetching branches");
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({
                        "success": false, 
                        "message": format!("GitHub API error: {}", status)
                    })),
                )
                    .into_response();
            }

            match res.json::<Vec<GitBranch>>().await {
                Ok(branches) => (StatusCode::OK, ApiResponse::success(branches)).into_response(),
                Err(e) => {
                    tracing::error!(?e, "failed to parse GitHub branches response");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "success": false, 
                            "message": "Failed to parse GitHub response"
                        })),
                    )
                        .into_response()
                }
            }
        }
        Err(e) => {
            tracing::error!(?e, "failed to call GitHub API");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"success": false, "message": "Failed to call GitHub API"})),
            )
                .into_response()
        }
    }
}
