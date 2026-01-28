//! Subscription API routes for Pulse digest preferences

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
use tracing::instrument;
use uuid::Uuid;

use super::error::{ApiResponse, ErrorResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        projects::ProjectRepository,
        subscriptions::{
            DigestFrequency, SubscriptionRepository, SubscriptionSettings, UserSubscription,
        },
    },
};

#[derive(Debug, Deserialize)]
pub struct UpdateGlobalSettingsRequest {
    pub digest_frequency: DigestFrequency,
}

pub fn router() -> Router<AppState> {
    Router::new()
        // Global subscription settings
        .route(
            "/subscriptions",
            get(get_settings).put(update_global_settings),
        )
        // Project subscriptions
        .route(
            "/projects/{project_id}/subscribe",
            axum::routing::post(subscribe_to_project).delete(unsubscribe_from_project),
        )
}

/// Get user's subscription settings
#[instrument(
    name = "subscriptions.get",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn get_settings(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<SubscriptionSettings>>, ErrorResponse> {
    let settings = SubscriptionRepository::get_settings(state.pool(), ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get subscription settings");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get settings")
        })?;

    Ok(ApiResponse::success(settings))
}

/// Update global digest frequency
#[instrument(
    name = "subscriptions.update_global",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id)
)]
async fn update_global_settings(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<UpdateGlobalSettingsRequest>,
) -> Result<Json<ApiResponse<UserSubscription>>, ErrorResponse> {
    let subscription = SubscriptionRepository::upsert_global_settings(
        state.pool(),
        ctx.user.id,
        &payload.digest_frequency,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to update global settings");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to update settings",
        )
    })?;

    Ok(ApiResponse::success(subscription))
}

/// Subscribe to a project
#[instrument(
    name = "subscriptions.subscribe",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn subscribe_to_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ApiResponse<UserSubscription>>, ErrorResponse> {
    // Verify project exists
    ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    let subscription =
        SubscriptionRepository::subscribe_to_project(state.pool(), ctx.user.id, project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %project_id, "failed to subscribe");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to subscribe")
            })?;

    tracing::info!(%project_id, "subscribed to project");

    Ok(ApiResponse::success(subscription))
}

/// Unsubscribe from a project
#[instrument(
    name = "subscriptions.unsubscribe",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn unsubscribe_from_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let removed =
        SubscriptionRepository::unsubscribe_from_project(state.pool(), ctx.user.id, project_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %project_id, "failed to unsubscribe");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to unsubscribe")
            })?;

    if removed {
        tracing::info!(%project_id, "unsubscribed from project");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "subscription not found",
        ))
    }
}
