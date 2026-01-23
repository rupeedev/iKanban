//! Tags routes - CRUD operations for team tags

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
};
use serde::Deserialize;
use tracing::instrument;
use uuid::Uuid;

use super::{error::{ApiResponse, ErrorResponse}, organization_members::ensure_member_access};
use crate::{
    AppState,
    auth::RequestContext,
    db::tags::{CreateTag, Tag, TagRepository, UpdateTag},
    db::teams::TeamRepository,
};

#[derive(Debug, Deserialize)]
pub struct ListTagsQuery {
    pub team_id: Option<Uuid>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tags", get(list_tags).post(create_tag))
        .route("/tags/{tag_id}", get(get_tag).put(update_tag).delete(delete_tag))
}

/// List tags - returns tags filtered by team_id
#[instrument(
    name = "tags.list_tags",
    skip(state, ctx, params),
    fields(user_id = %ctx.user.id)
)]
async fn list_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ListTagsQuery>,
) -> Result<Json<ApiResponse<Vec<Tag>>>, ErrorResponse> {
    let team_id = params.team_id.ok_or_else(|| {
        ErrorResponse::new(StatusCode::BAD_REQUEST, "team_id is required")
    })?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) = TeamRepository::workspace_id(state.pool(), team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;
    } else {
        return Err(ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"));
    }

    let tags = TagRepository::find_by_team(state.pool(), team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to list tags");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list tags")
        })?;

    Ok(ApiResponse::success(tags))
}

/// Get a specific tag by ID
#[instrument(
    name = "tags.get_tag",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, tag_id = %tag_id)
)]
async fn get_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(tag_id): Path<Uuid>,
) -> Result<Json<ApiResponse<Tag>>, ErrorResponse> {
    let tag = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to get tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    // Verify user has access to tag's team's workspace
    if let Some(team_id) = tag.team_id {
        if let Some(workspace_id) = TeamRepository::workspace_id(state.pool(), team_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get tag")
            })?
        {
            ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;
        }
    }

    Ok(ApiResponse::success(tag))
}

/// Create a new tag
#[instrument(
    name = "tags.create_tag",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id)
)]
async fn create_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateTag>,
) -> Result<Json<ApiResponse<Tag>>, ErrorResponse> {
    // Verify user has access to team's workspace if team_id is provided
    if let Some(team_id) = payload.team_id {
        if let Some(workspace_id) = TeamRepository::workspace_id(state.pool(), team_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create tag")
            })?
        {
            ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;
        } else {
            return Err(ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"));
        }
    }

    let tag = TagRepository::create(state.pool(), &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create tag")
        })?;

    tracing::info!(tag_id = %tag.id, "tag created");
    Ok(ApiResponse::success(tag))
}

/// Update an existing tag
#[instrument(
    name = "tags.update_tag",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, tag_id = %tag_id)
)]
async fn update_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(tag_id): Path<Uuid>,
    Json(payload): Json<UpdateTag>,
) -> Result<Json<ApiResponse<Tag>>, ErrorResponse> {
    // Get existing tag to verify access
    let existing = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to get tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    // Verify user has access to tag's team's workspace
    if let Some(team_id) = existing.team_id {
        if let Some(workspace_id) = TeamRepository::workspace_id(state.pool(), team_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update tag")
            })?
        {
            ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;
        }
    }

    let tag = TagRepository::update(state.pool(), tag_id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to update tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update tag")
        })?;

    tracing::info!(%tag_id, "tag updated");
    Ok(ApiResponse::success(tag))
}

/// Delete a tag
#[instrument(
    name = "tags.delete_tag",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, tag_id = %tag_id)
)]
async fn delete_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(tag_id): Path<Uuid>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    // Get existing tag to verify access
    let existing = TagRepository::find_by_id(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to get tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete tag")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"))?;

    // Verify user has access to tag's team's workspace
    if let Some(team_id) = existing.team_id {
        if let Some(workspace_id) = TeamRepository::workspace_id(state.pool(), team_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete tag")
            })?
        {
            ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;
        }
    }

    let deleted = TagRepository::delete(state.pool(), tag_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %tag_id, "failed to delete tag");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete tag")
        })?;

    if !deleted {
        return Err(ErrorResponse::new(StatusCode::NOT_FOUND, "tag not found"));
    }

    tracing::info!(%tag_id, "tag deleted");
    Ok(ApiResponse::success(()))
}
