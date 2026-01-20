use std::str::FromStr;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// Trust level for users (IKA-187)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "snake_case")]
pub enum TrustLevel {
    /// New user - default level
    #[default]
    New = 0,
    /// Basic - email verified + 7 days
    Basic = 1,
    /// Standard - 30 days + 5 tasks + no abuse signals
    Standard = 2,
    /// Trusted - 90 days + 20 tasks + 1 invite
    Trusted = 3,
    /// Verified - manual admin approval
    Verified = 4,
}

impl From<i32> for TrustLevel {
    fn from(value: i32) -> Self {
        match value {
            0 => Self::New,
            1 => Self::Basic,
            2 => Self::Standard,
            3 => Self::Trusted,
            4 => Self::Verified,
            _ => Self::New,
        }
    }
}

impl From<TrustLevel> for i32 {
    fn from(level: TrustLevel) -> Self {
        level as i32
    }
}

/// User trust profile (IKA-186)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UserTrustProfile {
    pub id: Uuid,
    pub user_id: String,
    pub trust_level: TrustLevel,
    pub email_verified: bool,
    #[ts(type = "Date | null")]
    pub email_verified_at: Option<DateTime<Utc>>,
    pub account_age_days: i32,
    pub total_tasks_created: i32,
    pub members_invited: i32,
    pub is_flagged: bool,
    pub flagged_reason: Option<String>,
    #[ts(type = "Date | null")]
    pub flagged_at: Option<DateTime<Utc>>,
    pub flagged_by: Option<String>,
    pub is_banned: bool,
    #[ts(type = "Date | null")]
    pub banned_at: Option<DateTime<Utc>>,
    pub banned_by: Option<String>,
    pub ban_reason: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Request to flag a user
#[derive(Debug, Deserialize, TS)]
pub struct FlagUserRequest {
    pub reason: String,
}

/// Request to ban a user
#[derive(Debug, Deserialize, TS)]
pub struct BanUserRequest {
    pub reason: String,
}

// Helper struct for raw DB rows
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
    /// Find a trust profile by user ID
    pub async fn find_by_user_id(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
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
               WHERE user_id = $1"#,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create or get existing trust profile for a user
    pub async fn get_or_create(pool: &PgPool, user_id: &str) -> Result<Self, sqlx::Error> {
        // First try to find existing
        if let Some(profile) = Self::find_by_user_id(pool, user_id).await? {
            return Ok(profile);
        }

        // Create new profile
        let id = Uuid::new_v4();
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"INSERT INTO user_trust_profiles (id, user_id)
               VALUES ($1, $2)
               ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
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
            id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Mark email as verified
    pub async fn mark_email_verified(pool: &PgPool, user_id: &str) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"UPDATE user_trust_profiles
               SET email_verified = true,
                   email_verified_at = NOW(),
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

    /// Update trust level (IKA-187)
    pub async fn update_trust_level(
        pool: &PgPool,
        user_id: &str,
        level: TrustLevel,
    ) -> Result<Self, sqlx::Error> {
        let level_i32: i32 = level.into();
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"UPDATE user_trust_profiles
               SET trust_level = $2, updated_at = NOW()
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
            level_i32
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

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

    /// Increment task count
    pub async fn increment_tasks_created(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"UPDATE user_trust_profiles
               SET total_tasks_created = total_tasks_created + 1,
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

    /// Increment members invited count
    pub async fn increment_members_invited(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            UserTrustProfileRow,
            r#"UPDATE user_trust_profiles
               SET members_invited = members_invited + 1,
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
}
