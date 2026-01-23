//! Inbox notification routes

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
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
    db::inbox::{CreateInboxItem, InboxItem, InboxRepository, InboxSummary},
};

#[derive(Debug, Deserialize)]
pub struct ListInboxQuery {
    pub limit: Option<i64>,
    pub unread_only: Option<bool>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/inbox", get(list_inbox).post(create_inbox_item))
        .route("/inbox/summary", get(get_inbox_summary))
        .route("/inbox/read-all", axum::routing::post(mark_all_as_read))
        .route(
            "/inbox/{item_id}",
            get(get_inbox_item).delete(delete_inbox_item),
        )
        .route("/inbox/{item_id}/read", axum::routing::post(mark_as_read))
}

/// List inbox items for the current user
#[instrument(
    name = "inbox.list",
    skip(state, ctx, params),
    fields(user_id = %ctx.user.id)
)]
async fn list_inbox(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ListInboxQuery>,
) -> Result<Json<ApiResponse<Vec<InboxItem>>>, ErrorResponse> {
    let items = if params.unread_only.unwrap_or(false) {
        InboxRepository::find_unread(state.pool(), ctx.user.id, params.limit)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to list unread inbox items");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list inbox items",
                )
            })?
    } else {
        InboxRepository::find_all(state.pool(), ctx.user.id, params.limit)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to list inbox items");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list inbox items",
                )
            })?
    };

    Ok(ApiResponse::success(items))
}

/// Get inbox summary (counts)
#[instrument(
    name = "inbox.summary",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn get_inbox_summary(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<InboxSummary>>, ErrorResponse> {
    let summary = InboxRepository::get_summary(state.pool(), ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to get inbox summary");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get inbox summary",
            )
        })?;

    Ok(ApiResponse::success(summary))
}

/// Get a specific inbox item
#[instrument(
    name = "inbox.get",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, item_id = %item_id)
)]
async fn get_inbox_item(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(item_id): Path<Uuid>,
) -> Result<Json<ApiResponse<InboxItem>>, ErrorResponse> {
    let item = InboxRepository::find_by_id(state.pool(), item_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %item_id, "failed to get inbox item");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get inbox item",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "inbox item not found"))?;

    // Verify ownership
    if item.user_id != ctx.user.id {
        return Err(ErrorResponse::new(StatusCode::FORBIDDEN, "access denied"));
    }

    Ok(ApiResponse::success(item))
}

/// Create a new inbox item (typically called by system, not users)
#[instrument(
    name = "inbox.create",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id)
)]
async fn create_inbox_item(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateInboxItem>,
) -> Result<Json<ApiResponse<InboxItem>>, ErrorResponse> {
    let item = InboxRepository::create(state.pool(), ctx.user.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create inbox item");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to create inbox item",
            )
        })?;

    Ok(ApiResponse::success(item))
}

/// Mark an inbox item as read
#[instrument(
    name = "inbox.mark_read",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, item_id = %item_id)
)]
async fn mark_as_read(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(item_id): Path<Uuid>,
) -> Result<Json<ApiResponse<InboxItem>>, ErrorResponse> {
    let item = InboxRepository::mark_as_read(state.pool(), item_id, ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %item_id, "failed to mark inbox item as read");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to mark as read")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "inbox item not found"))?;

    Ok(ApiResponse::success(item))
}

/// Mark all inbox items as read
#[instrument(
    name = "inbox.mark_all_read",
    skip(state, ctx),
    fields(user_id = %ctx.user.id)
)]
async fn mark_all_as_read(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ApiResponse<u64>>, ErrorResponse> {
    let count = InboxRepository::mark_all_as_read(state.pool(), ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to mark all inbox items as read");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to mark all as read",
            )
        })?;

    Ok(ApiResponse::success(count))
}

/// Delete an inbox item
#[instrument(
    name = "inbox.delete",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, item_id = %item_id)
)]
async fn delete_inbox_item(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(item_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let deleted = InboxRepository::delete(state.pool(), item_id, ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %item_id, "failed to delete inbox item");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete inbox item",
            )
        })?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "inbox item not found",
        ))
    }
}
