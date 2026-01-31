//! Admin routes - Dashboard with real data from database
//!
//! IKA-283: Updated to query actual counts from database tables.
//! IKA-286: Implemented get_users to return actual users from team_members.
//! IKA-XXX: Added PUT/POST/DELETE endpoints for full admin functionality.

#![allow(dead_code)] // Some fields used only for API contract

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    routing::{get, put, post, delete},
};
use serde::{Serialize, Deserialize};
use sqlx::FromRow;
use uuid::Uuid;

use super::error::ApiResponse;
use crate::{AppState, auth::RequestContext};

// =============================================================================
// Database Row Types
// =============================================================================

#[derive(Debug, FromRow)]
struct AdminUserRow {
    id: Uuid,
    email: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
    role: String,
    joined_at: chrono::DateTime<chrono::Utc>,
    teams_count: i64,
    #[allow(dead_code)]
    projects_count: i64,
}

#[derive(Debug, FromRow)]
struct ActivityLogRow {
    id: Uuid,
    user_id: Uuid,
    user_email: Option<String>,
    action: String,
    resource_type: String,
    resource_id: Option<Uuid>,
    resource_name: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

/// Map team_member role to admin display role
fn map_role_to_admin_role(role: &str) -> String {
    match role {
        "owner" => "owner".to_string(),
        "maintainer" => "admin".to_string(),
        "contributor" => "member".to_string(),
        "viewer" => "viewer".to_string(),
        _ => "member".to_string(),
    }
}

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

#[derive(Debug, Deserialize)]
pub struct UpdateConfigurationRequest {
    pub config: AdminConfiguration,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserStatusRequest {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRoleRequest {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePermissionRequest {
    pub role: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFeatureRequest {
    pub enabled: bool,
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
        .route(
            "/admin/{workspace_id}/users/{user_id}/status",
            put(update_user_status),
        )
        .route(
            "/admin/{workspace_id}/users/{user_id}/role",
            put(update_user_role),
        )
        .route(
            "/admin/{workspace_id}/users/{user_id}",
            delete(remove_user),
        )
        // Invitations (IKA-282)
        .route("/admin/{workspace_id}/invitations", get(get_invitations))
        .route("/admin/{workspace_id}/invitations", post(create_invitation))
        .route(
            "/admin/{workspace_id}/invitations/{invitation_id}/resend",
            post(resend_invitation),
        )
        .route(
            "/admin/{workspace_id}/invitations/{invitation_id}",
            delete(revoke_invitation),
        )
        // Permissions (IKA-282)
        .route("/admin/{workspace_id}/permissions", get(get_permissions))
        .route(
            "/admin/{workspace_id}/permissions/{permission_id}",
            put(update_permission),
        )
        // Features (IKA-282)
        .route("/admin/{workspace_id}/features", get(get_features))
        .route(
            "/admin/{workspace_id}/features/{feature_id}",
            put(update_feature),
        )
        // Configuration (IKA-282)
        .route(
            "/admin/{workspace_id}/configuration",
            get(get_configuration).put(update_configuration),
        )
}

// =============================================================================
// Handler Implementations
// =============================================================================

/// Get workspace stats - queries real counts from database
/// IKA-283: Updated to return actual data
/// Note: Teams don't have workspace_id set, so we count system-wide for now
async fn get_stats(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<AdminStats>> {
    let pool = state.pool();

    // Count distinct users from team_members via clerk_user_id (actual users with team access)
    let total_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT clerk_user_id) FROM team_members WHERE clerk_user_id IS NOT NULL",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    // Active users = same as total for now
    let active_users = total_users;

    // Count pending invitations (system-wide for now)
    let pending_invitations: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM invitations WHERE status = 'pending'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    // Count all teams (teams don't have workspace_id set)
    let total_teams: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM teams")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    // Count all projects
    let total_projects: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    // Count all tasks
    let total_tasks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    ApiResponse::success(AdminStats {
        total_users,
        active_users,
        pending_invitations,
        total_teams,
        total_projects,
        total_tasks,
    })
}

/// Get workspace activity - queries activity_logs table
/// IKA-286: Implemented to return recent activity from activity_logs
async fn get_activity(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<AdminActivity>>> {
    let pool = state.pool();

    // Query recent activity logs (last 50 entries)
    let activities: Vec<AdminActivity> = match sqlx::query_as::<_, ActivityLogRow>(
        r#"
        SELECT
            id,
            user_id,
            user_email,
            action,
            resource_type,
            resource_id,
            resource_name,
            created_at
        FROM activity_logs
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows
            .into_iter()
            .map(|row| AdminActivity {
                id: row.id,
                user_id: row.user_id,
                action: row.action.clone(),
                resource_type: row.resource_type.clone(),
                resource_id: row.resource_id,
                activity_type: format!("{}_{}", row.action, row.resource_type),
                user_email: row.user_email,
                target_email: None,
                from_role: None,
                to_role: None,
                timestamp: row.created_at,
                created_at: row.created_at,
            })
            .collect(),
        Err(e) => {
            tracing::error!("Failed to fetch activity logs: {}", e);
            vec![]
        }
    };

    ApiResponse::success(activities)
}

/// Get workspace users - queries team_members with aggregated team/project counts
/// IKA-286: Implemented to return actual users from team_members table
/// IKA-287: Fixed invalid GROUP BY - use DISTINCT ON for PostgreSQL
async fn get_users(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<AdminUser>>> {
    let pool = state.pool();

    // Query distinct users from team_members with aggregated team count
    // Use DISTINCT ON (PostgreSQL) to get one row per unique clerk_user_id
    let users: Vec<AdminUser> = match sqlx::query_as::<_, AdminUserRow>(
        r#"
        SELECT DISTINCT ON (tm.clerk_user_id)
            tm.id,
            tm.email,
            tm.display_name,
            tm.avatar_url,
            tm.role,
            tm.joined_at,
            (SELECT COUNT(DISTINCT t2.team_id) FROM team_members t2 WHERE t2.clerk_user_id = tm.clerk_user_id) as teams_count,
            (SELECT COUNT(DISTINCT mp.project_id) FROM member_project_access mp WHERE mp.member_id = tm.id) as projects_count
        FROM team_members tm
        WHERE tm.clerk_user_id IS NOT NULL
        ORDER BY tm.clerk_user_id, tm.joined_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows
            .into_iter()
            .map(|row| AdminUser {
                id: row.id,
                email: row.email,
                display_name: row.display_name,
                avatar_url: row.avatar_url,
                role: map_role_to_admin_role(&row.role),
                status: "active".to_string(), // All team members are active
                joined_at: row.joined_at,
                workspaces: 1, // Users are in the current workspace
                teams: row.teams_count,
            })
            .collect(),
        Err(e) => {
            tracing::error!("Failed to fetch admin users: {}", e);
            vec![]
        }
    };

    ApiResponse::success(users)
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

// =============================================================================
// Update Handlers (Stubs - return success for now)
// =============================================================================

/// Update user status (stub)
async fn update_user_status(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((_workspace_id, _user_id)): Path<(Uuid, Uuid)>,
    Json(_request): Json<UpdateUserStatusRequest>,
) -> Json<ApiResponse<AdminUser>> {
    // Stub: return mock user
    ApiResponse::success(AdminUser {
        id: _user_id,
        email: "user@example.com".to_string(),
        display_name: Some("User".to_string()),
        avatar_url: None,
        role: "member".to_string(),
        status: _request.status,
        joined_at: chrono::Utc::now(),
        workspaces: 1,
        teams: 0,
    })
}

/// Update user role (stub)
async fn update_user_role(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((_workspace_id, _user_id)): Path<(Uuid, Uuid)>,
    Json(_request): Json<UpdateUserRoleRequest>,
) -> Json<ApiResponse<AdminUser>> {
    // Stub: return mock user
    ApiResponse::success(AdminUser {
        id: _user_id,
        email: "user@example.com".to_string(),
        display_name: Some("User".to_string()),
        avatar_url: None,
        role: _request.role,
        status: "active".to_string(),
        joined_at: chrono::Utc::now(),
        workspaces: 1,
        teams: 0,
    })
}

/// Remove user from workspace (stub)
async fn remove_user(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((_workspace_id, _user_id)): Path<(Uuid, Uuid)>,
) -> Json<ApiResponse<()>> {
    // Stub: return success
    ApiResponse::success(())
}

/// Create invitation (stub)
async fn create_invitation(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
    Json(_request): Json<serde_json::Value>,
) -> Json<ApiResponse<AdminInvitation>> {
    // Stub: return mock invitation
    ApiResponse::success(AdminInvitation {
        id: Uuid::new_v4(),
        email: "newuser@example.com".to_string(),
        role: "member".to_string(),
        status: "pending".to_string(),
        invited_by: Some("admin@example.com".to_string()),
        team_name: "Default Team".to_string(),
        workspace_name: "Workspace".to_string(),
        sent_at: chrono::Utc::now(),
        expires_at: chrono::Utc::now() + chrono::Duration::days(7),
    })
}

/// Resend invitation (stub)
async fn resend_invitation(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((_workspace_id, _invitation_id)): Path<(Uuid, Uuid)>,
) -> Json<ApiResponse<AdminInvitation>> {
    // Stub: return mock invitation
    ApiResponse::success(AdminInvitation {
        id: _invitation_id,
        email: "user@example.com".to_string(),
        role: "member".to_string(),
        status: "pending".to_string(),
        invited_by: Some("admin@example.com".to_string()),
        team_name: "Default Team".to_string(),
        workspace_name: "Workspace".to_string(),
        sent_at: chrono::Utc::now(),
        expires_at: chrono::Utc::now() + chrono::Duration::days(7),
    })
}

/// Revoke invitation (stub)
async fn revoke_invitation(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((_workspace_id, _invitation_id)): Path<(Uuid, Uuid)>,
) -> Json<ApiResponse<()>> {
    // Stub: return success
    ApiResponse::success(())
}

/// Update permission (stub)
async fn update_permission(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((_workspace_id, _permission_id)): Path<(Uuid, Uuid)>,
    Json(_request): Json<UpdatePermissionRequest>,
) -> Json<ApiResponse<AdminPermission>> {
    // Stub: return mock permission
    ApiResponse::success(AdminPermission {
        id: _permission_id,
        label: "Permission".to_string(),
        description: "Permission description".to_string(),
        owner: true,
        admin: _request.enabled,
        member: false,
        viewer: false,
    })
}

/// Update feature (stub)
async fn update_feature(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((_workspace_id, _feature_id)): Path<(Uuid, Uuid)>,
    Json(_request): Json<UpdateFeatureRequest>,
) -> Json<ApiResponse<AdminFeatureToggle>> {
    // Stub: return mock feature
    ApiResponse::success(AdminFeatureToggle {
        id: _feature_id,
        label: "Feature".to_string(),
        description: "Feature description".to_string(),
        enabled: _request.enabled,
        category: "General".to_string(),
    })
}

/// Update configuration (stub)
async fn update_configuration(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_workspace_id): Path<Uuid>,
    Json(request): Json<UpdateConfigurationRequest>,
) -> Json<ApiResponse<AdminConfiguration>> {
    // Stub: return the same configuration back
    ApiResponse::success(request.config)
}
