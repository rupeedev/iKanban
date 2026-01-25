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

use super::error::ApiResponse;
use crate::{AppState, auth::RequestContext};

// =============================================================================
// Dashboard Types
// =============================================================================

#[derive(Debug, Serialize)]
pub struct AdminStats {
    pub total_users: i64,
    pub active_users: i64,
    pub pending_invitations: i64,
    pub total_teams: i64,
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
    pub activity_type: String,
    pub user_email: Option<String>,
    pub target_email: Option<String>,
    pub from_role: Option<String>,
    pub to_role: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// =============================================================================
// Users Types
// =============================================================================

#[derive(Debug, Serialize)]
pub struct AdminUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub status: String,
    pub joined_at: chrono::DateTime<chrono::Utc>,
    pub workspaces: i64,
    pub teams: i64,
}

// =============================================================================
// Invitations Types
// =============================================================================

#[derive(Debug, Serialize)]
pub struct AdminInvitation {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    pub status: String,
    pub invited_by: Option<String>,
    pub team_name: String,
    pub workspace_name: String,
    pub sent_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

// =============================================================================
// Permissions Types
// =============================================================================

#[derive(Debug, Serialize)]
pub struct AdminPermission {
    pub id: Uuid,
    pub label: String,
    pub description: String,
    pub owner: bool,
    pub admin: bool,
    pub member: bool,
    pub viewer: bool,
}

// =============================================================================
// Features Types
// =============================================================================

#[derive(Debug, Serialize)]
pub struct AdminFeatureToggle {
    pub id: Uuid,
    pub label: String,
    pub description: String,
    pub enabled: bool,
    pub category: String,
}

// =============================================================================
// Configuration Types
// =============================================================================

#[derive(Debug, Serialize)]
pub struct AdminConfiguration {
    pub app_name: String,
    pub default_language: String,
    pub timezone: String,
    pub support_email: String,
    pub default_workspace_color: String,
    pub default_member_role: String,
    pub max_members_per_workspace: i64,
    pub auto_create_project: bool,
    pub github_enabled: bool,
    pub github_org: String,
    pub notifications_enabled: bool,
    pub email_notifications: bool,
    pub session_timeout_minutes: i64,
    pub min_password_length: i64,
    pub require_mfa: bool,
}

// =============================================================================
// Router
// =============================================================================

pub fn router() -> Router<AppState> {
    Router::new()
        // Dashboard
        .route("/admin/{workspace_id}/stats", get(get_stats))
        .route("/admin/{workspace_id}/activity", get(get_activity))
        // Users (IKA-282)
        .route("/admin/{workspace_id}/users", get(get_users))
        // Invitations (IKA-282)
        .route("/admin/{workspace_id}/invitations", get(get_invitations))
        // Permissions (IKA-282)
        .route("/admin/{workspace_id}/permissions", get(get_permissions))
        // Features (IKA-282)
        .route("/admin/{workspace_id}/features", get(get_features))
        // Configuration (IKA-282)
        .route(
            "/admin/{workspace_id}/configuration",
            get(get_configuration),
        )
}

// =============================================================================
// Handler Implementations (Stubs)
// =============================================================================

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
        pending_invitations: 0,
        total_teams: 0,
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

/// Get workspace users - returns empty array (stub)
/// IKA-282: Added to fix 404 errors on admin pages
async fn get_users(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<AdminUser>>> {
    // Stub: return empty users (skip membership check for now)
    ApiResponse::success(vec![])
}

/// Get workspace invitations - returns empty array (stub)
/// IKA-282: Added to fix 404 errors on admin pages
async fn get_invitations(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<AdminInvitation>>> {
    // Stub: return empty invitations (skip membership check for now)
    ApiResponse::success(vec![])
}

/// Get workspace permissions - returns empty array (stub)
/// IKA-282: Added to fix 404 errors on admin pages
async fn get_permissions(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<AdminPermission>>> {
    // Stub: return empty permissions (skip membership check for now)
    ApiResponse::success(vec![])
}

/// Get workspace features - returns empty array (stub)
/// IKA-282: Added to fix 404 errors on admin pages
async fn get_features(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<AdminFeatureToggle>>> {
    // Stub: return empty features (skip membership check for now)
    ApiResponse::success(vec![])
}

/// Get workspace configuration - returns default values (stub)
/// IKA-282: Added to fix 404 errors on admin pages
async fn get_configuration(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<AdminConfiguration>> {
    // Stub: return default configuration
    ApiResponse::success(AdminConfiguration {
        app_name: "iKanban".to_string(),
        default_language: "en".to_string(),
        timezone: "UTC".to_string(),
        support_email: "support@scho1ar.com".to_string(),
        default_workspace_color: "#4F46E5".to_string(),
        default_member_role: "member".to_string(),
        max_members_per_workspace: 100,
        auto_create_project: true,
        github_enabled: false,
        github_org: "".to_string(),
        notifications_enabled: true,
        email_notifications: true,
        session_timeout_minutes: 1440,
        min_password_length: 8,
        require_mfa: false,
    })
}
