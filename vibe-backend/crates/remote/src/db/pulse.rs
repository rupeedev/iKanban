//! Pulse (Activity) database operations for project updates and reactions

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// Health status for project updates
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProjectHealthStatus {
    #[default]
    OnTrack,
    AtRisk,
    OffTrack,
    Completed,
    Paused,
}

impl ProjectHealthStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OnTrack => "on_track",
            Self::AtRisk => "at_risk",
            Self::OffTrack => "off_track",
            Self::Completed => "completed",
            Self::Paused => "paused",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "on_track" => Self::OnTrack,
            "at_risk" => Self::AtRisk,
            "off_track" => Self::OffTrack,
            "completed" => Self::Completed,
            "paused" => Self::Paused,
            _ => Self::OnTrack,
        }
    }
}

/// A project update for the Pulse feed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectUpdate {
    pub id: Uuid,
    pub project_id: Uuid,
    pub author_id: Uuid,
    pub content: String,
    pub health_status: Option<ProjectHealthStatus>,
    pub progress_data: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Project update with reaction counts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectUpdateWithReactions {
    #[serde(flatten)]
    pub update: ProjectUpdate,
    pub reactions: Vec<ReactionCount>,
    pub user_reactions: Vec<String>,
}

/// Reaction count for an update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionCount {
    pub emoji: String,
    pub count: i64,
}

/// Data to create a new project update
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectUpdate {
    pub content: String,
    pub health_status: Option<ProjectHealthStatus>,
    pub progress_data: Option<serde_json::Value>,
}

/// Data to update an existing project update
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectUpdate {
    pub content: Option<String>,
    pub health_status: Option<ProjectHealthStatus>,
    pub progress_data: Option<serde_json::Value>,
}

/// A reaction on an update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateReaction {
    pub id: Uuid,
    pub update_id: Uuid,
    pub user_id: Uuid,
    pub emoji: String,
    pub created_at: DateTime<Utc>,
}

/// Filter options for listing updates
#[derive(Debug, Clone, Default)]
pub enum PulseFilter {
    #[default]
    Recent,
    ForMe,
    Popular,
}

/// Summary of pulse items for notification badge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PulseSummary {
    pub total_count: i64,
    pub unread_count: i64,
}

#[derive(Debug, Error)]
pub enum PulseError {
    #[error("update not found")]
    NotFound,
    #[error("access denied")]
    Forbidden,
    #[error("reaction already exists")]
    ReactionExists,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct PulseRepository;

impl PulseRepository {
    // ========================================================================
    // Project Updates
    // ========================================================================

    /// List updates with "Recent" filter (all updates, newest first)
    pub async fn list_recent(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ProjectUpdate>, PulseError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                author_id AS "author_id!: Uuid",
                content AS "content!",
                health_status::TEXT AS "health_status",
                progress_data,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM project_updates
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ProjectUpdate {
                id: r.id,
                project_id: r.project_id,
                author_id: r.author_id,
                content: r.content,
                health_status: r.health_status.map(|s| ProjectHealthStatus::parse(&s)),
                progress_data: r.progress_data,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// List updates with "For Me" filter (projects user is lead or subscribed)
    pub async fn list_for_user(
        pool: &PgPool,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ProjectUpdate>, PulseError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                pu.id AS "id!: Uuid",
                pu.project_id AS "project_id!: Uuid",
                pu.author_id AS "author_id!: Uuid",
                pu.content AS "content!",
                pu.health_status::TEXT AS "health_status",
                pu.progress_data,
                pu.created_at AS "created_at!: DateTime<Utc>",
                pu.updated_at AS "updated_at!: DateTime<Utc>"
            FROM project_updates pu
            WHERE pu.project_id IN (
                -- Projects where user is lead
                SELECT id FROM projects WHERE lead_id = $1
                UNION
                -- Projects user is subscribed to
                SELECT project_id FROM user_subscriptions WHERE user_id = $1 AND project_id IS NOT NULL
            )
            ORDER BY pu.created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            user_id,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ProjectUpdate {
                id: r.id,
                project_id: r.project_id,
                author_id: r.author_id,
                content: r.content,
                health_status: r.health_status.map(|s| ProjectHealthStatus::parse(&s)),
                progress_data: r.progress_data,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// List updates with "Popular" filter (most reactions in last 7 days)
    pub async fn list_popular(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ProjectUpdate>, PulseError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                pu.id AS "id!: Uuid",
                pu.project_id AS "project_id!: Uuid",
                pu.author_id AS "author_id!: Uuid",
                pu.content AS "content!",
                pu.health_status::TEXT AS "health_status",
                pu.progress_data,
                pu.created_at AS "created_at!: DateTime<Utc>",
                pu.updated_at AS "updated_at!: DateTime<Utc>"
            FROM project_updates pu
            LEFT JOIN (
                SELECT update_id, COUNT(*) as reaction_count
                FROM update_reactions
                WHERE created_at > NOW() - INTERVAL '7 days'
                GROUP BY update_id
            ) rc ON rc.update_id = pu.id
            WHERE pu.created_at > NOW() - INTERVAL '7 days'
            ORDER BY COALESCE(rc.reaction_count, 0) DESC, pu.created_at DESC
            LIMIT $1 OFFSET $2
            "#,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ProjectUpdate {
                id: r.id,
                project_id: r.project_id,
                author_id: r.author_id,
                content: r.content,
                health_status: r.health_status.map(|s| ProjectHealthStatus::parse(&s)),
                progress_data: r.progress_data,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// List updates for a specific project
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ProjectUpdate>, PulseError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                author_id AS "author_id!: Uuid",
                content AS "content!",
                health_status::TEXT AS "health_status",
                progress_data,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM project_updates
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            project_id,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ProjectUpdate {
                id: r.id,
                project_id: r.project_id,
                author_id: r.author_id,
                content: r.content,
                health_status: r.health_status.map(|s| ProjectHealthStatus::parse(&s)),
                progress_data: r.progress_data,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Get a single update by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<ProjectUpdate>, PulseError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                author_id AS "author_id!: Uuid",
                content AS "content!",
                health_status::TEXT AS "health_status",
                progress_data,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM project_updates
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| ProjectUpdate {
            id: r.id,
            project_id: r.project_id,
            author_id: r.author_id,
            content: r.content,
            health_status: r.health_status.map(|s| ProjectHealthStatus::parse(&s)),
            progress_data: r.progress_data,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Create a new project update
    pub async fn create(
        pool: &PgPool,
        project_id: Uuid,
        author_id: Uuid,
        payload: &CreateProjectUpdate,
    ) -> Result<ProjectUpdate, PulseError> {
        let health_str = payload.health_status.as_ref().map(|h| h.as_str());

        let row = sqlx::query!(
            r#"
            INSERT INTO project_updates (project_id, author_id, content, health_status, progress_data)
            SELECT $1, $2, $3, t.h::project_health_status, $5
            FROM (SELECT $4::TEXT AS h) t
            RETURNING
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                author_id AS "author_id!: Uuid",
                content AS "content!",
                health_status::TEXT AS "health_status",
                progress_data,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            project_id,
            author_id,
            payload.content,
            health_str,
            payload.progress_data
        )
        .fetch_one(pool)
        .await?;

        Ok(ProjectUpdate {
            id: row.id,
            project_id: row.project_id,
            author_id: row.author_id,
            content: row.content,
            health_status: row.health_status.map(|s| ProjectHealthStatus::parse(&s)),
            progress_data: row.progress_data,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Update an existing project update (author only)
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        author_id: Uuid,
        payload: &UpdateProjectUpdate,
    ) -> Result<Option<ProjectUpdate>, PulseError> {
        let health_str = payload.health_status.as_ref().map(|h| h.as_str());

        let row = sqlx::query!(
            r#"
            UPDATE project_updates
            SET
                content = COALESCE($3, content),
                health_status = CASE WHEN $4::TEXT IS NOT NULL THEN $4::project_health_status ELSE health_status END,
                progress_data = COALESCE($5, progress_data),
                updated_at = NOW()
            WHERE id = $1 AND author_id = $2
            RETURNING
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                author_id AS "author_id!: Uuid",
                content AS "content!",
                health_status::TEXT AS "health_status",
                progress_data,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            author_id,
            payload.content,
            health_str,
            payload.progress_data
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| ProjectUpdate {
            id: r.id,
            project_id: r.project_id,
            author_id: r.author_id,
            content: r.content,
            health_status: r.health_status.map(|s| ProjectHealthStatus::parse(&s)),
            progress_data: r.progress_data,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Delete a project update (author only)
    pub async fn delete(pool: &PgPool, id: Uuid, author_id: Uuid) -> Result<bool, PulseError> {
        let result = sqlx::query!(
            "DELETE FROM project_updates WHERE id = $1 AND author_id = $2",
            id,
            author_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    // ========================================================================
    // Reactions
    // ========================================================================

    /// Get reactions for an update
    pub async fn get_reactions(
        pool: &PgPool,
        update_id: Uuid,
    ) -> Result<Vec<ReactionCount>, PulseError> {
        let rows = sqlx::query!(
            r#"
            SELECT emoji, COUNT(*) AS "reaction_count!: i64"
            FROM update_reactions
            WHERE update_id = $1
            GROUP BY emoji
            ORDER BY COUNT(*) DESC
            "#,
            update_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ReactionCount {
                emoji: r.emoji,
                count: r.reaction_count,
            })
            .collect())
    }

    /// Get user's reactions for an update
    pub async fn get_user_reactions(
        pool: &PgPool,
        update_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<String>, PulseError> {
        let rows = sqlx::query_scalar!(
            "SELECT emoji FROM update_reactions WHERE update_id = $1 AND user_id = $2",
            update_id,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows)
    }

    /// Add a reaction to an update
    pub async fn add_reaction(
        pool: &PgPool,
        update_id: Uuid,
        user_id: Uuid,
        emoji: &str,
    ) -> Result<UpdateReaction, PulseError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO update_reactions (update_id, user_id, emoji)
            VALUES ($1, $2, $3)
            ON CONFLICT (update_id, user_id, emoji) DO UPDATE SET created_at = update_reactions.created_at
            RETURNING
                id AS "id!: Uuid",
                update_id AS "update_id!: Uuid",
                user_id AS "user_id!: Uuid",
                emoji AS "emoji!",
                created_at AS "created_at!: DateTime<Utc>"
            "#,
            update_id,
            user_id,
            emoji
        )
        .fetch_one(pool)
        .await?;

        Ok(UpdateReaction {
            id: row.id,
            update_id: row.update_id,
            user_id: row.user_id,
            emoji: row.emoji,
            created_at: row.created_at,
        })
    }

    /// Remove a reaction from an update
    pub async fn remove_reaction(
        pool: &PgPool,
        update_id: Uuid,
        user_id: Uuid,
        emoji: &str,
    ) -> Result<bool, PulseError> {
        let result = sqlx::query!(
            "DELETE FROM update_reactions WHERE update_id = $1 AND user_id = $2 AND emoji = $3",
            update_id,
            user_id,
            emoji
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    // ========================================================================
    // Summary & Read Status
    // ========================================================================

    /// Get summary counts for pulse notifications (for badge display)
    pub async fn get_summary(pool: &PgPool, user_id: Uuid) -> Result<PulseSummary, PulseError> {
        let row = sqlx::query!(
            r#"
            SELECT
                COUNT(*) AS "total_count!",
                COUNT(*) FILTER (WHERE is_read = false) AS "unread_count!"
            FROM project_updates
            WHERE author_id = $1
            "#,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(PulseSummary {
            total_count: row.total_count,
            unread_count: row.unread_count,
        })
    }

    /// Mark a single update as read
    pub async fn mark_as_read(
        pool: &PgPool,
        update_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, PulseError> {
        let result = sqlx::query(
            "UPDATE project_updates SET is_read = true WHERE id = $1 AND author_id = $2",
        )
        .bind(update_id)
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Mark all updates as read for a user
    pub async fn mark_all_as_read(pool: &PgPool, user_id: Uuid) -> Result<i64, PulseError> {
        let result = sqlx::query(
            "UPDATE project_updates SET is_read = true WHERE author_id = $1 AND is_read = false",
        )
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() as i64)
    }
}
