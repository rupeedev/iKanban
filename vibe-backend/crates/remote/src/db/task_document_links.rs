//! Task document links database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// A link between a task and a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDocumentLink {
    pub id: Uuid,
    pub task_id: Uuid,
    pub document_id: Uuid,
    pub created_at: DateTime<Utc>,
}

/// Response with linked document info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedDocument {
    pub id: Uuid,
    pub document_id: Uuid,
    pub document_title: String,
    pub folder_name: Option<String>,
    pub linked_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum TaskDocumentLinkError {
    #[error("link not found")]
    NotFound,
    #[error("document not found")]
    DocumentNotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TaskDocumentLinkRepository;

impl TaskDocumentLinkRepository {
    /// Find all document links for a task with document details
    pub async fn find_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<LinkedDocument>, TaskDocumentLinkError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                tdl.id AS "id!: Uuid",
                tdl.document_id AS "document_id!: Uuid",
                COALESCE(d.title, 'Untitled') AS "document_title!",
                df.name AS "folder_name?",
                tdl.created_at AS "linked_at!: DateTime<Utc>"
            FROM task_document_links tdl
            JOIN documents d ON d.id = tdl.document_id
            LEFT JOIN document_folders df ON df.id = d.folder_id
            WHERE tdl.task_id = $1
            ORDER BY tdl.created_at DESC
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| LinkedDocument {
                id: r.id,
                document_id: r.document_id,
                document_title: r.document_title,
                folder_name: r.folder_name,
                linked_at: r.linked_at,
            })
            .collect())
    }

    /// Link a document to a task (idempotent - checks for existing link first)
    pub async fn link_document(
        pool: &PgPool,
        task_id: Uuid,
        document_id: Uuid,
    ) -> Result<TaskDocumentLink, TaskDocumentLinkError> {
        // Check if link already exists
        let existing = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                task_id AS "task_id!: Uuid",
                document_id AS "document_id!: Uuid",
                created_at AS "created_at!: DateTime<Utc>"
            FROM task_document_links
            WHERE task_id = $1 AND document_id = $2
            "#,
            task_id,
            document_id
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = existing {
            return Ok(TaskDocumentLink {
                id: row.id,
                task_id: row.task_id,
                document_id: row.document_id,
                created_at: row.created_at,
            });
        }

        // Create new link
        let row = sqlx::query!(
            r#"
            INSERT INTO task_document_links (task_id, document_id)
            VALUES ($1, $2)
            RETURNING
                id AS "id!: Uuid",
                task_id AS "task_id!: Uuid",
                document_id AS "document_id!: Uuid",
                created_at AS "created_at!: DateTime<Utc>"
            "#,
            task_id,
            document_id
        )
        .fetch_one(pool)
        .await?;

        Ok(TaskDocumentLink {
            id: row.id,
            task_id: row.task_id,
            document_id: row.document_id,
            created_at: row.created_at,
        })
    }

    /// Unlink a document from a task
    pub async fn unlink_document(
        pool: &PgPool,
        task_id: Uuid,
        document_id: Uuid,
    ) -> Result<bool, TaskDocumentLinkError> {
        let result = sqlx::query!(
            "DELETE FROM task_document_links WHERE task_id = $1 AND document_id = $2",
            task_id,
            document_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete all document links for a task
    pub async fn delete_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<u64, TaskDocumentLinkError> {
        let result = sqlx::query!("DELETE FROM task_document_links WHERE task_id = $1", task_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
}
