//! Stub endpoints for local-only features
//!
//! These endpoints exist in the local Tauri app but have no meaning in the remote server.
//! We return empty arrays to prevent frontend errors.

use axum::{
    Json, Router,
    extract::{Extension, Path, Query},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{AppState, auth::RequestContext};

pub fn router() -> Router<AppState> {
    Router::new()
        // Task attempts - local-only feature for managing coding agent workspaces
        .route("/task-attempts", get(list_task_attempts))
        .route("/task-attempts/{attempt_id}", get(get_task_attempt))
        .route("/task-attempts/{attempt_id}/children", get(get_attempt_children))
        .route("/task-attempts/{attempt_id}/repos", get(get_attempt_repos))
        .route("/task-attempts/{attempt_id}/branch-status", get(get_branch_status))
        // Project repositories - local-only feature for linking to local git repos
        .route("/projects/{project_id}/repositories", get(list_project_repositories))
        .route("/projects/{project_id}/repositories/{repo_id}", get(get_project_repository))
}

#[derive(Debug, Deserialize)]
struct TaskAttemptsQuery {
    task_id: Option<Uuid>,
}

/// List task attempts - returns empty array (local-only feature)
async fn list_task_attempts(
    Extension(_ctx): Extension<RequestContext>,
    Query(_params): Query<TaskAttemptsQuery>,
) -> Json<Vec<Value>> {
    // Task attempts are local-only for managing coding agent workspaces
    Json(vec![])
}

/// Get a single task attempt - returns not found (local-only feature)
async fn get_task_attempt(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({
            "error": "Task attempts are only available in the local desktop app"
        })),
    )
}

/// Get task attempt children - returns empty (local-only feature)
async fn get_attempt_children(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<Value> {
    Json(json!({
        "parent": null,
        "children": []
    }))
}

/// Get task attempt repos - returns empty array (local-only feature)
async fn get_attempt_repos(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<Vec<Value>> {
    Json(vec![])
}

/// Get branch status - returns empty array (local-only feature)
async fn get_branch_status(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<Vec<Value>> {
    Json(vec![])
}

/// List project repositories - returns empty array (local-only feature)
async fn list_project_repositories(
    Extension(_ctx): Extension<RequestContext>,
    Path(_project_id): Path<Uuid>,
) -> Json<Vec<Value>> {
    // Project repositories link projects to local git repos - not applicable for remote
    Json(vec![])
}

/// Get a single project repository - returns not found (local-only feature)
async fn get_project_repository(
    Extension(_ctx): Extension<RequestContext>,
    Path((_project_id, _repo_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({
            "error": "Project repositories are only available in the local desktop app"
        })),
    )
}
