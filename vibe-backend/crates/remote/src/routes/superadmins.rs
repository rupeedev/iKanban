//! Superadmin routes for app-level administration.
//!
//! These routes are protected by the `require_superadmin` middleware and provide:
//! - Superadmin status check
//! - Dashboard statistics
//! - Superadmin list management

use axum::{Extension, Json, Router, extract::State, routing::get};
use serde::{Deserialize, Serialize};
use tracing::instrument;

use crate::{AppState, auth::RequestContext, db::superadmins::SuperadminRepository};
use super::error::ApiResponse;

/// Response for the superadmin check endpoint
#[derive(Debug, Serialize, Deserialize)]
pub struct SuperadminCheckResponse {
    pub is_superadmin: bool,
    pub email: String,
}

/// Dashboard statistics for the superadmin panel
#[derive(Debug, Serialize, Deserialize)]
pub struct SuperadminStatsResponse {
    pub pending_registrations: i64,
    pub approved_today: i64,
    pub total_users: i64,
    pub total_workspaces: i64,
}

/// Superadmin info for list responses
#[derive(Debug, Serialize, Deserialize)]
pub struct SuperadminInfo {
    pub id: uuid::Uuid,
    pub email: String,
    pub name: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Router for public superadmin routes (status check)
pub fn public_router() -> Router<AppState> {
    Router::new().route("/superadmin/check", get(check_superadmin_status))
}

/// Router for protected superadmin routes (requires superadmin auth)
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/superadmin/stats", get(get_stats))
        .route("/superadmin/list", get(list_superadmins))
}

/// Check if the current authenticated user is a superadmin.
/// This endpoint uses standard session auth (not superadmin middleware)
/// so any authenticated user can check their own status.
#[instrument(name = "superadmin.check", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn check_superadmin_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Json<ApiResponse<SuperadminCheckResponse>> {
    let pool = state.pool();
    let repo = SuperadminRepository::new(pool);

    let is_superadmin = match repo.find_by_email(&ctx.user.email).await {
        Ok(Some(superadmin)) => superadmin.is_active,
        Ok(None) => false,
        Err(error) => {
            tracing::warn!(?error, "Failed to check superadmin status");
            false
        }
    };

    ApiResponse::success(SuperadminCheckResponse {
        is_superadmin,
        email: ctx.user.email,
    })
}

/// Get dashboard statistics for the superadmin panel.
/// This endpoint is protected by the superadmin middleware.
#[instrument(name = "superadmin.stats", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn get_stats(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Json<ApiResponse<SuperadminStatsResponse>> {
    let pool = state.pool();

    // Get total users count
    let total_users = sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!" FROM users"#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    // Get total workspaces count
    let total_workspaces = sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!" FROM organizations"#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    // TODO: Implement registration tracking when registration flow is built
    // For now, return placeholders
    let pending_registrations = 0;
    let approved_today = 0;

    tracing::debug!(
        user_id = %ctx.user.id,
        total_users,
        total_workspaces,
        "Superadmin stats retrieved"
    );

    ApiResponse::success(SuperadminStatsResponse {
        pending_registrations,
        approved_today,
        total_users,
        total_workspaces,
    })
}

/// List all superadmins.
/// This endpoint is protected by the superadmin middleware.
#[instrument(name = "superadmin.list", skip(state, _ctx))]
async fn list_superadmins(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
) -> Json<ApiResponse<Vec<SuperadminInfo>>> {
    let pool = state.pool();
    let repo = SuperadminRepository::new(pool);

    let superadmins = match repo.list_all().await {
        Ok(list) => list
            .into_iter()
            .map(|s| SuperadminInfo {
                id: s.id,
                email: s.email,
                name: s.name,
                is_active: s.is_active,
                created_at: s.created_at,
            })
            .collect(),
        Err(error) => {
            tracing::warn!(?error, "Failed to list superadmins");
            vec![]
        }
    };

    ApiResponse::success(superadmins)
}
