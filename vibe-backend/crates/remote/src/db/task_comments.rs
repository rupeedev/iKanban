//! Task comments database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskComment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Option<Uuid>,
    pub author_name: String,
    pub author_email: Option<String>,
    pub content: String,
    pub is_internal: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTaskComment {
    pub content: String,
    #[serde(default)]
    pub is_internal: bool,
    pub author_name: String,
    pub author_email: Option<String>,
    pub author_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTaskComment {
    pub content: Option<String>,
    pub is_internal: Option<bool>,
}

#[derive(Debug, Error)]
pub enum TaskCommentError {
    #[error("comment not found")]
    NotFound,
    #[error("task not found")]
    TaskNotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskCommentRepository;

impl TaskCommentRepository {
    /// Find all comments for a task, ordered by creation time (oldest first)
    pub async fn find_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<TaskComment>, TaskCommentError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                task_id AS "task_id!: Uuid",
                author_id AS "author_id: Uuid",
                author_name AS "author_name!",
                author_email,
                content AS "content!",
                is_internal AS "is_internal!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM task_comments
            WHERE task_id = $1
            ORDER BY created_at ASC
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TaskComment {
                id: r.id,
                task_id: r.task_id,
                author_id: r.author_id,
                author_name: r.author_name,
                author_email: r.author_email,
                content: r.content,
                is_internal: r.is_internal,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Find a single comment by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<TaskComment>, TaskCommentError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                task_id AS "task_id!: Uuid",
                author_id AS "author_id: Uuid",
                author_name AS "author_name!",
                author_email,
                content AS "content!",
                is_internal AS "is_internal!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM task_comments
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| TaskComment {
            id: r.id,
            task_id: r.task_id,
            author_id: r.author_id,
            author_name: r.author_name,
            author_email: r.author_email,
            content: r.content,
            is_internal: r.is_internal,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Create a new comment
    pub async fn create(
        pool: &PgPool,
        task_id: Uuid,
        payload: &CreateTaskComment,
    ) -> Result<TaskComment, TaskCommentError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO task_comments (task_id, author_id, author_name, author_email, content, is_internal)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id AS "id!: Uuid",
                task_id AS "task_id!: Uuid",
                author_id AS "author_id: Uuid",
                author_name AS "author_name!",
                author_email,
                content AS "content!",
                is_internal AS "is_internal!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            task_id,
            payload.author_id,
            payload.author_name,
            payload.author_email,
            payload.content,
            payload.is_internal
        )
        .fetch_one(pool)
        .await?;

        Ok(TaskComment {
            id: row.id,
            task_id: row.task_id,
            author_id: row.author_id,
            author_name: row.author_name,
            author_email: row.author_email,
            content: row.content,
            is_internal: row.is_internal,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Update an existing comment
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateTaskComment,
    ) -> Result<TaskComment, TaskCommentError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(TaskCommentError::NotFound)?;

        let content = payload.content.as_ref().unwrap_or(&existing.content);
        let is_internal = payload.is_internal.unwrap_or(existing.is_internal);

        let row = sqlx::query!(
            r#"
            UPDATE task_comments
            SET content = $2, is_internal = $3, updated_at = NOW()
            WHERE id = $1
            RETURNING
                id AS "id!: Uuid",
                task_id AS "task_id!: Uuid",
                author_id AS "author_id: Uuid",
                author_name AS "author_name!",
                author_email,
                content AS "content!",
                is_internal AS "is_internal!: bool",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            content,
            is_internal
        )
        .fetch_one(pool)
        .await?;

        Ok(TaskComment {
            id: row.id,
            task_id: row.task_id,
            author_id: row.author_id,
            author_name: row.author_name,
            author_email: row.author_email,
            content: row.content,
            is_internal: row.is_internal,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Delete a comment
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, TaskCommentError> {
        let result = sqlx::query!("DELETE FROM task_comments WHERE id = $1", id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}
