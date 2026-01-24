-- Create sso_configurations table for SAML 2.0 SSO integration
-- Supports Okta, Azure AD, Google Workspace, and other SAML 2.0 IdPs

CREATE TABLE IF NOT EXISTS sso_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,
    
    -- SSO Provider type: okta, azure_ad, google_workspace, generic
    provider_type TEXT NOT NULL,
    
    -- Human-readable name for this SSO configuration
    name TEXT NOT NULL,
    
    -- Whether this SSO configuration is active
    enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- SAML 2.0 Configuration
    -- Identity Provider metadata URL (for dynamic metadata updates)
    idp_metadata_url TEXT,
    
    -- Identity Provider Entity ID
    idp_entity_id TEXT NOT NULL,
    
    -- Single Sign-On Service URL (where to send SAML requests)
    idp_sso_url TEXT NOT NULL,
    
    -- Single Logout Service URL (optional)
    idp_slo_url TEXT,
    
    -- IdP X.509 certificate for signature verification (PEM format)
    idp_certificate TEXT NOT NULL,
    
    -- Service Provider (our app) Entity ID
    sp_entity_id TEXT NOT NULL,
    
    -- Assertion Consumer Service URL (where IdP sends responses)
    sp_acs_url TEXT NOT NULL,
    
    -- Service Provider metadata URL (for IdP configuration)
    sp_metadata_url TEXT NOT NULL,
    
    -- SAML attribute mapping configuration (JSON)
    -- Maps SAML assertion attributes to user profile fields
    -- Example: {"email": "email", "name": "displayName", "first_name": "givenName"}
    attribute_mapping JSONB NOT NULL DEFAULT '{}',
    
    -- Additional provider-specific configuration (JSON)
    -- Can store provider-specific settings, custom attributes, etc.
    provider_config JSONB NOT NULL DEFAULT '{}',
    
    -- JIT (Just-In-Time) provisioning settings
    jit_provisioning_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Default role for JIT-provisioned users: member, admin
    default_role TEXT NOT NULL DEFAULT 'member',
    
    -- Require SSO for this workspace (enforce SSO-only login)
    enforce_sso BOOLEAN NOT NULL DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    
    -- Constraints
    CONSTRAINT sso_configurations_unique_workspace_provider UNIQUE(tenant_workspace_id, provider_type),
    CONSTRAINT sso_configurations_valid_provider CHECK (provider_type IN ('okta', 'azure_ad', 'google_workspace', 'generic')),
    CONSTRAINT sso_configurations_valid_role CHECK (default_role IN ('member', 'admin', 'owner'))
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_sso_configurations_workspace ON sso_configurations(tenant_workspace_id);
CREATE INDEX IF NOT EXISTS idx_sso_configurations_enabled ON sso_configurations(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_sso_configurations_provider ON sso_configurations(provider_type);

-- Add SSO settings to tenant_workspaces
-- This migration extends the settings JSONB field, which already exists
-- SSO-related settings will be stored in the settings JSON:
-- {
--   "sso_enabled": boolean,
--   "sso_enforce": boolean,  -- require SSO for all workspace members
--   "sso_default_provider": string,  -- default SSO provider to use
--   "allow_email_password": boolean  -- allow email/password alongside SSO
-- }

-- Comments for documentation
COMMENT ON TABLE sso_configurations IS 'SAML 2.0 SSO configurations for tenant workspaces. Supports Okta, Azure AD, Google Workspace, and generic SAML IdPs.';
COMMENT ON COLUMN sso_configurations.provider_type IS 'SSO provider: okta, azure_ad, google_workspace, or generic';
COMMENT ON COLUMN sso_configurations.idp_metadata_url IS 'Identity Provider metadata URL for automatic configuration updates';
COMMENT ON COLUMN sso_configurations.idp_entity_id IS 'SAML IdP Entity ID (unique identifier for the identity provider)';
COMMENT ON COLUMN sso_configurations.idp_sso_url IS 'SAML Single Sign-On Service URL (where authentication requests are sent)';
COMMENT ON COLUMN sso_configurations.idp_certificate IS 'X.509 certificate in PEM format for verifying SAML assertion signatures';
COMMENT ON COLUMN sso_configurations.sp_entity_id IS 'Service Provider Entity ID (our application identifier)';
COMMENT ON COLUMN sso_configurations.sp_acs_url IS 'Assertion Consumer Service URL (callback endpoint for SAML responses)';
COMMENT ON COLUMN sso_configurations.attribute_mapping IS 'JSON mapping of SAML attributes to user profile fields';
COMMENT ON COLUMN sso_configurations.jit_provisioning_enabled IS 'Enable Just-In-Time user provisioning on first SSO login';
COMMENT ON COLUMN sso_configurations.enforce_sso IS 'When true, only SSO authentication is allowed for workspace members';
