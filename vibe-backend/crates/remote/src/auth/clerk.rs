//! Clerk JWT token verification for the remote server.
//!
//! This module provides middleware for verifying Clerk JWTs directly,
//! allowing the frontend to use Clerk tokens without a token exchange flow.

use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use reqwest::Client;
use serde::Deserialize;
use tokio::sync::RwLock;
use tracing::{debug, error, warn};
use uuid::Uuid;

use crate::{
    AppState, configure_user_scope,
    db::{
        oauth_accounts::OAuthAccountRepository,
        users::{UpsertUser, UserRepository},
    },
};

/// User identity extracted from Clerk JWT
#[derive(Debug, Clone)]
pub struct ClerkUser {
    pub user_id: String,
    pub email: Option<String>,
    pub session_id: Option<String>,
}

/// JWT claims from Clerk token
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ClerkClaims {
    sub: String,         // user_id
    sid: Option<String>, // session_id
    email: Option<String>,
    azp: Option<String>, // authorized party (client ID)
    exp: u64,
    iat: u64,
    iss: String,
}

/// Cached JWKS with expiration
struct CachedJwks {
    jwks: JwkSet,
    fetched_at: Instant,
}

/// Clerk authentication state
pub struct ClerkAuthState {
    http_client: Client,
    jwks_cache: RwLock<Option<CachedJwks>>,
    clerk_issuer: String,
    jwks_url: String,
    cache_duration: Duration,
}

impl ClerkAuthState {
    pub fn new() -> Self {
        // Clerk issuer format: https://<clerk-subdomain>.clerk.accounts.dev
        let clerk_domain =
            std::env::var("CLERK_DOMAIN").unwrap_or_else(|_| "clerk.accounts.dev".to_string());

        Self {
            http_client: Client::new(),
            jwks_cache: RwLock::new(None),
            clerk_issuer: format!("https://{}", clerk_domain),
            jwks_url: format!("https://{}/.well-known/jwks.json", clerk_domain),
            cache_duration: Duration::from_secs(3600), // 1 hour cache
        }
    }

    /// Fetch JWKS from Clerk, with caching
    async fn get_jwks(&self) -> Result<JwkSet, ClerkAuthError> {
        // Check cache first
        {
            let cache = self.jwks_cache.read().await;
            if let Some(cached) = cache.as_ref() {
                if cached.fetched_at.elapsed() < self.cache_duration {
                    return Ok(cached.jwks.clone());
                }
            }
        }

        // Fetch fresh JWKS
        debug!(url = %self.jwks_url, "Fetching Clerk JWKS");
        let response = self
            .http_client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to fetch JWKS: {}", e);
                ClerkAuthError::JwksFetchFailed
            })?;

        let jwks: JwkSet = response.json().await.map_err(|e| {
            error!("Failed to parse JWKS: {}", e);
            ClerkAuthError::JwksParseFailed
        })?;

        // Update cache
        {
            let mut cache = self.jwks_cache.write().await;
            *cache = Some(CachedJwks {
                jwks: jwks.clone(),
                fetched_at: Instant::now(),
            });
        }

        Ok(jwks)
    }

    /// Validate a Clerk JWT token
    pub async fn validate_token(&self, token: &str) -> Result<ClerkUser, ClerkAuthError> {
        // Decode header to get the key ID (kid)
        let header = decode_header(token).map_err(|e| {
            debug!("Invalid JWT header: {}", e);
            ClerkAuthError::InvalidToken
        })?;

        let kid = header.kid.ok_or_else(|| {
            debug!("JWT missing kid");
            ClerkAuthError::InvalidToken
        })?;

        // Get JWKS and find the matching key
        let jwks = self.get_jwks().await?;
        let jwk = jwks.find(&kid).ok_or_else(|| {
            debug!("Key {} not found in JWKS", kid);
            ClerkAuthError::KeyNotFound
        })?;

        // Build decoding key from JWK
        let decoding_key = DecodingKey::from_jwk(jwk).map_err(|e| {
            error!("Failed to create decoding key: {}", e);
            ClerkAuthError::InvalidKey
        })?;

        // Set up validation
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&self.clerk_issuer]);
        validation.validate_exp = true;

        // Decode and validate token
        let token_data = decode::<ClerkClaims>(token, &decoding_key, &validation).map_err(|e| {
            debug!("Token validation failed: {}", e);
            ClerkAuthError::InvalidToken
        })?;

        Ok(ClerkUser {
            user_id: token_data.claims.sub,
            email: token_data.claims.email,
            session_id: token_data.claims.sid,
        })
    }
}

impl Default for ClerkAuthState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub enum ClerkAuthError {
    MissingToken,
    InvalidToken,
    JwksFetchFailed,
    JwksParseFailed,
    KeyNotFound,
    InvalidKey,
}

impl IntoResponse for ClerkAuthError {
    fn into_response(self) -> Response {
        let status = match self {
            ClerkAuthError::MissingToken => StatusCode::UNAUTHORIZED,
            ClerkAuthError::InvalidToken => StatusCode::UNAUTHORIZED,
            ClerkAuthError::JwksFetchFailed => StatusCode::SERVICE_UNAVAILABLE,
            ClerkAuthError::JwksParseFailed => StatusCode::INTERNAL_SERVER_ERROR,
            ClerkAuthError::KeyNotFound => StatusCode::UNAUTHORIZED,
            ClerkAuthError::InvalidKey => StatusCode::INTERNAL_SERVER_ERROR,
        };
        status.into_response()
    }
}

/// Request context with the database user, compatible with existing routes
#[derive(Clone)]
#[allow(dead_code)] // May be used by routes that want Clerk-specific context
pub struct ClerkRequestContext {
    pub user: crate::db::users::User,
    pub clerk_user_id: String,
}

/// Middleware that verifies Clerk tokens and injects ClerkRequestContext
pub async fn require_clerk_session(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let bearer = match req.headers().typed_get::<Authorization<Bearer>>() {
        Some(Authorization(token)) => token.token().to_owned(),
        None => {
            warn!("Missing authorization header");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    let clerk_auth = state.clerk_auth();
    let clerk_user = match clerk_auth.validate_token(&bearer).await {
        Ok(user) => user,
        Err(error) => {
            warn!(?error, "Failed to validate Clerk token");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    debug!(
        clerk_user_id = %clerk_user.user_id,
        email = ?clerk_user.email,
        "Clerk token validated"
    );

    // Look up the database user by Clerk user ID
    let pool = state.pool();
    let oauth_repo = OAuthAccountRepository::new(pool);
    let user_repo = UserRepository::new(pool);

    // Try to find existing user by Clerk ID
    let db_user = match oauth_repo.get_by_provider_user("clerk", &clerk_user.user_id).await {
        Ok(Some(oauth_account)) => {
            // User exists, fetch their full record
            match user_repo.fetch_user(oauth_account.user_id).await {
                Ok(user) => user,
                Err(e) => {
                    error!(?e, "Failed to fetch user by ID from oauth_account");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            }
        }
        Ok(None) => {
            // New user - auto-create them
            debug!(clerk_user_id = %clerk_user.user_id, "Creating new user from Clerk");

            let new_user_id = Uuid::new_v4();
            let email = clerk_user.email.as_deref().unwrap_or("unknown@clerk.user");

            // Create the user record
            let upsert = UpsertUser {
                id: new_user_id,
                email,
                first_name: None,
                last_name: None,
                username: None,
            };

            let user = match user_repo.upsert_user(upsert).await {
                Ok(u) => u,
                Err(e) => {
                    error!(?e, "Failed to create user record");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            };

            // Create the oauth_account link
            let oauth_insert = crate::db::oauth_accounts::OAuthAccountInsert {
                user_id: user.id,
                provider: "clerk",
                provider_user_id: &clerk_user.user_id,
                email: clerk_user.email.as_deref(),
                username: None,
                display_name: None,
                avatar_url: None,
            };

            if let Err(e) = oauth_repo.upsert(oauth_insert).await {
                error!(?e, "Failed to create oauth_account link");
                // Continue anyway - user was created
            }

            user
        }
        Err(e) => {
            error!(?e, "Database error looking up oauth_account");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    configure_user_scope(db_user.id, db_user.username.as_deref(), Some(db_user.email.as_str()));

    // Insert as both ClerkRequestContext (new) and RequestContext (legacy compatibility)
    let ctx = ClerkRequestContext {
        user: db_user.clone(),
        clerk_user_id: clerk_user.user_id.clone(),
    };
    req.extensions_mut().insert(ctx);

    // Also insert as the legacy RequestContext for compatibility with existing routes
    // Note: session_id and access_token_expires_at are placeholders since we don't have sessions
    let legacy_ctx = super::middleware::RequestContext {
        user: db_user,
        session_id: Uuid::nil(), // Placeholder - no session with Clerk auth
        access_token_expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
    };
    req.extensions_mut().insert(legacy_ctx);

    next.run(req).await
}
