# SSO/SAML Integration Implementation Guide

## Overview

This document describes the SSO/SAML 2.0 integration implementation for iKanban's multi-tenant workspace system (TENANCY-P5-01).

## Architecture

### Components

1. **Database Layer** (`sso_configurations` table)
2. **Business Logic** (SAML validation, JIT provisioning)
3. **API Routes** (Public SAML endpoints + Protected management endpoints)
4. **SAML Service Provider** (Metadata generation, assertion validation)

### Database Schema

The `sso_configurations` table stores SAML configurations per workspace:

```sql
CREATE TABLE sso_configurations (
    id UUID PRIMARY KEY,
    tenant_workspace_id UUID REFERENCES tenant_workspaces(id),
    provider_type TEXT (okta, azure_ad, google_workspace, generic),
    name TEXT,
    enabled BOOLEAN DEFAULT true,
    
    -- IdP Configuration
    idp_metadata_url TEXT,
    idp_entity_id TEXT NOT NULL,
    idp_sso_url TEXT NOT NULL,
    idp_slo_url TEXT,
    idp_certificate TEXT NOT NULL,
    
    -- SP Configuration
    sp_entity_id TEXT NOT NULL,
    sp_acs_url TEXT NOT NULL,
    sp_metadata_url TEXT NOT NULL,
    
    -- Attribute Mapping & Settings
    attribute_mapping JSONB DEFAULT '{}',
    provider_config JSONB DEFAULT '{}',
    jit_provisioning_enabled BOOLEAN DEFAULT true,
    default_role TEXT DEFAULT 'member',
    enforce_sso BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);
```

### SAML Flow

#### 1. IdP-Initiated Login
```
User → IdP → POST /sso/saml/acs/:workspace_id → JIT Provision → Redirect to App
```

#### 2. SP-Initiated Login
```
User → GET /sso/saml/login/:workspace_id → Redirect to IdP → 
       POST /sso/saml/acs/:workspace_id → JIT Provision → Redirect to App
```

## API Endpoints

### Public Endpoints

- `GET /sso/saml/metadata/:workspace_id` - SAML SP metadata
- `GET /sso/saml/login/:workspace_id` - Initiate SAML login
- `POST /sso/saml/acs/:workspace_id` - SAML callback (ACS)

### Protected Endpoints

- `GET /tenant-workspaces/:workspace_id/sso-configurations` - List configs
- `POST /tenant-workspaces/:workspace_id/sso-configurations` - Create config
- `GET /tenant-workspaces/:workspace_id/sso-configurations/:config_id` - Get config
- `PUT /tenant-workspaces/:workspace_id/sso-configurations/:config_id` - Update config
- `DELETE /tenant-workspaces/:workspace_id/sso-configurations/:config_id` - Delete config
- `POST /tenant-workspaces/:workspace_id/sso-configurations/:config_id/test` - Test config

## IdP Configuration

### Supported Providers
- Okta
- Azure AD
- Google Workspace
- Generic SAML 2.0

### Configuration Requirements
1. ACS URL: `https://api.scho1ar.com/sso/saml/acs/{workspace_id}`
2. Entity ID: `https://ikanban.scho1ar.com`
3. Name ID Format: Email Address
4. Required Attributes: email, firstName, lastName, displayName

## Security Notes

**Current Implementation (MVP):**
- ✅ SAML assertion parsing
- ✅ Attribute extraction
- ✅ JIT user provisioning
- ⚠️ Basic validation only

**Production Requirements:**
- ❌ SAML signature verification (needs implementation)
- ❌ Certificate chain validation (needs implementation)
- ❌ Replay attack prevention (needs implementation)

## Files Modified

- `vibe-backend/crates/remote/migrations/20260124054656_create_sso_configurations.sql`
- `vibe-backend/crates/db/src/models/sso_configuration.rs`
- `vibe-backend/crates/remote/src/auth/saml.rs`
- `vibe-backend/crates/remote/src/routes/sso.rs`

See full documentation for detailed API specs, configuration guides, and troubleshooting.
