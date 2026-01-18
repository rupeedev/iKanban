//! AI Provider API Keys model for storing Claude, Gemini, OpenAI API keys

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// AI providers supported
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Anthropic,
    Google,
    Openai,
}

impl std::fmt::Display for AiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiProvider::Anthropic => write!(f, "anthropic"),
            AiProvider::Google => write!(f, "google"),
            AiProvider::Openai => write!(f, "openai"),
        }
    }
}

impl std::str::FromStr for AiProvider {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "anthropic" | "claude" => Ok(AiProvider::Anthropic),
            "google" | "gemini" => Ok(AiProvider::Google),
            "openai" | "gpt" | "codex" => Ok(AiProvider::Openai),
            _ => Err(format!("Unknown AI provider: {}", s)),
        }
    }
}

/// An AI provider API key for Claude, Gemini, or OpenAI
#[derive(Debug, Clone)]
pub struct AiProviderKey {
    pub id: Uuid,
    pub tenant_workspace_id: Uuid,
    pub provider: String,
    pub key_prefix: String,
    pub encrypted_key: String,
    pub is_valid: bool,
    pub last_validated_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// AI provider key info for listing (masked key)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct AiProviderKeyInfo {
    pub id: Uuid,
    pub provider: String,
    pub key_prefix: String,
    pub is_valid: bool,
    #[ts(type = "Date | null")]
    pub last_validated_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

impl From<AiProviderKey> for AiProviderKeyInfo {
    fn from(key: AiProviderKey) -> Self {
        Self {
            id: key.id,
            provider: key.provider,
            key_prefix: key.key_prefix,
            is_valid: key.is_valid,
            last_validated_at: key.last_validated_at,
            created_at: key.created_at,
        }
    }
}

/// Request to create/update an AI provider key
#[derive(Debug, Deserialize, TS)]
pub struct UpsertAiProviderKey {
    pub provider: String,
    pub api_key: String,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct AiProviderKeyRow {
    id: Uuid,
    tenant_workspace_id: Uuid,
    provider: String,
    key_prefix: String,
    encrypted_key: String,
    is_valid: bool,
    last_validated_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<AiProviderKeyRow> for AiProviderKey {
    fn from(row: AiProviderKeyRow) -> Self {
        Self {
            id: row.id,
            tenant_workspace_id: row.tenant_workspace_id,
            provider: row.provider,
            key_prefix: row.key_prefix,
            encrypted_key: row.encrypted_key,
            is_valid: row.is_valid,
            last_validated_at: row.last_validated_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl AiProviderKey {
    /// Get the prefix from an API key (first 8 chars)
    fn get_prefix(key: &str) -> String {
        key.chars().take(8).collect()
    }

    /// Simple obfuscation for API key storage
    /// In production, use AES-GCM with proper key management
    fn obfuscate_key(key: &str) -> String {
        use base64::{Engine, engine::general_purpose::STANDARD};

        // Get encryption secret from env or use default (not secure for production!)
        let secret = std::env::var("ENCRYPTION_SECRET")
            .unwrap_or_else(|_| "default-secret-key-change-me!".to_string());

        // Simple XOR obfuscation with secret
        let obfuscated: Vec<u8> = key
            .bytes()
            .enumerate()
            .map(|(i, b)| b ^ secret.as_bytes()[i % secret.len()])
            .collect();

        STANDARD.encode(obfuscated)
    }

    /// Deobfuscate an API key
    fn deobfuscate_key(encrypted: &str) -> Result<String, String> {
        use base64::{Engine, engine::general_purpose::STANDARD};

        let secret = std::env::var("ENCRYPTION_SECRET")
            .unwrap_or_else(|_| "default-secret-key-change-me!".to_string());

        let decoded = STANDARD
            .decode(encrypted)
            .map_err(|e| format!("Failed to decode: {}", e))?;

        let key_bytes: Vec<u8> = decoded
            .iter()
            .enumerate()
            .map(|(i, &b)| b ^ secret.as_bytes()[i % secret.len()])
            .collect();

        String::from_utf8(key_bytes).map_err(|e| format!("Invalid UTF-8: {}", e))
    }

    /// Create or update an AI provider key
    pub async fn upsert(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
        data: &UpsertAiProviderKey,
    ) -> Result<AiProviderKeyInfo, sqlx::Error> {
        let key_prefix = Self::get_prefix(&data.api_key);
        let encrypted_key = Self::obfuscate_key(&data.api_key);

        let row: AiProviderKeyRow = sqlx::query_as(
            r#"INSERT INTO ai_provider_keys (tenant_workspace_id, provider, key_prefix, encrypted_key)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (tenant_workspace_id, provider)
               DO UPDATE SET
                   key_prefix = EXCLUDED.key_prefix,
                   encrypted_key = EXCLUDED.encrypted_key,
                   is_valid = true,
                   last_validated_at = NULL,
                   updated_at = NOW()
               RETURNING id, tenant_workspace_id, provider, key_prefix, encrypted_key,
                         is_valid, last_validated_at, created_at, updated_at"#,
        )
        .bind(tenant_workspace_id)
        .bind(data.provider.to_lowercase())
        .bind(&key_prefix)
        .bind(&encrypted_key)
        .fetch_one(pool)
        .await?;

        Ok(AiProviderKey::from(row).into())
    }

    /// Get the decrypted API key for a provider
    pub async fn get_key(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
        provider: &str,
    ) -> Result<Option<String>, sqlx::Error> {
        let row: Option<AiProviderKeyRow> = sqlx::query_as(
            r#"SELECT id, tenant_workspace_id, provider, key_prefix, encrypted_key,
                      is_valid, last_validated_at, created_at, updated_at
               FROM ai_provider_keys
               WHERE tenant_workspace_id = $1 AND provider = $2"#,
        )
        .bind(tenant_workspace_id)
        .bind(provider.to_lowercase())
        .fetch_optional(pool)
        .await?;

        if let Some(row) = row {
            match Self::deobfuscate_key(&row.encrypted_key) {
                Ok(key) => Ok(Some(key)),
                Err(_) => Ok(None),
            }
        } else {
            Ok(None)
        }
    }

    /// List all configured AI provider keys for a tenant workspace
    pub async fn list(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
    ) -> Result<Vec<AiProviderKeyInfo>, sqlx::Error> {
        let rows: Vec<AiProviderKeyRow> = sqlx::query_as(
            r#"SELECT id, tenant_workspace_id, provider, key_prefix, encrypted_key,
                      is_valid, last_validated_at, created_at, updated_at
               FROM ai_provider_keys
               WHERE tenant_workspace_id = $1
               ORDER BY provider"#,
        )
        .bind(tenant_workspace_id)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| AiProviderKey::from(r).into())
            .collect())
    }

    /// Delete an AI provider key
    pub async fn delete(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
        provider: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM ai_provider_keys WHERE tenant_workspace_id = $1 AND provider = $2",
        )
        .bind(tenant_workspace_id)
        .bind(provider.to_lowercase())
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Update validation status
    pub async fn update_validation(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
        provider: &str,
        is_valid: bool,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            r#"UPDATE ai_provider_keys
               SET is_valid = $3, last_validated_at = NOW(), updated_at = NOW()
               WHERE tenant_workspace_id = $1 AND provider = $2"#,
        )
        .bind(tenant_workspace_id)
        .bind(provider.to_lowercase())
        .bind(is_valid)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Check if a provider is configured for a tenant workspace
    pub async fn is_configured(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
        provider: &str,
    ) -> Result<bool, sqlx::Error> {
        let count: (i64,) = sqlx::query_as(
            r#"SELECT COUNT(*) FROM ai_provider_keys
               WHERE tenant_workspace_id = $1 AND provider = $2"#,
        )
        .bind(tenant_workspace_id)
        .bind(provider.to_lowercase())
        .fetch_one(pool)
        .await?;

        Ok(count.0 > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_prefix() {
        assert_eq!(
            AiProviderKey::get_prefix("sk-ant-api03-test123"),
            "sk-ant-a"
        );
        assert_eq!(AiProviderKey::get_prefix("AIza1234"), "AIza1234");
        assert_eq!(AiProviderKey::get_prefix("short"), "short");
    }

    #[test]
    fn test_obfuscation_roundtrip() {
        let original = "sk-ant-api03-testkey123456789";
        let obfuscated = AiProviderKey::obfuscate_key(original);
        let deobfuscated = AiProviderKey::deobfuscate_key(&obfuscated).unwrap();
        assert_eq!(original, deobfuscated);
    }

    #[test]
    fn test_ai_provider_from_str() {
        assert_eq!(
            "anthropic".parse::<AiProvider>().unwrap(),
            AiProvider::Anthropic
        );
        assert_eq!(
            "claude".parse::<AiProvider>().unwrap(),
            AiProvider::Anthropic
        );
        assert_eq!("google".parse::<AiProvider>().unwrap(), AiProvider::Google);
        assert_eq!("gemini".parse::<AiProvider>().unwrap(), AiProvider::Google);
        assert_eq!("openai".parse::<AiProvider>().unwrap(), AiProvider::Openai);
        assert_eq!("gpt".parse::<AiProvider>().unwrap(), AiProvider::Openai);
    }
}
