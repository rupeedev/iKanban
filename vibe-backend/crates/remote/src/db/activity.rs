//! Activity logging database operations
//!
//! IKA-286: Activity tracking for admin dashboard

use sqlx::PgPool;
use uuid::Uuid;

/// Log an activity to the activity_logs table
#[allow(clippy::too_many_arguments)]
pub async fn log_activity(
    pool: &PgPool,
    user_id: Uuid,
    user_email: Option<&str>,
    action: &str,
    resource_type: &str,
    resource_id: Option<Uuid>,
    resource_name: Option<&str>,
    workspace_id: Option<Uuid>,
    team_id: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO activity_logs (user_id, user_email, action, resource_type, resource_id, resource_name, workspace_id, team_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(user_id)
    .bind(user_email)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(resource_name)
    .bind(workspace_id)
    .bind(team_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Action constants for activity logging
pub mod actions {
    pub const CREATE: &str = "create";
    pub const UPDATE: &str = "update";
    pub const DELETE: &str = "delete";
    pub const LOGIN: &str = "login";
    pub const LOGOUT: &str = "logout";
    pub const INVITE: &str = "invite";
    pub const JOIN: &str = "join";
    pub const LEAVE: &str = "leave";
    pub const ASSIGN: &str = "assign";
    pub const UNASSIGN: &str = "unassign";
}

/// Resource type constants for activity logging
pub mod resources {
    pub const TASK: &str = "task";
    pub const PROJECT: &str = "project";
    pub const TEAM: &str = "team";
    pub const MEMBER: &str = "member";
    pub const DOCUMENT: &str = "document";
    pub const COMMENT: &str = "comment";
    pub const INVITATION: &str = "invitation";
    pub const WORKSPACE: &str = "workspace";
}
