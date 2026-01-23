//! Teams routes - Real implementation using database

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    db::teams::{Team, TeamDocument, TeamFolder, TeamInvitation, TeamIssue, TeamMember, TeamRepository},
    db::projects::{Project, ProjectRepository},
};
use super::error::{ApiResponse, ErrorResponse};
use super::organization_members::ensure_member_access;

#[derive(Debug, Deserialize)]
pub struct ListTeamsQuery {
    pub workspace_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct CreateTeamRequest {
    pub workspace_id: Uuid,
    pub name: String,
    pub slug: String,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTeamRequest {
    pub name: Option<String>,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub document_storage_path: Option<String>,
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

/// Team dashboard response with all aggregated data
#[derive(Debug, Serialize)]
pub struct TeamDashboard {
    pub team: Team,
    pub members: Vec<TeamMember>,
    pub project_ids: Vec<Uuid>,
    pub projects: Vec<Project>,
    pub issues: Vec<TeamIssue>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/teams", get(list_teams).post(create_team))
        .route(
            "/teams/{team_id}",
            get(get_team).put(update_team).delete(delete_team),
        )
        .route("/teams/{team_id}/dashboard", get(get_team_dashboard))
        .route(
            "/teams/{team_id}/projects",
            get(get_team_projects).post(assign_project),
        )
        .route("/teams/{team_id}/issues", get(get_team_issues))
        .route("/teams/{team_id}/members", get(get_team_members))
        .route("/teams/{team_id}/members/sync", axum::routing::post(sync_team_members))
        .route("/teams/{team_id}/invitations", get(get_team_invitations))
        .route("/teams/{team_id}/documents", get(get_team_documents))
        .route("/teams/{team_id}/folders", get(get_team_folders))
}

/// List teams - returns teams from database
#[instrument(
    name = "teams.list_teams",
    skip(state, ctx, params),
    fields(user_id = %ctx.user.id)
)]
async fn list_teams(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ListTeamsQuery>,
) -> Result<Json<ApiResponse<Vec<Team>>>, ErrorResponse> {
    let teams = match params.workspace_id {
        Some(workspace_id) => {
            // Verify user has access to this workspace
            ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;

            TeamRepository::list_by_workspace(state.pool(), workspace_id)
                .await
                .map_err(|error| {
                    tracing::error!(?error, %workspace_id, "failed to list teams");
                    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list teams")
                })?
        }
        None => {
            // No workspace filter - return all teams (for now)
            // In production, this should probably be restricted
            TeamRepository::list_all(state.pool())
                .await
                .map_err(|error| {
                    tracing::error!(?error, "failed to list all teams");
                    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list teams")
                })?
        }
    };

    Ok(ApiResponse::success(teams))
}

/// Get a specific team by ID or slug
#[instrument(
    name = "teams.get_team",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id)
)]
async fn get_team(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Team>>, ErrorResponse> {
    let team = TeamRepository::get_by_id_or_slug(state.pool(), &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) = TeamRepository::workspace_id(state.pool(), team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;
    }

    Ok(ApiResponse::success(team))
}

/// Get team dashboard - aggregated team data (accepts ID or slug)
#[instrument(
    name = "teams.get_team_dashboard",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id)
)]
async fn get_team_dashboard(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<TeamDashboard>>, ErrorResponse> {
    let pool = state.pool();

    // Get team by ID or slug
    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    let team_uuid = team.id;

    // Verify user has access to team's workspace
    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team_uuid)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Get members
    let members = TeamRepository::get_members(pool, team_uuid)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team members");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team members")
        })?;

    // Get project IDs
    let project_ids = TeamRepository::get_project_ids(pool, team_uuid)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team project IDs");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team projects")
        })?;

    // Get projects (fetch all by their IDs)
    let mut projects = Vec::new();
    for project_id in &project_ids {
        if let Ok(Some(project)) = ProjectRepository::fetch_by_id(pool, *project_id).await {
            projects.push(project);
        }
    }

    // Get issues
    let issues = TeamRepository::get_issues(pool, team_uuid)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team issues");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team issues")
        })?;

    Ok(ApiResponse::success(TeamDashboard {
        team,
        members,
        project_ids,
        projects,
        issues,
    }))
}

/// Create a team - not implemented yet
async fn create_team(
    State(_state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(_payload): Json<CreateTeamRequest>,
) -> Result<Json<ApiResponse<Team>>, ErrorResponse> {
    tracing::warn!(user_id = %ctx.user.id, "create_team not implemented");
    Err(ErrorResponse::new(StatusCode::NOT_IMPLEMENTED, "create team not implemented"))
}

/// Update a team - not implemented yet
async fn update_team(
    State(_state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(_payload): Json<UpdateTeamRequest>,
) -> Result<Json<ApiResponse<Team>>, ErrorResponse> {
    tracing::warn!(user_id = %ctx.user.id, %team_id, "update_team not implemented");
    Err(ErrorResponse::new(StatusCode::NOT_IMPLEMENTED, "update team not implemented"))
}

/// Delete a team - not implemented yet
async fn delete_team(
    State(_state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<StatusCode, ErrorResponse> {
    tracing::warn!(user_id = %ctx.user.id, %team_id, "delete_team not implemented");
    Err(ErrorResponse::new(StatusCode::NOT_IMPLEMENTED, "delete team not implemented"))
}

/// Get team projects
async fn get_team_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<Project>>>, ErrorResponse> {
    let pool = state.pool();

    // Get team by ID or slug
    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Get project IDs and fetch projects
    let project_ids = TeamRepository::get_project_ids(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team project IDs");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team projects")
        })?;

    let mut projects = Vec::new();
    for project_id in &project_ids {
        if let Ok(Some(project)) = ProjectRepository::fetch_by_id(pool, *project_id).await {
            projects.push(project);
        }
    }

    Ok(ApiResponse::success(projects))
}

/// Assign project to team
async fn assign_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(payload): Json<TeamProjectAssignment>,
) -> Result<Json<ApiResponse<TeamProject>>, ErrorResponse> {
    let pool = state.pool();

    // Get team by ID or slug
    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Assign project to team
    let team_project = TeamRepository::assign_project(pool, team.id, payload.project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, project_id = %payload.project_id, "failed to assign project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to assign project")
        })?;

    Ok(ApiResponse::success(TeamProject {
        team_id: team_project.team_id,
        project_id: team_project.project_id,
    }))
}

/// Get team issues
async fn get_team_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<TeamIssue>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let issues = TeamRepository::get_issues(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team issues");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team issues")
        })?;

    Ok(ApiResponse::success(issues))
}

/// Get team members
async fn get_team_members(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<TeamMember>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let members = TeamRepository::get_members(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team members");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team members")
        })?;

    Ok(ApiResponse::success(members))
}

/// Sync team members - refreshes member list and returns updated members
async fn sync_team_members(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<TeamMember>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // For now, sync just returns current members
    // In future, this could sync from Clerk or other external source
    let members = TeamRepository::get_members(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to sync team members");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to sync team members")
        })?;

    Ok(ApiResponse::success(members))
}

/// Get team invitations
async fn get_team_invitations(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<TeamInvitation>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let invitations = TeamRepository::get_invitations(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team invitations");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team invitations")
        })?;

    Ok(ApiResponse::success(invitations))
}

/// Get team documents
async fn get_team_documents(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<TeamDocument>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let documents = TeamRepository::get_documents(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team documents");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team documents")
        })?;

    Ok(ApiResponse::success(documents))
}

/// Get team folders
async fn get_team_folders(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<TeamFolder>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) = TeamRepository::workspace_id(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let folders = TeamRepository::get_folders(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team folders");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team folders")
        })?;

    Ok(ApiResponse::success(folders))
}
