//! Email Verification API routes (IKA-189)
//!
//! Endpoints for email verification flow:
//! - Send verification email
//! - Verify token
//! - Check verification status
//! - Resend verification email

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Duration, Utc};
use db_crate::models::{
    EmailVerification, SendVerificationRequest,
    user_trust_profile::{TrustLevel, UserTrustProfile},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::instrument;

use crate::{AppState, auth::RequestContext};

/// Response for verification status
#[derive(Debug, Serialize)]
pub struct VerificationStatusResponse {
    pub is_verified: bool,
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_verification: Option<PendingVerification>,
}

#[derive(Debug, Serialize)]
pub struct PendingVerification {
    pub email: String,
    pub expires_at: DateTime<Utc>,
    pub can_resend: bool,
}

/// Query params for verify endpoint
#[derive(Debug, Deserialize)]
pub struct VerifyEmailQuery {
    pub token: String,
}

/// Response after sending verification email
#[derive(Debug, Serialize)]
pub struct SendVerificationResponse {
    pub message: String,
    pub expires_at: DateTime<Utc>,
}

/// Response after successful verification
#[derive(Debug, Serialize)]
pub struct VerifyEmailResponse {
    pub message: String,
    pub email: String,
    pub trust_level_upgraded: bool,
}

/// Public routes (no auth required for verify endpoint)
pub fn public_router() -> Router<AppState> {
    Router::new()
        // Verify email token (public - called from email link)
        .route("/auth/verify-email", get(verify_email))
}

/// Protected routes requiring authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        // Check verification status
        .route("/auth/verification-status", get(get_verification_status))
        // Send/resend verification email
        .route("/auth/send-verification", post(send_verification_email))
}

/// Get the current user's email verification status
#[instrument(name = "email_verification.get_status", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn get_verification_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let user_id = ctx.user.id.to_string();

    // Check if user has verified email
    match EmailVerification::is_email_verified(state.pool(), &user_id).await {
        Ok(true) => {
            // Get the verified email
            match EmailVerification::get_verified_email(state.pool(), &user_id).await {
                Ok(Some(email)) => {
                    Json(VerificationStatusResponse {
                        is_verified: true,
                        email: Some(email),
                        verified_at: None, // Could add this if needed
                        pending_verification: None,
                    })
                    .into_response()
                }
                Ok(None) => Json(VerificationStatusResponse {
                    is_verified: true,
                    email: None,
                    verified_at: None,
                    pending_verification: None,
                })
                .into_response(),
                Err(err) => {
                    tracing::error!(?err, "failed to get verified email");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": "internal server error" })),
                    )
                        .into_response()
                }
            }
        }
        Ok(false) => {
            // Check for pending verification
            match EmailVerification::find_pending_by_user(state.pool(), &user_id).await {
                Ok(Some(pending)) => {
                    // Check if can resend (rate limit: 1 minute)
                    let can_resend = pending.created_at + Duration::minutes(1) < Utc::now();

                    Json(VerificationStatusResponse {
                        is_verified: false,
                        email: None,
                        verified_at: None,
                        pending_verification: Some(PendingVerification {
                            email: pending.email,
                            expires_at: pending.expires_at,
                            can_resend,
                        }),
                    })
                    .into_response()
                }
                Ok(None) => Json(VerificationStatusResponse {
                    is_verified: false,
                    email: None,
                    verified_at: None,
                    pending_verification: None,
                })
                .into_response(),
                Err(err) => {
                    tracing::error!(?err, "failed to find pending verification");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": "internal server error" })),
                    )
                        .into_response()
                }
            }
        }
        Err(err) => {
            tracing::error!(?err, "failed to check email verification status");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Send verification email to the user
#[instrument(name = "email_verification.send", skip(state, ctx, body), fields(user_id = %ctx.user.id))]
async fn send_verification_email(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(body): Json<SendVerificationRequest>,
) -> Response {
    let user_id = ctx.user.id.to_string();
    let email = body.email.trim().to_lowercase();

    // Validate email format
    if !email.contains('@') || email.len() < 5 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid email address" })),
        )
            .into_response();
    }

    // Check if already verified
    match EmailVerification::is_email_verified(state.pool(), &user_id).await {
        Ok(true) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Email is already verified" })),
            )
                .into_response();
        }
        Err(err) => {
            tracing::error!(?err, "failed to check verification status");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response();
        }
        _ => {}
    }

    // Check rate limit (1 email per minute)
    if let Ok(Some(pending)) = EmailVerification::find_pending_by_user(state.pool(), &user_id).await
        && pending.created_at + Duration::minutes(1) > Utc::now()
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({
                "error": "Please wait before requesting another verification email",
                "retry_after_seconds": 60
            })),
        )
            .into_response();
    }

    // Create verification record and token
    match EmailVerification::create(state.pool(), &user_id, &email).await {
        Ok((verification, token)) => {
            // Build verification URL
            let verify_url = format!(
                "{}/auth/verify-email?token={}",
                state.server_public_base_url, token
            );

            // Send email via mailer
            state
                .mailer
                .send_email_verification(&email, &verify_url)
                .await;

            Json(SendVerificationResponse {
                message: "Verification email sent".to_string(),
                expires_at: verification.expires_at,
            })
            .into_response()
        }
        Err(err) => {
            tracing::error!(?err, "failed to create verification record");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to send verification email" })),
            )
                .into_response()
        }
    }
}

/// Verify email token (called from email link)
#[instrument(name = "email_verification.verify", skip(state, query))]
async fn verify_email(
    State(state): State<AppState>,
    Query(query): Query<VerifyEmailQuery>,
) -> Response {
    let token = query.token.trim();

    if token.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Missing verification token" })),
        )
            .into_response();
    }

    // Verify the token
    match EmailVerification::verify_token(state.pool(), token).await {
        Ok(Some(verification)) => {
            // Upgrade user's trust level if at NewUser level
            let trust_level_upgraded =
                upgrade_trust_level_if_needed(state.pool(), &verification.user_id).await;

            // Redirect to app with success message
            // In production, this would redirect to the frontend
            Json(VerifyEmailResponse {
                message: "Email verified successfully".to_string(),
                email: verification.email,
                trust_level_upgraded,
            })
            .into_response()
        }
        Ok(None) => (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Invalid or expired verification token",
                "details": "The token may have expired or already been used"
            })),
        )
            .into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to verify token");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to verify email" })),
            )
                .into_response()
        }
    }
}

/// Upgrade trust level from NewUser to Basic when email is verified
async fn upgrade_trust_level_if_needed(pool: &sqlx::PgPool, user_id: &str) -> bool {
    match UserTrustProfile::find_by_user_id(pool, user_id).await {
        Ok(Some(profile)) => {
            if profile.trust_level == TrustLevel::New {
                // Upgrade to Basic trust level
                match UserTrustProfile::update_trust_level(pool, user_id, TrustLevel::Basic).await {
                    Ok(_) => {
                        tracing::info!(
                            user_id = %user_id,
                            "Trust level upgraded from NewUser to Basic after email verification"
                        );
                        true
                    }
                    Err(err) => {
                        tracing::error!(?err, "failed to upgrade trust level");
                        false
                    }
                }
            } else {
                false
            }
        }
        Ok(None) => {
            // Create profile with Basic trust level
            match UserTrustProfile::get_or_create(pool, user_id).await {
                Ok(profile) => {
                    if profile.trust_level == TrustLevel::New {
                        match UserTrustProfile::update_trust_level(pool, user_id, TrustLevel::Basic)
                            .await
                        {
                            Ok(_) => {
                                tracing::info!(
                                    user_id = %user_id,
                                    "Trust level upgraded from NewUser to Basic after email verification (new profile)"
                                );
                                return true;
                            }
                            Err(err) => {
                                tracing::error!(
                                    ?err,
                                    "failed to upgrade trust level for new profile"
                                );
                            }
                        }
                    }
                    false
                }
                Err(err) => {
                    tracing::error!(?err, "failed to get or create trust profile");
                    false
                }
            }
        }
        Err(err) => {
            tracing::error!(?err, "failed to find trust profile");
            false
        }
    }
}
