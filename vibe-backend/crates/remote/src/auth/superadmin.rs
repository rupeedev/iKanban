//! Superadmin middleware for protected admin routes.

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use tracing::{debug, info, warn};
use uuid::Uuid;

use super::middleware::RequestContext;
use crate::{
    AppState, configure_user_scope,
    db::{
        identity_errors::IdentityError,
        oauth_accounts::OAuthAccountRepository,
        superadmins::SuperadminRepository,
        users::{UpsertUser, UserRepository},
    },
};

/// Middleware that requires the user to be an authenticated superadmin.
/// This middleware:
/// 1. Validates the Clerk JWT token
/// 2. Looks up or creates the database user
/// 3. Checks if the user's email exists in superadmins table
/// 4. Returns 403 Forbidden if not a superadmin
///
/// Use this middleware to protect /superadmin/* routes.
#[allow(dead_code)]
pub async fn require_superadmin(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    // 1. Extract bearer token
    let bearer = match req.headers().typed_get::<Authorization<Bearer>>() {
        Some(Authorization(token)) => token.token().to_owned(),
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    // 2. Validate Clerk token
    let clerk_auth = state.clerk_auth();
    let clerk_user = match clerk_auth.validate_token(&bearer).await {
        Ok(user) => user,
        Err(error) => {
            warn!(?error, "superadmin: failed to validate Clerk token");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    // 3. Look up or create database user
    let pool = state.pool();
    let oauth_repo = OAuthAccountRepository::new(pool);
    let user_repo = UserRepository::new(pool);

    let db_user = match oauth_repo.get_by_provider_user("clerk", &clerk_user.user_id).await {
        Ok(Some(oauth_account)) => {
            match user_repo.fetch_user(oauth_account.user_id).await {
                Ok(user) => user,
                Err(e) => {
                    warn!(?e, "superadmin: failed to fetch user");
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            }
        }
        Ok(None) => {
            // New user - auto-create them
            debug!(clerk_user_id = %clerk_user.user_id, "superadmin: creating new user from Clerk");

            let new_user_id = Uuid::new_v4();
            let email = clerk_user.email.as_deref().unwrap_or("unknown@clerk.user");

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
                    warn!(?e, "superadmin: failed to create user");
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
                warn!(?e, "superadmin: failed to create oauth_account link");
            }

            user
        }
        Err(e) => {
            warn!(?e, "superadmin: database error looking up oauth_account");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // 4. Check superadmin status by email
    let superadmin_repo = SuperadminRepository::new(pool);
    let is_superadmin = match superadmin_repo.find_by_email(&db_user.email).await {
        Ok(Some(superadmin)) => superadmin.is_active,
        Ok(None) => false,
        Err(IdentityError::Database(error)) => {
            warn!(?error, "superadmin: failed to check superadmin status");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
        Err(error) => {
            warn!(
                ?error,
                "superadmin: unexpected error checking superadmin status"
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if !is_superadmin {
        info!(
            user_id = %db_user.id,
            email = %db_user.email,
            "superadmin: access denied - not a superadmin"
        );
        return StatusCode::FORBIDDEN.into_response();
    }

    debug!(
        user_id = %db_user.id,
        "superadmin: access granted"
    );

    configure_user_scope(db_user.id, db_user.username.as_deref(), Some(db_user.email.as_str()));

    // 5. Insert request context (compatible with existing routes)
    req.extensions_mut().insert(RequestContext {
        user: db_user,
        session_id: Uuid::nil(), // Placeholder - no session with Clerk auth
        access_token_expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
    });

    next.run(req).await
}

/// Extract the RequestContext from request extensions.
/// Use this in superadmin route handlers to get the authenticated user.
#[allow(dead_code)]
pub fn superadmin_user(req: &Request<Body>) -> Option<&RequestContext> {
    req.extensions().get::<RequestContext>()
}
