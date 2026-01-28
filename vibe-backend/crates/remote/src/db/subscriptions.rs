//! User subscription database operations for Pulse digest preferences

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// Digest frequency options
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum DigestFrequency {
    #[default]
    Daily,
    Weekly,
    Never,
}

impl DigestFrequency {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Never => "never",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "daily" => Self::Daily,
            "weekly" => Self::Weekly,
            "never" => Self::Never,
            _ => Self::Daily,
        }
    }
}

/// A user subscription to a project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSubscription {
    pub id: Uuid,
    pub user_id: Uuid,
    pub project_id: Option<Uuid>,
    pub tenant_workspace_id: Option<Uuid>,
    pub digest_frequency: DigestFrequency,
    pub subscribed_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data to create or update a subscription
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertSubscription {
    pub digest_frequency: DigestFrequency,
}

/// User's subscription settings (global + per-project)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionSettings {
    pub global_frequency: DigestFrequency,
    pub project_subscriptions: Vec<ProjectSubscription>,
}

/// Summary of a project subscription
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSubscription {
    pub project_id: Uuid,
    pub project_name: String,
    pub subscribed_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum SubscriptionError {
    #[error("subscription not found")]
    NotFound,
    #[error("already subscribed")]
    AlreadySubscribed,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct SubscriptionRepository;

impl SubscriptionRepository {
    /// Get user's global subscription settings
    pub async fn get_global_settings(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<UserSubscription>, SubscriptionError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                project_id AS "project_id: Uuid",
                tenant_workspace_id AS "tenant_workspace_id: Uuid",
                digest_frequency::TEXT AS "digest_frequency!",
                subscribed_at AS "subscribed_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM user_subscriptions
            WHERE user_id = $1 AND project_id IS NULL
            "#,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| UserSubscription {
            id: r.id,
            user_id: r.user_id,
            project_id: r.project_id,
            tenant_workspace_id: r.tenant_workspace_id,
            digest_frequency: DigestFrequency::parse(&r.digest_frequency),
            subscribed_at: r.subscribed_at,
            updated_at: r.updated_at,
        }))
    }

    /// Set or update user's global digest frequency
    pub async fn upsert_global_settings(
        pool: &PgPool,
        user_id: Uuid,
        frequency: &DigestFrequency,
    ) -> Result<UserSubscription, SubscriptionError> {
        let freq_str = frequency.as_str();
        let row = sqlx::query!(
            r#"
            INSERT INTO user_subscriptions (user_id, project_id, digest_frequency)
            SELECT $1, NULL, t.f::digest_frequency
            FROM (SELECT $2::TEXT AS f) t
            ON CONFLICT (user_id, project_id) DO UPDATE SET
                digest_frequency = EXCLUDED.digest_frequency,
                updated_at = NOW()
            RETURNING
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                project_id AS "project_id: Uuid",
                tenant_workspace_id AS "tenant_workspace_id: Uuid",
                digest_frequency::TEXT AS "digest_frequency!",
                subscribed_at AS "subscribed_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            user_id,
            freq_str
        )
        .fetch_one(pool)
        .await?;

        Ok(UserSubscription {
            id: row.id,
            user_id: row.user_id,
            project_id: row.project_id,
            tenant_workspace_id: row.tenant_workspace_id,
            digest_frequency: DigestFrequency::parse(&row.digest_frequency),
            subscribed_at: row.subscribed_at,
            updated_at: row.updated_at,
        })
    }

    /// List all project subscriptions for a user
    pub async fn list_project_subscriptions(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<ProjectSubscription>, SubscriptionError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                us.project_id AS "project_id!: Uuid",
                p.name AS "project_name!",
                us.subscribed_at AS "subscribed_at!: DateTime<Utc>"
            FROM user_subscriptions us
            JOIN projects p ON p.id = us.project_id
            WHERE us.user_id = $1 AND us.project_id IS NOT NULL
            ORDER BY us.subscribed_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ProjectSubscription {
                project_id: r.project_id,
                project_name: r.project_name,
                subscribed_at: r.subscribed_at,
            })
            .collect())
    }

    /// Subscribe to a project
    pub async fn subscribe_to_project(
        pool: &PgPool,
        user_id: Uuid,
        project_id: Uuid,
    ) -> Result<UserSubscription, SubscriptionError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO user_subscriptions (user_id, project_id, digest_frequency)
            VALUES ($1, $2, 'daily')
            ON CONFLICT (user_id, project_id) DO UPDATE SET updated_at = NOW()
            RETURNING
                id AS "id!: Uuid",
                user_id AS "user_id!: Uuid",
                project_id AS "project_id: Uuid",
                tenant_workspace_id AS "tenant_workspace_id: Uuid",
                digest_frequency::TEXT AS "digest_frequency!",
                subscribed_at AS "subscribed_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            user_id,
            project_id
        )
        .fetch_one(pool)
        .await?;

        Ok(UserSubscription {
            id: row.id,
            user_id: row.user_id,
            project_id: row.project_id,
            tenant_workspace_id: row.tenant_workspace_id,
            digest_frequency: DigestFrequency::parse(&row.digest_frequency),
            subscribed_at: row.subscribed_at,
            updated_at: row.updated_at,
        })
    }

    /// Unsubscribe from a project
    pub async fn unsubscribe_from_project(
        pool: &PgPool,
        user_id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, SubscriptionError> {
        let result = sqlx::query!(
            "DELETE FROM user_subscriptions WHERE user_id = $1 AND project_id = $2",
            user_id,
            project_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Check if user is subscribed to a project
    pub async fn is_subscribed(
        pool: &PgPool,
        user_id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, SubscriptionError> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(SELECT 1 FROM user_subscriptions WHERE user_id = $1 AND project_id = $2) AS "exists!: bool""#,
            user_id,
            project_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }

    /// Get full subscription settings for a user
    pub async fn get_settings(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<SubscriptionSettings, SubscriptionError> {
        let global = Self::get_global_settings(pool, user_id).await?;
        let projects = Self::list_project_subscriptions(pool, user_id).await?;

        Ok(SubscriptionSettings {
            global_frequency: global
                .map(|s| s.digest_frequency)
                .unwrap_or(DigestFrequency::Daily),
            project_subscriptions: projects,
        })
    }
}
