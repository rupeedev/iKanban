//! Document database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// Document model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: Uuid,
    pub team_id: Uuid,
    pub folder_id: Option<Uuid>,
    pub title: String,
    pub slug: Option<String>,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub icon: Option<String>,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub position: i32,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub storage_key: Option<String>,
    pub storage_bucket: Option<String>,
    pub storage_metadata: Option<serde_json::Value>,
    pub storage_provider: String,
}

#[derive(Debug, Error)]
pub enum DocumentError {
    #[error("document not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

/// Request to create a new document
#[derive(Debug, Deserialize)]
pub struct CreateDocument {
    pub folder_id: Option<Uuid>,
    pub title: String,
    pub content: Option<String>,
    pub file_type: Option<String>,
    pub icon: Option<String>,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub storage_provider: Option<String>,
    pub storage_key: Option<String>,
}

/// Request to update a document
#[derive(Debug, Deserialize)]
pub struct UpdateDocument {
    pub folder_id: Option<Uuid>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub icon: Option<String>,
    pub is_pinned: Option<bool>,
    pub is_archived: Option<bool>,
    pub position: Option<i32>,
}

/// Generate a URL-friendly slug from a title
pub fn generate_slug(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c == ' ' || c == '_' || c == '/' {
                '-'
            } else {
                ' '
            }
        })
        .filter(|c| *c != ' ')
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(100)
        .collect()
}

pub struct DocumentRepository;

impl DocumentRepository {
    /// Find all documents by team
    pub async fn find_all_by_team(
        pool: &PgPool,
        team_id: Uuid,
        include_archived: bool,
    ) -> Result<Vec<Document>, DocumentError> {
        if include_archived {
            Self::find_all_with_archived(pool, team_id).await
        } else {
            Self::find_all_active(pool, team_id).await
        }
    }

    async fn find_all_with_archived(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<Document>, DocumentError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, folder_id, title, slug, content, file_path, file_type,
                   file_size, mime_type, icon, is_pinned, is_archived, position, created_by,
                   created_at, updated_at, storage_key, storage_bucket, storage_metadata, storage_provider
            FROM documents WHERE team_id = $1
            ORDER BY is_pinned DESC, position ASC, updated_at DESC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| Document {
                id: r.id,
                team_id: r.team_id,
                folder_id: r.folder_id,
                title: r.title,
                slug: r.slug,
                content: r.content,
                file_path: r.file_path,
                file_type: r.file_type,
                file_size: r.file_size,
                mime_type: r.mime_type,
                icon: r.icon,
                is_pinned: r.is_pinned,
                is_archived: r.is_archived,
                position: r.position,
                created_by: r.created_by,
                created_at: r.created_at,
                updated_at: r.updated_at,
                storage_key: r.storage_key,
                storage_bucket: r.storage_bucket,
                storage_metadata: r.storage_metadata,
                storage_provider: r.storage_provider,
            })
            .collect())
    }

    async fn find_all_active(pool: &PgPool, team_id: Uuid) -> Result<Vec<Document>, DocumentError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, folder_id, title, slug, content, file_path, file_type,
                   file_size, mime_type, icon, is_pinned, is_archived, position, created_by,
                   created_at, updated_at, storage_key, storage_bucket, storage_metadata, storage_provider
            FROM documents WHERE team_id = $1 AND is_archived = FALSE
            ORDER BY is_pinned DESC, position ASC, updated_at DESC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| Document {
                id: r.id,
                team_id: r.team_id,
                folder_id: r.folder_id,
                title: r.title,
                slug: r.slug,
                content: r.content,
                file_path: r.file_path,
                file_type: r.file_type,
                file_size: r.file_size,
                mime_type: r.mime_type,
                icon: r.icon,
                is_pinned: r.is_pinned,
                is_archived: r.is_archived,
                position: r.position,
                created_by: r.created_by,
                created_at: r.created_at,
                updated_at: r.updated_at,
                storage_key: r.storage_key,
                storage_bucket: r.storage_bucket,
                storage_metadata: r.storage_metadata,
                storage_provider: r.storage_provider,
            })
            .collect())
    }

    /// Find documents by folder
    pub async fn find_by_folder(
        pool: &PgPool,
        team_id: Uuid,
        folder_id: Option<Uuid>,
    ) -> Result<Vec<Document>, DocumentError> {
        if let Some(fid) = folder_id {
            Self::find_in_folder(pool, team_id, fid).await
        } else {
            Self::find_in_root(pool, team_id).await
        }
    }

    async fn find_in_folder(
        pool: &PgPool,
        team_id: Uuid,
        folder_id: Uuid,
    ) -> Result<Vec<Document>, DocumentError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, folder_id, title, slug, content, file_path, file_type,
                   file_size, mime_type, icon, is_pinned, is_archived, position, created_by,
                   created_at, updated_at, storage_key, storage_bucket, storage_metadata, storage_provider
            FROM documents WHERE team_id = $1 AND folder_id = $2 AND is_archived = FALSE
            ORDER BY is_pinned DESC, position ASC, updated_at DESC
            "#,
            team_id,
            folder_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| Document {
                id: r.id,
                team_id: r.team_id,
                folder_id: r.folder_id,
                title: r.title,
                slug: r.slug,
                content: r.content,
                file_path: r.file_path,
                file_type: r.file_type,
                file_size: r.file_size,
                mime_type: r.mime_type,
                icon: r.icon,
                is_pinned: r.is_pinned,
                is_archived: r.is_archived,
                position: r.position,
                created_by: r.created_by,
                created_at: r.created_at,
                updated_at: r.updated_at,
                storage_key: r.storage_key,
                storage_bucket: r.storage_bucket,
                storage_metadata: r.storage_metadata,
                storage_provider: r.storage_provider,
            })
            .collect())
    }

    async fn find_in_root(pool: &PgPool, team_id: Uuid) -> Result<Vec<Document>, DocumentError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, folder_id, title, slug, content, file_path, file_type,
                   file_size, mime_type, icon, is_pinned, is_archived, position, created_by,
                   created_at, updated_at, storage_key, storage_bucket, storage_metadata, storage_provider
            FROM documents WHERE team_id = $1 AND folder_id IS NULL AND is_archived = FALSE
            ORDER BY is_pinned DESC, position ASC, updated_at DESC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| Document {
                id: r.id,
                team_id: r.team_id,
                folder_id: r.folder_id,
                title: r.title,
                slug: r.slug,
                content: r.content,
                file_path: r.file_path,
                file_type: r.file_type,
                file_size: r.file_size,
                mime_type: r.mime_type,
                icon: r.icon,
                is_pinned: r.is_pinned,
                is_archived: r.is_archived,
                position: r.position,
                created_by: r.created_by,
                created_at: r.created_at,
                updated_at: r.updated_at,
                storage_key: r.storage_key,
                storage_bucket: r.storage_bucket,
                storage_metadata: r.storage_metadata,
                storage_provider: r.storage_provider,
            })
            .collect())
    }

    /// Find document by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Document>, DocumentError> {
        let row = sqlx::query!(
            r#"
            SELECT id, team_id, folder_id, title, slug, content, file_path, file_type,
                   file_size, mime_type, icon, is_pinned, is_archived, position, created_by,
                   created_at, updated_at, storage_key, storage_bucket, storage_metadata, storage_provider
            FROM documents WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Document {
            id: r.id,
            team_id: r.team_id,
            folder_id: r.folder_id,
            title: r.title,
            slug: r.slug,
            content: r.content,
            file_path: r.file_path,
            file_type: r.file_type,
            file_size: r.file_size,
            mime_type: r.mime_type,
            icon: r.icon,
            is_pinned: r.is_pinned,
            is_archived: r.is_archived,
            position: r.position,
            created_by: r.created_by,
            created_at: r.created_at,
            updated_at: r.updated_at,
            storage_key: r.storage_key,
            storage_bucket: r.storage_bucket,
            storage_metadata: r.storage_metadata,
            storage_provider: r.storage_provider,
        }))
    }

    /// Create a new document
    pub async fn create(
        pool: &PgPool,
        team_id: Uuid,
        data: &CreateDocument,
    ) -> Result<Document, DocumentError> {
        let file_type = data
            .file_type
            .clone()
            .unwrap_or_else(|| "markdown".to_string());
        let slug = generate_slug(&data.title);
        let storage_provider = data
            .storage_provider
            .clone()
            .unwrap_or_else(|| "local".to_string());

        // Get max position - use COALESCE to handle NULL case
        let max_pos = sqlx::query_scalar!(
            r#"SELECT COALESCE(MAX(position), -1) + 1 FROM documents WHERE team_id = $1"#,
            team_id
        )
        .fetch_one(pool)
        .await?
        .unwrap_or(0) as i32;

        let row = sqlx::query!(
            r#"
            INSERT INTO documents (team_id, folder_id, title, slug, content, file_type, icon,
                position, file_path, file_size, mime_type, storage_provider, storage_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, team_id, folder_id, title, slug, content, file_path, file_type,
                   file_size, mime_type, icon, is_pinned, is_archived, position, created_by,
                   created_at, updated_at, storage_key, storage_bucket, storage_metadata, storage_provider
            "#,
            team_id,
            data.folder_id,
            data.title,
            slug,
            data.content,
            file_type,
            data.icon,
            max_pos,
            data.file_path,
            data.file_size,
            data.mime_type,
            storage_provider,
            data.storage_key
        )
        .fetch_one(pool)
        .await?;

        Ok(Document {
            id: row.id,
            team_id: row.team_id,
            folder_id: row.folder_id,
            title: row.title,
            slug: row.slug,
            content: row.content,
            file_path: row.file_path,
            file_type: row.file_type,
            file_size: row.file_size,
            mime_type: row.mime_type,
            icon: row.icon,
            is_pinned: row.is_pinned,
            is_archived: row.is_archived,
            position: row.position,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            storage_key: row.storage_key,
            storage_bucket: row.storage_bucket,
            storage_metadata: row.storage_metadata,
            storage_provider: row.storage_provider,
        })
    }

    /// Update a document
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateDocument,
    ) -> Result<Document, DocumentError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(DocumentError::NotFound)?;

        let folder_id = data.folder_id.or(existing.folder_id);
        let title = data.title.as_ref().unwrap_or(&existing.title);
        let slug = if data.title.is_some() {
            Some(generate_slug(title))
        } else {
            existing.slug
        };
        let content = data.content.clone().or(existing.content);
        let icon = data.icon.clone().or(existing.icon);
        let is_pinned = data.is_pinned.unwrap_or(existing.is_pinned);
        let is_archived = data.is_archived.unwrap_or(existing.is_archived);
        let position = data.position.unwrap_or(existing.position);

        let row = sqlx::query!(
            r#"
            UPDATE documents
            SET folder_id = $2, title = $3, slug = $4, content = $5, icon = $6,
                is_pinned = $7, is_archived = $8, position = $9, updated_at = NOW()
            WHERE id = $1
            RETURNING id, team_id, folder_id, title, slug, content, file_path, file_type,
                   file_size, mime_type, icon, is_pinned, is_archived, position, created_by,
                   created_at, updated_at, storage_key, storage_bucket, storage_metadata, storage_provider
            "#,
            id,
            folder_id,
            title,
            slug,
            content,
            icon,
            is_pinned,
            is_archived,
            position
        )
        .fetch_one(pool)
        .await?;

        Ok(Document {
            id: row.id,
            team_id: row.team_id,
            folder_id: row.folder_id,
            title: row.title,
            slug: row.slug,
            content: row.content,
            file_path: row.file_path,
            file_type: row.file_type,
            file_size: row.file_size,
            mime_type: row.mime_type,
            icon: row.icon,
            is_pinned: row.is_pinned,
            is_archived: row.is_archived,
            position: row.position,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            storage_key: row.storage_key,
            storage_bucket: row.storage_bucket,
            storage_metadata: row.storage_metadata,
            storage_provider: row.storage_provider,
        })
    }

    /// Delete a document
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, DocumentError> {
        let result = sqlx::query!("DELETE FROM documents WHERE id = $1", id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}
