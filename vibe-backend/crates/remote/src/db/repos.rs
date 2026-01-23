//! Repos database operations for remote crate

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repo {
    pub id: Uuid,
    pub path: String,
    pub name: String,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateRepo {
    pub path: String,
    pub name: String,
    pub display_name: String,
}

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("repo not found")]
    NotFound,
    #[error("repo already exists")]
    AlreadyExists,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct RepoRepository;

impl RepoRepository {
    /// Find a repo by path
    pub async fn find_by_path(pool: &PgPool, path: &str) -> Result<Option<Repo>, RepoError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                path AS "path!",
                name AS "name!",
                display_name AS "display_name!",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM repos
            WHERE path = $1
            "#,
            path
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Repo {
            id: r.id,
            path: r.path,
            name: r.name,
            display_name: r.display_name,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Find a repo by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Repo>, RepoError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                path AS "path!",
                name AS "name!",
                display_name AS "display_name!",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM repos
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Repo {
            id: r.id,
            path: r.path,
            name: r.name,
            display_name: r.display_name,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Create or find existing repo by path
    pub async fn create_or_find(pool: &PgPool, payload: &CreateRepo) -> Result<Repo, RepoError> {
        // First try to find existing
        if let Some(existing) = Self::find_by_path(pool, &payload.path).await? {
            return Ok(existing);
        }

        // Create new
        let row = sqlx::query!(
            r#"
            INSERT INTO repos (path, name, display_name)
            VALUES ($1, $2, $3)
            RETURNING
                id AS "id!: Uuid",
                path AS "path!",
                name AS "name!",
                display_name AS "display_name!",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            payload.path,
            payload.name,
            payload.display_name
        )
        .fetch_one(pool)
        .await?;

        Ok(Repo {
            id: row.id,
            path: row.path,
            name: row.name,
            display_name: row.display_name,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}
