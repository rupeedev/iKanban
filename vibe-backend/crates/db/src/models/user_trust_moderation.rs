//! User trust profile moderation operations (IKA-190)
//!
//! Handles flag/ban operations for user moderation.

use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::user_trust_profile::{TrustLevel, UserTrustProfile};

// Re-use the row struct for DB mapping
#[derive(FromRow)]
struct UserTrustProfileRow {
    id: Uuid,
    user_id: String,
    trust_level: i32,
    email_verified: bool,
    email_verified_at: Option<DateTime<Utc>>,
    account_age_days: i32,
    total_tasks_created: i32,
    members_invited: i32,
    is_flagged: bool,
    flagged_reason: Option<String>,
    flagged_at: Option<DateTime<Utc>>,
    flagged_by: Option<String>,
    is_banned: bool,
    banned_at: Option<DateTime<Utc>>,
    banned_by: Option<String>,
    ban_reason: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<UserTrustProfileRow> for UserTrustProfile {
    fn from(row: UserTrustProfileRow) -> Self {
        Self {
            id: row.id,
            user_id: row.user_id,
            trust_level: TrustLevel::from(row.trust_level),
            email_verified: row.email_verified,
            email_verified_at: row.email_verified_at,
            account_age_days: row.account_age_days,
            total_tasks_created: row.total_tasks_created,
            members_invited: row.members_invited,
            is_flagged: row.is_flagged,
            flagged_reason: row.flagged_reason,
            flagged_at: row.flagged_at,
            flagged_by: row.flagged_by,
            is_banned: row.is_banned,
            banned_at: row.banned_at,
            banned_by: row.banned_by,
            ban_reason: row.ban_reason,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl UserTrustProfile {
    /// Flag a user (IKA-190)
    pub async fn flag_user(
        pool: &PgPool,
        user_id: &str,
        reason: &str,
        flagged_by: &str,
    ) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"UPDATE user_trust_profiles
               SET is_flagged = true,
                   flagged_reason = $2,
                   flagged_at = NOW(),
                   flagged_by = $3,
                   updated_at = NOW()
               WHERE user_id = $1
               RETURNING id as "id!: Uuid",
                         user_id,
                         trust_level,
                         email_verified,
                         email_verified_at as "email_verified_at: DateTime<Utc>",
                         account_age_days,
                         total_tasks_created,
                         members_invited,
                         is_flagged,
                         flagged_reason,
                         flagged_at as "flagged_at: DateTime<Utc>",
                         flagged_by,
                         is_banned,
                         banned_at as "banned_at: DateTime<Utc>",
                         banned_by,
                         ban_reason,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            user_id,
            reason,
            flagged_by
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Unflag a user
    pub async fn unflag_user(pool: &PgPool, user_id: &str) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"UPDATE user_trust_profiles
               SET is_flagged = false,
                   flagged_reason = NULL,
                   flagged_at = NULL,
                   flagged_by = NULL,
                   updated_at = NOW()
               WHERE user_id = $1
               RETURNING id as "id!: Uuid",
                         user_id,
                         trust_level,
                         email_verified,
                         email_verified_at as "email_verified_at: DateTime<Utc>",
                         account_age_days,
                         total_tasks_created,
                         members_invited,
                         is_flagged,
                         flagged_reason,
                         flagged_at as "flagged_at: DateTime<Utc>",
                         flagged_by,
                         is_banned,
                         banned_at as "banned_at: DateTime<Utc>",
                         banned_by,
                         ban_reason,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Ban a user
    pub async fn ban_user(
        pool: &PgPool,
        user_id: &str,
        reason: &str,
        banned_by: &str,
    ) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"UPDATE user_trust_profiles
               SET is_banned = true,
                   ban_reason = $2,
                   banned_at = NOW(),
                   banned_by = $3,
                   updated_at = NOW()
               WHERE user_id = $1
               RETURNING id as "id!: Uuid",
                         user_id,
                         trust_level,
                         email_verified,
                         email_verified_at as "email_verified_at: DateTime<Utc>",
                         account_age_days,
                         total_tasks_created,
                         members_invited,
                         is_flagged,
                         flagged_reason,
                         flagged_at as "flagged_at: DateTime<Utc>",
                         flagged_by,
                         is_banned,
                         banned_at as "banned_at: DateTime<Utc>",
                         banned_by,
                         ban_reason,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            user_id,
            reason,
            banned_by
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// List all flagged users (IKA-190: Admin dashboard)
    pub async fn list_flagged(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            UserTrustProfileRow,
            r#"SELECT id as "id!: Uuid",
                      user_id,
                      trust_level,
                      email_verified,
                      email_verified_at as "email_verified_at: DateTime<Utc>",
                      account_age_days,
                      total_tasks_created,
                      members_invited,
                      is_flagged,
                      flagged_reason,
                      flagged_at as "flagged_at: DateTime<Utc>",
                      flagged_by,
                      is_banned,
                      banned_at as "banned_at: DateTime<Utc>",
                      banned_by,
                      ban_reason,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM user_trust_profiles
               WHERE is_flagged = true
               ORDER BY flagged_at DESC"#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
}
