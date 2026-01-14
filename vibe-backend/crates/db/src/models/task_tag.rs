use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// A link between a task and a tag
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskTag {
    pub id: Uuid,
    pub task_id: Uuid,
    pub tag_id: Uuid,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Request to add a tag to a task
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct AddTagRequest {
    pub tag_id: Uuid,
}

/// Tag with full details for task display
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskTagWithDetails {
    pub id: Uuid,
    pub tag_id: Uuid,
    pub tag_name: String,
    pub content: String,
    pub color: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct TaskTagRow {
    id: Uuid,
    task_id: Uuid,
    tag_id: Uuid,
    created_at: DateTime<Utc>,
}

impl From<TaskTagRow> for TaskTag {
    fn from(row: TaskTagRow) -> Self {
        Self {
            id: row.id,
            task_id: row.task_id,
            tag_id: row.tag_id,
            created_at: row.created_at,
        }
    }
}

// Helper struct for tag with details
#[derive(FromRow)]
struct TaskTagWithDetailsRow {
    id: Uuid,
    tag_id: Uuid,
    tag_name: String,
    content: String,
    color: Option<String>,
    created_at: DateTime<Utc>,
}

impl From<TaskTagWithDetailsRow> for TaskTagWithDetails {
    fn from(row: TaskTagWithDetailsRow) -> Self {
        Self {
            id: row.id,
            tag_id: row.tag_id,
            tag_name: row.tag_name,
            content: row.content,
            color: row.color,
            created_at: row.created_at,
        }
    }
}

impl TaskTag {
    /// Find all tags for a task with tag details
    pub async fn find_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<TaskTagWithDetails>, sqlx::Error> {
        let rows = sqlx::query_as!(
            TaskTagWithDetailsRow,
            r#"SELECT
                  tt.id as "id!: Uuid",
                  tt.tag_id as "tag_id!: Uuid",
                  t.tag_name as "tag_name!",
                  t.content as "content!",
                  t.color as "color?",
                  tt.created_at as "created_at!: DateTime<Utc>"
               FROM task_tags tt
               JOIN tags t ON t.id = tt.tag_id
               WHERE tt.task_id = $1
               ORDER BY t.tag_name ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Add a tag to a task
    pub async fn add_tag(
        pool: &PgPool,
        task_id: Uuid,
        tag_id: Uuid,
    ) -> Result<TaskTag, sqlx::Error> {
        // Check if link already exists
        let existing = sqlx::query_scalar!(
            r#"SELECT id as "id: Uuid" FROM task_tags
               WHERE task_id = $1 AND tag_id = $2"#,
            task_id,
            tag_id
        )
        .fetch_optional(pool)
        .await?;

        if let Some(id) = existing {
            // Return existing link
            let row = sqlx::query_as!(
                TaskTagRow,
                r#"SELECT id as "id!: Uuid", task_id as "task_id!: Uuid", tag_id as "tag_id!: Uuid", created_at as "created_at!: DateTime<Utc>"
                   FROM task_tags WHERE id = $1"#,
                id
            )
            .fetch_one(pool)
            .await?;
            return Ok(row.into());
        }

        let id = Uuid::new_v4();
        let row = sqlx::query_as!(
            TaskTagRow,
            r#"INSERT INTO task_tags (id, task_id, tag_id, created_at)
               VALUES ($1, $2, $3, NOW())
               RETURNING id as "id!: Uuid",
                         task_id as "task_id!: Uuid",
                         tag_id as "tag_id!: Uuid",
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            task_id,
            tag_id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Remove a tag from a task
    pub async fn remove_tag(
        pool: &PgPool,
        task_id: Uuid,
        tag_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM task_tags WHERE task_id = $1 AND tag_id = $2",
            task_id,
            tag_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Delete all tags for a task
    pub async fn delete_by_task_id(pool: &PgPool, task_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM task_tags WHERE task_id = $1",
            task_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }
}
