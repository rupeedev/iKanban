use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

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
        let id = Uuid::new_v4();
        let color = data.color.as_deref().unwrap_or("#6B7280");
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

        let tag_name = data.tag_name.as_ref().unwrap_or(&existing.tag_name);
        let content = data.content.as_ref().unwrap_or(&existing.content);
        let color = data.color.as_ref().or(existing.color.as_ref());
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
