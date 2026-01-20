use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// A superadmin is an app-level administrator who can approve/reject registrations
/// and access /superadmin/* routes. This is different from workspace owners or admins.
#[derive(Debug, Clone, Serialize, Deserialize, TS, FromRow)]
pub struct Superadmin {
    pub id: Uuid,
    pub user_id: String, // Clerk user ID
    pub email: String,
    pub name: Option<String>,
    pub is_active: bool,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Request to create a new superadmin
#[derive(Debug, Deserialize)]
pub struct CreateSuperadmin {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
}

/// Superadmin info for API responses (without sensitive internal data)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SuperadminInfo {
    pub id: Uuid,
    pub email: String,
    pub name: Option<String>,
    pub is_active: bool,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

impl From<Superadmin> for SuperadminInfo {
    fn from(s: Superadmin) -> Self {
        Self {
            id: s.id,
            email: s.email,
            name: s.name,
            is_active: s.is_active,
            created_at: s.created_at,
        }
    }
}

impl Superadmin {
    /// Check if a user is a superadmin by their Clerk user ID
    pub async fn is_superadmin(pool: &PgPool, user_id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(
                SELECT 1 FROM superadmins
                WHERE user_id = $1 AND is_active = true
            ) as "exists!: bool""#,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }

    /// Find a superadmin by their Clerk user ID
    pub async fn find_by_user_id(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Superadmin,
            r#"SELECT id, user_id, email, name, is_active,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM superadmins
               WHERE user_id = $1"#,
            user_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find a superadmin by their email
    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Superadmin,
            r#"SELECT id, user_id, email, name, is_active,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM superadmins
               WHERE email = $1"#,
            email
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new superadmin
    pub async fn create(pool: &PgPool, data: &CreateSuperadmin) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Superadmin,
            r#"INSERT INTO superadmins (user_id, email, name)
               VALUES ($1, $2, $3)
               RETURNING id, user_id, email, name, is_active,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            data.user_id,
            data.email,
            data.name
        )
        .fetch_one(pool)
        .await
    }

    /// List all superadmins (optionally filter by active status)
    pub async fn list(
        pool: &PgPool,
        active_only: bool,
    ) -> Result<Vec<SuperadminInfo>, sqlx::Error> {
        let superadmins = if active_only {
            sqlx::query_as!(
                Superadmin,
                r#"SELECT id, user_id, email, name, is_active,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM superadmins
                   WHERE is_active = true
                   ORDER BY created_at ASC"#
            )
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as!(
                Superadmin,
                r#"SELECT id, user_id, email, name, is_active,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM superadmins
                   ORDER BY created_at ASC"#
            )
            .fetch_all(pool)
            .await?
        };

        Ok(superadmins.into_iter().map(|s| s.into()).collect())
    }

    /// Deactivate a superadmin (soft delete)
    pub async fn deactivate(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE superadmins
               SET is_active = false, updated_at = NOW()
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Reactivate a superadmin
    pub async fn reactivate(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"UPDATE superadmins
               SET is_active = true, updated_at = NOW()
               WHERE id = $1"#,
            id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete a superadmin permanently (use with caution)
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM superadmins WHERE id = $1", id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}
