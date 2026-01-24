//! SSO/SAML routes for remote server
//!
//! Provides endpoints for SSO configuration management and SAML authentication flows

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose};
use db_crate::models::sso_configuration::{
    CreateSsoConfiguration, SsoConfiguration, SsoConfigurationError, UpdateSsoConfiguration,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{error, info, instrument, warn};
use uuid::Uuid;

use crate::{
    AppState,
    auth::{
        ClerkRequestContext, JitProvisioningService, SamlServiceProvider, parse_saml_response,
    },
};

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct SamlCallbackRequest {
    #[serde(rename = "SAMLResponse")]
    saml_response: String,
    #[serde(rename = "RelayState")]
    relay_state: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SamlLoginResponse {
    pub success: bool,
    pub user_id: String,
    pub email: String,
    pub is_new_user: bool,
    pub redirect_url: Option<String>,
}

// ============================================================================
// Public Routes (No Auth)
// ============================================================================

pub fn public_router() -> Router<AppState> {
    Router::new()
        // SAML authentication endpoints
        .route(
            "/sso/saml/metadata/:workspace_id",
            get(get_saml_metadata),
        )
        .route(
            "/sso/saml/acs/:workspace_id",
            post(handle_saml_callback),
        )
        .route(
            "/sso/saml/login/:workspace_id",
            get(initiate_saml_login),
        )
}

// ============================================================================
// Protected Routes (Requires Auth)
// ============================================================================

pub fn protected_router() -> Router<AppState> {
    Router::new()
        // SSO Configuration CRUD
        .route(
            "/tenant-workspaces/:workspace_id/sso-configurations",
            get(list_sso_configs).post(create_sso_config),
        )
        .route(
            "/tenant-workspaces/:workspace_id/sso-configurations/:config_id",
            get(get_sso_config)
                .put(update_sso_config)
                .delete(delete_sso_config),
        )
        .route(
            "/tenant-workspaces/:workspace_id/sso-configurations/:config_id/test",
            post(test_sso_config),
        )
}

// ============================================================================
// Public Handlers
// ============================================================================

/// Get SAML metadata for a workspace
#[instrument(name = "sso.get_saml_metadata", skip(state), fields(workspace_id = %workspace_id))]
async fn get_saml_metadata(
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Html<String>, Response> {
    // Get the enabled SSO configuration for this workspace
    let config = match SsoConfiguration::find_enabled_for_workspace(state.pool(), workspace_id).await
    {
        Ok(Some(config)) => config,
        Ok(None) => {
            warn!(workspace_id = %workspace_id, "No enabled SSO configuration found");
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "No SSO configuration found for this workspace"
                })),
            )
                .into_response());
        }
        Err(e) => {
            error!(error = ?e, "Failed to fetch SSO configuration");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    // Generate SAML metadata
    let saml_provider = match SamlServiceProvider::new(config) {
        Ok(provider) => provider,
        Err(e) => {
            error!(error = ?e, "Failed to create SAML service provider");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    match saml_provider.generate_metadata() {
        Ok(metadata) => Ok(Html(metadata)),
        Err(e) => {
            error!(error = ?e, "Failed to generate SAML metadata");
            Err(StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
    }
}

/// Initiate SAML login
#[instrument(name = "sso.initiate_saml_login", skip(state), fields(workspace_id = %workspace_id))]
async fn initiate_saml_login(
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Response, Response> {
    // Get the enabled SSO configuration
    let config = match SsoConfiguration::find_enabled_for_workspace(state.pool(), workspace_id).await
    {
        Ok(Some(config)) => config,
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "No SSO configuration found"
                })),
            )
                .into_response());
        }
        Err(e) => {
            error!(error = ?e, "Failed to fetch SSO configuration");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    let saml_provider = match SamlServiceProvider::new(config.clone()) {
        Ok(provider) => provider,
        Err(e) => {
            error!(error = ?e, "Failed to create SAML service provider");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    // Generate SAML AuthnRequest
    let authn_request = match saml_provider.generate_authn_request() {
        Ok(request) => request,
        Err(e) => {
            error!(error = ?e, "Failed to generate SAML AuthnRequest");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    // Redirect to IdP SSO URL with the request
    let encoded_request = general_purpose::STANDARD.encode(authn_request.as_bytes());
    let redirect_url = format!(
        "{}?SAMLRequest={}",
        config.idp_sso_url,
        urlencoding::encode(&encoded_request)
    );

    Ok((
        StatusCode::FOUND,
        [(axum::http::header::LOCATION, redirect_url)],
    )
        .into_response())
}

/// Handle SAML callback (Assertion Consumer Service)
#[instrument(name = "sso.handle_saml_callback", skip(state, form), fields(workspace_id = %workspace_id))]
async fn handle_saml_callback(
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    axum::Form(form): axum::Form<SamlCallbackRequest>,
) -> Result<Json<SamlLoginResponse>, Response> {
    info!("Received SAML callback");

    // Get SSO configuration
    let config = match SsoConfiguration::find_enabled_for_workspace(state.pool(), workspace_id).await
    {
        Ok(Some(config)) => config,
        Ok(None) => {
            warn!("No enabled SSO configuration found");
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "error": "SSO not configured for this workspace"
                })),
            )
                .into_response());
        }
        Err(e) => {
            error!(error = ?e, "Failed to fetch SSO configuration");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    // Parse SAML response
    let saml_response_xml = match parse_saml_response(&form.saml_response) {
        Ok(xml) => xml,
        Err(e) => {
            error!(error = ?e, "Failed to parse SAML response");
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "success": false,
                    "error": "Invalid SAML response"
                })),
            )
                .into_response());
        }
    };

    // Create SAML service provider
    let saml_provider = match SamlServiceProvider::new(config.clone()) {
        Ok(provider) => provider,
        Err(e) => {
            error!(error = ?e, "Failed to create SAML service provider");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    // Validate SAML response and extract attributes
    let user_attrs = match saml_provider.validate_response(&saml_response_xml) {
        Ok(attrs) => attrs,
        Err(e) => {
            error!(error = ?e, "SAML response validation failed");
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({
                    "success": false,
                    "error": "SAML authentication failed"
                })),
            )
                .into_response());
        }
    };

    // JIT user provisioning
    if config.jit_provisioning_enabled {
        let provisioned_user = match JitProvisioningService::provision_user(
            state.pool(),
            workspace_id,
            &user_attrs,
            config.default_role,
        )
        .await
        {
            Ok(user) => user,
            Err(e) => {
                error!(error = ?e, "Failed to provision user");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "success": false,
                        "error": "Failed to create user account"
                    })),
                )
                    .into_response());
            }
        };

        info!(
            user_id = %provisioned_user.user_id,
            email = %provisioned_user.email,
            is_new = provisioned_user.is_new,
            "User provisioned via SAML SSO"
        );

        Ok(Json(SamlLoginResponse {
            success: true,
            user_id: provisioned_user.user_id,
            email: provisioned_user.email,
            is_new_user: provisioned_user.is_new,
            redirect_url: form.relay_state,
        }))
    } else {
        // JIT provisioning disabled, just return user info
        Ok(Json(SamlLoginResponse {
            success: true,
            user_id: user_attrs.name_id,
            email: user_attrs.email,
            is_new_user: false,
            redirect_url: form.relay_state,
        }))
    }
}

// ============================================================================
// Protected Handlers
// ============================================================================

/// List all SSO configurations for a workspace
#[instrument(name = "sso.list_configs", skip(state), fields(workspace_id = %workspace_id))]
async fn list_sso_configs(
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    Extension(_ctx): Extension<ClerkRequestContext>,
) -> Result<Json<serde_json::Value>, Response> {
    // TODO: Check if user has permission to view SSO configs for this workspace

    match SsoConfiguration::find_all_for_workspace(state.pool(), workspace_id).await {
        Ok(configs) => Ok(Json(json!({
            "success": true,
            "data": configs
        }))),
        Err(e) => {
            error!(error = ?e, "Failed to list SSO configurations");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": "Failed to list SSO configurations"
                })),
            )
                .into_response())
        }
    }
}

/// Get a specific SSO configuration
#[instrument(name = "sso.get_config", skip(state), fields(workspace_id = %workspace_id, config_id = %config_id))]
async fn get_sso_config(
    State(state): State<AppState>,
    Path((workspace_id, config_id)): Path<(Uuid, Uuid)>,
    Extension(_ctx): Extension<ClerkRequestContext>,
) -> Result<Json<serde_json::Value>, Response> {
    match SsoConfiguration::find_by_id(state.pool(), config_id).await {
        Ok(config) => {
            // Verify the config belongs to the workspace
            if config.tenant_workspace_id != workspace_id {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(json!({
                        "success": false,
                        "error": "SSO configuration not found"
                    })),
                )
                    .into_response());
            }

            Ok(Json(json!({
                "success": true,
                "data": config
            })))
        }
        Err(SsoConfigurationError::NotFound) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({
                "success": false,
                "error": "SSO configuration not found"
            })),
        )
            .into_response()),
        Err(e) => {
            error!(error = ?e, "Failed to get SSO configuration");
            Err(StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
    }
}

/// Create a new SSO configuration
#[instrument(name = "sso.create_config", skip(state, payload), fields(workspace_id = %workspace_id))]
async fn create_sso_config(
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    Extension(ctx): Extension<ClerkRequestContext>,
    Json(payload): Json<CreateSsoConfiguration>,
) -> Result<Json<serde_json::Value>, Response> {
    // TODO: Check if user has permission to create SSO configs

    match SsoConfiguration::create(
        state.pool(),
        workspace_id,
        payload,
        Some(ctx.clerk_user_id.to_string()),
    )
    .await
    {
        Ok(config) => Ok(Json(json!({
            "success": true,
            "data": config
        }))),
        Err(SsoConfigurationError::AlreadyExists) => Err((
            StatusCode::CONFLICT,
            Json(json!({
                "success": false,
                "error": "SSO configuration already exists for this provider"
            })),
        )
            .into_response()),
        Err(e) => {
            error!(error = ?e, "Failed to create SSO configuration");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": "Failed to create SSO configuration"
                })),
            )
                .into_response())
        }
    }
}

/// Update an SSO configuration
#[instrument(name = "sso.update_config", skip(state, payload), fields(workspace_id = %workspace_id, config_id = %config_id))]
async fn update_sso_config(
    State(state): State<AppState>,
    Path((workspace_id, config_id)): Path<(Uuid, Uuid)>,
    Extension(_ctx): Extension<ClerkRequestContext>,
    Json(payload): Json<UpdateSsoConfiguration>,
) -> Result<Json<serde_json::Value>, Response> {
    // Verify the config belongs to the workspace
    match SsoConfiguration::find_by_id(state.pool(), config_id).await {
        Ok(config) if config.tenant_workspace_id != workspace_id => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "SSO configuration not found"
                })),
            )
                .into_response());
        }
        Err(_) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "SSO configuration not found"
                })),
            )
                .into_response());
        }
        _ => {}
    }

    match SsoConfiguration::update(state.pool(), config_id, payload).await {
        Ok(config) => Ok(Json(json!({
            "success": true,
            "data": config
        }))),
        Err(e) => {
            error!(error = ?e, "Failed to update SSO configuration");
            Err(StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
    }
}

/// Delete an SSO configuration
#[instrument(name = "sso.delete_config", skip(state), fields(workspace_id = %workspace_id, config_id = %config_id))]
async fn delete_sso_config(
    State(state): State<AppState>,
    Path((workspace_id, config_id)): Path<(Uuid, Uuid)>,
    Extension(_ctx): Extension<ClerkRequestContext>,
) -> Result<Json<serde_json::Value>, Response> {
    // Verify the config belongs to the workspace
    match SsoConfiguration::find_by_id(state.pool(), config_id).await {
        Ok(config) if config.tenant_workspace_id != workspace_id => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "SSO configuration not found"
                })),
            )
                .into_response());
        }
        Err(_) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "SSO configuration not found"
                })),
            )
                .into_response());
        }
        _ => {}
    }

    match SsoConfiguration::delete(state.pool(), config_id).await {
        Ok(_) => Ok(Json(json!({
            "success": true,
            "message": "SSO configuration deleted"
        }))),
        Err(e) => {
            error!(error = ?e, "Failed to delete SSO configuration");
            Err(StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
    }
}

/// Test an SSO configuration
#[instrument(name = "sso.test_config", skip(state), fields(workspace_id = %workspace_id, config_id = %config_id))]
async fn test_sso_config(
    State(state): State<AppState>,
    Path((workspace_id, config_id)): Path<(Uuid, Uuid)>,
    Extension(_ctx): Extension<ClerkRequestContext>,
) -> Result<Json<serde_json::Value>, Response> {
    // Get the configuration
    let config = match SsoConfiguration::find_by_id(state.pool(), config_id).await {
        Ok(config) if config.tenant_workspace_id == workspace_id => config,
        Ok(_) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "SSO configuration not found"
                })),
            )
                .into_response());
        }
        Err(_) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "success": false,
                    "error": "SSO configuration not found"
                })),
            )
                .into_response());
        }
    };

    // Try to create SAML service provider to validate configuration
    match SamlServiceProvider::new(config) {
        Ok(_) => Ok(Json(json!({
            "success": true,
            "message": "SSO configuration is valid"
        }))),
        Err(e) => Ok(Json(json!({
            "success": false,
            "error": format!("SSO configuration validation failed: {}", e)
        }))),
    }
}
