//! Trust Profiles API routes (IKA-186)
//!
//! Endpoints for managing user trust profiles, flagging, and banning.

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use db_crate::models::user_trust_profile::{
    BanUserRequest, FlagUserRequest, TrustLevel, UserTrustProfile,
};
use serde_json::json;
use tracing::instrument;

use super::error::ApiResponse;
use crate::{AppState, auth::RequestContext};

/// Protected routes requiring authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        // Get current user's trust profile
        .route("/trust-profile", get(get_my_trust_profile))
        // Admin routes for managing trust profiles
        .route("/admin/trust-profiles/flagged", get(list_flagged_users))
        .route(
            "/admin/trust-profiles/{user_id}",
            get(get_user_trust_profile),
        )
        .route("/admin/trust-profiles/{user_id}/flag", post(flag_user))
        .route("/admin/trust-profiles/{user_id}/unflag", post(unflag_user))
        .route("/admin/trust-profiles/{user_id}/ban", post(ban_user))
        .route(
            "/admin/trust-profiles/{user_id}/trust-level",
            post(update_trust_level),
        )
}

/// Get the current user's trust profile
#[instrument(name = "trust_profiles.get_my_trust_profile", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn get_my_trust_profile(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let user_id = ctx.user.id.to_string();

    match UserTrustProfile::get_or_create(state.pool(), &user_id).await {
        Ok(profile) => Json(profile).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to get/create trust profile");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// List all flagged users (admin only)
#[instrument(name = "trust_profiles.list_flagged_users", skip(state, _ctx))]
async fn list_flagged_users(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    match UserTrustProfile::list_flagged(state.pool()).await {
        Ok(profiles) => ApiResponse::success(profiles).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to list flagged users");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "message": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Get a specific user's trust profile (admin only)
#[instrument(name = "trust_profiles.get_user_trust_profile", skip(state, _ctx), fields(target_user_id = %user_id))]
async fn get_user_trust_profile(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(user_id): Path<String>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    match UserTrustProfile::find_by_user_id(state.pool(), &user_id).await {
        Ok(Some(profile)) => Json(profile).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "trust profile not found" })),
        )
            .into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to get trust profile");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Flag a user (admin only)
#[instrument(name = "trust_profiles.flag_user", skip(state, ctx, body), fields(target_user_id = %user_id, admin_id = %ctx.user.id))]
async fn flag_user(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(user_id): Path<String>,
    Json(body): Json<FlagUserRequest>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    let flagged_by = ctx.user.id.to_string();

    match UserTrustProfile::flag_user(state.pool(), &user_id, &body.reason, &flagged_by).await {
        Ok(profile) => Json(profile).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to flag user");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Unflag a user (admin only)
#[instrument(name = "trust_profiles.unflag_user", skip(state, _ctx), fields(target_user_id = %user_id))]
async fn unflag_user(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(user_id): Path<String>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    match UserTrustProfile::unflag_user(state.pool(), &user_id).await {
        Ok(profile) => Json(profile).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to unflag user");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Ban a user (admin only)
#[instrument(name = "trust_profiles.ban_user", skip(state, ctx, body), fields(target_user_id = %user_id, admin_id = %ctx.user.id))]
async fn ban_user(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(user_id): Path<String>,
    Json(body): Json<BanUserRequest>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    let banned_by = ctx.user.id.to_string();

    match UserTrustProfile::ban_user(state.pool(), &user_id, &body.reason, &banned_by).await {
        Ok(profile) => Json(profile).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to ban user");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Request body for updating trust level
#[derive(Debug, serde::Deserialize)]
pub struct UpdateTrustLevelRequest {
    pub trust_level: i32,
}

/// Update a user's trust level (admin only)
#[instrument(name = "trust_profiles.update_trust_level", skip(state, _ctx, body), fields(target_user_id = %user_id))]
async fn update_trust_level(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(user_id): Path<String>,
    Json(body): Json<UpdateTrustLevelRequest>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    let level = TrustLevel::from(body.trust_level);

    match UserTrustProfile::update_trust_level(state.pool(), &user_id, level).await {
        Ok(profile) => Json(profile).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to update trust level");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}
