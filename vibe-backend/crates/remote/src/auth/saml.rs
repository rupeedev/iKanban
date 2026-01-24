//! SAML 2.0 authentication module for SSO integration
//!
//! Provides basic SAML assertion validation, metadata generation, and JIT user provisioning
//! This is a lightweight implementation for MVP. For production, consider using a full SAML library.

use std::collections::HashMap;

use anyhow::{Context, Result, anyhow};
use base64::{Engine as _, engine::general_purpose};
use chrono::{DateTime, Utc};
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use db_crate::models::sso_configuration::{SsoConfiguration, WorkspaceMemberRole};

// ============================================================================
// SAML Service Provider
// ============================================================================

/// SAML Service Provider wrapper
pub struct SamlServiceProvider {
    config: SsoConfiguration,
}

impl SamlServiceProvider {
    /// Create a new SAML Service Provider from SSO configuration
    pub fn new(config: SsoConfiguration) -> Result<Self> {
        Ok(Self { config })
    }

    /// Generate SAML metadata XML for this Service Provider
    pub fn generate_metadata(&self) -> Result<String> {
        let metadata = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="{}">
    <md:SPSSODescriptor
        AuthnRequestsSigned="false"
        WantAssertionsSigned="true"
        protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
        <md:AssertionConsumerService
            Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
            Location="{}"
            index="0"
            isDefault="true"/>
    </md:SPSSODescriptor>
    <md:Organization>
        <md:OrganizationName xml:lang="en">iKanban</md:OrganizationName>
        <md:OrganizationDisplayName xml:lang="en">iKanban</md:OrganizationDisplayName>
        <md:OrganizationURL xml:lang="en">https://ikanban.scho1ar.com</md:OrganizationURL>
    </md:Organization>
    <md:ContactPerson contactType="technical">
        <md:Company>iKanban</md:Company>
    </md:ContactPerson>
</md:EntityDescriptor>"#,
            self.config.sp_entity_id, self.config.sp_acs_url
        );

        Ok(metadata)
    }

    /// Validate a SAML response and extract user attributes
    /// 
    /// ⚠️ SECURITY WARNING: This is a basic implementation for MVP.
    /// Production deployment MUST add:
    /// - SAML response signature verification with IdP certificate
    /// - X.509 certificate chain validation
    /// - Replay attack prevention (track assertion IDs)
    /// - Timestamp validation (NotBefore, NotOnOrAfter)
    /// - Audience restriction validation
    /// 
    /// Without these checks, the system is vulnerable to:
    /// - SAML assertion forgery
    /// - Replay attacks
    /// - Man-in-the-middle attacks
    pub fn validate_response(&self, saml_response: &str) -> Result<SamlUserAttributes> {
        // Parse SAML response XML
        let mut reader = Reader::from_str(saml_response);
        reader.config_mut().trim_text(true);

        let mut attributes: HashMap<String, String> = HashMap::new();
        let mut name_id = String::new();
        let mut current_attr_name: Option<String> = None;
        let mut in_attribute_value = false;

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                    
                    // Extract NameID
                    if name == "NameID" {
                        let mut text_buf = Vec::new();
                        if let Ok(Event::Text(text)) = reader.read_event_into(&mut text_buf) {
                            name_id = text.unescape().unwrap_or_default().to_string();
                        }
                    }
                    
                    // Extract Attribute Name
                    if name == "Attribute" {
                        if let Some(name_attr) = e.attributes()
                            .filter_map(|a| a.ok())
                            .find(|a| a.key.as_ref() == b"Name")
                        {
                            current_attr_name = Some(
                                String::from_utf8_lossy(&name_attr.value).to_string()
                            );
                        }
                    }
                    
                    if name == "AttributeValue" {
                        in_attribute_value = true;
                    }
                }
                Ok(Event::Text(text)) if in_attribute_value => {
                    if let Some(ref attr_name) = current_attr_name {
                        let value = text.unescape().unwrap_or_default().to_string();
                        attributes.insert(attr_name.clone(), value);
                    }
                }
                Ok(Event::End(e)) => {
                    let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                    if name == "AttributeValue" {
                        in_attribute_value = false;
                    }
                    if name == "Attribute" {
                        current_attr_name = None;
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(anyhow!("Error parsing SAML XML: {}", e)),
                _ => {}
            }
            buf.clear();
        }

        // Map attributes based on configuration
        let mapping: HashMap<String, String> = match serde_json::from_value(
            self.config.attribute_mapping.clone()
        ) {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!("Failed to parse attribute mapping, using defaults: {}", e);
                HashMap::new()
            }
        };

        let email = self.get_mapped_attribute(&attributes, &mapping, "email")
            .ok_or_else(|| anyhow!("Email attribute not found in SAML assertion"))?;

        if name_id.is_empty() {
            name_id = email.clone();
        }

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
        // Try mapping first, then fallback to field name
        let attr_names = vec![
            mapping.get(field).map(|s| s.as_str()),
            Some(field),
        ];

        for attr_name in attr_names.into_iter().flatten() {
            if let Some(value) = attributes.get(attr_name) {
                return Some(value.clone());
            }
        }
        None
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

    /// Generate a SAML AuthnRequest (basic version)
    pub fn generate_authn_request(&self) -> Result<String> {
        let request_id = generate_request_id();
        let issue_instant = Utc::now().to_rfc3339();

        let authn_request = format!(
            r#"<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="{}"
    Version="2.0"
    IssueInstant="{}"
    Destination="{}"
    AssertionConsumerServiceURL="{}">
    <saml:Issuer>{}</saml:Issuer>
    <samlp:NameIDPolicy
        Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        AllowCreate="true"/>
</samlp:AuthnRequest>"#,
            request_id,
            issue_instant,
            self.config.idp_sso_url,
            self.config.sp_acs_url,
            self.config.sp_entity_id
        );

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
        let existing_member = sqlx::query_as::<_, (String, String)>(
            r#"
            SELECT user_id, role
            FROM tenant_workspace_members
            WHERE tenant_workspace_id = $1 AND email = $2
            "#
        )
        .bind(workspace_id)
        .bind(&saml_attrs.email)
        .fetch_optional(pool)
        .await?;

        if let Some((user_id, role)) = existing_member {
            // User exists, update their profile if needed
            Self::update_user_profile(pool, &user_id, saml_attrs).await?;

            Ok(ProvisionedUser {
                user_id,
                email: saml_attrs.email.clone(),
                is_new: false,
                role,
            })
        } else {
            // Create new user via JIT provisioning
            let user_id = saml_attrs.name_id.clone();
            let display_name = saml_attrs.full_name().unwrap_or_else(|| saml_attrs.email.clone());

            sqlx::query(
                r#"
                INSERT INTO tenant_workspace_members (
                    tenant_workspace_id, user_id, email, display_name, role
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (tenant_workspace_id, user_id) DO UPDATE
                SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
                "#
            )
            .bind(workspace_id)
            .bind(&user_id)
            .bind(&saml_attrs.email)
            .bind(&display_name)
            .bind(default_role.to_string())
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

        sqlx::query(
            r#"
            UPDATE tenant_workspace_members
            SET display_name = $2, email = $3, updated_at = NOW()
            WHERE user_id = $1
            "#
        )
        .bind(user_id)
        .bind(&display_name)
        .bind(&saml_attrs.email)
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
    let decoded = general_purpose::STANDARD.decode(base64_response)
        .context("Failed to decode base64 SAML response")?;
    
    String::from_utf8(decoded)
        .context("Failed to parse SAML response as UTF-8")
}

/// Generate a random request ID for SAML requests
pub fn generate_request_id() -> String {
    format!("_id_{}", Uuid::new_v4().as_simple())
}
