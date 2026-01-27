//! Teams routes - Real implementation using database

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::{
    error::{ApiResponse, ErrorResponse},
    organization_members::ensure_member_access,
};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        document_folders::{
            CreateDocumentFolder, DocumentFolder, DocumentFolderRepository, UpdateDocumentFolder,
        },
        documents::{CreateDocument, Document, DocumentRepository, UpdateDocument},
        projects::{Project, ProjectRepository},
        teams::{
            CreateTeamIssue, Team, TeamDocument, TeamFolder, TeamInvitation, TeamIssue, TeamMember,
            TeamRepository, UpdateTeamIssue,
        },
    },
};

#[derive(Debug, Deserialize)]
pub struct ListTeamsQuery {
    pub workspace_id: Option<Uuid>,
}

/// Query parameters for getting team issues
#[derive(Debug, Deserialize)]
pub struct GetTeamIssuesQuery {
    /// Comma-separated list of tag UUIDs to filter by (AND logic)
    pub tags: Option<String>,
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
#[allow(dead_code)] // Placeholder for future update_team implementation
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

#[derive(Debug, Deserialize)]
pub struct UpdateTeamMemberRoleRequest {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTeamInvitationRequest {
    pub email: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateInvitationRoleRequest {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct SyncClerkMemberRequest {
    pub clerk_user_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
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
        .route(
            "/teams/{team_id}/issues",
            get(get_team_issues).post(create_team_issue),
        )
        .route(
            "/teams/{team_id}/issues/{issue_id}",
            patch(update_team_issue),
        )
        .route(
            "/teams/{team_id}/issues/{issue_id}/sub-issues",
            get(get_sub_issues),
        )
        .route("/teams/{team_id}/members", get(get_team_members))
        .route(
            "/teams/{team_id}/members/{member_id}",
            axum::routing::put(update_team_member_role).delete(delete_team_member),
        )
        .route(
            "/teams/{team_id}/members/sync",
            axum::routing::post(sync_team_members),
        )
        .route(
            "/teams/{team_id}/invitations",
            get(get_team_invitations).post(create_team_invitation),
        )
        .route(
            "/teams/{team_id}/invitations/{invitation_id}",
            axum::routing::put(update_team_invitation_role).delete(cancel_team_invitation),
        )
        // Document CRUD routes
        .route(
            "/teams/{team_id}/documents",
            get(get_team_documents).post(create_team_document),
        )
        .route(
            "/teams/{team_id}/documents/{document_id}",
            get(get_team_document)
                .put(update_team_document)
                .delete(delete_team_document),
        )
        // Folder CRUD routes
        .route(
            "/teams/{team_id}/folders",
            get(get_team_folders).post(create_team_folder),
        )
        .route(
            "/teams/{team_id}/folders/{folder_id}",
            get(get_team_folder)
                .put(update_team_folder)
                .delete(delete_team_folder),
        )
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
/// Performance optimized: uses tokio::join! for parallel queries and batch fetch
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

    // IKA-303: Parallelize queries using tokio::join! for better performance
    let (members_result, project_ids_result, issues_result) = tokio::join!(
        TeamRepository::get_members(pool, team_uuid),
        TeamRepository::get_project_ids(pool, team_uuid),
        TeamRepository::get_issues(pool, team_uuid, None)
    );

    let members = members_result.map_err(|error| {
        tracing::error!(?error, %team_id, "failed to get team members");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to get team members",
        )
    })?;

    let project_ids = project_ids_result.map_err(|error| {
        tracing::error!(?error, %team_id, "failed to get team project IDs");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to get team projects",
        )
    })?;

    let issues = issues_result.map_err(|error| {
        tracing::error!(?error, %team_id, "failed to get team issues");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to get team issues",
        )
    })?;

    // IKA-303: Fetch projects by IDs
    // Note: Using N+1 loop for now; batch fetch with ANY($1) has runtime type issues
    let mut projects = Vec::new();
    for project_id in &project_ids {
        if let Ok(Some(project)) = ProjectRepository::fetch_by_id(pool, *project_id).await {
            projects.push(project);
        }
    }

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
    Err(ErrorResponse::new(
        StatusCode::NOT_IMPLEMENTED,
        "create team not implemented",
    ))
}

/// Update a team - not implemented yet
async fn update_team(
    State(_state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(_payload): Json<UpdateTeamRequest>,
) -> Result<Json<ApiResponse<Team>>, ErrorResponse> {
    tracing::warn!(user_id = %ctx.user.id, %team_id, "update_team not implemented");
    Err(ErrorResponse::new(
        StatusCode::NOT_IMPLEMENTED,
        "update team not implemented",
    ))
}

/// Delete a team - not implemented yet
async fn delete_team(
    State(_state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
) -> Result<StatusCode, ErrorResponse> {
    tracing::warn!(user_id = %ctx.user.id, %team_id, "delete_team not implemented");
    Err(ErrorResponse::new(
        StatusCode::NOT_IMPLEMENTED,
        "delete team not implemented",
    ))
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
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
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
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get team projects",
            )
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
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
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
    Query(query): Query<GetTeamIssuesQuery>,
) -> Result<Json<ApiResponse<Vec<TeamIssue>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Parse tag UUIDs from comma-separated string
    let tag_ids: Option<Vec<Uuid>> = query.tags.as_ref().and_then(|tags_str| {
        let parsed: Vec<Uuid> = tags_str
            .split(',')
            .filter_map(|s| s.trim().parse::<Uuid>().ok())
            .collect();
        if parsed.is_empty() {
            None
        } else {
            Some(parsed)
        }
    });

    let issues = TeamRepository::get_issues(pool, team.id, tag_ids.as_deref())
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team issues");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get team issues",
            )
        })?;

    Ok(ApiResponse::success(issues))
}

/// Get sub-issues for a parent issue
async fn get_sub_issues(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, issue_id)): Path<(String, Uuid)>,
) -> Result<Json<ApiResponse<Vec<TeamIssue>>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let sub_issues = TeamRepository::get_sub_issues(pool, team.id, issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, %issue_id, "failed to get sub-issues");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get sub-issues",
            )
        })?;

    Ok(ApiResponse::success(sub_issues))
}

/// Request payload for creating a team issue
#[derive(Debug, Deserialize)]
pub struct CreateTeamIssueRequest {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub due_date: Option<DateTime<Utc>>,
    pub assignee_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
}

/// Request payload for updating a team issue
#[derive(Debug, Deserialize)]
pub struct UpdateTeamIssueRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub due_date: Option<DateTime<Utc>>,
    pub assignee_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
}

/// Create a new team issue
async fn create_team_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(payload): Json<CreateTeamIssueRequest>,
) -> Result<Json<ApiResponse<TeamIssue>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to the team's workspace
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Verify the project belongs to this team
    let team_projects = TeamRepository::get_project_ids(pool, team.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team projects");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to verify project",
            )
        })?;

    if !team_projects.contains(&payload.project_id) {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "project does not belong to this team",
        ));
    }

    let create_data = CreateTeamIssue {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        priority: payload.priority,
        due_date: payload.due_date,
        assignee_id: payload.assignee_id,
        parent_id: payload.parent_id,
    };

    let issue = TeamRepository::create_issue(pool, team.id, payload.project_id, create_data)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to create team issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create issue")
        })?;

    tracing::info!(
        team_id = %team.id,
        issue_id = %issue.id,
        issue_number = ?issue.issue_number,
        "created team issue"
    );

    Ok(ApiResponse::success(issue))
}

/// Update an existing team issue
#[instrument(
    name = "teams.update_team_issue",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id, issue_id = %issue_id)
)]
async fn update_team_issue(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, issue_id)): Path<(String, Uuid)>,
    Json(payload): Json<UpdateTeamIssueRequest>,
) -> Result<Json<ApiResponse<TeamIssue>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to the team's workspace
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let update_data = UpdateTeamIssue {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        priority: payload.priority,
        due_date: payload.due_date,
        assignee_id: payload.assignee_id,
        project_id: payload.project_id,
        parent_id: payload.parent_id,
    };

    let issue = TeamRepository::update_issue(pool, team.id, issue_id, update_data)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, %issue_id, "failed to update team issue");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update issue")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue not found"))?;

    tracing::info!(
        team_id = %team.id,
        issue_id = %issue.id,
        "updated team issue"
    );

    Ok(ApiResponse::success(issue))
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

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
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
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get team members",
            )
        })?;

    Ok(ApiResponse::success(members))
}

/// Delete a team member
#[instrument(
    name = "teams.delete_team_member",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id, member_id = %member_id)
)]
async fn delete_team_member(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, member_id)): Path<(String, Uuid)>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Check if trying to delete self (prevent)
    let member = TeamRepository::get_member(pool, team.id, member_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, %member_id, "failed to get member");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get member")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "member not found"))?;

    // Prevent deleting the last owner
    if member.role == "owner" {
        let all_members = TeamRepository::get_members(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team members");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?;

        let owner_count = all_members.iter().filter(|m| m.role == "owner").count();
        if owner_count <= 1 {
            return Err(ErrorResponse::new(
                StatusCode::BAD_REQUEST,
                "cannot remove the last owner of the team",
            ));
        }
    }

    let deleted = TeamRepository::remove_member(pool, team.id, member_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, %member_id, "failed to remove member");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to remove member")
        })?;

    if !deleted {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "member not found",
        ));
    }

    tracing::info!(%team_id, %member_id, "team member removed");
    Ok(ApiResponse::success(()))
}

/// Update a team member's role
#[instrument(
    name = "teams.update_team_member_role",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id, member_id = %member_id)
)]
async fn update_team_member_role(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, member_id)): Path<(String, Uuid)>,
    Json(payload): Json<UpdateTeamMemberRoleRequest>,
) -> Result<Json<ApiResponse<TeamMember>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Validate role
    let valid_roles = ["viewer", "contributor", "maintainer", "owner"];
    if !valid_roles.contains(&payload.role.as_str()) {
        return Err(ErrorResponse::new(StatusCode::BAD_REQUEST, "invalid role"));
    }

    // Get current member to check if demoting last owner
    let current_member = TeamRepository::get_member(pool, team.id, member_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, %member_id, "failed to get member");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get member")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "member not found"))?;

    // Prevent demoting the last owner
    if current_member.role == "owner" && payload.role != "owner" {
        let all_members = TeamRepository::get_members(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team members");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?;

        let owner_count = all_members.iter().filter(|m| m.role == "owner").count();
        if owner_count <= 1 {
            return Err(ErrorResponse::new(
                StatusCode::BAD_REQUEST,
                "cannot demote the last owner of the team",
            ));
        }
    }

    let member = TeamRepository::update_member_role(pool, team.id, member_id, &payload.role)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, %member_id, "failed to update member role");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to update member role",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "member not found"))?;

    tracing::info!(%team_id, %member_id, role = %payload.role, "team member role updated");
    Ok(ApiResponse::success(member))
}

/// Sync Clerk user to team members - finds or creates member with Clerk data
#[instrument(
    name = "teams.sync_team_members",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id)
)]
async fn sync_team_members(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(payload): Json<SyncClerkMemberRequest>,
) -> Result<Json<ApiResponse<TeamMember>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Sync the Clerk user to team members (upsert)
    let member = TeamRepository::sync_clerk_member(
        pool,
        team.id,
        &payload.clerk_user_id,
        &payload.email,
        payload.display_name.as_deref(),
        payload.avatar_url.as_deref(),
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, %team_id, clerk_user_id = %payload.clerk_user_id, "failed to sync team member");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to sync team member",
        )
    })?;

    tracing::info!(
        team_id = %team.id,
        member_id = %member.id,
        clerk_user_id = %payload.clerk_user_id,
        "synced clerk user to team member"
    );

    Ok(ApiResponse::success(member))
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

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
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
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get team invitations",
            )
        })?;

    Ok(ApiResponse::success(invitations))
}

/// Create a team invitation
#[instrument(
    name = "teams.create_team_invitation",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id)
)]
async fn create_team_invitation(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(payload): Json<CreateTeamInvitationRequest>,
) -> Result<Json<ApiResponse<TeamInvitation>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Validate role
    let valid_roles = ["viewer", "contributor", "maintainer", "owner"];
    if !valid_roles.contains(&payload.role.as_str()) {
        return Err(ErrorResponse::new(StatusCode::BAD_REQUEST, "invalid role"));
    }

    // Validate email format
    if !payload.email.contains('@') || payload.email.len() < 3 {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "invalid email address",
        ));
    }

    let invitation = TeamRepository::create_invitation(
        pool,
        team.id,
        &payload.email,
        &payload.role,
        Some(ctx.user.id),
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, %team_id, email = %payload.email, "failed to create invitation");
        // Check for duplicate invitation error
        if let crate::db::teams::TeamError::Database(ref db_err) = error
            && (db_err.to_string().contains("UNIQUE constraint")
                || db_err.to_string().contains("duplicate"))
        {
            return ErrorResponse::new(
                StatusCode::CONFLICT,
                "an invitation for this email already exists",
            );
        }
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to create invitation",
        )
    })?;

    tracing::info!(%team_id, email = %payload.email, "team invitation created");
    Ok(ApiResponse::success(invitation))
}

/// Update a team invitation's role
#[instrument(
    name = "teams.update_team_invitation_role",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id, invitation_id = %invitation_id)
)]
async fn update_team_invitation_role(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, invitation_id)): Path<(String, Uuid)>,
    Json(payload): Json<UpdateInvitationRoleRequest>,
) -> Result<Json<ApiResponse<TeamInvitation>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    // Validate role
    let valid_roles = ["viewer", "contributor", "maintainer", "owner"];
    if !valid_roles.contains(&payload.role.as_str()) {
        return Err(ErrorResponse::new(StatusCode::BAD_REQUEST, "invalid role"));
    }

    let invitation = TeamRepository::update_invitation_role(
        pool,
        team.id,
        invitation_id,
        &payload.role,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, %team_id, %invitation_id, "failed to update invitation role");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to update invitation role",
        )
    })?
    .ok_or_else(|| {
        ErrorResponse::new(StatusCode::NOT_FOUND, "invitation not found or not pending")
    })?;

    tracing::info!(%team_id, %invitation_id, role = %payload.role, "team invitation role updated");
    Ok(ApiResponse::success(invitation))
}

/// Cancel a team invitation
#[instrument(
    name = "teams.cancel_team_invitation",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id, invitation_id = %invitation_id)
)]
async fn cancel_team_invitation(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, invitation_id)): Path<(String, Uuid)>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    // Verify user has access to team's workspace
    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let deleted = TeamRepository::cancel_invitation(pool, team.id, invitation_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, %invitation_id, "failed to cancel invitation");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to cancel invitation",
            )
        })?;

    if !deleted {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "invitation not found",
        ));
    }

    tracing::info!(%team_id, %invitation_id, "team invitation canceled");
    Ok(ApiResponse::success(()))
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

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
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
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get team documents",
            )
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

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
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
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get team folders",
            )
        })?;

    Ok(ApiResponse::success(folders))
}

// =============================================================================
// Document CRUD handlers (POST, GET by ID, PUT, DELETE)
// =============================================================================

/// Create a new document in a team
#[instrument(
    name = "teams.create_team_document",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id)
)]
async fn create_team_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(payload): Json<CreateDocument>,
) -> Result<Json<ApiResponse<Document>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let document = DocumentRepository::create(pool, team.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to create document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to create document",
            )
        })?;

    tracing::info!(team_id = %team.id, document_id = %document.id, "created team document");
    Ok(ApiResponse::success(document))
}

/// Get a specific document by ID
#[instrument(
    name = "teams.get_team_document",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id, document_id = %document_id)
)]
async fn get_team_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, document_id)): Path<(String, Uuid)>,
) -> Result<Json<ApiResponse<Document>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let document = DocumentRepository::find_by_id(pool, document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to get document");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get document")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "document not found"))?;

    if document.team_id != team.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "document not found in this team",
        ));
    }

    Ok(ApiResponse::success(document))
}

/// Update a document
#[instrument(
    name = "teams.update_team_document",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id, document_id = %document_id)
)]
async fn update_team_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, document_id)): Path<(String, Uuid)>,
    Json(payload): Json<UpdateDocument>,
) -> Result<Json<ApiResponse<Document>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let existing = DocumentRepository::find_by_id(pool, document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to find document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to update document",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "document not found"))?;

    if existing.team_id != team.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "document not found in this team",
        ));
    }

    let document = DocumentRepository::update(pool, document_id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to update document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to update document",
            )
        })?;

    tracing::info!(team_id = %team.id, document_id = %document.id, "updated team document");
    Ok(ApiResponse::success(document))
}

/// Delete a document
#[instrument(
    name = "teams.delete_team_document",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id, document_id = %document_id)
)]
async fn delete_team_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, document_id)): Path<(String, Uuid)>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let existing = DocumentRepository::find_by_id(pool, document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to find document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete document",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "document not found"))?;

    if existing.team_id != team.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "document not found in this team",
        ));
    }

    DocumentRepository::delete(pool, document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to delete document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete document",
            )
        })?;

    tracing::info!(team_id = %team.id, %document_id, "deleted team document");
    Ok(StatusCode::NO_CONTENT)
}

// =============================================================================
// Folder CRUD handlers (POST, GET by ID, PUT, DELETE)
// =============================================================================

/// Create a new folder in a team
#[instrument(
    name = "teams.create_team_folder",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id)
)]
async fn create_team_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(team_id): Path<String>,
    Json(payload): Json<CreateDocumentFolder>,
) -> Result<Json<ApiResponse<DocumentFolder>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let folder = DocumentFolderRepository::create(pool, team.id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to create folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create folder")
        })?;

    tracing::info!(team_id = %team.id, folder_id = %folder.id, "created team folder");
    Ok(ApiResponse::success(folder))
}

/// Get a specific folder by ID
#[instrument(
    name = "teams.get_team_folder",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id, folder_id = %folder_id)
)]
async fn get_team_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, folder_id)): Path<(String, Uuid)>,
) -> Result<Json<ApiResponse<DocumentFolder>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let folder = DocumentFolderRepository::find_by_id(pool, folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to get folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get folder")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "folder not found"))?;

    if folder.team_id != team.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "folder not found in this team",
        ));
    }

    Ok(ApiResponse::success(folder))
}

/// Update a folder
#[instrument(
    name = "teams.update_team_folder",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %team_id, folder_id = %folder_id)
)]
async fn update_team_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, folder_id)): Path<(String, Uuid)>,
    Json(payload): Json<UpdateDocumentFolder>,
) -> Result<Json<ApiResponse<DocumentFolder>>, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let existing = DocumentFolderRepository::find_by_id(pool, folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to find folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update folder")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "folder not found"))?;

    if existing.team_id != team.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "folder not found in this team",
        ));
    }

    let folder = DocumentFolderRepository::update(pool, folder_id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to update folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update folder")
        })?;

    tracing::info!(team_id = %team.id, folder_id = %folder.id, "updated team folder");
    Ok(ApiResponse::success(folder))
}

/// Delete a folder
#[instrument(
    name = "teams.delete_team_folder",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, team_id = %team_id, folder_id = %folder_id)
)]
async fn delete_team_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((team_id, folder_id)): Path<(String, Uuid)>,
) -> Result<StatusCode, ErrorResponse> {
    let pool = state.pool();

    let team = TeamRepository::get_by_id_or_slug(pool, &team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "team not found"))?;

    if let Some(workspace_id) =
        TeamRepository::workspace_id(pool, team.id)
            .await
            .map_err(|error| {
                tracing::error!(?error, %team_id, "failed to get team workspace");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get team")
            })?
    {
        ensure_member_access(pool, workspace_id, ctx.user.id).await?;
    }

    let existing = DocumentFolderRepository::find_by_id(pool, folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to find folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete folder")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "folder not found"))?;

    if existing.team_id != team.id {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "folder not found in this team",
        ));
    }

    DocumentFolderRepository::delete(pool, folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to delete folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete folder")
        })?;

    tracing::info!(team_id = %team.id, %folder_id, "deleted team folder");
    Ok(StatusCode::NO_CONTENT)
}
