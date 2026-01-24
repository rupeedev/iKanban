use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// SsoConfiguration Model
// ============================================================================

/// SAML 2.0 SSO configuration for a tenant workspace
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SsoConfiguration {
    pub id: Uuid,
    pub tenant_workspace_id: Uuid,
    pub provider_type: SsoProviderType,
    pub name: String,
    pub enabled: bool,
    
    // IdP Configuration
    pub idp_metadata_url: Option<String>,
    pub idp_entity_id: String,
    pub idp_sso_url: String,
    pub idp_slo_url: Option<String>,
    pub idp_certificate: String,
    
    // SP Configuration
    pub sp_entity_id: String,
    pub sp_acs_url: String,
    pub sp_metadata_url: String,
    
    // Attribute Mapping
    #[ts(type = "Record<string, string>")]
    pub attribute_mapping: serde_json::Value,
    
    // Provider-specific config
    #[ts(type = "Record<string, unknown>")]
    pub provider_config: serde_json::Value,
    
    // JIT Provisioning
    pub jit_provisioning_enabled: bool,
    pub default_role: WorkspaceMemberRole,
    pub enforce_sso: bool,
    
    // Metadata
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
    pub created_by: Option<String>,
}

/// SSO provider types
#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, sqlx::Type)]
#[sqlx(type_name = "text")]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SsoProviderType {
    Okta,
    AzureAd,
    GoogleWorkspace,
    Generic,
}

impl std::fmt::Display for SsoProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SsoProviderType::Okta => write!(f, "okta"),
            SsoProviderType::AzureAd => write!(f, "azure_ad"),
            SsoProviderType::GoogleWorkspace => write!(f, "google_workspace"),
            SsoProviderType::Generic => write!(f, "generic"),
        }
    }
}

impl std::str::FromStr for SsoProviderType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "okta" => Ok(SsoProviderType::Okta),
            "azure_ad" => Ok(SsoProviderType::AzureAd),
            "google_workspace" => Ok(SsoProviderType::GoogleWorkspace),
            "generic" => Ok(SsoProviderType::Generic),
            _ => Err(format!("Unknown SSO provider type: {}", s)),
        }
    }
}

/// Workspace member role for JIT provisioning
#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, sqlx::Type)]
#[sqlx(type_name = "text")]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum WorkspaceMemberRole {
    Member,
    Admin,
    Owner,
}

impl std::fmt::Display for WorkspaceMemberRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkspaceMemberRole::Member => write!(f, "member"),
            WorkspaceMemberRole::Admin => write!(f, "admin"),
            WorkspaceMemberRole::Owner => write!(f, "owner"),
        }
    }
}

impl std::str::FromStr for WorkspaceMemberRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "member" => Ok(WorkspaceMemberRole::Member),
            "admin" => Ok(WorkspaceMemberRole::Admin),
            "owner" => Ok(WorkspaceMemberRole::Owner),
            _ => Err(format!("Unknown workspace member role: {}", s)),
        }
    }
}

/// Helper struct for FromRow conversion
#[derive(FromRow)]
struct SsoConfigurationRow {
    id: Uuid,
    tenant_workspace_id: Uuid,
    provider_type: String,
    name: String,
    enabled: bool,
    idp_metadata_url: Option<String>,
    idp_entity_id: String,
    idp_sso_url: String,
    idp_slo_url: Option<String>,
    idp_certificate: String,
    sp_entity_id: String,
    sp_acs_url: String,
    sp_metadata_url: String,
    attribute_mapping: serde_json::Value,
    provider_config: serde_json::Value,
    jit_provisioning_enabled: bool,
    default_role: String,
    enforce_sso: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    created_by: Option<String>,
}

impl TryFrom<SsoConfigurationRow> for SsoConfiguration {
    type Error = String;

    fn try_from(row: SsoConfigurationRow) -> Result<Self, Self::Error> {
        Ok(SsoConfiguration {
            id: row.id,
            tenant_workspace_id: row.tenant_workspace_id,
            provider_type: row.provider_type.parse()?,
            name: row.name,
            enabled: row.enabled,
            idp_metadata_url: row.idp_metadata_url,
            idp_entity_id: row.idp_entity_id,
            idp_sso_url: row.idp_sso_url,
            idp_slo_url: row.idp_slo_url,
            idp_certificate: row.idp_certificate,
            sp_entity_id: row.sp_entity_id,
            sp_acs_url: row.sp_acs_url,
            sp_metadata_url: row.sp_metadata_url,
            attribute_mapping: row.attribute_mapping,
            provider_config: row.provider_config,
            jit_provisioning_enabled: row.jit_provisioning_enabled,
            default_role: row.default_role.parse()?,
            enforce_sso: row.enforce_sso,
            created_at: row.created_at,
            updated_at: row.updated_at,
            created_by: row.created_by,
        })
    }
}

// ============================================================================
// DTOs for API
// ============================================================================

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateSsoConfiguration {
    pub provider_type: SsoProviderType,
    pub name: String,
    pub idp_metadata_url: Option<String>,
    pub idp_entity_id: String,
    pub idp_sso_url: String,
    pub idp_slo_url: Option<String>,
    pub idp_certificate: String,
    pub sp_entity_id: String,
    pub sp_acs_url: String,
    #[ts(type = "Record<string, string>")]
    pub attribute_mapping: Option<serde_json::Value>,
    #[ts(type = "Record<string, unknown>")]
    pub provider_config: Option<serde_json::Value>,
    pub jit_provisioning_enabled: Option<bool>,
    pub default_role: Option<WorkspaceMemberRole>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateSsoConfiguration {
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub idp_metadata_url: Option<String>,
    pub idp_entity_id: Option<String>,
    pub idp_sso_url: Option<String>,
    pub idp_slo_url: Option<String>,
    pub idp_certificate: Option<String>,
    #[ts(type = "Record<string, string>")]
    pub attribute_mapping: Option<serde_json::Value>,
    #[ts(type = "Record<string, unknown>")]
    pub provider_config: Option<serde_json::Value>,
    pub jit_provisioning_enabled: Option<bool>,
    pub default_role: Option<WorkspaceMemberRole>,
    pub enforce_sso: Option<bool>,
}

// ============================================================================
// Database Operations
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum SsoConfigurationError {
    #[error("SSO configuration not found")]
    NotFound,
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Invalid data: {0}")]
    InvalidData(String),
    #[error("SSO configuration already exists for this workspace and provider")]
    AlreadyExists,
}

impl SsoConfiguration {
    /// Create a new SSO configuration
    pub async fn create(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
        data: CreateSsoConfiguration,
        created_by: Option<String>,
    ) -> Result<Self, SsoConfigurationError> {
        let sp_metadata_url = format!(
            "https://api.scho1ar.com/sso/saml/metadata/{}", 
            tenant_workspace_id
        );
        
        let row = sqlx::query_as::<_, SsoConfigurationRow>(
            r#"
            INSERT INTO sso_configurations (
                tenant_workspace_id, provider_type, name, idp_metadata_url,
                idp_entity_id, idp_sso_url, idp_slo_url, idp_certificate,
                sp_entity_id, sp_acs_url, sp_metadata_url,
                attribute_mapping, provider_config,
                jit_provisioning_enabled, default_role, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
            "#,
        )
        .bind(tenant_workspace_id)
        .bind(data.provider_type.to_string())
        .bind(&data.name)
        .bind(&data.idp_metadata_url)
        .bind(&data.idp_entity_id)
        .bind(&data.idp_sso_url)
        .bind(&data.idp_slo_url)
        .bind(&data.idp_certificate)
        .bind(&data.sp_entity_id)
        .bind(&data.sp_acs_url)
        .bind(&sp_metadata_url)
        .bind(data.attribute_mapping.unwrap_or_else(|| serde_json::json!({})))
        .bind(data.provider_config.unwrap_or_else(|| serde_json::json!({})))
        .bind(data.jit_provisioning_enabled.unwrap_or(true))
        .bind(data.default_role.unwrap_or(WorkspaceMemberRole::Member).to_string())
        .bind(&created_by)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(db_err) = &e {
                if db_err.is_unique_violation() {
                    return SsoConfigurationError::AlreadyExists;
                }
            }
            SsoConfigurationError::Database(e)
        })?;

        row.try_into().map_err(SsoConfigurationError::InvalidData)
    }

    /// Get SSO configuration by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Self, SsoConfigurationError> {
        let row = sqlx::query_as::<_, SsoConfigurationRow>(
            "SELECT * FROM sso_configurations WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(SsoConfigurationError::NotFound)?;

        row.try_into().map_err(SsoConfigurationError::InvalidData)
    }

    /// Get SSO configuration for a workspace by provider type
    pub async fn find_by_workspace_and_provider(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
        provider_type: SsoProviderType,
    ) -> Result<Self, SsoConfigurationError> {
        let row = sqlx::query_as::<_, SsoConfigurationRow>(
            "SELECT * FROM sso_configurations WHERE tenant_workspace_id = $1 AND provider_type = $2"
        )
        .bind(tenant_workspace_id)
        .bind(provider_type.to_string())
        .fetch_optional(pool)
        .await?
        .ok_or(SsoConfigurationError::NotFound)?;

        row.try_into().map_err(SsoConfigurationError::InvalidData)
    }

    /// List all SSO configurations for a workspace
    pub async fn find_all_for_workspace(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
    ) -> Result<Vec<Self>, SsoConfigurationError> {
        let rows = sqlx::query_as::<_, SsoConfigurationRow>(
            "SELECT * FROM sso_configurations WHERE tenant_workspace_id = $1 ORDER BY created_at DESC"
        )
        .bind(tenant_workspace_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter()
            .map(|row| row.try_into().map_err(SsoConfigurationError::InvalidData))
            .collect()
    }

    /// Get enabled SSO configuration for a workspace
    pub async fn find_enabled_for_workspace(
        pool: &PgPool,
        tenant_workspace_id: Uuid,
    ) -> Result<Option<Self>, SsoConfigurationError> {
        let row = sqlx::query_as::<_, SsoConfigurationRow>(
            "SELECT * FROM sso_configurations WHERE tenant_workspace_id = $1 AND enabled = true LIMIT 1"
        )
        .bind(tenant_workspace_id)
        .fetch_optional(pool)
        .await?;

        row.map(|r| r.try_into().map_err(SsoConfigurationError::InvalidData))
            .transpose()
    }

    /// Update SSO configuration
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: UpdateSsoConfiguration,
    ) -> Result<Self, SsoConfigurationError> {
        let row = sqlx::query_as::<_, SsoConfigurationRow>(
            r#"
            UPDATE sso_configurations
            SET
                name = COALESCE($2, name),
                enabled = COALESCE($3, enabled),
                idp_metadata_url = COALESCE($4, idp_metadata_url),
                idp_entity_id = COALESCE($5, idp_entity_id),
                idp_sso_url = COALESCE($6, idp_sso_url),
                idp_slo_url = COALESCE($7, idp_slo_url),
                idp_certificate = COALESCE($8, idp_certificate),
                attribute_mapping = COALESCE($9, attribute_mapping),
                provider_config = COALESCE($10, provider_config),
                jit_provisioning_enabled = COALESCE($11, jit_provisioning_enabled),
                default_role = COALESCE($12, default_role),
                enforce_sso = COALESCE($13, enforce_sso),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(&data.name)
        .bind(data.enabled)
        .bind(&data.idp_metadata_url)
        .bind(&data.idp_entity_id)
        .bind(&data.idp_sso_url)
        .bind(&data.idp_slo_url)
        .bind(&data.idp_certificate)
        .bind(&data.attribute_mapping)
        .bind(&data.provider_config)
        .bind(data.jit_provisioning_enabled)
        .bind(data.default_role.map(|r| r.to_string()))
        .bind(data.enforce_sso)
        .fetch_optional(pool)
        .await?
        .ok_or(SsoConfigurationError::NotFound)?;

        row.try_into().map_err(SsoConfigurationError::InvalidData)
    }

    /// Delete SSO configuration
    pub async fn delete(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<(), SsoConfigurationError> {
        let result = sqlx::query("DELETE FROM sso_configurations WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(SsoConfigurationError::NotFound);
        }

        Ok(())
    }
}
