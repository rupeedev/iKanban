//! API keys routes for programmatic access

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use tracing::instrument;
use uuid::Uuid;

use super::error::{ApiResponse, ErrorResponse};
use crate::{
    AppState,
    auth::RequestContext,
    db::api_keys::{ApiKeyInfo, ApiKeyRepository, ApiKeyWithSecret, CreateApiKeyRequest},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api-keys", get(list_api_keys).post(create_api_key))
        .route("/api-keys/{key_id}", axum::routing::delete(delete_api_key))
        .route("/api-keys/{key_id}/revoke", post(revoke_api_key))
}

/// List all API keys for the current user
#[instrument(
    name = "api_keys.list",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn list_api_keys(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<Vec<ApiKeyInfo>>>, ErrorResponse> {
    let user_id = ctx.user.id.to_string();
    let keys = ApiKeyRepository::list_by_user(state.pool(), &user_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to list API keys");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list API keys")
        })?;

    Ok(ApiResponse::success(keys))
}

/// Create a new API key
#[instrument(
    name = "api_keys.create",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id)
)]
async fn create_api_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateApiKeyRequest>,
) -> Result<Json<ApiResponse<ApiKeyWithSecret>>, ErrorResponse> {
    if payload.name.trim().is_empty() {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "API key name is required",
        ));
    }

    let user_id = ctx.user.id.to_string();
    let key = ApiKeyRepository::create(state.pool(), &user_id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create API key");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to create API key",
            )
        })?;

    Ok(ApiResponse::success(key))
}

/// Revoke an API key
#[instrument(
    name = "api_keys.revoke",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, key_id = %key_id)
)]
async fn revoke_api_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(key_id): Path<Uuid>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    let user_id = ctx.user.id.to_string();
    let revoked = ApiKeyRepository::revoke(state.pool(), key_id, &user_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %key_id, "failed to revoke API key");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to revoke API key",
            )
        })?;

    if !revoked {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "API key not found or already revoked",
        ));
    }

    Ok(ApiResponse::success(()))
}

/// Delete an API key permanently
#[instrument(
    name = "api_keys.delete",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, key_id = %key_id)
)]
async fn delete_api_key(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(key_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let user_id = ctx.user.id.to_string();
    let deleted = ApiKeyRepository::delete(state.pool(), key_id, &user_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %key_id, "failed to delete API key");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete API key",
            )
        })?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "API key not found",
        ))
    }
}
