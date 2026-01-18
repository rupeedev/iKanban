//! Dropbox Storage Routes
//!
//! API endpoints for Dropbox OAuth and file operations.

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::DeploymentImpl;

/// Request body for getting auth URL
#[derive(Debug, Deserialize)]
pub struct GetAuthUrlRequest {
    pub team_id: Uuid,
}

/// Response with OAuth URL
#[derive(Debug, Serialize)]
pub struct AuthUrlResponse {
    pub url: String,
}

/// OAuth callback query parameters
#[derive(Debug, Deserialize)]
pub struct CallbackParams {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// Status request query parameters
#[derive(Debug, Deserialize)]
pub struct StatusQuery {
    pub team_id: Uuid,
}

/// Disconnect request body
#[derive(Debug, Deserialize)]
pub struct DisconnectRequest {
    pub team_id: Uuid,
}

/// Connection status response
#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub connected: bool,
    pub provider: String,
    pub email: Option<String>,
    pub folder_path: Option<String>,
}

/// Generate OAuth authorization URL for Dropbox
pub async fn get_auth_url(
    State(_deployment): State<DeploymentImpl>,
    Json(req): Json<GetAuthUrlRequest>,
) -> Result<Json<AuthUrlResponse>, Response> {
    // Check if Dropbox is configured
    let client_id = std::env::var("DROPBOX_CLIENT_ID").ok();
    let client_secret = std::env::var("DROPBOX_CLIENT_SECRET").ok();

    if client_id.is_none() || client_secret.is_none() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Dropbox integration is not configured. Set DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET."
            })),
        ).into_response());
    }

    // Generate state token with team_id for callback
    let state = format!("dropbox_{}", req.team_id);

    // Get redirect URI from env or use default
    let redirect_uri = std::env::var("DROPBOX_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:3001/api/storage/dropbox/callback".to_string());

    // Build OAuth URL
    let url = format!(
        "https://www.dropbox.com/oauth2/authorize?client_id={}&redirect_uri={}&response_type=code&token_access_type=offline&state={}",
        urlencoding::encode(&client_id.unwrap()),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&state)
    );

    Ok(Json(AuthUrlResponse { url }))
}

/// OAuth callback handler for Dropbox
pub async fn oauth_callback(
    State(_deployment): State<DeploymentImpl>,
    Query(params): Query<CallbackParams>,
) -> impl IntoResponse {
    // Handle errors from Dropbox
    if let Some(error) = params.error {
        let error_desc = params.error_description.unwrap_or_default();
        tracing::error!("Dropbox OAuth error: {} - {}", error, error_desc);
        return Redirect::to(&format!(
            "/settings/team?provider=dropbox&error={}",
            urlencoding::encode(&error)
        ));
    }

    let code = match params.code {
        Some(c) => c,
        None => {
            return Redirect::to("/settings/team?provider=dropbox&error=missing_code");
        }
    };

    let state = match params.state {
        Some(s) => s,
        None => {
            return Redirect::to("/settings/team?provider=dropbox&error=missing_state");
        }
    };

    // Parse team_id from state
    let team_id = state.strip_prefix("dropbox_").unwrap_or(&state);

    tracing::info!(
        "Dropbox OAuth callback for team: {}, code length: {}",
        team_id,
        code.len()
    );

    // TODO: Exchange code for tokens using DropboxClient
    // TODO: Get account info
    // TODO: Store tokens in team_storage_configs

    // For now, redirect with success (placeholder)
    Redirect::to(&format!(
        "/settings/team?provider=dropbox&status=connected&team_id={}",
        team_id
    ))
}

/// Disconnect Dropbox from team
pub async fn disconnect(
    State(_deployment): State<DeploymentImpl>,
    Json(req): Json<DisconnectRequest>,
) -> Result<Json<serde_json::Value>, Response> {
    tracing::info!("Disconnecting Dropbox for team: {}", req.team_id);

    // TODO: Revoke token
    // TODO: Delete from team_storage_configs

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Dropbox disconnected"
    })))
}

/// Get Dropbox connection status for team
pub async fn get_status(
    State(_deployment): State<DeploymentImpl>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<StatusResponse>, Response> {
    tracing::info!("Getting Dropbox status for team: {}", query.team_id);

    // TODO: Query team_storage_configs for dropbox provider
    // TODO: If found and token valid, return connected status

    // For now, return not connected (placeholder)
    Ok(Json(StatusResponse {
        connected: false,
        provider: "dropbox".to_string(),
        email: None,
        folder_path: None,
    }))
}

/// URL encoding helper
mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
