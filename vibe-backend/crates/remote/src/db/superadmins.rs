use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, query_as};
use uuid::Uuid;

use super::identity_errors::IdentityError;

/// Superadmin record for app-level administrators
/// who can approve/reject registration requests and access /superadmin/* routes
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Superadmin {
    pub id: Uuid,
    pub user_id: String, // Clerk user ID
    pub email: String,
    pub name: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct SuperadminRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> SuperadminRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Check if a user (by Clerk user_id) is an active superadmin
    pub async fn is_superadmin(&self, user_id: &str) -> Result<bool, IdentityError> {
        let result = sqlx::query_scalar!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM superadmins
                WHERE user_id = $1 AND is_active = true
            ) AS "exists!"
            "#,
            user_id
        )
        .fetch_one(self.pool)
        .await?;

        Ok(result)
    }

    /// Find a superadmin by Clerk user_id
    pub async fn find_by_user_id(
        &self,
        user_id: &str,
    ) -> Result<Option<Superadmin>, IdentityError> {
        let superadmin = query_as!(
            Superadmin,
            r#"
            SELECT
                id           AS "id!: Uuid",
                user_id      AS "user_id!",
                email        AS "email!",
                name         AS "name?",
                is_active    AS "is_active!",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            FROM superadmins
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(superadmin)
    }

    /// Find a superadmin by email
    pub async fn find_by_email(&self, email: &str) -> Result<Option<Superadmin>, IdentityError> {
        let superadmin = query_as!(
            Superadmin,
            r#"
            SELECT
                id           AS "id!: Uuid",
                user_id      AS "user_id!",
                email        AS "email!",
                name         AS "name?",
                is_active    AS "is_active!",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            FROM superadmins
            WHERE email = $1
            "#,
            email
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(superadmin)
    }

    /// List all superadmins (active and inactive)
    pub async fn list_all(&self) -> Result<Vec<Superadmin>, IdentityError> {
        let superadmins = query_as!(
            Superadmin,
            r#"
            SELECT
                id           AS "id!: Uuid",
                user_id      AS "user_id!",
                email        AS "email!",
                name         AS "name?",
                is_active    AS "is_active!",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            FROM superadmins
            ORDER BY created_at ASC
            "#
        )
        .fetch_all(self.pool)
        .await?;

        Ok(superadmins)
    }
}
