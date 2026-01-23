//! API keys database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// API key info returned to users (without the secret)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyInfo {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub scopes: Vec<String>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_revoked: bool,
    pub created_at: DateTime<Utc>,
}

/// API key with the full secret (only returned on creation)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyWithSecret {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub key: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Request to create a new API key
#[derive(Debug, Clone, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
    pub expires_in_days: Option<i64>,
}

#[derive(Debug, Error)]
pub enum ApiKeyError {
    #[error("API key not found")]
    NotFound,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ApiKeyRepository;

impl ApiKeyRepository {
    /// Generate a new API key with prefix "vk_"
    fn generate_key() -> (String, String, String) {
        let random_bytes: [u8; 32] = rand::random();
        let key_body = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            random_bytes,
        );
        let full_key = format!("vk_{}", key_body);
        let prefix = full_key.chars().take(12).collect::<String>();
        let hash = Self::hash_key(&full_key);
        (full_key, prefix, hash)
    }

    /// Hash an API key using SHA-256
    fn hash_key(key: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(key.as_bytes());
        let result = hasher.finalize();
        hex::encode(result)
    }

    /// List all API keys for a user
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Vec<ApiKeyInfo>, ApiKeyError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id,
                name,
                key_prefix,
                scopes,
                last_used_at,
                expires_at,
                is_revoked,
                created_at
            FROM api_keys
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ApiKeyInfo {
                id: r.id,
                name: r.name,
                key_prefix: r.key_prefix,
                scopes: r.scopes.clone(),
                last_used_at: r.last_used_at,
                expires_at: r.expires_at,
                is_revoked: r.is_revoked,
                created_at: r.created_at,
            })
            .collect())
    }

    /// Create a new API key
    pub async fn create(
        pool: &PgPool,
        user_id: &str,
        request: &CreateApiKeyRequest,
    ) -> Result<ApiKeyWithSecret, ApiKeyError> {
        let (full_key, prefix, hash) = Self::generate_key();

        let expires_at = request
            .expires_in_days
            .map(|days| Utc::now() + chrono::Duration::days(days));

        let row = sqlx::query!(
            r#"
            INSERT INTO api_keys (user_id, name, key_prefix, key_hash, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, key_prefix, expires_at, created_at
            "#,
            user_id,
            request.name,
            prefix,
            hash,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(ApiKeyWithSecret {
            id: row.id,
            name: row.name,
            key_prefix: row.key_prefix,
            key: full_key,
            expires_at: row.expires_at,
            created_at: row.created_at,
        })
    }

    /// Revoke an API key (soft delete - keeps the record but marks as revoked)
    pub async fn revoke(pool: &PgPool, key_id: Uuid, user_id: &str) -> Result<bool, ApiKeyError> {
        let result = sqlx::query!(
            r#"
            UPDATE api_keys
            SET is_revoked = TRUE, updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND is_revoked = FALSE
            "#,
            key_id,
            user_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete an API key permanently
    pub async fn delete(pool: &PgPool, key_id: Uuid, user_id: &str) -> Result<bool, ApiKeyError> {
        let result = sqlx::query!(
            "DELETE FROM api_keys WHERE id = $1 AND user_id = $2",
            key_id,
            user_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Validate an API key and return the user_id if valid
    pub async fn validate_key(pool: &PgPool, key: &str) -> Result<Option<String>, ApiKeyError> {
        let hash = Self::hash_key(key);

        let row = sqlx::query!(
            r#"
            SELECT user_id
            FROM api_keys
            WHERE key_hash = $1
              AND is_revoked = FALSE
              AND (expires_at IS NULL OR expires_at > NOW())
            "#,
            hash
        )
        .fetch_optional(pool)
        .await?;

        if row.is_some() {
            // Update last_used_at
            sqlx::query!(
                "UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1",
                hash
            )
            .execute(pool)
            .await?;
        }

        Ok(row.map(|r| r.user_id))
    }
}
