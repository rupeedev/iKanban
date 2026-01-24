//! SAML 2.0 authentication module for SSO integration
//!
//! Provides SAML assertion validation, metadata generation, and JIT user provisioning

use std::collections::HashMap;

use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use samael::{
    metadata::{ContactPerson, ContactType, EntityDescriptor, SpSsoDescriptor},
    service_provider::ServiceProvider,
    schema::{Assertion, Response as SamlResponse},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use db_crate::models::sso_configuration::{SsoConfiguration, WorkspaceMemberRole};

// ============================================================================
// SAML Service Provider
// ============================================================================

/// SAML Service Provider wrapper
pub struct SamlServiceProvider {
    config: SsoConfiguration,
    service_provider: ServiceProvider,
}

impl SamlServiceProvider {
    /// Create a new SAML Service Provider from SSO configuration
    pub fn new(config: SsoConfiguration) -> Result<Self> {
        // Parse the IdP certificate
        let idp_cert = samael::idp::IdentityProvider {
            entity_id: Some(config.idp_entity_id.clone()),
            single_sign_on_service_url: Some(config.idp_sso_url.clone()),
            single_logout_service_url: config.idp_slo_url.clone(),
            signing_keys: vec![samael::crypto::decode_x509_cert(&config.idp_certificate)?],
            ..Default::default()
        };

        let service_provider = ServiceProvider {
            entity_id: config.sp_entity_id.clone(),
            acs_url: config.sp_acs_url.clone(),
            idp: idp_cert,
            ..Default::default()
        };

        Ok(Self {
            config,
            service_provider,
        })
    }

    /// Generate SAML metadata XML for this Service Provider
    pub fn generate_metadata(&self) -> Result<String> {
        let sp_descriptor = SpSsoDescriptor {
            assertion_consumer_service: vec![samael::metadata::AssertionConsumerService {
                index: 0,
                is_default: Some(true),
                binding: samael::metadata::HTTP_POST_BINDING.to_string(),
                location: self.config.sp_acs_url.clone(),
            }],
            want_assertions_signed: Some(true),
            authn_requests_signed: Some(false),
            ..Default::default()
        };

        let entity_descriptor = EntityDescriptor {
            entity_id: Some(self.config.sp_entity_id.clone()),
            sp_sso_descriptors: Some(vec![sp_descriptor]),
            contact_person: Some(vec![ContactPerson {
                contact_type: Some(ContactType::Technical),
                ..Default::default()
            }]),
            ..Default::default()
        };

        entity_descriptor
            .to_xml()
            .context("Failed to generate SAML metadata XML")
    }

    /// Validate a SAML response and extract user attributes
    pub fn validate_response(&self, saml_response: &str) -> Result<SamlUserAttributes> {
        // Parse and validate the SAML response
        let response = self
            .service_provider
            .parse_response(saml_response, None)
            .context("Failed to parse SAML response")?;

        // Extract assertions
        let assertions = self.extract_assertions(&response)?;
        
        if assertions.is_empty() {
            return Err(anyhow!("No assertions found in SAML response"));
        }

        // Get the first assertion (most common case)
        let assertion = &assertions[0];

        // Extract user attributes
        self.extract_user_attributes(assertion)
    }

    /// Extract assertions from SAML response
    fn extract_assertions(&self, response: &SamlResponse) -> Result<Vec<Assertion>> {
        let assertions = response
            .assertions
            .as_ref()
            .ok_or_else(|| anyhow!("No assertions in SAML response"))?;

        Ok(assertions.clone())
    }

    /// Extract user attributes from SAML assertion
    fn extract_user_attributes(&self, assertion: &Assertion) -> Result<SamlUserAttributes> {
        let attribute_statement = assertion
            .attribute_statement
            .as_ref()
            .ok_or_else(|| anyhow!("No attribute statement in assertion"))?;

        // Extract raw attributes
        let mut attributes = HashMap::new();
        for attr in &attribute_statement.attributes {
            if let Some(name) = &attr.name {
                if let Some(values) = &attr.values {
                    if !values.is_empty() {
                        attributes.insert(name.clone(), values[0].value.clone());
                    }
                }
            }
        }

        // Map attributes based on configuration
        let mapping: HashMap<String, String> = serde_json::from_value(
            self.config.attribute_mapping.clone()
        ).unwrap_or_default();

        let email = self.get_mapped_attribute(&attributes, &mapping, "email")
            .ok_or_else(|| anyhow!("Email attribute not found in SAML assertion"))?;

        let name_id = assertion
            .subject
            .as_ref()
            .and_then(|s| s.name_id.as_ref())
            .and_then(|n| n.value.clone())
            .unwrap_or_else(|| email.clone());

        Ok(SamlUserAttributes {
            name_id,
            email,
            first_name: self.get_mapped_attribute(&attributes, &mapping, "first_name"),
            last_name: self.get_mapped_attribute(&attributes, &mapping, "last_name"),
            display_name: self.get_mapped_attribute(&attributes, &mapping, "display_name"),
            groups: self.get_mapped_attributes(&attributes, &mapping, "groups"),
            attributes,
        })
    }

    /// Get a mapped attribute value
    fn get_mapped_attribute(
        &self,
        attributes: &HashMap<String, String>,
        mapping: &HashMap<String, String>,
        field: &str,
    ) -> Option<String> {
        // Check if there's a mapping for this field
        let attr_name = mapping.get(field).unwrap_or(&field.to_string()).clone();
        attributes.get(&attr_name).cloned()
    }

    /// Get mapped attributes as a vector (for multi-value attributes like groups)
    fn get_mapped_attributes(
        &self,
        attributes: &HashMap<String, String>,
        mapping: &HashMap<String, String>,
        field: &str,
    ) -> Vec<String> {
        self.get_mapped_attribute(attributes, mapping, field)
            .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
            .unwrap_or_default()
    }

    /// Generate a SAML AuthnRequest
    pub fn generate_authn_request(&self) -> Result<String> {
        let authn_request = self
            .service_provider
            .make_authentication_request(&self.config.idp_sso_url)
            .context("Failed to generate SAML AuthnRequest")?;

        Ok(authn_request)
    }
}

// ============================================================================
// SAML User Attributes
// ============================================================================

/// User attributes extracted from SAML assertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamlUserAttributes {
    /// NameID from SAML assertion (unique identifier)
    pub name_id: String,
    
    /// User's email address
    pub email: String,
    
    /// User's first name
    pub first_name: Option<String>,
    
    /// User's last name
    pub last_name: Option<String>,
    
    /// User's display name
    pub display_name: Option<String>,
    
    /// Groups/roles from IdP
    pub groups: Vec<String>,
    
    /// All raw attributes from SAML assertion
    pub attributes: HashMap<String, String>,
}

impl SamlUserAttributes {
    /// Get the full name of the user
    pub fn full_name(&self) -> Option<String> {
        match (&self.first_name, &self.last_name) {
            (Some(first), Some(last)) => Some(format!("{} {}", first, last)),
            (Some(first), None) => Some(first.clone()),
            (None, Some(last)) => Some(last.clone()),
            _ => self.display_name.clone(),
        }
    }
}

// ============================================================================
// JIT User Provisioning
// ============================================================================

/// Just-In-Time user provisioning service
pub struct JitProvisioningService;

impl JitProvisioningService {
    /// Provision or update a user based on SAML attributes
    pub async fn provision_user(
        pool: &sqlx::PgPool,
        workspace_id: Uuid,
        saml_attrs: &SamlUserAttributes,
        default_role: WorkspaceMemberRole,
    ) -> Result<ProvisionedUser> {
        // Check if user already exists in workspace
        let existing_member = sqlx::query!(
            r#"
            SELECT user_id, role
            FROM tenant_workspace_members
            WHERE tenant_workspace_id = $1 AND email = $2
            "#,
            workspace_id,
            &saml_attrs.email
        )
        .fetch_optional(pool)
        .await?;

        if let Some(member) = existing_member {
            // User exists, update their profile if needed
            Self::update_user_profile(pool, &member.user_id, saml_attrs).await?;

            Ok(ProvisionedUser {
                user_id: member.user_id,
                email: saml_attrs.email.clone(),
                is_new: false,
                role: member.role,
            })
        } else {
            // Create new user via JIT provisioning
            let user_id = saml_attrs.name_id.clone();
            let display_name = saml_attrs.full_name().unwrap_or_else(|| saml_attrs.email.clone());

            sqlx::query!(
                r#"
                INSERT INTO tenant_workspace_members (
                    tenant_workspace_id, user_id, email, display_name, role
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (tenant_workspace_id, user_id) DO UPDATE
                SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
                "#,
                workspace_id,
                &user_id,
                &saml_attrs.email,
                &display_name,
                default_role.to_string()
            )
            .execute(pool)
            .await?;

            Ok(ProvisionedUser {
                user_id,
                email: saml_attrs.email.clone(),
                is_new: true,
                role: default_role.to_string(),
            })
        }
    }

    /// Update user profile based on SAML attributes
    async fn update_user_profile(
        pool: &sqlx::PgPool,
        user_id: &str,
        saml_attrs: &SamlUserAttributes,
    ) -> Result<()> {
        let display_name = saml_attrs.full_name().unwrap_or_else(|| saml_attrs.email.clone());

        sqlx::query!(
            r#"
            UPDATE tenant_workspace_members
            SET display_name = $2, email = $3, updated_at = NOW()
            WHERE user_id = $1
            "#,
            user_id,
            &display_name,
            &saml_attrs.email
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}

/// Result of user provisioning
#[derive(Debug, Clone)]
pub struct ProvisionedUser {
    pub user_id: String,
    pub email: String,
    pub is_new: bool,
    pub role: String,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Parse SAML response from base64-encoded string
pub fn parse_saml_response(base64_response: &str) -> Result<String> {
    let decoded = base64::decode(base64_response)
        .context("Failed to decode base64 SAML response")?;
    
    String::from_utf8(decoded)
        .context("Failed to parse SAML response as UTF-8")
}

/// Generate a random request ID for SAML requests
pub fn generate_request_id() -> String {
    format!("_id_{}", Uuid::new_v4().simple())
}
