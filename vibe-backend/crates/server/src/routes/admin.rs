use axum::{
    Router,
    extract::{Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, post, put},
};
use chrono::{DateTime, Utc};
use db::models::{
    team_member::{CreateTeamInvitation, TeamInvitation, TeamMemberRole},
    tenant_workspace::{TenantWorkspace, TenantWorkspaceMember, WorkspaceMemberRole},
    user_registration::UserRegistration,
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::auth::ClerkUser};

// ============================================================================
// SQLx Row Types (for runtime type checking)
// ============================================================================

#[derive(FromRow)]
struct MemberActivityRow {
    id: String,
    user_email: String,
    to_role: String,
    timestamp: DateTime<Utc>,
}

#[derive(FromRow)]
struct InvitationActivityRow {
    id: String,
    target_email: String,
    to_role: String,
    timestamp: DateTime<Utc>,
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct AdminStats {
    pub total_users: i64,
    pub active_users: i64,
    pub pending_registrations: i64,
    pub total_workspaces: i64,
    pub total_teams: i64,
    pub pending_invitations: i64,
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
    pub joined_at: String,
    pub workspaces: i64,
    pub teams: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserStatusRequest {
    pub status: String, // "active", "suspended"
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRoleRequest {
    pub role: String, // "owner", "admin", "member"
}

#[derive(Debug, Serialize)]
pub struct AdminInvitation {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    pub status: String,
    pub invited_by: Option<String>,
    pub team_name: String,
    pub workspace_name: String,
    pub sent_at: String,
    pub expires_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvitationRequest {
    pub email: String,
    pub role: String,
    pub workspace_id: Uuid,
    pub team_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminPermission {
    pub id: String,
    pub label: String,
    pub description: String,
    pub owner: bool,
    pub admin: bool,
    pub member: bool,
    pub viewer: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePermissionRequest {
    pub role: String, // "admin", "member", "viewer"
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminFeatureToggle {
    pub id: String,
    pub label: String,
    pub description: String,
    pub enabled: bool,
    pub category: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFeatureToggleRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdminConfiguration {
    // General
    pub app_name: String,
    pub default_language: String,
    pub timezone: String,
    pub support_email: String,
    // Workspace
    pub default_workspace_color: String,
    pub default_member_role: String,
    pub max_members_per_workspace: i32,
    pub auto_create_project: bool,
    // Integration
    pub github_enabled: bool,
    pub github_org: String,
    pub notifications_enabled: bool,
    pub email_notifications: bool,
    // Security
    pub session_timeout_minutes: i32,
    pub min_password_length: i32,
    pub require_mfa: bool,
    pub allowed_domains: String,
    pub max_login_attempts: i32,
    pub lockout_duration_minutes: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConfigurationRequest {
    pub config: AdminConfiguration,
}

// ============================================================================
// Helpers
// ============================================================================

async fn verify_admin_access(
    pool: &sqlx::PgPool,
    workspace_id: Uuid,
    user_id: &str,
) -> Result<(), ApiError> {
    let role = TenantWorkspaceMember::get_role(pool, workspace_id, user_id).await?;
    match role {
        Some(WorkspaceMemberRole::Owner) | Some(WorkspaceMemberRole::Admin) => Ok(()),
        _ => Err(ApiError::Forbidden("Admin access required".to_string())),
    }
}

async fn verify_owner_access(
    pool: &sqlx::PgPool,
    workspace_id: Uuid,
    user_id: &str,
) -> Result<(), ApiError> {
    let role = TenantWorkspaceMember::get_role(pool, workspace_id, user_id).await?;
    if role != Some(WorkspaceMemberRole::Owner) {
        return Err(ApiError::Forbidden("Owner access required".to_string()));
    }
    Ok(())
}

// ============================================================================
// Dashboard Stats Routes
// ============================================================================

/// Get admin dashboard statistics
pub async fn get_admin_stats(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<AdminStats>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Get total members in workspace
    let members =
        TenantWorkspaceMember::find_by_workspace(&deployment.db().pool, workspace_id).await?;
    let total_users = members.len() as i64;
    let active_users = total_users; // All members are considered active for now

    // Get pending registrations
    let pending_registrations = UserRegistration::list_pending(&deployment.db().pool)
        .await
        .map(|r| r.len() as i64)
        .unwrap_or(0);

    // Get workspace count
    let total_workspaces = 1i64; // Current workspace only for now

    // Get teams in workspace (runtime type checking for SQLx cache compatibility)
    let teams_count: i64 = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM teams WHERE tenant_workspace_id = $1"#,
    )
    .bind(workspace_id)
    .fetch_one(&deployment.db().pool)
    .await
    .unwrap_or(0);

    // Get pending invitations (runtime type checking for SQLx cache compatibility)
    let pending_invitations: i64 = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM team_invitations ti
           JOIN teams t ON ti.team_id = t.id
           WHERE t.tenant_workspace_id = $1 AND ti.status = 'pending'"#,
    )
    .bind(workspace_id)
    .fetch_one(&deployment.db().pool)
    .await
    .unwrap_or(0);

    let stats = AdminStats {
        total_users,
        active_users,
        pending_registrations,
        total_workspaces,
        total_teams: teams_count,
        pending_invitations,
    };

    Ok(ResponseJson(ApiResponse::success(stats)))
}

/// Get recent activity for admin dashboard
pub async fn get_admin_activity(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<AdminActivity>>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Get recent team member additions (runtime type checking for SQLx cache compatibility)
    let recent_members: Vec<AdminActivity> = sqlx::query_as::<_, MemberActivityRow>(
        r#"SELECT
            tm.id::text as id,
            tm.email as user_email,
            tm.role as to_role,
            tm.joined_at as timestamp
           FROM team_members tm
           JOIN teams t ON tm.team_id = t.id
           WHERE t.tenant_workspace_id = $1
           ORDER BY tm.joined_at DESC
           LIMIT 10"#,
    )
    .bind(workspace_id)
    .fetch_all(&deployment.db().pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| AdminActivity {
        id: r.id,
        activity_type: "user_joined".to_string(),
        user_email: Some(r.user_email),
        target_email: None,
        from_role: None,
        to_role: Some(r.to_role),
        timestamp: r.timestamp.to_rfc3339(),
    })
    .collect();

    // Get recent invitations sent (runtime type checking for SQLx cache compatibility)
    let recent_invitations: Vec<AdminActivity> = sqlx::query_as::<_, InvitationActivityRow>(
        r#"SELECT
            ti.id::text as id,
            ti.email as target_email,
            ti.role as to_role,
            ti.created_at as timestamp
           FROM team_invitations ti
           JOIN teams t ON ti.team_id = t.id
           WHERE t.tenant_workspace_id = $1
           ORDER BY ti.created_at DESC
           LIMIT 5"#,
    )
    .bind(workspace_id)
    .fetch_all(&deployment.db().pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| AdminActivity {
        id: r.id,
        activity_type: "invitation_sent".to_string(),
        user_email: None,
        target_email: Some(r.target_email),
        from_role: None,
        to_role: Some(r.to_role),
        timestamp: r.timestamp.to_rfc3339(),
    })
    .collect();

    // Merge and sort by timestamp
    let mut all_activity: Vec<AdminActivity> = recent_members
        .into_iter()
        .chain(recent_invitations)
        .collect();
    all_activity.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    all_activity.truncate(10);

    Ok(ResponseJson(ApiResponse::success(all_activity)))
}

// ============================================================================
// Users Routes
// ============================================================================

/// List all users in the workspace
pub async fn list_users(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<AdminUser>>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    let members =
        TenantWorkspaceMember::find_by_workspace(&deployment.db().pool, workspace_id).await?;

    let mut users: Vec<AdminUser> = Vec::new();
    for member in members {
        // Count teams for this user (runtime type checking)
        let teams_count: i64 = sqlx::query_scalar::<_, i64>(
            r#"SELECT COUNT(*) FROM team_members tm
               JOIN teams t ON tm.team_id = t.id
               WHERE t.tenant_workspace_id = $1 AND tm.clerk_user_id = $2"#,
        )
        .bind(workspace_id)
        .bind(&member.user_id)
        .fetch_one(&deployment.db().pool)
        .await
        .unwrap_or(0);

        users.push(AdminUser {
            id: member.user_id.clone(),
            email: member.email.clone(),
            display_name: member.display_name.clone(),
            avatar_url: member.avatar_url.clone(),
            role: member.role.to_string(),
            status: "active".to_string(), // All members are active
            joined_at: member.joined_at.to_rfc3339(),
            workspaces: 1, // Current workspace
            teams: teams_count,
        });
    }

    Ok(ResponseJson(ApiResponse::success(users)))
}

/// Update user status (suspend/activate)
pub async fn update_user_status(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, target_user_id)): Path<(Uuid, String)>,
    axum::extract::Json(_payload): axum::extract::Json<UpdateUserStatusRequest>,
) -> Result<ResponseJson<ApiResponse<AdminUser>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // For now, we just return the user without actually suspending
    // Full Clerk integration would be needed for actual suspension
    let member =
        TenantWorkspaceMember::find_by_user(&deployment.db().pool, workspace_id, &target_user_id)
            .await?
            .ok_or_else(|| ApiError::NotFound("User not found in workspace".to_string()))?;

    let admin_user = AdminUser {
        id: member.user_id.clone(),
        email: member.email.clone(),
        display_name: member.display_name.clone(),
        avatar_url: member.avatar_url.clone(),
        role: member.role.to_string(),
        status: "active".to_string(),
        joined_at: member.joined_at.to_rfc3339(),
        workspaces: 1,
        teams: 0,
    };

    Ok(ResponseJson(ApiResponse::success(admin_user)))
}

/// Update user role
pub async fn update_user_role(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, target_user_id)): Path<(Uuid, String)>,
    axum::extract::Json(payload): axum::extract::Json<UpdateUserRoleRequest>,
) -> Result<ResponseJson<ApiResponse<AdminUser>>, ApiError> {
    verify_owner_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    let new_role = match payload.role.as_str() {
        "owner" => WorkspaceMemberRole::Owner,
        "admin" => WorkspaceMemberRole::Admin,
        _ => WorkspaceMemberRole::Member,
    };

    let member = TenantWorkspaceMember::update_role(
        &deployment.db().pool,
        workspace_id,
        &target_user_id,
        new_role,
    )
    .await?;

    let admin_user = AdminUser {
        id: member.user_id.clone(),
        email: member.email.clone(),
        display_name: member.display_name.clone(),
        avatar_url: member.avatar_url.clone(),
        role: member.role.to_string(),
        status: "active".to_string(),
        joined_at: member.joined_at.to_rfc3339(),
        workspaces: 1,
        teams: 0,
    };

    Ok(ResponseJson(ApiResponse::success(admin_user)))
}

/// Remove a user from workspace
pub async fn remove_user(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, target_user_id)): Path<(Uuid, String)>,
) -> Result<StatusCode, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Cannot remove yourself
    if user.user_id == target_user_id {
        return Err(ApiError::BadRequest("Cannot remove yourself".to_string()));
    }

    TenantWorkspaceMember::remove(&deployment.db().pool, workspace_id, &target_user_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Invitations Routes
// ============================================================================

/// List all invitations in the workspace
pub async fn list_invitations(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<AdminInvitation>>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Runtime type checking for SQLx cache compatibility
    let invitations: Vec<AdminInvitation> = sqlx::query_as::<_, ListInvitationRow>(
        r#"SELECT
            ti.id,
            ti.email,
            ti.role,
            ti.status,
            tm.email as invited_by_email,
            t.name as team_name,
            tw.name as workspace_name,
            ti.created_at as sent_at,
            ti.expires_at
           FROM team_invitations ti
           JOIN teams t ON ti.team_id = t.id
           JOIN tenant_workspaces tw ON t.tenant_workspace_id = tw.id
           LEFT JOIN team_members tm ON ti.invited_by = tm.id
           WHERE t.tenant_workspace_id = $1
           ORDER BY ti.created_at DESC"#,
    )
    .bind(workspace_id)
    .fetch_all(&deployment.db().pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| AdminInvitation {
        id: r.id,
        email: r.email,
        role: r.role,
        status: r.status,
        invited_by: r.invited_by_email,
        team_name: r.team_name,
        workspace_name: r.workspace_name,
        sent_at: r.sent_at.to_rfc3339(),
        expires_at: r.expires_at.to_rfc3339(),
    })
    .collect();

    Ok(ResponseJson(ApiResponse::success(invitations)))
}

#[derive(Debug, FromRow)]
struct ListInvitationRow {
    id: Uuid,
    email: String,
    role: String,
    status: String,
    invited_by_email: Option<String>,
    team_name: String,
    workspace_name: String,
    sent_at: chrono::DateTime<chrono::Utc>,
    expires_at: chrono::DateTime<chrono::Utc>,
}

/// Create a new invitation
pub async fn create_invitation(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Json(payload): axum::extract::Json<CreateInvitationRequest>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<AdminInvitation>>), ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Get the first team in the workspace if no team_id is specified (runtime type checking)
    let team_id = match payload.team_id {
        Some(id) => id,
        None => sqlx::query_scalar::<_, Uuid>(
            r#"SELECT id FROM teams WHERE tenant_workspace_id = $1 LIMIT 1"#,
        )
        .bind(workspace_id)
        .fetch_optional(&deployment.db().pool)
        .await?
        .ok_or_else(|| ApiError::BadRequest("No teams in workspace".to_string()))?,
    };

    // Get inviter's team member ID (runtime type checking)
    let inviter: Option<Uuid> = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id FROM team_members WHERE team_id = $1 AND clerk_user_id = $2"#,
    )
    .bind(team_id)
    .bind(&user.user_id)
    .fetch_optional(&deployment.db().pool)
    .await?;

    let role = match payload.role.as_str() {
        "owner" => TeamMemberRole::Owner,
        "maintainer" => TeamMemberRole::Maintainer,
        "contributor" => TeamMemberRole::Contributor,
        _ => TeamMemberRole::Viewer,
    };

    let create_invitation = CreateTeamInvitation {
        email: payload.email.clone(),
        role: Some(role),
    };

    let invitation =
        TeamInvitation::create(&deployment.db().pool, team_id, &create_invitation, inviter)
            .await
            .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    // Get additional info for response (runtime type checking)
    let team_name: String =
        sqlx::query_scalar::<_, String>(r#"SELECT name FROM teams WHERE id = $1"#)
            .bind(team_id)
            .fetch_one(&deployment.db().pool)
            .await
            .unwrap_or_default();

    let workspace_name: String =
        sqlx::query_scalar::<_, String>(r#"SELECT name FROM tenant_workspaces WHERE id = $1"#)
            .bind(workspace_id)
            .fetch_one(&deployment.db().pool)
            .await
            .unwrap_or_default();

    let admin_invitation = AdminInvitation {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role.to_string(),
        status: invitation.status.to_string(),
        invited_by: user.email,
        team_name,
        workspace_name,
        sent_at: invitation.created_at.to_rfc3339(),
        expires_at: invitation.expires_at.to_rfc3339(),
    };

    Ok((
        StatusCode::CREATED,
        ResponseJson(ApiResponse::success(admin_invitation)),
    ))
}

/// Resend an invitation
pub async fn resend_invitation(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<AdminInvitation>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Get the existing invitation (runtime type checking)
    let invitation = sqlx::query_as::<_, ListInvitationRow>(
        r#"SELECT
            ti.id,
            ti.email,
            ti.role,
            ti.status,
            tm.email as invited_by_email,
            t.name as team_name,
            tw.name as workspace_name,
            ti.created_at as sent_at,
            ti.expires_at
           FROM team_invitations ti
           JOIN teams t ON ti.team_id = t.id
           JOIN tenant_workspaces tw ON t.tenant_workspace_id = tw.id
           LEFT JOIN team_members tm ON ti.invited_by = tm.id
           WHERE ti.id = $1 AND t.tenant_workspace_id = $2"#,
    )
    .bind(invitation_id)
    .bind(workspace_id)
    .fetch_optional(&deployment.db().pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invitation not found".to_string()))?;

    // Update expires_at to extend the invitation (runtime type checking)
    let new_expires_at = chrono::Utc::now() + chrono::Duration::days(7);
    sqlx::query("UPDATE team_invitations SET expires_at = $1, status = 'pending' WHERE id = $2")
        .bind(new_expires_at)
        .bind(invitation_id)
        .execute(&deployment.db().pool)
        .await?;

    let admin_invitation = AdminInvitation {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: "pending".to_string(),
        invited_by: invitation.invited_by_email,
        team_name: invitation.team_name,
        workspace_name: invitation.workspace_name,
        sent_at: invitation.sent_at.to_rfc3339(),
        expires_at: new_expires_at.to_rfc3339(),
    };

    Ok(ResponseJson(ApiResponse::success(admin_invitation)))
}

/// Revoke an invitation
pub async fn revoke_invitation(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Verify invitation belongs to workspace (runtime type checking)
    let exists: bool = sqlx::query_scalar::<_, bool>(
        r#"SELECT COUNT(*) > 0 FROM team_invitations ti
           JOIN teams t ON ti.team_id = t.id
           WHERE ti.id = $1 AND t.tenant_workspace_id = $2"#,
    )
    .bind(invitation_id)
    .bind(workspace_id)
    .fetch_one(&deployment.db().pool)
    .await?;

    if !exists {
        return Err(ApiError::NotFound("Invitation not found".to_string()));
    }

    // Runtime type checking
    sqlx::query("DELETE FROM team_invitations WHERE id = $1")
        .bind(invitation_id)
        .execute(&deployment.db().pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Permissions Routes
// ============================================================================

/// Default permissions configuration
fn get_default_permissions() -> Vec<AdminPermission> {
    vec![
        AdminPermission {
            id: "view_dashboard".to_string(),
            label: "View Dashboard".to_string(),
            description: "Access to main dashboard".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: true,
        },
        AdminPermission {
            id: "manage_projects".to_string(),
            label: "Manage Projects".to_string(),
            description: "Create, edit, delete projects".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: false,
        },
        AdminPermission {
            id: "manage_tasks".to_string(),
            label: "Manage Tasks".to_string(),
            description: "Create, edit, assign tasks".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: false,
        },
        AdminPermission {
            id: "view_documents".to_string(),
            label: "View Documents".to_string(),
            description: "Read team documents".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: true,
        },
        AdminPermission {
            id: "edit_documents".to_string(),
            label: "Edit Documents".to_string(),
            description: "Modify team documents".to_string(),
            owner: true,
            admin: true,
            member: true,
            viewer: false,
        },
        AdminPermission {
            id: "manage_members".to_string(),
            label: "Manage Members".to_string(),
            description: "Invite, remove team members".to_string(),
            owner: true,
            admin: true,
            member: false,
            viewer: false,
        },
        AdminPermission {
            id: "change_roles".to_string(),
            label: "Change Roles".to_string(),
            description: "Modify member roles".to_string(),
            owner: true,
            admin: true,
            member: false,
            viewer: false,
        },
        AdminPermission {
            id: "access_settings".to_string(),
            label: "Access Settings".to_string(),
            description: "View and modify settings".to_string(),
            owner: true,
            admin: true,
            member: false,
            viewer: false,
        },
        AdminPermission {
            id: "access_admin".to_string(),
            label: "Access Admin Panel".to_string(),
            description: "View admin dashboard".to_string(),
            owner: true,
            admin: true,
            member: false,
            viewer: false,
        },
        AdminPermission {
            id: "delete_workspace".to_string(),
            label: "Delete Workspace".to_string(),
            description: "Permanently delete workspace".to_string(),
            owner: true,
            admin: false,
            member: false,
            viewer: false,
        },
    ]
}

/// Default feature toggles
fn get_default_feature_toggles() -> Vec<AdminFeatureToggle> {
    vec![
        AdminFeatureToggle {
            id: "public_signups".to_string(),
            label: "Public Sign-ups".to_string(),
            description: "Allow anyone to create an account".to_string(),
            enabled: false,
            category: "Access".to_string(),
        },
        AdminFeatureToggle {
            id: "email_verification".to_string(),
            label: "Email Verification".to_string(),
            description: "Require email verification for new accounts".to_string(),
            enabled: true,
            category: "Access".to_string(),
        },
        AdminFeatureToggle {
            id: "workspace_creation".to_string(),
            label: "Workspace Creation".to_string(),
            description: "Allow members to create workspaces".to_string(),
            enabled: true,
            category: "Features".to_string(),
        },
        AdminFeatureToggle {
            id: "document_sync".to_string(),
            label: "Document Sync".to_string(),
            description: "Enable GitHub document synchronization".to_string(),
            enabled: true,
            category: "Features".to_string(),
        },
        AdminFeatureToggle {
            id: "ai_features".to_string(),
            label: "AI Features".to_string(),
            description: "Enable AI-powered features".to_string(),
            enabled: true,
            category: "Features".to_string(),
        },
        AdminFeatureToggle {
            id: "api_access".to_string(),
            label: "API Access".to_string(),
            description: "Allow API key generation".to_string(),
            enabled: true,
            category: "Integration".to_string(),
        },
        AdminFeatureToggle {
            id: "webhooks".to_string(),
            label: "Webhooks".to_string(),
            description: "Enable webhook integrations".to_string(),
            enabled: false,
            category: "Integration".to_string(),
        },
        AdminFeatureToggle {
            id: "mfa_required".to_string(),
            label: "Require MFA".to_string(),
            description: "Require multi-factor authentication".to_string(),
            enabled: false,
            category: "Security".to_string(),
        },
        AdminFeatureToggle {
            id: "session_timeout".to_string(),
            label: "Session Timeout".to_string(),
            description: "Auto-logout after inactivity".to_string(),
            enabled: true,
            category: "Security".to_string(),
        },
    ]
}

/// Get permissions for a workspace
pub async fn get_permissions(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<AdminPermission>>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Get workspace settings which may contain custom permissions
    let workspace = TenantWorkspace::find_by_id(&deployment.db().pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_string()))?;

    // Try to get permissions from settings, fall back to defaults
    let permissions = match workspace.settings.get("permissions") {
        Some(value) => {
            serde_json::from_value(value.clone()).unwrap_or_else(|_| get_default_permissions())
        }
        None => get_default_permissions(),
    };

    Ok(ResponseJson(ApiResponse::success(permissions)))
}

/// Update a permission
pub async fn update_permission(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, permission_id)): Path<(Uuid, String)>,
    axum::extract::Json(payload): axum::extract::Json<UpdatePermissionRequest>,
) -> Result<ResponseJson<ApiResponse<AdminPermission>>, ApiError> {
    verify_owner_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    // Get workspace
    let workspace = TenantWorkspace::find_by_id(&deployment.db().pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_string()))?;

    // Get current permissions
    let mut permissions: Vec<AdminPermission> = match workspace.settings.get("permissions") {
        Some(value) => {
            serde_json::from_value(value.clone()).unwrap_or_else(|_| get_default_permissions())
        }
        None => get_default_permissions(),
    };

    // Find and update the specific permission
    let permission = permissions
        .iter_mut()
        .find(|p| p.id == permission_id)
        .ok_or_else(|| ApiError::NotFound("Permission not found".to_string()))?;

    match payload.role.as_str() {
        "admin" => permission.admin = payload.enabled,
        "member" => permission.member = payload.enabled,
        "viewer" => permission.viewer = payload.enabled,
        _ => return Err(ApiError::BadRequest("Invalid role".to_string())),
    }

    let updated_permission = permission.clone();

    // Save updated permissions to workspace settings
    let mut settings = workspace.settings.clone();
    settings["permissions"] = serde_json::to_value(&permissions)
        .map_err(|e| ApiError::BadRequest(format!("Failed to serialize permissions: {}", e)))?;

    // Runtime type checking
    sqlx::query("UPDATE tenant_workspaces SET settings = $1, updated_at = NOW() WHERE id = $2")
        .bind(&settings)
        .bind(workspace_id)
        .execute(&deployment.db().pool)
        .await?;

    Ok(ResponseJson(ApiResponse::success(updated_permission)))
}

/// Get feature toggles for a workspace
pub async fn get_feature_toggles(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<AdminFeatureToggle>>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    let workspace = TenantWorkspace::find_by_id(&deployment.db().pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_string()))?;

    let features = match workspace.settings.get("features") {
        Some(value) => {
            serde_json::from_value(value.clone()).unwrap_or_else(|_| get_default_feature_toggles())
        }
        None => get_default_feature_toggles(),
    };

    Ok(ResponseJson(ApiResponse::success(features)))
}

/// Update a feature toggle
pub async fn update_feature_toggle(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, feature_id)): Path<(Uuid, String)>,
    axum::extract::Json(payload): axum::extract::Json<UpdateFeatureToggleRequest>,
) -> Result<ResponseJson<ApiResponse<AdminFeatureToggle>>, ApiError> {
    verify_owner_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    let workspace = TenantWorkspace::find_by_id(&deployment.db().pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_string()))?;

    let mut features: Vec<AdminFeatureToggle> = match workspace.settings.get("features") {
        Some(value) => {
            serde_json::from_value(value.clone()).unwrap_or_else(|_| get_default_feature_toggles())
        }
        None => get_default_feature_toggles(),
    };

    let feature = features
        .iter_mut()
        .find(|f| f.id == feature_id)
        .ok_or_else(|| ApiError::NotFound("Feature not found".to_string()))?;

    feature.enabled = payload.enabled;
    let updated_feature = feature.clone();

    // Save updated features to workspace settings
    let mut settings = workspace.settings.clone();
    settings["features"] = serde_json::to_value(&features)
        .map_err(|e| ApiError::BadRequest(format!("Failed to serialize features: {}", e)))?;

    // Runtime type checking
    sqlx::query("UPDATE tenant_workspaces SET settings = $1, updated_at = NOW() WHERE id = $2")
        .bind(&settings)
        .bind(workspace_id)
        .execute(&deployment.db().pool)
        .await?;

    Ok(ResponseJson(ApiResponse::success(updated_feature)))
}

// ============================================================================
// Configuration Routes
// ============================================================================

/// Default configuration
fn get_default_configuration() -> AdminConfiguration {
    AdminConfiguration {
        app_name: "iKanban".to_string(),
        default_language: "en".to_string(),
        timezone: "UTC".to_string(),
        support_email: "support@ikanban.com".to_string(),
        default_workspace_color: "blue".to_string(),
        default_member_role: "member".to_string(),
        max_members_per_workspace: 50,
        auto_create_project: true,
        github_enabled: true,
        github_org: String::new(),
        notifications_enabled: true,
        email_notifications: true,
        session_timeout_minutes: 60,
        min_password_length: 8,
        require_mfa: false,
        allowed_domains: String::new(),
        max_login_attempts: 5,
        lockout_duration_minutes: 15,
    }
}

/// Get workspace configuration
pub async fn get_configuration(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<AdminConfiguration>>, ApiError> {
    verify_admin_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    let workspace = TenantWorkspace::find_by_id(&deployment.db().pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_string()))?;

    let config = match workspace.settings.get("configuration") {
        Some(value) => {
            serde_json::from_value(value.clone()).unwrap_or_else(|_| get_default_configuration())
        }
        None => get_default_configuration(),
    };

    Ok(ResponseJson(ApiResponse::success(config)))
}

/// Update workspace configuration
pub async fn update_configuration(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Json(payload): axum::extract::Json<UpdateConfigurationRequest>,
) -> Result<ResponseJson<ApiResponse<AdminConfiguration>>, ApiError> {
    verify_owner_access(&deployment.db().pool, workspace_id, &user.user_id).await?;

    let workspace = TenantWorkspace::find_by_id(&deployment.db().pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_string()))?;

    // Save updated configuration to workspace settings
    let mut settings = workspace.settings.clone();
    settings["configuration"] = serde_json::to_value(&payload.config)
        .map_err(|e| ApiError::BadRequest(format!("Failed to serialize configuration: {}", e)))?;

    // Runtime type checking
    sqlx::query("UPDATE tenant_workspaces SET settings = $1, updated_at = NOW() WHERE id = $2")
        .bind(&settings)
        .bind(workspace_id)
        .execute(&deployment.db().pool)
        .await?;

    Ok(ResponseJson(ApiResponse::success(payload.config)))
}

// ============================================================================
// Router
// ============================================================================

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        // Dashboard routes
        .route("/admin/{workspace_id}/stats", get(get_admin_stats))
        .route("/admin/{workspace_id}/activity", get(get_admin_activity))
        // Users routes
        .route("/admin/{workspace_id}/users", get(list_users))
        .route(
            "/admin/{workspace_id}/users/{target_user_id}/status",
            put(update_user_status),
        )
        .route(
            "/admin/{workspace_id}/users/{target_user_id}/role",
            put(update_user_role),
        )
        .route(
            "/admin/{workspace_id}/users/{target_user_id}",
            delete(remove_user),
        )
        // Invitations routes
        .route(
            "/admin/{workspace_id}/invitations",
            get(list_invitations).post(create_invitation),
        )
        .route(
            "/admin/{workspace_id}/invitations/{invitation_id}/resend",
            post(resend_invitation),
        )
        .route(
            "/admin/{workspace_id}/invitations/{invitation_id}",
            delete(revoke_invitation),
        )
        // Permissions routes
        .route("/admin/{workspace_id}/permissions", get(get_permissions))
        .route(
            "/admin/{workspace_id}/permissions/{permission_id}",
            put(update_permission),
        )
        .route("/admin/{workspace_id}/features", get(get_feature_toggles))
        .route(
            "/admin/{workspace_id}/features/{feature_id}",
            put(update_feature_toggle),
        )
        // Configuration routes
        .route(
            "/admin/{workspace_id}/configuration",
            get(get_configuration).put(update_configuration),
        )
        .with_state(deployment.clone())
}
