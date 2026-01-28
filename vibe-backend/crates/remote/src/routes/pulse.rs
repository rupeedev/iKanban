//! Pulse (Activity) API routes for project updates and reactions

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
    db::{
        projects::ProjectRepository,
        pulse::{
            CreateProjectUpdate, ProjectUpdate, ProjectUpdateWithReactions, PulseRepository,
            UpdateProjectUpdate, UpdateReaction,
        },
    },
};

#[derive(Debug, Deserialize)]
pub struct ListPulseQuery {
    pub filter: Option<String>, // "for_me", "popular", "recent"
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ListProjectUpdatesQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct AddReactionRequest {
    pub emoji: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        // Pulse feed
        .route("/pulse", get(list_updates))
        // Project updates
        .route(
            "/projects/{project_id}/updates",
            get(list_project_updates).post(create_update),
        )
        // Single update operations
        .route(
            "/updates/{update_id}",
            get(get_update).put(update_update).delete(delete_update),
        )
        // Reactions
        .route("/updates/{update_id}/reactions", axum::routing::post(add_reaction))
        .route(
            "/updates/{update_id}/reactions/{emoji}",
            axum::routing::delete(remove_reaction),
        )
}

/// List updates for the Pulse feed with filters
#[instrument(
    name = "pulse.list",
    skip(state, ctx, params),
    fields(user_id = %ctx.user.id)
)]
async fn list_updates(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ListPulseQuery>,
) -> Result<Json<ApiResponse<Vec<ProjectUpdateWithReactions>>>, ErrorResponse> {
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);
    let filter = params.filter.as_deref().unwrap_or("recent");

    let updates = match filter {
        "for_me" => PulseRepository::list_for_user(state.pool(), ctx.user.id, limit, offset).await,
        "popular" => PulseRepository::list_popular(state.pool(), limit, offset).await,
        _ => PulseRepository::list_recent(state.pool(), limit, offset).await,
    }
    .map_err(|error| {
        tracing::error!(?error, "failed to list updates");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list updates")
    })?;

    // Enrich with reactions
    let updates_with_reactions = enrich_updates_with_reactions(state.pool(), updates, ctx.user.id).await?;

    Ok(ApiResponse::success(updates_with_reactions))
}

/// List updates for a specific project
#[instrument(
    name = "pulse.list_project",
    skip(state, ctx, params),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn list_project_updates(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Query(params): Query<ListProjectUpdatesQuery>,
) -> Result<Json<ApiResponse<Vec<ProjectUpdateWithReactions>>>, ErrorResponse> {
    // Verify project exists
    ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let updates = PulseRepository::list_by_project(state.pool(), project_id, limit, offset)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to list project updates");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list updates")
        })?;

    // Enrich with reactions
    let updates_with_reactions = enrich_updates_with_reactions(state.pool(), updates, ctx.user.id).await?;

    Ok(ApiResponse::success(updates_with_reactions))
}

/// Create a new project update
#[instrument(
    name = "pulse.create",
    skip(state, ctx, payload),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn create_update(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<CreateProjectUpdate>,
) -> Result<Json<ApiResponse<ProjectUpdate>>, ErrorResponse> {
    // Verify project exists
    ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    let update = PulseRepository::create(state.pool(), project_id, ctx.user.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to create update");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create update")
        })?;

    tracing::info!(%project_id, update_id = %update.id, "created project update");

    Ok(ApiResponse::success(update))
}

/// Get a single update with reactions
#[instrument(
    name = "pulse.get",
    skip(state, ctx),
    fields(update_id = %update_id, user_id = %ctx.user.id)
)]
async fn get_update(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(update_id): Path<Uuid>,
) -> Result<Json<ApiResponse<ProjectUpdateWithReactions>>, ErrorResponse> {
    let update = PulseRepository::find_by_id(state.pool(), update_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to get update");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get update")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "update not found"))?;

    let reactions = PulseRepository::get_reactions(state.pool(), update_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to get reactions");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get reactions")
        })?;

    let user_reactions = PulseRepository::get_user_reactions(state.pool(), update_id, ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to get user reactions");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get user reactions")
        })?;

    Ok(ApiResponse::success(ProjectUpdateWithReactions {
        update,
        reactions,
        user_reactions,
    }))
}

/// Update an existing update (author only)
#[instrument(
    name = "pulse.update",
    skip(state, ctx, payload),
    fields(update_id = %update_id, user_id = %ctx.user.id)
)]
async fn update_update(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(update_id): Path<Uuid>,
    Json(payload): Json<UpdateProjectUpdate>,
) -> Result<Json<ApiResponse<ProjectUpdate>>, ErrorResponse> {
    let update = PulseRepository::update(state.pool(), update_id, ctx.user.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to update");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update")
        })?
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::NOT_FOUND,
                "update not found or you are not the author",
            )
        })?;

    Ok(ApiResponse::success(update))
}

/// Delete an update (author only)
#[instrument(
    name = "pulse.delete",
    skip(state, ctx),
    fields(update_id = %update_id, user_id = %ctx.user.id)
)]
async fn delete_update(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(update_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let deleted = PulseRepository::delete(state.pool(), update_id, ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to delete update");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete update")
        })?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "update not found or you are not the author",
        ))
    }
}

/// Add a reaction to an update
#[instrument(
    name = "pulse.add_reaction",
    skip(state, ctx, payload),
    fields(update_id = %update_id, user_id = %ctx.user.id)
)]
async fn add_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(update_id): Path<Uuid>,
    Json(payload): Json<AddReactionRequest>,
) -> Result<Json<ApiResponse<UpdateReaction>>, ErrorResponse> {
    // Verify update exists
    PulseRepository::find_by_id(state.pool(), update_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to get update");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get update")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "update not found"))?;

    let reaction = PulseRepository::add_reaction(state.pool(), update_id, ctx.user.id, &payload.emoji)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to add reaction");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to add reaction")
        })?;

    Ok(ApiResponse::success(reaction))
}

/// Remove a reaction from an update
#[instrument(
    name = "pulse.remove_reaction",
    skip(state, ctx),
    fields(update_id = %update_id, emoji = %emoji, user_id = %ctx.user.id)
)]
async fn remove_reaction(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((update_id, emoji)): Path<(Uuid, String)>,
) -> Result<StatusCode, ErrorResponse> {
    let removed = PulseRepository::remove_reaction(state.pool(), update_id, ctx.user.id, &emoji)
        .await
        .map_err(|error| {
            tracing::error!(?error, %update_id, "failed to remove reaction");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to remove reaction")
        })?;

    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ErrorResponse::new(StatusCode::NOT_FOUND, "reaction not found"))
    }
}

/// Helper to enrich updates with reaction data
async fn enrich_updates_with_reactions(
    pool: &sqlx::PgPool,
    updates: Vec<ProjectUpdate>,
    user_id: Uuid,
) -> Result<Vec<ProjectUpdateWithReactions>, ErrorResponse> {
    let mut result = Vec::with_capacity(updates.len());

    for update in updates {
        let reactions = PulseRepository::get_reactions(pool, update.id)
            .await
            .unwrap_or_default();
        let user_reactions = PulseRepository::get_user_reactions(pool, update.id, user_id)
            .await
            .unwrap_or_default();

        result.push(ProjectUpdateWithReactions {
            update,
            reactions,
            user_reactions,
        });
    }

    Ok(result)
}
