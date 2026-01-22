//! Admin routes - Stub implementation for frontend compatibility
//!
//! These endpoints return empty/default data to prevent 404 errors.
//! TODO: Implement actual admin dashboard when the feature is needed.

#![allow(dead_code)] // Stub implementation - fields used for API contract

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    routing::get,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{AppState, auth::RequestContext};
use super::organization_members::ensure_member_access;

#[derive(Debug, Serialize)]
pub struct AdminStats {
    pub total_users: i64,
    pub active_users: i64,
    pub total_projects: i64,
    pub total_tasks: i64,
}

#[derive(Debug, Serialize)]
pub struct AdminActivity {
    pub id: Uuid,
    pub user_id: Uuid,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/{workspace_id}/stats", get(get_stats))
        .route("/admin/{workspace_id}/activity", get(get_activity))
}

/// Get workspace stats - returns default values (stub)
async fn get_stats(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<AdminStats>, axum::http::StatusCode> {
    // Verify user has access to workspace
    ensure_member_access(state.pool(), workspace_id, ctx.user.id)
        .await
        .map_err(|_| axum::http::StatusCode::FORBIDDEN)?;

    // Stub: return empty stats
    Ok(Json(AdminStats {
        total_users: 0,
        active_users: 0,
        total_projects: 0,
        total_tasks: 0,
    }))
}

/// Get workspace activity - returns empty array (stub)
async fn get_activity(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<AdminActivity>>, axum::http::StatusCode> {
    // Verify user has access to workspace
    ensure_member_access(state.pool(), workspace_id, ctx.user.id)
        .await
        .map_err(|_| axum::http::StatusCode::FORBIDDEN)?;

    // Stub: return empty activity
    Ok(Json(vec![]))
}
