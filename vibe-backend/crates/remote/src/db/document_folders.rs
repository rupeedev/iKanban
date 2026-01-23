//! Document folder database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// Document folder for hierarchical organization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentFolder {
    pub id: Uuid,
    pub team_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub local_path: Option<String>,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum DocumentFolderError {
    #[error("folder not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

/// Request to create a new folder
#[derive(Debug, Deserialize)]
pub struct CreateDocumentFolder {
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub local_path: Option<String>,
}

/// Request to update a folder
#[derive(Debug, Deserialize)]
pub struct UpdateDocumentFolder {
    pub parent_id: Option<Uuid>,
    pub name: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub local_path: Option<String>,
    pub position: Option<i32>,
}

pub struct DocumentFolderRepository;

impl DocumentFolderRepository {
    /// Find all folders by team
    pub async fn find_all_by_team(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<DocumentFolder>, DocumentFolderError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, parent_id, name, icon, color, local_path, position, created_at, updated_at
            FROM document_folders WHERE team_id = $1
            ORDER BY position ASC, name ASC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| DocumentFolder {
                id: r.id,
                team_id: r.team_id,
                parent_id: r.parent_id,
                name: r.name,
                icon: r.icon,
                color: r.color,
                local_path: r.local_path,
                position: r.position,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Find folder by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<DocumentFolder>, DocumentFolderError> {
        let row = sqlx::query!(
            r#"
            SELECT id, team_id, parent_id, name, icon, color, local_path, position, created_at, updated_at
            FROM document_folders WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| DocumentFolder {
            id: r.id,
            team_id: r.team_id,
            parent_id: r.parent_id,
            name: r.name,
            icon: r.icon,
            color: r.color,
            local_path: r.local_path,
            position: r.position,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Find children of a folder (or root folders if parent_id is None)
    pub async fn find_children(
        pool: &PgPool,
        team_id: Uuid,
        parent_id: Option<Uuid>,
    ) -> Result<Vec<DocumentFolder>, DocumentFolderError> {
        if let Some(pid) = parent_id {
            Self::find_children_with_parent(pool, team_id, pid).await
        } else {
            Self::find_root_folders(pool, team_id).await
        }
    }

    async fn find_children_with_parent(
        pool: &PgPool,
        team_id: Uuid,
        parent_id: Uuid,
    ) -> Result<Vec<DocumentFolder>, DocumentFolderError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, parent_id, name, icon, color, local_path, position, created_at, updated_at
            FROM document_folders WHERE parent_id = $1 AND team_id = $2
            ORDER BY position ASC, name ASC
            "#,
            parent_id,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| DocumentFolder {
                id: r.id,
                team_id: r.team_id,
                parent_id: r.parent_id,
                name: r.name,
                icon: r.icon,
                color: r.color,
                local_path: r.local_path,
                position: r.position,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    async fn find_root_folders(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<DocumentFolder>, DocumentFolderError> {
        let rows = sqlx::query!(
            r#"
            SELECT id, team_id, parent_id, name, icon, color, local_path, position, created_at, updated_at
            FROM document_folders WHERE parent_id IS NULL AND team_id = $1
            ORDER BY position ASC, name ASC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| DocumentFolder {
                id: r.id,
                team_id: r.team_id,
                parent_id: r.parent_id,
                name: r.name,
                icon: r.icon,
                color: r.color,
                local_path: r.local_path,
                position: r.position,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Create a new folder
    pub async fn create(
        pool: &PgPool,
        team_id: Uuid,
        data: &CreateDocumentFolder,
    ) -> Result<DocumentFolder, DocumentFolderError> {
        // Get max position
        let max_pos = sqlx::query_scalar!(
            r#"SELECT COALESCE(MAX(position), -1) + 1 FROM document_folders WHERE team_id = $1"#,
            team_id
        )
        .fetch_one(pool)
        .await?
        .unwrap_or(0) as i32;

        let row = sqlx::query!(
            r#"
            INSERT INTO document_folders (team_id, parent_id, name, icon, color, local_path, position)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, team_id, parent_id, name, icon, color, local_path, position, created_at, updated_at
            "#,
            team_id,
            data.parent_id,
            data.name,
            data.icon,
            data.color,
            data.local_path,
            max_pos
        )
        .fetch_one(pool)
        .await?;

        Ok(DocumentFolder {
            id: row.id,
            team_id: row.team_id,
            parent_id: row.parent_id,
            name: row.name,
            icon: row.icon,
            color: row.color,
            local_path: row.local_path,
            position: row.position,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Update a folder
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateDocumentFolder,
    ) -> Result<DocumentFolder, DocumentFolderError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(DocumentFolderError::NotFound)?;

        let parent_id = data.parent_id.or(existing.parent_id);
        let name = data.name.as_ref().unwrap_or(&existing.name);
        let icon = data.icon.clone().or(existing.icon);
        let color = data.color.clone().or(existing.color);
        let local_path = data.local_path.clone().or(existing.local_path);
        let position = data.position.unwrap_or(existing.position);

        let row = sqlx::query!(
            r#"
            UPDATE document_folders
            SET parent_id = $2, name = $3, icon = $4, color = $5, local_path = $6,
                position = $7, updated_at = NOW()
            WHERE id = $1
            RETURNING id, team_id, parent_id, name, icon, color, local_path, position, created_at, updated_at
            "#,
            id,
            parent_id,
            name,
            icon,
            color,
            local_path,
            position
        )
        .fetch_one(pool)
        .await?;

        Ok(DocumentFolder {
            id: row.id,
            team_id: row.team_id,
            parent_id: row.parent_id,
            name: row.name,
            icon: row.icon,
            color: row.color,
            local_path: row.local_path,
            position: row.position,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Delete a folder
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, DocumentFolderError> {
        let result = sqlx::query!("DELETE FROM document_folders WHERE id = $1", id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}
