use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use chrono::Utc;
use tracing::{info, warn};

use super::middleware::RequestContext;
use crate::{
    AppState,
    db::{
        auth::{AuthSessionError, AuthSessionRepository, MAX_SESSION_INACTIVITY_DURATION},
        identity_errors::IdentityError,
        superadmins::SuperadminRepository,
        users::UserRepository,
    },
};

/// Middleware that requires the user to be an authenticated superadmin.
/// This middleware:
/// 1. Validates the session (same as require_session)
/// 2. Checks if the user's email or user_id exists in superadmins table
/// 3. Returns 403 Forbidden if not a superadmin
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

    // 2. Decode JWT
    let jwt = state.jwt();
    let identity = match jwt.decode_access_token(&bearer) {
        Ok(details) => details,
        Err(error) => {
            warn!(?error, "superadmin: failed to decode access token");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    // 3. Validate session
    let pool = state.pool();
    let session_repo = AuthSessionRepository::new(pool);
    let session = match session_repo.get(identity.session_id).await {
        Ok(session) => session,
        Err(AuthSessionError::NotFound) => {
            warn!("superadmin: session `{}` not found", identity.session_id);
            return StatusCode::UNAUTHORIZED.into_response();
        }
        Err(AuthSessionError::Database(error)) => {
            warn!(?error, "superadmin: failed to load session");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
        Err(_) => {
            warn!("superadmin: failed to load session for unknown reason");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    if session.revoked_at.is_some() {
        warn!(
            "superadmin: session `{}` rejected (revoked)",
            identity.session_id
        );
        return StatusCode::UNAUTHORIZED.into_response();
    }

    if session.inactivity_duration(Utc::now()) > MAX_SESSION_INACTIVITY_DURATION {
        warn!(
            "superadmin: session `{}` expired due to inactivity",
            identity.session_id
        );
        if let Err(error) = session_repo.revoke(session.id).await {
            warn!(?error, "superadmin: failed to revoke inactive session");
        }
        return StatusCode::UNAUTHORIZED.into_response();
    }

    // 4. Load user
    let user_repo = UserRepository::new(pool);
    let user = match user_repo.fetch_user(identity.user_id).await {
        Ok(user) => user,
        Err(IdentityError::NotFound) => {
            warn!("superadmin: user `{}` not found", identity.user_id);
            return StatusCode::UNAUTHORIZED.into_response();
        }
        Err(IdentityError::Database(error)) => {
            warn!(?error, "superadmin: failed to load user");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
        Err(_) => {
            warn!("superadmin: unexpected error loading user");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // 5. Check superadmin status by email (superadmins table uses Clerk user_id as TEXT)
    // We match by email since that's what we have from our users table
    let superadmin_repo = SuperadminRepository::new(pool);
    let is_superadmin = match superadmin_repo.find_by_email(&user.email).await {
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
            user_id = %user.id,
            email = %user.email,
            "superadmin: access denied - not a superadmin"
        );
        return StatusCode::FORBIDDEN.into_response();
    }

    tracing::debug!(
        user_id = %user.id,
        "superadmin: access granted"
    );

    // 6. Insert request context
    req.extensions_mut().insert(RequestContext {
        user,
        session_id: session.id,
        access_token_expires_at: identity.expires_at,
    });

    // 7. Touch session to update last-used timestamp
    if let Err(error) = session_repo.touch(session.id).await {
        warn!(
            ?error,
            "superadmin: failed to update session last-used timestamp"
        );
    }

    next.run(req).await
}

/// Extract the RequestContext from request extensions.
/// Use this in superadmin route handlers to get the authenticated user.
#[allow(dead_code)]
pub fn superadmin_user(req: &Request<Body>) -> Option<&RequestContext> {
    req.extensions().get::<RequestContext>()
}
