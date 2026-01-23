//! AI provider keys database operations
//!
//! Manages API keys for AI providers (Anthropic, Google, OpenAI) per workspace.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

/// Information about an AI provider key (without the actual key)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderKeyInfo {
    pub id: Uuid,
    pub provider: String,
    pub key_prefix: String,
    pub is_valid: bool,
    pub last_validated_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Request to create/update an AI provider key
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertAiProviderKeyRequest {
    pub provider: String,
    pub api_key: String,
}

/// Repository for AI provider key operations
pub struct AiProviderKeyRepository;

impl AiProviderKeyRepository {
    /// List all AI provider keys for a workspace (without actual key values)
    pub async fn list_by_workspace(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Vec<AiProviderKeyInfo>, sqlx::Error> {
        sqlx::query_as!(
            AiProviderKeyInfo,
            r#"
            SELECT
                id,
                provider,
                key_prefix,
                is_valid,
                last_validated_at,
                created_at
            FROM ai_provider_keys
            WHERE tenant_workspace_id = $1
            ORDER BY created_at DESC
            "#,
            workspace_id
        )
        .fetch_all(pool)
        .await
    }

    /// Upsert (create or update) an AI provider key
    pub async fn upsert(
        pool: &PgPool,
        workspace_id: Uuid,
        request: &UpsertAiProviderKeyRequest,
    ) -> Result<AiProviderKeyInfo, sqlx::Error> {
        // Extract key prefix for display (first chars before masking)
        let key_prefix = Self::extract_key_prefix(&request.api_key);

        // For now, store the key as-is (TODO: add encryption layer)
        let encrypted_key = &request.api_key;

        sqlx::query_as!(
            AiProviderKeyInfo,
            r#"
            INSERT INTO ai_provider_keys (tenant_workspace_id, provider, encrypted_key, key_prefix, is_valid)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (tenant_workspace_id, provider)
            DO UPDATE SET
                encrypted_key = EXCLUDED.encrypted_key,
                key_prefix = EXCLUDED.key_prefix,
                is_valid = true,
                last_validated_at = NULL,
                updated_at = NOW()
            RETURNING
                id,
                provider,
                key_prefix,
                is_valid,
                last_validated_at,
                created_at
            "#,
            workspace_id,
            request.provider,
            encrypted_key,
            key_prefix
        )
        .fetch_one(pool)
        .await
    }

    /// Delete an AI provider key
    pub async fn delete(
        pool: &PgPool,
        workspace_id: Uuid,
        provider: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"
            DELETE FROM ai_provider_keys
            WHERE tenant_workspace_id = $1 AND provider = $2
            "#,
            workspace_id,
            provider
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Get the decrypted API key for a provider (for testing/use)
    pub async fn get_key(
        pool: &PgPool,
        workspace_id: Uuid,
        provider: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"
            SELECT encrypted_key
            FROM ai_provider_keys
            WHERE tenant_workspace_id = $1 AND provider = $2
            "#,
            workspace_id,
            provider
        )
        .fetch_optional(pool)
        .await?;

        // TODO: decrypt the key
        Ok(result)
    }

    /// Update the validation status of a key
    pub async fn update_validation_status(
        pool: &PgPool,
        workspace_id: Uuid,
        provider: &str,
        is_valid: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE ai_provider_keys
            SET is_valid = $3, last_validated_at = NOW(), updated_at = NOW()
            WHERE tenant_workspace_id = $1 AND provider = $2
            "#,
            workspace_id,
            provider,
            is_valid
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Extract key prefix for display (mask most of the key)
    fn extract_key_prefix(key: &str) -> String {
        // Show first few characters based on provider key patterns
        let prefix_len = if key.starts_with("sk-ant-") {
            10 // Anthropic: sk-ant-XXX...
        } else if key.starts_with("AIza") {
            8 // Google: AIzaXXXX...
        } else if key.starts_with("sk-") {
            6 // OpenAI: sk-XXX...
        } else {
            6 // Default
        };

        let prefix: String = key.chars().take(prefix_len).collect();
        format!("{}...", prefix)
    }
}
