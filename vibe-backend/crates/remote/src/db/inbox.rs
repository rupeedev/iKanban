//! Inbox notification database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// Types of notifications that can be sent to the inbox
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum InboxNotificationType {
    TaskAssigned,
    TaskMentioned,
    TaskComment,
    TaskStatusChanged,
    TaskCompleted,
    WorkspaceCreated,
    #[default]
    SystemNotification,
}

impl InboxNotificationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TaskAssigned => "task_assigned",
            Self::TaskMentioned => "task_mentioned",
            Self::TaskComment => "task_comment",
            Self::TaskStatusChanged => "task_status_changed",
            Self::TaskCompleted => "task_completed",
            Self::WorkspaceCreated => "workspace_created",
            Self::SystemNotification => "system_notification",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "task_assigned" => Self::TaskAssigned,
            "task_mentioned" => Self::TaskMentioned,
            "task_comment" => Self::TaskComment,
            "task_status_changed" => Self::TaskStatusChanged,
            "task_completed" => Self::TaskCompleted,
            "workspace_created" => Self::WorkspaceCreated,
            _ => Self::SystemNotification,
        }
    }
}

/// An inbox item/notification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxItem {
    pub id: Uuid,
    pub user_id: Uuid,
    pub notification_type: InboxNotificationType,
    pub title: String,
    pub message: Option<String>,
    pub task_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data required to create a new inbox item
#[derive(Debug, Clone, Deserialize)]
pub struct CreateInboxItem {
    pub notification_type: InboxNotificationType,
    pub title: String,
    pub message: Option<String>,
    pub task_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
}

/// Summary of inbox items (for badges, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxSummary {
    pub total_count: i64,
    pub unread_count: i64,
}

#[derive(Debug, Error)]
pub enum InboxError {
    #[error("inbox item not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct InboxRepository;

impl InboxRepository {
    /// Find all inbox items for a user, ordered by most recent first
    pub async fn find_all(
        pool: &PgPool,
        user_id: Uuid,
        limit: Option<i64>,
    ) -> Result<Vec<InboxItem>, InboxError> {
        let limit = limit.unwrap_or(100);
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                notification_type::TEXT AS "notification_type!",
                title AS "title!",
                message,
                task_id AS "task_id: Uuid",
                project_id AS "project_id: Uuid",
                workspace_id AS "workspace_id: Uuid",
                is_read AS "is_read!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM inbox_items
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
            user_id,
            limit
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| InboxItem {
                id: r.id,
                user_id: r.user_id,
                notification_type: InboxNotificationType::parse(&r.notification_type),
                title: r.title,
                message: r.message,
                task_id: r.task_id,
                project_id: r.project_id,
                workspace_id: r.workspace_id,
                is_read: r.is_read,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Find all unread inbox items for a user
    pub async fn find_unread(
        pool: &PgPool,
        user_id: Uuid,
        limit: Option<i64>,
    ) -> Result<Vec<InboxItem>, InboxError> {
        let limit = limit.unwrap_or(100);
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                notification_type::TEXT AS "notification_type!",
                title AS "title!",
                message,
                task_id AS "task_id: Uuid",
                project_id AS "project_id: Uuid",
                workspace_id AS "workspace_id: Uuid",
                is_read AS "is_read!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM inbox_items
            WHERE user_id = $1 AND is_read = FALSE
            ORDER BY created_at DESC
            LIMIT $2
            "#,
            user_id,
            limit
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| InboxItem {
                id: r.id,
                user_id: r.user_id,
                notification_type: InboxNotificationType::parse(&r.notification_type),
                title: r.title,
                message: r.message,
                task_id: r.task_id,
                project_id: r.project_id,
                workspace_id: r.workspace_id,
                is_read: r.is_read,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Find an inbox item by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<InboxItem>, InboxError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                notification_type::TEXT AS "notification_type!",
                title AS "title!",
                message,
                task_id AS "task_id: Uuid",
                project_id AS "project_id: Uuid",
                workspace_id AS "workspace_id: Uuid",
                is_read AS "is_read!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM inbox_items
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| InboxItem {
            id: r.id,
            user_id: r.user_id,
            notification_type: InboxNotificationType::parse(&r.notification_type),
            title: r.title,
            message: r.message,
            task_id: r.task_id,
            project_id: r.project_id,
            workspace_id: r.workspace_id,
            is_read: r.is_read,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Create a new inbox item
    pub async fn create(
        pool: &PgPool,
        user_id: Uuid,
        payload: &CreateInboxItem,
    ) -> Result<InboxItem, InboxError> {
        let notification_type_str = payload.notification_type.as_str();
        // Use raw SQL to avoid enum type mapping issues
        let row = sqlx::query!(
            r#"
            INSERT INTO inbox_items (user_id, notification_type, title, message, task_id, project_id, workspace_id, is_read)
            SELECT $1, t.n::inbox_notification_type, $3, $4, $5, $6, $7, FALSE
            FROM (SELECT $2::TEXT AS n) t
            RETURNING
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                notification_type::TEXT AS "notification_type!",
                title AS "title!",
                message,
                task_id AS "task_id: Uuid",
                project_id AS "project_id: Uuid",
                workspace_id AS "workspace_id: Uuid",
                is_read AS "is_read!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            user_id,
            notification_type_str,
            payload.title,
            payload.message,
            payload.task_id,
            payload.project_id,
            payload.workspace_id
        )
        .fetch_one(pool)
        .await?;

        Ok(InboxItem {
            id: row.id,
            user_id: row.user_id,
            notification_type: InboxNotificationType::parse(&row.notification_type),
            title: row.title,
            message: row.message,
            task_id: row.task_id,
            project_id: row.project_id,
            workspace_id: row.workspace_id,
            is_read: row.is_read,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Mark an inbox item as read
    pub async fn mark_as_read(
        pool: &PgPool,
        id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<InboxItem>, InboxError> {
        let row = sqlx::query!(
            r#"
            UPDATE inbox_items
            SET is_read = TRUE, updated_at = NOW()
            WHERE id = $1 AND user_id = $2
            RETURNING
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                notification_type::TEXT AS "notification_type!",
                title AS "title!",
                message,
                task_id AS "task_id: Uuid",
                project_id AS "project_id: Uuid",
                workspace_id AS "workspace_id: Uuid",
                is_read AS "is_read!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| InboxItem {
            id: r.id,
            user_id: r.user_id,
            notification_type: InboxNotificationType::parse(&r.notification_type),
            title: r.title,
            message: r.message,
            task_id: r.task_id,
            project_id: r.project_id,
            workspace_id: r.workspace_id,
            is_read: r.is_read,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Mark all inbox items as read for a user
    pub async fn mark_all_as_read(pool: &PgPool, user_id: Uuid) -> Result<u64, InboxError> {
        let result = sqlx::query!(
            "UPDATE inbox_items SET is_read = TRUE, updated_at = NOW() WHERE user_id = $1 AND is_read = FALSE",
            user_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Delete an inbox item
    pub async fn delete(pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool, InboxError> {
        let result = sqlx::query!(
            "DELETE FROM inbox_items WHERE id = $1 AND user_id = $2",
            id,
            user_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Count unread inbox items for a user
    pub async fn count_unread(pool: &PgPool, user_id: Uuid) -> Result<i64, InboxError> {
        let result = sqlx::query_scalar!(
            r#"SELECT COUNT(*) AS "count!: i64" FROM inbox_items WHERE user_id = $1 AND is_read = FALSE"#,
            user_id
        )
        .fetch_one(pool)
        .await?;
        Ok(result)
    }

    /// Get inbox summary for a user (total and unread counts)
    pub async fn get_summary(pool: &PgPool, user_id: Uuid) -> Result<InboxSummary, InboxError> {
        let result = sqlx::query!(
            r#"
            SELECT
                COUNT(*) AS "total_count!: i64",
                COALESCE(SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END), 0) AS "unread_count!: i64"
            FROM inbox_items
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(InboxSummary {
            total_count: result.total_count,
            unread_count: result.unread_count,
        })
    }

    /// Delete all inbox items related to a task
    pub async fn delete_by_task_id(pool: &PgPool, task_id: Uuid) -> Result<u64, InboxError> {
        let result = sqlx::query!("DELETE FROM inbox_items WHERE task_id = $1", task_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete all inbox items related to a project
    pub async fn delete_by_project_id(pool: &PgPool, project_id: Uuid) -> Result<u64, InboxError> {
        let result = sqlx::query!("DELETE FROM inbox_items WHERE project_id = $1", project_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
