//! Stub endpoints for local-only features
//!
//! These endpoints exist in the local Tauri app but have no meaning in the remote server.
//! We return empty arrays to prevent frontend errors.

use axum::{
    Json, Router,
    extract::{Extension, Path, Query},
    routing::get,
};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use super::error::ApiResponse;
use crate::{AppState, auth::RequestContext};

pub fn router() -> Router<AppState> {
    Router::new()
        // Task attempts - local-only feature for managing coding agent workspaces
        .route("/task-attempts", get(list_task_attempts))
        .route("/task-attempts/{attempt_id}", get(get_task_attempt))
        .route(
            "/task-attempts/{attempt_id}/children",
            get(get_attempt_children),
        )
        .route("/task-attempts/{attempt_id}/repos", get(get_attempt_repos))
        .route(
            "/task-attempts/{attempt_id}/branch-status",
            get(get_branch_status),
        )
    // NOTE: Project repository routes have been moved to routes/projects.rs
    // They now properly store GitHub/GitLab repo links in the database
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct TaskAttemptsQuery {
    task_id: Option<Uuid>,
}

/// List task attempts - returns empty array (local-only feature)
async fn list_task_attempts(
    Extension(_ctx): Extension<RequestContext>,
    Query(_params): Query<TaskAttemptsQuery>,
) -> Json<ApiResponse<Vec<Value>>> {
    // Task attempts are local-only for managing coding agent workspaces
    ApiResponse::success(vec![])
}

/// Get a single task attempt - returns not found (local-only feature)
async fn get_task_attempt(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<()>> {
    ApiResponse::error("Task attempts are only available in the local desktop app")
}

/// Get task attempt children - returns empty (local-only feature)
async fn get_attempt_children(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<AttemptChildrenResponse>> {
    ApiResponse::success(AttemptChildrenResponse {
        parent: None,
        children: vec![],
    })
}

#[derive(Debug, serde::Serialize)]
struct AttemptChildrenResponse {
    parent: Option<Value>,
    children: Vec<Value>,
}

/// Get task attempt repos - returns empty array (local-only feature)
async fn get_attempt_repos(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<Value>>> {
    ApiResponse::success(vec![])
}

/// Get branch status - returns empty array (local-only feature)
async fn get_branch_status(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<Value>>> {
    ApiResponse::success(vec![])
}
