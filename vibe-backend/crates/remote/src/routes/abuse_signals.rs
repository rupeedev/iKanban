//! Abuse Detection Signals API routes (IKA-188)
//!
//! Endpoints for managing abuse detection signals - creating, listing, and resolving.
//! These signals are used to track and mitigate abusive behavior patterns.

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use db_crate::models::{AbuseDetectionSignal, CreateAbuseSignal, ResolveAbuseSignal};
use serde_json::json;
use tracing::instrument;
use uuid::Uuid;

use super::error::ApiResponse;
use crate::{AppState, auth::RequestContext};

/// Protected routes requiring authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        // Get abuse signals for current user
        .route("/abuse-signals/me", get(get_my_abuse_signals))
        // Admin routes for managing abuse signals
        .route("/admin/abuse-signals", get(list_unresolved_signals))
        .route("/admin/abuse-signals/user/{user_id}", get(get_user_signals))
        .route("/admin/abuse-signals", post(create_signal))
        .route(
            "/admin/abuse-signals/{signal_id}/resolve",
            post(resolve_signal),
        )
}

/// Get the current user's abuse signals
#[instrument(name = "abuse_signals.get_my_abuse_signals", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn get_my_abuse_signals(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let user_id = ctx.user.id.to_string();

    match AbuseDetectionSignal::find_by_user_id(state.pool(), &user_id).await {
        Ok(signals) => Json(signals).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to get abuse signals");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// List all unresolved abuse signals (admin only)
#[instrument(name = "abuse_signals.list_unresolved_signals", skip(state, _ctx))]
async fn list_unresolved_signals(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    match AbuseDetectionSignal::list_unresolved(state.pool()).await {
        Ok(signals) => ApiResponse::success(signals).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to list unresolved abuse signals");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "message": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Get abuse signals for a specific user (admin only)
#[instrument(name = "abuse_signals.get_user_signals", skip(state, _ctx), fields(target_user_id = %user_id))]
async fn get_user_signals(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(user_id): Path<String>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    match AbuseDetectionSignal::find_by_user_id(state.pool(), &user_id).await {
        Ok(signals) => Json(signals).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to get user abuse signals");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Create a new abuse signal (admin only)
#[instrument(name = "abuse_signals.create_signal", skip(state, _ctx, body))]
async fn create_signal(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Json(body): Json<CreateAbuseSignal>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    match AbuseDetectionSignal::create(state.pool(), &body).await {
        Ok(signal) => (StatusCode::CREATED, Json(signal)).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to create abuse signal");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}

/// Resolve an abuse signal (admin only)
#[instrument(name = "abuse_signals.resolve_signal", skip(state, ctx, body), fields(signal_id = %signal_id, resolved_by = %ctx.user.id))]
async fn resolve_signal(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(signal_id): Path<Uuid>,
    Json(body): Json<ResolveAbuseSignal>,
) -> Response {
    // TODO: Add admin role check when role system is implemented

    let resolved_by = ctx.user.id.to_string();

    match AbuseDetectionSignal::resolve(
        state.pool(),
        signal_id,
        &resolved_by,
        body.resolution_notes.as_deref(),
    )
    .await
    {
        Ok(signal) => Json(signal).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to resolve abuse signal");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
                .into_response()
        }
    }
}
