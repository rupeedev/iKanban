use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, put, post},
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{error, info};
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::organization_members::MemberRole,
};

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/admin/:workspace_id/stats", get(get_stats))
        .route("/admin/:workspace_id/activity", get(get_activity))
        .route("/admin/:workspace_id/users", get(list_users))
        .route("/admin/:workspace_id/users/:user_id/status", put(update_user_status))
        .route("/admin/:workspace_id/users/:user_id/role", put(update_user_role))
        .route("/admin/:workspace_id/users/:user_id", delete(remove_user))
        .route("/admin/:workspace_id/invitations", get(list_invitations))
        .route("/admin/:workspace_id/invitations", post(create_invitation))
        .route("/admin/:workspace_id/invitations/:invitation_id/resend", post(resend_invitation))
        .route("/admin/:workspace_id/invitations/:invitation_id", delete(revoke_invitation))
        .route("/admin/:workspace_id/permissions", get(get_permissions))
        .route("/admin/:workspace_id/permissions/:permission_id", put(update_permission))
        .route("/admin/:workspace_id/features", get(get_features))
        .route("/admin/:workspace_id/features/:feature_id", put(update_feature))
        .route("/admin/:workspace_id/configuration", get(get_configuration))
        .route("/admin/:workspace_id/configuration", put(update_configuration))
}

// =============================================================================
// Response Types
// =============================================================================

#[derive(Debug, Serialize)]
pub struct AdminStats {
    pub total_users: i32,
    pub active_users: i32,
    pub pending_invitations: i32,
    pub total_teams: i32,
}

#[derive(Debug, Serialize)]
pub struct AdminActivity {
    pub id: String,
    pub activity_type: String,
    pub user_email: Option<String>,
    pub target_email: Option<String>,
    pub from_role: Option<String>,
    pub to_role: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize)]
pub struct AdminUser {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub status: String,
    pub workspaces: i32,
    pub teams: i32,
    pub joined_at: String,
}

#[derive(Debug, Serialize)]
pub struct AdminInvitation {
    pub id: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub workspace_name: String,
    pub team_name: String,
    pub sent_at: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct AdminPermission {
    pub id: String,
    pub name: String,
    pub description: String,
    pub owner: bool,
    pub admin: bool,
    pub member: bool,
    pub viewer: bool,
}

#[derive(Debug, Serialize)]
pub struct AdminFeatureToggle {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdminConfiguration {
    pub workspace_name: String,
    pub workspace_description: Option<String>,
    pub workspace_color: String,
    pub timezone: String,
    pub language: String,
    pub allow_public_signups: bool,
    pub require_email_verification: bool,
    pub session_timeout_minutes: i32,
}

// =============================================================================
// Request Types
// =============================================================================

#[derive(Debug, Deserialize)]
pub struct UpdateUserStatusRequest {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRoleRequest {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvitationRequest {
    pub email: String,
    pub role: MemberRole,
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
// Dashboard Endpoints
// =============================================================================

pub async fn get_stats(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<AdminStats>, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // Get total users count
    let total_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1"
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0) as i32;

    // Get active users count (status = 'active')
    let active_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND status = 'active'"
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0) as i32;

    // Get pending invitations count
    let pending_invitations = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM invitations WHERE organization_id = $1 AND status = 'pending'"
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0) as i32;

    // Get total teams count
    let total_teams = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM teams WHERE organization_id = $1"
    )
    .bind(workspace_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0) as i32;

    Ok(Json(AdminStats {
        total_users,
        active_users,
        pending_invitations,
        total_teams,
    }))
}

pub async fn get_activity(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<AdminActivity>>, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Implement activity log tracking
    // For now, return empty array
    Ok(Json(vec![]))
}

// =============================================================================
// User Management Endpoints
// =============================================================================

pub async fn list_users(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<AdminUser>>, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    let users = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, String, String, String)>(
        r#"
        SELECT 
            om.user_id::text,
            u.email,
            u.display_name,
            u.avatar_url,
            om.role,
            COALESCE(om.status, 'active') as status,
            om.created_at::text as joined_at
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = $1
        ORDER BY om.created_at DESC
        "#
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
    .map_err(|e| {
        error!("Failed to list users: {}", e);
        ErrorResponse::internal_error("Failed to list users")
    })?;

    let admin_users = users
        .into_iter()
        .map(|(id, email, display_name, avatar_url, role, status, joined_at)| AdminUser {
            id,
            email,
            display_name,
            avatar_url,
            role,
            status,
            workspaces: 1, // TODO: Count actual workspaces
            teams: 0,       // TODO: Count actual teams
            joined_at,
        })
        .collect();

    Ok(Json(admin_users))
}

pub async fn update_user_status(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((workspace_id, user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateUserStatusRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    sqlx::query(
        "UPDATE organization_members SET status = $1 WHERE organization_id = $2 AND user_id = $3"
    )
    .bind(&payload.status)
    .bind(workspace_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| {
        error!("Failed to update user status: {}", e);
        ErrorResponse::internal_error("Failed to update user status")
    })?;

    Ok(StatusCode::OK)
}

pub async fn update_user_role(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((workspace_id, user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateUserRoleRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    sqlx::query(
        "UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3"
    )
    .bind(&payload.role)
    .bind(workspace_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| {
        error!("Failed to update user role: {}", e);
        ErrorResponse::internal_error("Failed to update user role")
    })?;

    Ok(StatusCode::OK)
}

pub async fn remove_user(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((workspace_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    sqlx::query(
        "DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2"
    )
    .bind(workspace_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| {
        error!("Failed to remove user: {}", e);
        ErrorResponse::internal_error("Failed to remove user")
    })?;

    Ok(StatusCode::OK)
}

// =============================================================================
// Invitation Endpoints (Proxied to existing routes)
// =============================================================================

pub async fn list_invitations(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<AdminInvitation>>, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Query invitations table
    Ok(Json(vec![]))
}

pub async fn create_invitation(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
    Json(payload): Json<CreateInvitationRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Create invitation
    Ok(StatusCode::CREATED)
}

pub async fn resend_invitation(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((workspace_id, _invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Resend invitation
    Ok(StatusCode::OK)
}

pub async fn revoke_invitation(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((workspace_id, _invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Revoke invitation
    Ok(StatusCode::OK)
}

// =============================================================================
// Permissions & Features Endpoints
// =============================================================================

pub async fn get_permissions(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<AdminPermission>>, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // Return default permission matrix
    let permissions = vec![
        AdminPermission {
            id: "manage_users".to_string(),
            name: "Manage Users".to_string(),
            description: "Add, remove, and modify user accounts".to_string(),
            owner: true,
            admin: true,
            member: false,
            viewer: false,
        },
        AdminPermission {
            id: "manage_projects".to_string(),
            name: "Manage Projects".to_string(),
            description: "Create, edit, and delete projects".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: false,
        },
        AdminPermission {
            id: "manage_tasks".to_string(),
            name: "Manage Tasks".to_string(),
            description: "Create, edit, and delete tasks".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: false,
        },
        AdminPermission {
            id: "view_analytics".to_string(),
            name: "View Analytics".to_string(),
            description: "Access workspace analytics and reports".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: true,
        },
    ];

    Ok(Json(permissions))
}

pub async fn update_permission(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((workspace_id, _permission_id)): Path<(Uuid, String)>,
    Json(_payload): Json<UpdatePermissionRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Update permission in database
    Ok(StatusCode::OK)
}

pub async fn get_features(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<AdminFeatureToggle>>, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // Return default features
    let features = vec![
        AdminFeatureToggle {
            id: "ai_assistance".to_string(),
            name: "AI Assistance".to_string(),
            description: "Enable AI-powered task suggestions and automation".to_string(),
            enabled: true,
        },
        AdminFeatureToggle {
            id: "github_integration".to_string(),
            name: "GitHub Integration".to_string(),
            description: "Connect and sync with GitHub repositories".to_string(),
            enabled: true,
        },
    ];

    Ok(Json(features))
}

pub async fn update_feature(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((workspace_id, _feature_id)): Path<(Uuid, String)>,
    Json(_payload): Json<UpdateFeatureRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Update feature toggle in database
    Ok(StatusCode::OK)
}

// =============================================================================
// Configuration Endpoints
// =============================================================================

pub async fn get_configuration(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<AdminConfiguration>, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Fetch from database
    let config = AdminConfiguration {
        workspace_name: "Default Workspace".to_string(),
        workspace_description: Some("Default workspace description".to_string()),
        workspace_color: "blue".to_string(),
        timezone: "UTC".to_string(),
        language: "en".to_string(),
        allow_public_signups: false,
        require_email_verification: true,
        session_timeout_minutes: 1440,
    };

    Ok(Json(config))
}

pub async fn update_configuration(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
    Json(_config): Json<AdminConfiguration>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = &state.pool;
    
    // Check if user is admin
    if !is_admin(&ctx, workspace_id, pool).await? {
        return Err(ErrorResponse::forbidden("Admin access required"));
    }

    // TODO: Save configuration to database
    Ok(StatusCode::OK)
}

// =============================================================================
// Helper Functions
// =============================================================================

async fn is_admin(
    ctx: &RequestContext,
    workspace_id: Uuid,
    pool: &PgPool,
) -> Result<bool, ErrorResponse> {
    let user_id = ctx.user.id;

    let role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2"
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        error!("Failed to check admin role: {}", e);
        ErrorResponse::internal_error("Failed to check permissions")
    })?;

    Ok(role.map(|r| r == "admin" || r == "owner").unwrap_or(false))
}
