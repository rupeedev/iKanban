//! Teams routes - Stub implementation for frontend compatibility
//!
//! These endpoints return empty/default data to prevent 404 errors.
//! TODO: Implement actual team management when the feature is needed.

#![allow(dead_code)] // Stub implementation - fields used for API contract

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppState, auth::RequestContext};
use super::error::ApiResponse;

#[derive(Debug, Serialize)]
pub struct Team {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ListTeamsQuery {
    pub workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTeamRequest {
    pub workspace_id: Uuid,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTeamRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TeamProjectAssignment {
    pub project_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct TeamProject {
    pub team_id: Uuid,
    pub project_id: Uuid,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/teams", get(list_teams).post(create_team))
        .route(
            "/teams/{team_id}",
            get(get_team).put(update_team).delete(delete_team),
        )
        .route(
            "/teams/{team_id}/projects",
            get(get_team_projects).post(assign_project),
        )
}

/// List teams - returns empty array (stub)
async fn list_teams(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Query(_params): Query<ListTeamsQuery>,
) -> Json<ApiResponse<Vec<Team>>> {
    // Stub: return empty array
    ApiResponse::success(vec![])
}

/// Get a specific team - returns 404 (stub)
async fn get_team(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_team_id): Path<Uuid>,
) -> Result<Json<ApiResponse<Team>>, StatusCode> {
    // Stub: team not found
    Err(StatusCode::NOT_FOUND)
}

/// Create a team - not implemented (stub)
async fn create_team(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Json(_payload): Json<CreateTeamRequest>,
) -> Result<Json<ApiResponse<Team>>, StatusCode> {
    // Stub: not implemented
    Err(StatusCode::NOT_IMPLEMENTED)
}

/// Update a team - not implemented (stub)
async fn update_team(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_team_id): Path<Uuid>,
    Json(_payload): Json<UpdateTeamRequest>,
) -> Result<Json<ApiResponse<Team>>, StatusCode> {
    // Stub: not implemented
    Err(StatusCode::NOT_IMPLEMENTED)
}

/// Delete a team - not implemented (stub)
async fn delete_team(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_team_id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    // Stub: not implemented
    Err(StatusCode::NOT_IMPLEMENTED)
}

/// Get team projects - returns empty array (stub)
async fn get_team_projects(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_team_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<String>>> {
    // Stub: return empty array
    ApiResponse::success(vec![])
}

/// Assign project to team - not implemented (stub)
async fn assign_project(
    State(_state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(_team_id): Path<Uuid>,
    Json(_payload): Json<TeamProjectAssignment>,
) -> Result<Json<ApiResponse<TeamProject>>, StatusCode> {
    // Stub: not implemented
    Err(StatusCode::NOT_IMPLEMENTED)
}
