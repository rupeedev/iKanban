//! OAuth settings routes - Handle GitHub/GitLab OAuth for workspace integrations
//!
//! NOTE: The authorize endpoints are PUBLIC because they are opened in popup windows
//! which don't automatically include authentication cookies/headers from the parent window.
//! The connection is workspace-level (not user-specific), so we don't need user auth.

use axum::{
    Router,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
    routing::get,
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use url::Url;

use crate::{
    AppState,
    db::{
        github_connections::{CreateGitHubConnection, GitHubConnectionRepository},
        gitlab_connections::{CreateGitLabConnection, GitLabConnectionRepository},
    },
};

/// Public routes - OAuth authorize and callbacks
/// NOTE: Authorize endpoints must be public because popup windows don't include auth tokens
pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/oauth/github/authorize", get(github_authorize))
        .route("/oauth/gitlab/authorize", get(gitlab_authorize))
        .route("/oauth/github/settings/callback", get(github_callback))
        .route("/oauth/gitlab/settings/callback", get(gitlab_callback))
}

/// Protected routes - none currently needed
pub fn protected_router() -> Router<AppState> {
    Router::new()
}

#[derive(Debug, Deserialize)]
pub struct AuthorizeQuery {
    callback_url: String,
}

#[derive(Debug, Deserialize)]
pub struct GitHubCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GitLabCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubAccessTokenResponse {
    access_token: String,
    token_type: String,
    scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubUserResponse {
    login: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitLabAccessTokenResponse {
    access_token: String,
    token_type: String,
    refresh_token: Option<String>,
    scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitLabUserResponse {
    username: String,
}

/// GET /oauth/github/authorize - Start GitHub OAuth flow for settings
/// NOTE: This endpoint is PUBLIC because it's opened in a popup window which doesn't
/// include auth cookies/headers. The connection is workspace-level, not user-specific.
#[instrument(name = "oauth_settings.github_authorize", skip(_state))]
async fn github_authorize(
    State(_state): State<AppState>,
    Query(query): Query<AuthorizeQuery>,
) -> Response {
    tracing::info!("starting GitHub OAuth for settings");

    let client_id = match std::env::var("GITHUB_OAUTH_CLIENT_ID") {
        Ok(id) => id,
        Err(_) => {
            tracing::error!("GITHUB_OAUTH_CLIENT_ID not configured");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "GitHub OAuth not configured",
            )
                .into_response();
        }
    };

    let api_base =
        std::env::var("API_BASE_URL").unwrap_or_else(|_| "https://api.scho1ar.com".to_string());
    let redirect_uri = format!("{}/api/oauth/github/settings/callback", api_base);

    // Encode callback_url in state parameter
    let state_param = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        query.callback_url.as_bytes(),
    );

    let authorize_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}&state={}",
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode("repo read:org read:user"),
        urlencoding::encode(&state_param)
    );

    Redirect::temporary(&authorize_url).into_response()
}

/// GET /oauth/github/settings/callback - Handle GitHub OAuth callback
#[instrument(name = "oauth_settings.github_callback", skip(state))]
async fn github_callback(
    State(state): State<AppState>,
    Query(query): Query<GitHubCallbackQuery>,
) -> Response {
    // Decode the callback URL from state
    let callback_url = match &query.state {
        Some(state_param) => {
            match base64::Engine::decode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                state_param,
            ) {
                Ok(bytes) => match String::from_utf8(bytes) {
                    Ok(url) => url,
                    Err(_) => {
                        tracing::error!("invalid state parameter encoding");
                        return (StatusCode::BAD_REQUEST, "Invalid state parameter")
                            .into_response();
                    }
                },
                Err(_) => {
                    tracing::error!("failed to decode state parameter");
                    return (StatusCode::BAD_REQUEST, "Invalid state parameter").into_response();
                }
            }
        }
        None => {
            tracing::error!("missing state parameter");
            return (StatusCode::BAD_REQUEST, "Missing state parameter").into_response();
        }
    };

    // Check for errors from GitHub
    if let Some(error) = &query.error {
        let error_desc = query
            .error_description
            .as_deref()
            .unwrap_or("Unknown error");
        tracing::error!(%error, %error_desc, "GitHub OAuth error");
        return redirect_with_error(&callback_url, &format!("{}: {}", error, error_desc));
    }

    let code = match &query.code {
        Some(code) => code,
        None => {
            tracing::error!("missing code parameter");
            return redirect_with_error(&callback_url, "Missing authorization code");
        }
    };

    // Exchange code for access token
    let client_id = match std::env::var("GITHUB_OAUTH_CLIENT_ID") {
        Ok(id) => id,
        Err(_) => return redirect_with_error(&callback_url, "GitHub OAuth not configured"),
    };

    let client_secret = match std::env::var("GITHUB_OAUTH_CLIENT_SECRET") {
        Ok(secret) => secret,
        Err(_) => return redirect_with_error(&callback_url, "GitHub OAuth not configured"),
    };

    let api_base =
        std::env::var("API_BASE_URL").unwrap_or_else(|_| "https://api.scho1ar.com".to_string());
    let redirect_uri = format!("{}/api/oauth/github/settings/callback", api_base);

    let client = reqwest::Client::new();
    let token_response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("code", &code.to_string()),
            ("redirect_uri", &redirect_uri),
        ])
        .send()
        .await;

    let token_data: GitHubAccessTokenResponse = match token_response {
        Ok(resp) => {
            if !resp.status().is_success() {
                let body = resp.text().await.unwrap_or_default();
                tracing::error!(%body, "GitHub token exchange failed");
                return redirect_with_error(&callback_url, "Failed to exchange code for token");
            }
            match resp.json().await {
                Ok(data) => data,
                Err(e) => {
                    tracing::error!(?e, "failed to parse token response");
                    return redirect_with_error(&callback_url, "Failed to parse GitHub response");
                }
            }
        }
        Err(e) => {
            tracing::error!(?e, "GitHub token request failed");
            return redirect_with_error(&callback_url, "Failed to connect to GitHub");
        }
    };

    // Get GitHub username
    let user_response = client
        .get("https://api.github.com/user")
        .header(
            "Authorization",
            format!("Bearer {}", token_data.access_token),
        )
        .header("User-Agent", "ikanban")
        .send()
        .await;

    let github_username = match user_response {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<GitHubUserResponse>().await {
                    Ok(user) => Some(user.login),
                    Err(_) => None,
                }
            } else {
                None
            }
        }
        Err(_) => None,
    };

    // Store the connection
    let payload = CreateGitHubConnection {
        access_token: token_data.access_token,
        github_username,
    };

    // Check if connection already exists and update, or create new
    match GitHubConnectionRepository::find_workspace_connection(state.pool()).await {
        Ok(Some(existing)) => {
            // Update existing connection
            let update_payload = crate::db::github_connections::UpdateGitHubConnection {
                access_token: Some(payload.access_token),
                github_username: payload.github_username,
            };
            if let Err(e) =
                GitHubConnectionRepository::update(state.pool(), existing.id, &update_payload).await
            {
                tracing::error!(?e, "failed to update GitHub connection");
                return redirect_with_error(&callback_url, "Failed to save connection");
            }
        }
        Ok(None) => {
            // Create new connection
            if let Err(e) =
                GitHubConnectionRepository::create_workspace_connection(state.pool(), &payload)
                    .await
            {
                tracing::error!(?e, "failed to create GitHub connection");
                return redirect_with_error(&callback_url, "Failed to save connection");
            }
        }
        Err(e) => {
            tracing::error!(?e, "failed to check existing connection");
            return redirect_with_error(&callback_url, "Database error");
        }
    }

    tracing::info!("GitHub connection saved successfully");
    redirect_with_success(&callback_url)
}

/// GET /oauth/gitlab/authorize - Start GitLab OAuth flow for settings
/// NOTE: This endpoint is PUBLIC because it's opened in a popup window which doesn't
/// include auth cookies/headers. The connection is workspace-level, not user-specific.
#[instrument(name = "oauth_settings.gitlab_authorize", skip(_state))]
async fn gitlab_authorize(
    State(_state): State<AppState>,
    Query(query): Query<AuthorizeQuery>,
) -> Response {
    tracing::info!("starting GitLab OAuth for settings");

    let client_id = match std::env::var("GITLAB_OAUTH_CLIENT_ID") {
        Ok(id) => id,
        Err(_) => {
            tracing::error!("GITLAB_OAUTH_CLIENT_ID not configured");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "GitLab OAuth not configured",
            )
                .into_response();
        }
    };

    let gitlab_url =
        std::env::var("GITLAB_URL").unwrap_or_else(|_| "https://gitlab.com".to_string());
    let api_base =
        std::env::var("API_BASE_URL").unwrap_or_else(|_| "https://api.scho1ar.com".to_string());
    let redirect_uri = format!("{}/api/oauth/gitlab/settings/callback", api_base);

    // Encode callback_url in state parameter
    let state_param = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        query.callback_url.as_bytes(),
    );

    let authorize_url = format!(
        "{}/oauth/authorize?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
        gitlab_url,
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode("api read_api read_user read_repository"),
        urlencoding::encode(&state_param)
    );

    Redirect::temporary(&authorize_url).into_response()
}

/// GET /oauth/gitlab/settings/callback - Handle GitLab OAuth callback
#[instrument(name = "oauth_settings.gitlab_callback", skip(state))]
async fn gitlab_callback(
    State(state): State<AppState>,
    Query(query): Query<GitLabCallbackQuery>,
) -> Response {
    // Decode the callback URL from state
    let callback_url = match &query.state {
        Some(state_param) => {
            match base64::Engine::decode(
                &base64::engine::general_purpose::URL_SAFE_NO_PAD,
                state_param,
            ) {
                Ok(bytes) => match String::from_utf8(bytes) {
                    Ok(url) => url,
                    Err(_) => {
                        tracing::error!("invalid state parameter encoding");
                        return (StatusCode::BAD_REQUEST, "Invalid state parameter")
                            .into_response();
                    }
                },
                Err(_) => {
                    tracing::error!("failed to decode state parameter");
                    return (StatusCode::BAD_REQUEST, "Invalid state parameter").into_response();
                }
            }
        }
        None => {
            tracing::error!("missing state parameter");
            return (StatusCode::BAD_REQUEST, "Missing state parameter").into_response();
        }
    };

    // Check for errors from GitLab
    if let Some(error) = &query.error {
        let error_desc = query
            .error_description
            .as_deref()
            .unwrap_or("Unknown error");
        tracing::error!(%error, %error_desc, "GitLab OAuth error");
        return redirect_with_error(&callback_url, &format!("{}: {}", error, error_desc));
    }

    let code = match &query.code {
        Some(code) => code,
        None => {
            tracing::error!("missing code parameter");
            return redirect_with_error(&callback_url, "Missing authorization code");
        }
    };

    // Exchange code for access token
    let client_id = match std::env::var("GITLAB_OAUTH_CLIENT_ID") {
        Ok(id) => id,
        Err(_) => return redirect_with_error(&callback_url, "GitLab OAuth not configured"),
    };

    let client_secret = match std::env::var("GITLAB_OAUTH_CLIENT_SECRET") {
        Ok(secret) => secret,
        Err(_) => return redirect_with_error(&callback_url, "GitLab OAuth not configured"),
    };

    let gitlab_url =
        std::env::var("GITLAB_URL").unwrap_or_else(|_| "https://gitlab.com".to_string());
    let api_base =
        std::env::var("API_BASE_URL").unwrap_or_else(|_| "https://api.scho1ar.com".to_string());
    let redirect_uri = format!("{}/api/oauth/gitlab/settings/callback", api_base);

    let client = reqwest::Client::new();
    let token_response = client
        .post(format!("{}/oauth/token", gitlab_url))
        .header("Accept", "application/json")
        .form(&[
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("code", &code.to_string()),
            ("redirect_uri", &redirect_uri),
            ("grant_type", &"authorization_code".to_string()),
        ])
        .send()
        .await;

    let token_data: GitLabAccessTokenResponse = match token_response {
        Ok(resp) => {
            if !resp.status().is_success() {
                let body = resp.text().await.unwrap_or_default();
                tracing::error!(%body, "GitLab token exchange failed");
                return redirect_with_error(&callback_url, "Failed to exchange code for token");
            }
            match resp.json().await {
                Ok(data) => data,
                Err(e) => {
                    tracing::error!(?e, "failed to parse token response");
                    return redirect_with_error(&callback_url, "Failed to parse GitLab response");
                }
            }
        }
        Err(e) => {
            tracing::error!(?e, "GitLab token request failed");
            return redirect_with_error(&callback_url, "Failed to connect to GitLab");
        }
    };

    // Get GitLab username
    let user_response = client
        .get(format!("{}/api/v4/user", gitlab_url))
        .header(
            "Authorization",
            format!("Bearer {}", token_data.access_token),
        )
        .send()
        .await;

    let gitlab_username = match user_response {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<GitLabUserResponse>().await {
                    Ok(user) => Some(user.username),
                    Err(_) => None,
                }
            } else {
                None
            }
        }
        Err(_) => None,
    };

    // Store the connection
    let payload = CreateGitLabConnection {
        access_token: token_data.access_token,
        gitlab_username,
        gitlab_url: Some(gitlab_url),
    };

    // Check if connection already exists and update, or create new
    match GitLabConnectionRepository::find_workspace_connection(state.pool()).await {
        Ok(Some(existing)) => {
            // Update existing connection
            let update_payload = crate::db::gitlab_connections::UpdateGitLabConnection {
                access_token: Some(payload.access_token),
                gitlab_username: payload.gitlab_username,
                gitlab_url: payload.gitlab_url,
            };
            if let Err(e) =
                GitLabConnectionRepository::update(state.pool(), existing.id, &update_payload).await
            {
                tracing::error!(?e, "failed to update GitLab connection");
                return redirect_with_error(&callback_url, "Failed to save connection");
            }
        }
        Ok(None) => {
            // Create new connection
            if let Err(e) =
                GitLabConnectionRepository::create_workspace_connection(state.pool(), &payload)
                    .await
            {
                tracing::error!(?e, "failed to create GitLab connection");
                return redirect_with_error(&callback_url, "Failed to save connection");
            }
        }
        Err(e) => {
            tracing::error!(?e, "failed to check existing connection");
            return redirect_with_error(&callback_url, "Database error");
        }
    }

    tracing::info!("GitLab connection saved successfully");
    redirect_with_success(&callback_url)
}

fn redirect_with_success(callback_url: &str) -> Response {
    match Url::parse(callback_url) {
        Ok(mut url) => {
            url.query_pairs_mut().append_pair("success", "true");
            Redirect::temporary(url.as_str()).into_response()
        }
        Err(_) => (StatusCode::BAD_REQUEST, "Invalid callback URL").into_response(),
    }
}

fn redirect_with_error(callback_url: &str, error: &str) -> Response {
    match Url::parse(callback_url) {
        Ok(mut url) => {
            url.query_pairs_mut().append_pair("error", error);
            Redirect::temporary(url.as_str()).into_response()
        }
        Err(_) => (StatusCode::BAD_REQUEST, format!("Error: {}", error)).into_response(),
    }
}
