//! Tags database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

const DEFAULT_TAG_COLOR: &str = "#6B7280";

/// Validates that a color string is a valid hex color (e.g., "#FF5733")
fn is_valid_hex_color(color: &str) -> bool {
    color.starts_with('#') && color.len() == 7 && color[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Returns a valid hex color or the default if invalid
fn sanitize_color(color: Option<&str>) -> &str {
    match color {
        Some(c) if is_valid_hex_color(c) => c,
        _ => DEFAULT_TAG_COLOR,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: Uuid,
    pub tag_name: String,
    pub content: String,
    pub color: Option<String>,
    pub team_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTag {
    pub tag_name: String,
    pub content: Option<String>,
    pub color: Option<String>,
    pub team_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTag {
    pub tag_name: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Error)]
pub enum TagError {
    #[error("tag not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TagRepository;

impl TagRepository {
    /// Find all tags for a team
    pub async fn find_by_team(pool: &PgPool, team_id: Uuid) -> Result<Vec<Tag>, TagError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                tag_name AS "tag_name!",
                content AS "content!",
                color,
                team_id AS "team_id: Uuid",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM tags
            WHERE team_id = $1
            ORDER BY tag_name ASC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| Tag {
                id: r.id,
                tag_name: r.tag_name,
                content: r.content,
                color: r.color,
                team_id: r.team_id,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Find a single tag by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Tag>, TagError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                tag_name AS "tag_name!",
                content AS "content!",
                color,
                team_id AS "team_id: Uuid",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM tags
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Tag {
            id: r.id,
            tag_name: r.tag_name,
            content: r.content,
            color: r.color,
            team_id: r.team_id,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Create a new tag
    pub async fn create(pool: &PgPool, payload: &CreateTag) -> Result<Tag, TagError> {
        let color = sanitize_color(payload.color.as_deref());
        let content = payload.content.as_deref().unwrap_or("");

        let row = sqlx::query!(
            r#"
            INSERT INTO tags (tag_name, content, color, team_id)
            VALUES ($1, $2, $3, $4)
            RETURNING
                id AS "id!: Uuid",
                tag_name AS "tag_name!",
                content AS "content!",
                color,
                team_id AS "team_id: Uuid",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            payload.tag_name,
            content,
            color,
            payload.team_id
        )
        .fetch_one(pool)
        .await?;

        Ok(Tag {
            id: row.id,
            tag_name: row.tag_name,
            content: row.content,
            color: row.color,
            team_id: row.team_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Update an existing tag
    pub async fn update(pool: &PgPool, id: Uuid, payload: &UpdateTag) -> Result<Tag, TagError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(TagError::NotFound)?;

        let tag_name = payload.tag_name.as_ref().unwrap_or(&existing.tag_name);
        let content = payload.content.as_ref().unwrap_or(&existing.content);
        let color = match &payload.color {
            Some(c) if is_valid_hex_color(c) => Some(c.as_str()),
            Some(_) => existing.color.as_deref(),
            None => existing.color.as_deref(),
        };

        let row = sqlx::query!(
            r#"
            UPDATE tags
            SET tag_name = $2, content = $3, color = $4, updated_at = NOW()
            WHERE id = $1
            RETURNING
                id AS "id!: Uuid",
                tag_name AS "tag_name!",
                content AS "content!",
                color,
                team_id AS "team_id: Uuid",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            tag_name,
            content,
            color
        )
        .fetch_one(pool)
        .await?;

        Ok(Tag {
            id: row.id,
            tag_name: row.tag_name,
            content: row.content,
            color: row.color,
            team_id: row.team_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Delete a tag
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, TagError> {
        let result = sqlx::query!("DELETE FROM tags WHERE id = $1", id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}
