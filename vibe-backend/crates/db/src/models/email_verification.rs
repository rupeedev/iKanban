use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// Email verification record (IKA-189)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct EmailVerification {
    pub id: Uuid,
    pub user_id: String,
    pub email: String,
    /// Note: token_hash is not exposed in the API response
    #[serde(skip_serializing)]
    pub token_hash: String,
    #[ts(type = "Date")]
    pub expires_at: DateTime<Utc>,
    #[ts(type = "Date | null")]
    pub verified_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Request to send a verification email
#[derive(Debug, Deserialize, TS)]
pub struct SendVerificationRequest {
    pub email: String,
}

/// Response containing the verification token (only sent via email)
#[derive(Debug, Serialize)]
pub struct VerificationTokenResponse {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct EmailVerificationRow {
    id: Uuid,
    user_id: String,
    email: String,
    token_hash: String,
    expires_at: DateTime<Utc>,
    verified_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

impl From<EmailVerificationRow> for EmailVerification {
    fn from(row: EmailVerificationRow) -> Self {
        Self {
            id: row.id,
            user_id: row.user_id,
            email: row.email,
            token_hash: row.token_hash,
            expires_at: row.expires_at,
            verified_at: row.verified_at,
            created_at: row.created_at,
        }
    }
}

impl EmailVerification {
    /// Hash a verification token
    pub fn hash_token(token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Generate a new verification token (returns unhashed token for sending via email)
    pub fn generate_token() -> String {
        // Generate a random UUID-based token
        format!("vk_{}", Uuid::new_v4().to_string().replace("-", ""))
    }

    /// Create a new email verification record
    /// Returns the verification record and the unhashed token (to send via email)
    pub async fn create(
        pool: &PgPool,
        user_id: &str,
        email: &str,
    ) -> Result<(Self, String), sqlx::Error> {
        // Invalidate any existing verifications for this user/email
        sqlx::query!(
            r#"UPDATE email_verifications
               SET verified_at = NULL
               WHERE user_id = $1 AND email = $2 AND verified_at IS NULL"#,
            user_id,
            email
        )
        .execute(pool)
        .await?;

        let id = Uuid::new_v4();
        let token = Self::generate_token();
        let token_hash = Self::hash_token(&token);
        let expires_at = Utc::now() + Duration::hours(24);

        let row = sqlx::query_as!(
            EmailVerificationRow,
            r#"INSERT INTO email_verifications
               (id, user_id, email, token_hash, expires_at)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id as "id!: Uuid",
                         user_id,
                         email,
                         token_hash,
                         expires_at as "expires_at!: DateTime<Utc>",
                         verified_at as "verified_at: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            user_id,
            email,
            token_hash,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok((row.into(), token))
    }

    /// Verify a token and mark the email as verified
    pub async fn verify_token(pool: &PgPool, token: &str) -> Result<Option<Self>, sqlx::Error> {
        let token_hash = Self::hash_token(token);

        let row = sqlx::query_as!(
            EmailVerificationRow,
            r#"UPDATE email_verifications
               SET verified_at = NOW()
               WHERE token_hash = $1
                 AND expires_at > NOW()
                 AND verified_at IS NULL
               RETURNING id as "id!: Uuid",
                         user_id,
                         email,
                         token_hash,
                         expires_at as "expires_at!: DateTime<Utc>",
                         verified_at as "verified_at: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>""#,
            token_hash
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find pending verification for a user
    pub async fn find_pending_by_user(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            EmailVerificationRow,
            r#"SELECT id as "id!: Uuid",
                      user_id,
                      email,
                      token_hash,
                      expires_at as "expires_at!: DateTime<Utc>",
                      verified_at as "verified_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>"
               FROM email_verifications
               WHERE user_id = $1
                 AND verified_at IS NULL
                 AND expires_at > NOW()
               ORDER BY created_at DESC
               LIMIT 1"#,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Check if a user has a verified email
    pub async fn is_email_verified(pool: &PgPool, user_id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(
                SELECT 1 FROM email_verifications
                WHERE user_id = $1 AND verified_at IS NOT NULL
               ) as "exists!""#,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }

    /// Get the verified email for a user
    pub async fn get_verified_email(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT email
               FROM email_verifications
               WHERE user_id = $1 AND verified_at IS NOT NULL
               ORDER BY verified_at DESC
               LIMIT 1"#,
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(result)
    }

    /// Delete expired unverified records (cleanup job)
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"DELETE FROM email_verifications
               WHERE expires_at < NOW() AND verified_at IS NULL"#
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }
}
