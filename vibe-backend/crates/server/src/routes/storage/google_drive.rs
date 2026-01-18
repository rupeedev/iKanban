//! Google Drive Storage Routes
//!
//! API endpoints for Google Drive OAuth and file operations.

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
    pub folder_id: Option<String>,
}

/// Generate OAuth authorization URL for Google Drive
pub async fn get_auth_url(
    State(_deployment): State<DeploymentImpl>,
    Json(req): Json<GetAuthUrlRequest>,
) -> Result<Json<AuthUrlResponse>, Response> {
    // Check if Google Drive is configured
    let client_id = std::env::var("GOOGLE_CLIENT_ID").ok();
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").ok();

    if client_id.is_none() || client_secret.is_none() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Google Drive integration is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
            })),
        ).into_response());
    }

    // Generate state token with team_id for callback
    let state = format!("gdrive_{}", req.team_id);

    // Get redirect URI from env or use default
    let redirect_uri = std::env::var("GOOGLE_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:3001/api/storage/google-drive/callback".to_string());

    // Build OAuth URL
    let scope =
        "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
        urlencoding::encode(&client_id.unwrap()),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scope),
        urlencoding::encode(&state)
    );

    Ok(Json(AuthUrlResponse { url }))
}

/// OAuth callback handler for Google Drive
pub async fn oauth_callback(
    State(_deployment): State<DeploymentImpl>,
    Query(params): Query<CallbackParams>,
) -> impl IntoResponse {
    // Handle errors from Google
    if let Some(error) = params.error {
        tracing::error!("Google OAuth error: {}", error);
        return Redirect::to(&format!(
            "/settings/team?provider=google_drive&error={}",
            urlencoding::encode(&error)
        ));
    }

    let code = match params.code {
        Some(c) => c,
        None => {
            return Redirect::to("/settings/team?provider=google_drive&error=missing_code");
        }
    };

    let state = match params.state {
        Some(s) => s,
        None => {
            return Redirect::to("/settings/team?provider=google_drive&error=missing_state");
        }
    };

    // Parse team_id from state
    let team_id = state.strip_prefix("gdrive_").unwrap_or(&state);

    tracing::info!(
        "Google Drive OAuth callback for team: {}, code length: {}",
        team_id,
        code.len()
    );

    // TODO: Exchange code for tokens using GoogleDriveClient
    // TODO: Get user info
    // TODO: Store tokens in team_storage_configs

    // For now, redirect with success (placeholder)
    Redirect::to(&format!(
        "/settings/team?provider=google_drive&status=connected&team_id={}",
        team_id
    ))
}

/// Disconnect Google Drive from team
pub async fn disconnect(
    State(_deployment): State<DeploymentImpl>,
    Json(req): Json<DisconnectRequest>,
) -> Result<Json<serde_json::Value>, Response> {
    tracing::info!("Disconnecting Google Drive for team: {}", req.team_id);

    // TODO: Revoke token
    // TODO: Delete from team_storage_configs

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Google Drive disconnected"
    })))
}

/// Get Google Drive connection status for team
pub async fn get_status(
    State(_deployment): State<DeploymentImpl>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<StatusResponse>, Response> {
    tracing::info!("Getting Google Drive status for team: {}", query.team_id);

    // TODO: Query team_storage_configs for google_drive provider
    // TODO: If found and token valid, return connected status

    // For now, return not connected (placeholder)
    Ok(Json(StatusResponse {
        connected: false,
        provider: "google_drive".to_string(),
        email: None,
        folder_id: None,
    }))
}

/// URL encoding helper
mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
