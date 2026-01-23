//! Task tags database operations (junction table between tasks and tags)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// A link between a task and a tag
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskTag {
    pub id: Uuid,
    pub task_id: Uuid,
    pub tag_id: Uuid,
    pub created_at: DateTime<Utc>,
}

/// Tag with full details for task display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskTagWithDetails {
    pub id: Uuid,
    pub tag_id: Uuid,
    pub tag_name: String,
    pub content: String,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum TaskTagError {
    #[error("task tag not found")]
    NotFound,
    #[error("tag not found")]
    TagNotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskTagRepository;

impl TaskTagRepository {
    /// Find all tags for a task with full tag details
    pub async fn find_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<TaskTagWithDetails>, TaskTagError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                tt.id AS "id!: Uuid",
                tt.tag_id AS "tag_id!: Uuid",
                t.tag_name AS "tag_name!",
                t.content AS "content!",
                t.color,
                tt.created_at AS "created_at!: DateTime<Utc>"
            FROM task_tags tt
            JOIN tags t ON t.id = tt.tag_id
            WHERE tt.task_id = $1
            ORDER BY t.tag_name ASC
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TaskTagWithDetails {
                id: r.id,
                tag_id: r.tag_id,
                tag_name: r.tag_name,
                content: r.content,
                color: r.color,
                created_at: r.created_at,
            })
            .collect())
    }

    /// Add a tag to a task (race-condition safe using ON CONFLICT)
    pub async fn add_tag(
        pool: &PgPool,
        task_id: Uuid,
        tag_id: Uuid,
    ) -> Result<TaskTag, TaskTagError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO task_tags (task_id, tag_id)
            VALUES ($1, $2)
            ON CONFLICT (task_id, tag_id) DO UPDATE SET task_id = task_tags.task_id
            RETURNING
                id AS "id!: Uuid",
                task_id AS "task_id!: Uuid",
                tag_id AS "tag_id!: Uuid",
                created_at AS "created_at!: DateTime<Utc>"
            "#,
            task_id,
            tag_id
        )
        .fetch_one(pool)
        .await?;

        Ok(TaskTag {
            id: row.id,
            task_id: row.task_id,
            tag_id: row.tag_id,
            created_at: row.created_at,
        })
    }

    /// Remove a tag from a task
    pub async fn remove_tag(
        pool: &PgPool,
        task_id: Uuid,
        tag_id: Uuid,
    ) -> Result<bool, TaskTagError> {
        let result = sqlx::query!(
            "DELETE FROM task_tags WHERE task_id = $1 AND tag_id = $2",
            task_id,
            tag_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete all tags for a task
    pub async fn delete_by_task_id(pool: &PgPool, task_id: Uuid) -> Result<u64, TaskTagError> {
        let result = sqlx::query!("DELETE FROM task_tags WHERE task_id = $1", task_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
}
