//! Execution Shares Repository (IKA-257)
//! Share task executions with other users or teams

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Share type enum
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ShareType {
    #[default]
    View,
    Comment,
    Collaborate,
    Admin,
}

/// Share status enum
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ShareStatus {
    #[default]
    Active,
    Revoked,
    Expired,
}

/// Shared task record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct ExecutionShare {
    pub id: Uuid,
    pub execution_id: Uuid,
    pub shared_by: Uuid,
    pub shared_with_user_id: Option<Uuid>,
    pub shared_with_team_id: Option<Uuid>,
    pub share_type: String,
    pub message: Option<String>,
    pub status: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}

/// Data for sharing with a user
#[derive(Debug, Clone, Deserialize)]
pub struct ShareWithUser {
    pub execution_id: Uuid,
    pub shared_by: Uuid,
    pub shared_with_user_id: Uuid,
    pub share_type: Option<String>,
    pub message: Option<String>,
    pub expires_in_seconds: Option<i64>,
}

/// Data for sharing with a team
#[derive(Debug, Clone, Deserialize)]
pub struct ShareWithTeam {
    pub execution_id: Uuid,
    pub shared_by: Uuid,
    pub shared_with_team_id: Uuid,
    pub share_type: Option<String>,
    pub message: Option<String>,
    pub expires_in_seconds: Option<i64>,
}

#[derive(Debug, Error)]
pub enum ExecutionShareError {
    #[error("shared task not found")]
    NotFound,
    #[error("already shared with this user/team")]
    AlreadyShared,
    #[error("share has been revoked")]
    Revoked,
    #[error("share has expired")]
    Expired,
    #[error("not authorized to access this share")]
    NotAuthorized,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct ExecutionShareRepository;

impl ExecutionShareRepository {
    /// Find shared task by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<ExecutionShare>, ExecutionShareError> {
        let share = sqlx::query_as!(
            ExecutionShare,
            r#"
            SELECT
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            FROM execution_shares
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(share)
    }

    /// List shares for an execution
    pub async fn list_by_execution(
        pool: &PgPool,
        execution_id: Uuid,
    ) -> Result<Vec<ExecutionShare>, ExecutionShareError> {
        let shares = sqlx::query_as!(
            ExecutionShare,
            r#"
            SELECT
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            FROM execution_shares
            WHERE execution_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            "#,
            execution_id
        )
        .fetch_all(pool)
        .await?;

        Ok(shares)
    }

    /// List executions shared with a user
    pub async fn list_shared_with_user(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<ExecutionShare>, ExecutionShareError> {
        let shares = sqlx::query_as!(
            ExecutionShare,
            r#"
            SELECT
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            FROM execution_shares
            WHERE shared_with_user_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(shares)
    }

    /// List executions shared with a team
    pub async fn list_shared_with_team(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<ExecutionShare>, ExecutionShareError> {
        let shares = sqlx::query_as!(
            ExecutionShare,
            r#"
            SELECT
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            FROM execution_shares
            WHERE shared_with_team_id = $1 AND status = 'active'
            ORDER BY created_at DESC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(shares)
    }

    /// List shares created by a user
    pub async fn list_shared_by_user(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<ExecutionShare>, ExecutionShareError> {
        let shares = sqlx::query_as!(
            ExecutionShare,
            r#"
            SELECT
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            FROM execution_shares
            WHERE shared_by = $1
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(shares)
    }

    /// Share an execution with a user
    pub async fn share_with_user(
        pool: &PgPool,
        data: ShareWithUser,
    ) -> Result<ExecutionShare, ExecutionShareError> {
        let expires_at = data
            .expires_in_seconds
            .map(|secs| Utc::now() + chrono::Duration::seconds(secs));

        let share_type = data.share_type.unwrap_or_else(|| "view".to_string());

        let share = sqlx::query_as!(
            ExecutionShare,
            r#"
            INSERT INTO execution_shares (
                execution_id, shared_by, shared_with_user_id,
                share_type, message, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            "#,
            data.execution_id,
            data.shared_by,
            data.shared_with_user_id,
            share_type,
            data.message,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(share)
    }

    /// Share an execution with a team
    pub async fn share_with_team(
        pool: &PgPool,
        data: ShareWithTeam,
    ) -> Result<ExecutionShare, ExecutionShareError> {
        let expires_at = data
            .expires_in_seconds
            .map(|secs| Utc::now() + chrono::Duration::seconds(secs));

        let share_type = data.share_type.unwrap_or_else(|| "view".to_string());

        let share = sqlx::query_as!(
            ExecutionShare,
            r#"
            INSERT INTO execution_shares (
                execution_id, shared_by, shared_with_team_id,
                share_type, message, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            "#,
            data.execution_id,
            data.shared_by,
            data.shared_with_team_id,
            share_type,
            data.message,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(share)
    }

    /// Revoke a share
    pub async fn revoke(pool: &PgPool, id: Uuid) -> Result<ExecutionShare, ExecutionShareError> {
        let share = sqlx::query_as!(
            ExecutionShare,
            r#"
            UPDATE execution_shares
            SET status = 'revoked', revoked_at = NOW()
            WHERE id = $1 AND status = 'active'
            RETURNING
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            "#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ExecutionShareError::NotFound)?;

        Ok(share)
    }

    /// Update share type
    pub async fn update_share_type(
        pool: &PgPool,
        id: Uuid,
        share_type: &str,
    ) -> Result<ExecutionShare, ExecutionShareError> {
        let share = sqlx::query_as!(
            ExecutionShare,
            r#"
            UPDATE execution_shares
            SET share_type = $2
            WHERE id = $1 AND status = 'active'
            RETURNING
                id, execution_id, shared_by,
                shared_with_user_id, shared_with_team_id,
                share_type, message, status,
                expires_at, created_at, revoked_at
            "#,
            id,
            share_type
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ExecutionShareError::NotFound)?;

        Ok(share)
    }

    /// Check if a user has access to an execution via sharing
    pub async fn user_has_access(
        pool: &PgPool,
        execution_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, ExecutionShareError> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM execution_shares
            WHERE execution_id = $1
              AND shared_with_user_id = $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
            "#,
            execution_id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count > 0)
    }

    /// Check if a team has access to an execution via sharing
    pub async fn team_has_access(
        pool: &PgPool,
        execution_id: Uuid,
        team_id: Uuid,
    ) -> Result<bool, ExecutionShareError> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM execution_shares
            WHERE execution_id = $1
              AND shared_with_team_id = $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
            "#,
            execution_id,
            team_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count > 0)
    }

    /// Expire old shares
    pub async fn expire_old(pool: &PgPool) -> Result<u64, ExecutionShareError> {
        let result = sqlx::query!(
            r#"
            UPDATE execution_shares
            SET status = 'expired'
            WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW()
            "#
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Delete a share permanently
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, ExecutionShareError> {
        let result = sqlx::query!(r#"DELETE FROM execution_shares WHERE id = $1"#, id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}
