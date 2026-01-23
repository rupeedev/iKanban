//! AI Sessions Repository (IKA-254)
//! User sessions for interactive AI coding assistance

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Session type enum
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SessionType {
    #[default]
    Coding,
    Review,
    Chat,
    Debugging,
}

/// Session status enum
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SessionStatus {
    #[default]
    Active,
    Paused,
    Completed,
    Archived,
}

/// AI session record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct AiSession {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: Option<String>,
    pub session_type: String,
    pub status: String,
    pub working_directory: Option<String>,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
    pub config: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_activity_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Data for creating a new AI session
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAiSession {
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: Option<String>,
    pub session_type: Option<String>,
    pub working_directory: Option<String>,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
    pub config: Option<serde_json::Value>,
}

/// Data for updating an AI session
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAiSession {
    pub name: Option<String>,
    pub status: Option<String>,
    pub working_directory: Option<String>,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Error)]
pub enum AiSessionError {
    #[error("AI session not found")]
    NotFound,
    #[error("operation forbidden")]
    Forbidden,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct AiSessionRepository;

impl AiSessionRepository {
    /// Find session by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<AiSession>, AiSessionError> {
        let session = sqlx::query_as!(
            AiSession,
            r#"
            SELECT
                id, organization_id, user_id, project_id,
                name, session_type, status,
                working_directory, git_branch, git_commit,
                config,
                created_at, updated_at, last_activity_at, ended_at, deleted_at
            FROM ai_sessions
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(session)
    }

    /// List sessions by user
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: Uuid,
        include_archived: bool,
    ) -> Result<Vec<AiSession>, AiSessionError> {
        let sessions = if include_archived {
            sqlx::query_as!(
                AiSession,
                r#"
                SELECT
                    id, organization_id, user_id, project_id,
                    name, session_type, status,
                    working_directory, git_branch, git_commit,
                    config,
                    created_at, updated_at, last_activity_at, ended_at, deleted_at
                FROM ai_sessions
                WHERE user_id = $1 AND deleted_at IS NULL
                ORDER BY last_activity_at DESC NULLS LAST, created_at DESC
                "#,
                user_id
            )
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as!(
                AiSession,
                r#"
                SELECT
                    id, organization_id, user_id, project_id,
                    name, session_type, status,
                    working_directory, git_branch, git_commit,
                    config,
                    created_at, updated_at, last_activity_at, ended_at, deleted_at
                FROM ai_sessions
                WHERE user_id = $1 AND deleted_at IS NULL AND status != 'archived'
                ORDER BY last_activity_at DESC NULLS LAST, created_at DESC
                "#,
                user_id
            )
            .fetch_all(pool)
            .await?
        };

        Ok(sessions)
    }

    /// List active sessions by user
    pub async fn list_active_by_user(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<AiSession>, AiSessionError> {
        let sessions = sqlx::query_as!(
            AiSession,
            r#"
            SELECT
                id, organization_id, user_id, project_id,
                name, session_type, status,
                working_directory, git_branch, git_commit,
                config,
                created_at, updated_at, last_activity_at, ended_at, deleted_at
            FROM ai_sessions
            WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL
            ORDER BY last_activity_at DESC NULLS LAST
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(sessions)
    }

    /// List sessions by project
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<AiSession>, AiSessionError> {
        let sessions = sqlx::query_as!(
            AiSession,
            r#"
            SELECT
                id, organization_id, user_id, project_id,
                name, session_type, status,
                working_directory, git_branch, git_commit,
                config,
                created_at, updated_at, last_activity_at, ended_at, deleted_at
            FROM ai_sessions
            WHERE project_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(sessions)
    }

    /// Create a new AI session
    pub async fn create(pool: &PgPool, data: CreateAiSession) -> Result<AiSession, AiSessionError> {
        let session = sqlx::query_as!(
            AiSession,
            r#"
            INSERT INTO ai_sessions (
                organization_id, user_id, project_id, name, session_type,
                working_directory, git_branch, git_commit, config
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                id, organization_id, user_id, project_id,
                name, session_type, status,
                working_directory, git_branch, git_commit,
                config,
                created_at, updated_at, last_activity_at, ended_at, deleted_at
            "#,
            data.organization_id,
            data.user_id,
            data.project_id,
            data.name,
            data.session_type.unwrap_or_else(|| "coding".to_string()),
            data.working_directory,
            data.git_branch,
            data.git_commit,
            data.config
        )
        .fetch_one(pool)
        .await?;

        Ok(session)
    }

    /// Update session
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: UpdateAiSession,
    ) -> Result<AiSession, AiSessionError> {
        let session = sqlx::query_as!(
            AiSession,
            r#"
            UPDATE ai_sessions
            SET
                name = COALESCE($2, name),
                status = COALESCE($3, status),
                working_directory = COALESCE($4, working_directory),
                git_branch = COALESCE($5, git_branch),
                git_commit = COALESCE($6, git_commit),
                config = COALESCE($7, config),
                updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, organization_id, user_id, project_id,
                name, session_type, status,
                working_directory, git_branch, git_commit,
                config,
                created_at, updated_at, last_activity_at, ended_at, deleted_at
            "#,
            id,
            data.name,
            data.status,
            data.working_directory,
            data.git_branch,
            data.git_commit,
            data.config
        )
        .fetch_optional(pool)
        .await?
        .ok_or(AiSessionError::NotFound)?;

        Ok(session)
    }

    /// Update last activity timestamp
    pub async fn touch_activity(pool: &PgPool, id: Uuid) -> Result<(), AiSessionError> {
        let result = sqlx::query!(
            r#"
            UPDATE ai_sessions
            SET last_activity_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .execute(pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(AiSessionError::NotFound);
        }

        Ok(())
    }

    /// End session
    pub async fn end_session(pool: &PgPool, id: Uuid) -> Result<AiSession, AiSessionError> {
        let session = sqlx::query_as!(
            AiSession,
            r#"
            UPDATE ai_sessions
            SET status = 'completed', ended_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, organization_id, user_id, project_id,
                name, session_type, status,
                working_directory, git_branch, git_commit,
                config,
                created_at, updated_at, last_activity_at, ended_at, deleted_at
            "#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(AiSessionError::NotFound)?;

        Ok(session)
    }

    /// Archive session
    pub async fn archive(pool: &PgPool, id: Uuid) -> Result<AiSession, AiSessionError> {
        let session = sqlx::query_as!(
            AiSession,
            r#"
            UPDATE ai_sessions
            SET status = 'archived', updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, organization_id, user_id, project_id,
                name, session_type, status,
                working_directory, git_branch, git_commit,
                config,
                created_at, updated_at, last_activity_at, ended_at, deleted_at
            "#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(AiSessionError::NotFound)?;

        Ok(session)
    }

    /// Soft delete session
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, AiSessionError> {
        let result = sqlx::query!(
            r#"
            UPDATE ai_sessions
            SET deleted_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}
