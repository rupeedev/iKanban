//! Teams database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: Uuid,
    pub name: String,
    pub slug: Option<String>,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub document_storage_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTeamData {
    pub name: String,
    pub slug: String,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tenant_workspace_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTeamData {
    pub name: Option<String>,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub document_storage_path: Option<String>,
}

#[derive(Debug, Error)]
pub enum TeamError {
    #[error("team not found")]
    NotFound,
    #[error("team slug already exists")]
    SlugConflict,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TeamRepository;

impl TeamRepository {
    /// List teams by workspace (tenant_workspace_id)
    pub async fn list_by_workspace(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Vec<Team>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            WHERE tenant_workspace_id = $1
            ORDER BY name ASC
            "#,
            workspace_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| Team {
                id: row.id,
                name: row.name,
                slug: row.slug,
                identifier: row.identifier,
                icon: row.icon,
                color: row.color,
                document_storage_path: row.document_storage_path,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect())
    }

    /// List all teams (no workspace filter)
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Team>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            ORDER BY name ASC
            "#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| Team {
                id: row.id,
                name: row.name,
                slug: row.slug,
                identifier: row.identifier,
                icon: row.icon,
                color: row.color,
                document_storage_path: row.document_storage_path,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect())
    }

    /// Get a team by ID
    pub async fn get_by_id(pool: &PgPool, team_id: Uuid) -> Result<Option<Team>, TeamError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            WHERE id = $1
            "#,
            team_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Team {
            id: r.id,
            name: r.name,
            slug: r.slug,
            identifier: r.identifier,
            icon: r.icon,
            color: r.color,
            document_storage_path: r.document_storage_path,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Get a team's workspace ID
    pub async fn workspace_id(pool: &PgPool, team_id: Uuid) -> Result<Option<Uuid>, TeamError> {
        sqlx::query_scalar::<_, Option<Uuid>>(
            r#"SELECT tenant_workspace_id FROM teams WHERE id = $1"#,
        )
        .bind(team_id)
        .fetch_optional(pool)
        .await
        .map(|opt| opt.flatten())
        .map_err(TeamError::from)
    }
}
