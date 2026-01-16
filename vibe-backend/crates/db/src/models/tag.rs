use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

const DEFAULT_TAG_COLOR: &str = "#6B7280";
const MAX_TAG_NAME_LENGTH: usize = 100;
const MAX_TAG_CONTENT_LENGTH: usize = 1000;

/// Validates that a color string is a valid hex color (e.g., "#FF5733")
fn is_valid_hex_color(color: &str) -> bool {
    color.starts_with('#')
        && color.len() == 7
        && color[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Returns a valid hex color or the default if invalid
fn sanitize_color(color: Option<&str>) -> &str {
    match color {
        Some(c) if is_valid_hex_color(c) => c,
        _ => DEFAULT_TAG_COLOR,
    }
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Tag {
    pub id: Uuid,
    pub tag_name: String,
    pub content: String,
    pub color: Option<String>,
    pub team_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTag {
    pub tag_name: String,
    pub content: String,
    pub color: Option<String>,
    pub team_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTag {
    pub tag_name: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub team_id: Option<Uuid>,
}

impl Tag {
    pub async fn find_all(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Tag,
            r#"SELECT id as "id!: Uuid", tag_name, content as "content!", color, team_id as "team_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tags
               ORDER BY tag_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_team(pool: &PgPool, team_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Tag,
            r#"SELECT id as "id!: Uuid", tag_name, content as "content!", color, team_id as "team_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tags
               WHERE team_id = $1
               ORDER BY tag_name ASC"#,
            team_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Tag,
            r#"SELECT id as "id!: Uuid", tag_name, content as "content!", color, team_id as "team_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tags
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &PgPool, data: &CreateTag) -> Result<Self, sqlx::Error> {
        // Validate tag name length
        if data.tag_name.is_empty() {
            return Err(sqlx::Error::Protocol("Tag name cannot be empty".into()));
        }
        if data.tag_name.len() > MAX_TAG_NAME_LENGTH {
            return Err(sqlx::Error::Protocol(
                format!("Tag name too long (max {} characters)", MAX_TAG_NAME_LENGTH).into(),
            ));
        }
        
        // Validate content length
        if data.content.len() > MAX_TAG_CONTENT_LENGTH {
            return Err(sqlx::Error::Protocol(
                format!("Tag content too long (max {} characters)", MAX_TAG_CONTENT_LENGTH).into(),
            ));
        }
        
        let id = Uuid::new_v4();
        let color = sanitize_color(data.color.as_deref());
        sqlx::query_as!(
            Tag,
            r#"INSERT INTO tags (id, tag_name, content, color, team_id)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id as "id!: Uuid", tag_name, content as "content!", color, team_id as "team_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.tag_name,
            data.content,
            color,
            data.team_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateTag,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Validate tag name if provided
        let tag_name = if let Some(ref name) = data.tag_name {
            if name.is_empty() {
                return Err(sqlx::Error::Protocol("Tag name cannot be empty".into()));
            }
            if name.len() > MAX_TAG_NAME_LENGTH {
                return Err(sqlx::Error::Protocol(
                    format!("Tag name too long (max {} characters)", MAX_TAG_NAME_LENGTH).into(),
                ));
            }
            name
        } else {
            &existing.tag_name
        };

        // Validate content if provided
        let content = if let Some(ref c) = data.content {
            if c.len() > MAX_TAG_CONTENT_LENGTH {
                return Err(sqlx::Error::Protocol(
                    format!("Tag content too long (max {} characters)", MAX_TAG_CONTENT_LENGTH).into(),
                ));
            }
            c
        } else {
            &existing.content
        };

        // Validate color: use new color if valid, else keep existing or default
        let color: Option<&str> = match &data.color {
            Some(c) if is_valid_hex_color(c) => Some(c.as_str()),
            Some(_) => existing.color.as_deref(), // Invalid new color, keep existing
            None => existing.color.as_deref(),    // No new color, keep existing
        };
        let team_id = data.team_id.or(existing.team_id);

        sqlx::query_as!(
            Tag,
            r#"UPDATE tags
               SET tag_name = $2, content = $3, color = $4, team_id = $5, updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid", tag_name, content as "content!", color, team_id as "team_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            tag_name,
            content,
            color,
            team_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM tags WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
