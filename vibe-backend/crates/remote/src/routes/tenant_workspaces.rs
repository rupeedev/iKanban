//! Tenant Workspaces API routes for remote server
//!
//! Multi-tenancy workspace management endpoints.

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
};
use db_crate::models::tenant_workspace::{
    AddWorkspaceMember, CreateTenantWorkspace, TenantWorkspace, TenantWorkspaceError,
    TenantWorkspaceMember, UpdateTenantWorkspace, UpdateWorkspaceMemberRole,
    WorkspaceMemberRole,
};
use serde::Deserialize;
use serde_json::json;
use tracing::instrument;
use uuid::Uuid;

use crate::{AppState, auth::RequestContext};

/// Query params for listing workspaces
#[derive(Debug, Deserialize)]
pub struct ListWorkspacesQuery {
    pub user_id: String,
}

/// Query params for ensuring default workspace
#[derive(Debug, Deserialize)]
pub struct EnsureDefaultQuery {
    pub user_id: String,
    pub email: String,
}

/// Query params with user_id
#[derive(Debug, Deserialize)]
pub struct UserQuery {
    pub user_id: String,
}

/// Query params for creating workspace
#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceQuery {
    pub user_id: String,
    pub email: String,
}

/// Public routes (no auth required for some operations)
pub fn public_router() -> Router<AppState> {
    Router::new()
        // These routes use query params for user identification
        .route("/tenant-workspaces", get(list_workspaces))
        .route("/tenant-workspaces/ensure-default", post(ensure_default_workspace))
        .route("/tenant-workspaces/by-slug/{slug}", get(get_workspace_by_slug))
}

/// Protected routes requiring authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        // Workspace CRUD
        .route("/tenant-workspaces", post(create_workspace))
        .route(
            "/tenant-workspaces/{workspace_id}",
            get(get_workspace).put(update_workspace).delete(delete_workspace),
        )
        // Member management
        .route(
            "/tenant-workspaces/{workspace_id}/members",
            get(list_members).post(add_member),
        )
        .route(
            "/tenant-workspaces/{workspace_id}/members/{target_user_id}",
            put(update_member_role).delete(remove_member),
        )
}

/// List all workspaces for a user
#[instrument(name = "tenant_workspaces.list", skip(state), fields(user_id = %params.user_id))]
async fn list_workspaces(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ListWorkspacesQuery>,
) -> impl IntoResponse {
    match TenantWorkspace::find_all_for_user(state.pool(), &params.user_id).await {
        Ok(workspaces) => Json(json!({
            "success": true,
            "data": workspaces
        })).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to list workspaces");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to list workspaces" })),
            ).into_response()
        }
    }
}

/// Ensure user is in default workspace and return all workspaces
#[instrument(name = "tenant_workspaces.ensure_default", skip(state), fields(user_id = %params.user_id))]
async fn ensure_default_workspace(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<EnsureDefaultQuery>,
) -> impl IntoResponse {
    // Find or create the default workspace
    let default_workspace = match TenantWorkspace::find_or_create_default(state.pool()).await {
        Ok(ws) => ws,
        Err(err) => {
            tracing::error!(?err, "Failed to find/create default workspace");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to create default workspace" })),
            ).into_response();
        }
    };

    // Ensure user is a member of the default workspace
    if let Err(err) = TenantWorkspace::ensure_user_is_member(
        state.pool(),
        default_workspace.id,
        &params.user_id,
        &params.email,
    ).await {
        tracing::error!(?err, "Failed to ensure user is member");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": "Failed to add user to workspace" })),
        ).into_response();
    }

    // Return all workspaces the user now belongs to
    match TenantWorkspace::find_all_for_user(state.pool(), &params.user_id).await {
        Ok(workspaces) => Json(json!({
            "success": true,
            "data": workspaces
        })).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to list workspaces after ensure");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to list workspaces" })),
            ).into_response()
        }
    }
}

/// Get workspace by slug
#[instrument(name = "tenant_workspaces.get_by_slug", skip(state), fields(slug = %slug))]
async fn get_workspace_by_slug(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> impl IntoResponse {
    match TenantWorkspace::find_by_slug(state.pool(), &slug).await {
        Ok(Some(workspace)) => {
            // Verify user is a member
            match TenantWorkspaceMember::is_member(state.pool(), workspace.id, &params.user_id).await {
                Ok(true) => Json(json!({
                    "success": true,
                    "data": workspace
                })).into_response(),
                Ok(false) => (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "success": false, "error": "Not a member of this workspace" })),
                ).into_response(),
                Err(err) => {
                    tracing::error!(?err, "Failed to check membership");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": "Failed to verify membership" })),
                    ).into_response()
                }
            }
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "success": false, "error": "Workspace not found" })),
        ).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to get workspace by slug");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to get workspace" })),
            ).into_response()
        }
    }
}

/// Create a new workspace
#[instrument(name = "tenant_workspaces.create", skip(state, _ctx, payload), fields(user_id = %params.user_id))]
async fn create_workspace(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    axum::extract::Query(params): axum::extract::Query<CreateWorkspaceQuery>,
    Json(payload): Json<CreateTenantWorkspace>,
) -> impl IntoResponse {
    match TenantWorkspace::create(
        state.pool(),
        &payload,
        &params.user_id,
        &params.email,
    ).await {
        Ok(workspace) => (
            StatusCode::CREATED,
            Json(json!({
                "success": true,
                "data": workspace
            })),
        ).into_response(),
        Err(TenantWorkspaceError::SlugConflict) => (
            StatusCode::CONFLICT,
            Json(json!({ "success": false, "error": "Workspace slug already in use" })),
        ).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to create workspace");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to create workspace" })),
            ).into_response()
        }
    }
}

/// Get a workspace by ID
#[instrument(name = "tenant_workspaces.get", skip(state), fields(workspace_id = %workspace_id))]
async fn get_workspace(
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> impl IntoResponse {
    // Verify user is a member
    match TenantWorkspaceMember::is_member(state.pool(), workspace_id, &params.user_id).await {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "success": false, "error": "Not a member of this workspace" })),
            ).into_response();
        }
        Err(err) => {
            tracing::error!(?err, "Failed to check membership");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to verify membership" })),
            ).into_response();
        }
    }

    match TenantWorkspace::find_by_id(state.pool(), workspace_id).await {
        Ok(Some(workspace)) => Json(json!({
            "success": true,
            "data": workspace
        })).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "success": false, "error": "Workspace not found" })),
        ).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to get workspace");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to get workspace" })),
            ).into_response()
        }
    }
}

/// Update a workspace
#[instrument(name = "tenant_workspaces.update", skip(state, _ctx, payload), fields(workspace_id = %workspace_id))]
async fn update_workspace(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
    Json(payload): Json<UpdateTenantWorkspace>,
) -> impl IntoResponse {
    // Verify user is owner or admin
    match TenantWorkspaceMember::get_role(state.pool(), workspace_id, &params.user_id).await {
        Ok(Some(WorkspaceMemberRole::Owner)) | Ok(Some(WorkspaceMemberRole::Admin)) => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "success": false, "error": "Only owners and admins can update workspaces" })),
            ).into_response();
        }
        Err(err) => {
            tracing::error!(?err, "Failed to check role");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to verify permissions" })),
            ).into_response();
        }
    }

    match TenantWorkspace::update(state.pool(), workspace_id, &payload).await {
        Ok(workspace) => Json(json!({
            "success": true,
            "data": workspace
        })).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to update workspace");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to update workspace" })),
            ).into_response()
        }
    }
}

/// Delete a workspace
#[instrument(name = "tenant_workspaces.delete", skip(state, _ctx), fields(workspace_id = %workspace_id))]
async fn delete_workspace(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> impl IntoResponse {
    // Only owners can delete
    match TenantWorkspaceMember::get_role(state.pool(), workspace_id, &params.user_id).await {
        Ok(Some(WorkspaceMemberRole::Owner)) => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "success": false, "error": "Only owners can delete workspaces" })),
            ).into_response();
        }
        Err(err) => {
            tracing::error!(?err, "Failed to check role");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to verify permissions" })),
            ).into_response();
        }
    }

    match TenantWorkspace::delete(state.pool(), workspace_id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to delete workspace");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to delete workspace" })),
            ).into_response()
        }
    }
}

// ============================================================================
// Workspace Members Routes
// ============================================================================

/// List members of a workspace
#[instrument(name = "tenant_workspaces.list_members", skip(state), fields(workspace_id = %workspace_id))]
async fn list_members(
    State(state): State<AppState>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> impl IntoResponse {
    // Verify user is a member
    match TenantWorkspaceMember::is_member(state.pool(), workspace_id, &params.user_id).await {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "success": false, "error": "Not a member of this workspace" })),
            ).into_response();
        }
        Err(err) => {
            tracing::error!(?err, "Failed to check membership");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to verify membership" })),
            ).into_response();
        }
    }

    match TenantWorkspaceMember::find_by_workspace(state.pool(), workspace_id).await {
        Ok(members) => Json(json!({
            "success": true,
            "data": members
        })).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to list members");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to list members" })),
            ).into_response()
        }
    }
}

/// Add a member to a workspace
#[instrument(name = "tenant_workspaces.add_member", skip(state, _ctx, payload), fields(workspace_id = %workspace_id))]
async fn add_member(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
    Json(payload): Json<AddWorkspaceMember>,
) -> impl IntoResponse {
    // Verify user is owner or admin
    match TenantWorkspaceMember::get_role(state.pool(), workspace_id, &params.user_id).await {
        Ok(Some(WorkspaceMemberRole::Owner)) | Ok(Some(WorkspaceMemberRole::Admin)) => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "success": false, "error": "Only owners and admins can add members" })),
            ).into_response();
        }
        Err(err) => {
            tracing::error!(?err, "Failed to check role");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to verify permissions" })),
            ).into_response();
        }
    }

    match TenantWorkspaceMember::add(state.pool(), workspace_id, &payload).await {
        Ok(member) => (
            StatusCode::CREATED,
            Json(json!({
                "success": true,
                "data": member
            })),
        ).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to add member");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to add member" })),
            ).into_response()
        }
    }
}

/// Update a member's role
#[instrument(name = "tenant_workspaces.update_member_role", skip(state, _ctx, payload), fields(workspace_id = %workspace_id, target_user_id = %target_user_id))]
async fn update_member_role(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((workspace_id, target_user_id)): Path<(Uuid, String)>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
    Json(payload): Json<UpdateWorkspaceMemberRole>,
) -> impl IntoResponse {
    // Only owners can change roles
    match TenantWorkspaceMember::get_role(state.pool(), workspace_id, &params.user_id).await {
        Ok(Some(WorkspaceMemberRole::Owner)) => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "success": false, "error": "Only owners can change member roles" })),
            ).into_response();
        }
        Err(err) => {
            tracing::error!(?err, "Failed to check role");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to verify permissions" })),
            ).into_response();
        }
    }

    match TenantWorkspaceMember::update_role(
        state.pool(),
        workspace_id,
        &target_user_id,
        payload.role,
    ).await {
        Ok(member) => Json(json!({
            "success": true,
            "data": member
        })).into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to update member role");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to update member role" })),
            ).into_response()
        }
    }
}

/// Remove a member from a workspace
#[instrument(name = "tenant_workspaces.remove_member", skip(state, _ctx), fields(workspace_id = %workspace_id, target_user_id = %target_user_id))]
async fn remove_member(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path((workspace_id, target_user_id)): Path<(Uuid, String)>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> impl IntoResponse {
    // Owner/admin can remove others, anyone can remove themselves
    let is_self = params.user_id == target_user_id;

    if !is_self {
        match TenantWorkspaceMember::get_role(state.pool(), workspace_id, &params.user_id).await {
            Ok(Some(WorkspaceMemberRole::Owner)) | Ok(Some(WorkspaceMemberRole::Admin)) => {}
            Ok(_) => {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "success": false, "error": "Only owners and admins can remove other members" })),
                ).into_response();
            }
            Err(err) => {
                tracing::error!(?err, "Failed to check role");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": "Failed to verify permissions" })),
                ).into_response();
            }
        }
    }

    match TenantWorkspaceMember::remove(state.pool(), workspace_id, &target_user_id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            tracing::error!(?err, "Failed to remove member");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to remove member" })),
            ).into_response()
        }
    }
}
