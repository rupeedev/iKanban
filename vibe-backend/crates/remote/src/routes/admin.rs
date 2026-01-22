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
use super::error::ApiResponse;

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
/// TODO: Add proper tenant_workspace_members check when implementing
async fn get_stats(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<AdminStats>> {
    // Stub: return empty stats (skip membership check for now)
    ApiResponse::success(AdminStats {
        total_users: 0,
        active_users: 0,
        total_projects: 0,
        total_tasks: 0,
    })
}

/// Get workspace activity - returns empty array (stub)
/// TODO: Add proper tenant_workspace_members check when implementing
async fn get_activity(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<AdminActivity>>> {
    // Stub: return empty activity (skip membership check for now)
    ApiResponse::success(vec![])
}
