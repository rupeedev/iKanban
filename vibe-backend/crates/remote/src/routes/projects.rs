use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
use serde_json::Value;
use tracing::instrument;
use utils::api::projects::RemoteProject;
use uuid::Uuid;

use super::{
    error::{ApiResponse, ErrorResponse},
    organization_members::ensure_member_access,
};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        project_repos::{CreateProjectRepo, ProjectRepoRepository, UpdateProjectRepo},
        projects::{CreateProjectData, Project, ProjectError, ProjectRepository},
        repos::{CreateRepo, Repo, RepoRepository},
    },
};

#[derive(Debug, Deserialize)]
struct ProjectsQuery {
    workspace_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct CreateProjectRequest {
    workspace_id: Uuid,
    name: String,
    #[serde(default)]
    metadata: Value,
    #[serde(default)]
    priority: Option<i32>,
    #[serde(default)]
    lead_id: Option<Uuid>,
    #[serde(default)]
    start_date: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    target_date: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    health: Option<i32>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    icon: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{project_id}", get(get_project))
        // Repository routes
        .route(
            "/projects/{project_id}/repositories",
            get(list_project_repositories).post(add_project_repository),
        )
        .route(
            "/projects/{project_id}/repositories/{repo_id}",
            get(get_project_repository)
                .put(update_project_repository)
                .delete(delete_project_repository),
        )
}

#[instrument(
    name = "projects.list_projects",
    skip(state, ctx, params),
    fields(workspace_id = %params.workspace_id, user_id = %ctx.user.id)
)]
async fn list_projects(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ProjectsQuery>,
) -> Result<Json<ApiResponse<Vec<RemoteProject>>>, ErrorResponse> {
    let workspace_id = params.workspace_id;
    ensure_member_access(state.pool(), workspace_id, ctx.user.id).await?;

    let projects: Vec<RemoteProject> = match ProjectRepository::list_by_organization(
        state.pool(),
        workspace_id,
    )
    .await
    {
        Ok(rows) => rows.into_iter().map(to_remote_project).collect(),
        Err(error) => {
            tracing::error!(?error, workspace_id = %workspace_id, "failed to list remote projects");
            return Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list projects",
            ));
        }
    };

    Ok(ApiResponse::success(projects))
}

#[instrument(
    name = "projects.get_project",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn get_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ApiResponse<RemoteProject>>, ErrorResponse> {
    let record = ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), record.organization_id, ctx.user.id).await?;

    Ok(ApiResponse::success(to_remote_project(record)))
}

#[instrument(
    name = "projects.create_project",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, workspace_id = %payload.workspace_id)
)]
async fn create_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<Json<ApiResponse<RemoteProject>>, ErrorResponse> {
    let CreateProjectRequest {
        workspace_id,
        name,
        metadata,
        priority,
        lead_id,
        start_date,
        target_date,
        status,
        health,
        description,
        summary,
        icon,
    } = payload;
    let organization_id = workspace_id; // Alias for existing infrastructure

    ensure_member_access(state.pool(), organization_id, ctx.user.id).await?;

    let mut tx = state.pool().begin().await.map_err(|error| {
        tracing::error!(?error, "failed to start transaction for project creation");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
    })?;

    let metadata = normalize_metadata(metadata).ok_or_else(|| {
        ErrorResponse::new(StatusCode::BAD_REQUEST, "metadata must be a JSON object")
    })?;

    let project = match ProjectRepository::insert(
        &mut tx,
        CreateProjectData {
            organization_id,
            name,
            metadata,
            priority,
            lead_id,
            start_date,
            target_date,
            status,
            health,
            description,
            summary,
            icon,
        },
    )
    .await
    {
        Ok(project) => project,
        Err(error) => {
            tx.rollback().await.ok();
            return Err(match error {
                ProjectError::Conflict(message) => {
                    tracing::warn!(?message, "remote project conflict");
                    ErrorResponse::new(StatusCode::CONFLICT, "project already exists")
                }
                ProjectError::InvalidMetadata => {
                    ErrorResponse::new(StatusCode::BAD_REQUEST, "invalid project metadata")
                }
                ProjectError::Database(err) => {
                    tracing::error!(?err, "failed to create remote project");
                    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
                }
            });
        }
    };

    if let Err(error) = tx.commit().await {
        tracing::error!(?error, "failed to commit remote project creation");
        return Err(ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal server error",
        ));
    }

    Ok(ApiResponse::success(to_remote_project(project)))
}

// ============================================================================
// Project Repository Endpoints
// ============================================================================

/// List repositories linked to a project
#[instrument(
    name = "projects.list_repositories",
    skip(state, ctx),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn list_project_repositories(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<ApiResponse<Vec<Repo>>>, ErrorResponse> {
    // Verify project exists and user has access
    let project = ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;

    let repos = ProjectRepoRepository::list_by_project(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to list project repositories");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list repositories",
            )
        })?;

    Ok(ApiResponse::success(repos))
}

/// Add a repository to a project
#[instrument(
    name = "projects.add_repository",
    skip(state, ctx, payload),
    fields(project_id = %project_id, user_id = %ctx.user.id)
)]
async fn add_project_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(project_id): Path<Uuid>,
    Json(payload): Json<CreateProjectRepo>,
) -> Result<Json<ApiResponse<Repo>>, ErrorResponse> {
    // Verify project exists and user has access
    let project = ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;

    // Create or find the repo
    let repo = RepoRepository::create_or_find(
        state.pool(),
        &CreateRepo {
            path: payload.git_repo_path.clone(),
            name: payload
                .display_name
                .split('/')
                .last()
                .unwrap_or(&payload.display_name)
                .to_string(),
            display_name: payload.display_name.clone(),
        },
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, %project_id, "failed to create repo");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create repository")
    })?;

    // Link repo to project
    ProjectRepoRepository::link(state.pool(), project_id, repo.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, repo_id = %repo.id, "failed to link repo to project");
            match error {
                crate::db::project_repos::ProjectRepoError::AlreadyLinked => {
                    ErrorResponse::new(StatusCode::CONFLICT, "repository already linked to project")
                }
                _ => ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to link repository",
                ),
            }
        })?;

    tracing::info!(%project_id, repo_id = %repo.id, "linked repository to project");

    Ok(ApiResponse::success(repo))
}

/// Get a specific repository link for a project
#[instrument(
    name = "projects.get_repository",
    skip(state, ctx),
    fields(project_id = %project_id, repo_id = %repo_id, user_id = %ctx.user.id)
)]
async fn get_project_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((project_id, repo_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ApiResponse<Repo>>, ErrorResponse> {
    // Verify project exists and user has access
    let project = ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;

    // Verify the link exists
    ProjectRepoRepository::get(state.pool(), project_id, repo_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, %repo_id, "failed to get project repo link");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "repository not found in project"))?;

    // Get the repo details
    let repo = RepoRepository::find_by_id(state.pool(), repo_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %repo_id, "failed to load repo");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load repository")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "repository not found"))?;

    Ok(ApiResponse::success(repo))
}

/// Update a project repository configuration
#[instrument(
    name = "projects.update_repository",
    skip(state, ctx, payload),
    fields(project_id = %project_id, repo_id = %repo_id, user_id = %ctx.user.id)
)]
async fn update_project_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((project_id, repo_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateProjectRepo>,
) -> Result<Json<ApiResponse<Repo>>, ErrorResponse> {
    // Verify project exists and user has access
    let project = ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;

    // Update the project repo configuration
    ProjectRepoRepository::update(state.pool(), project_id, repo_id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, %repo_id, "failed to update project repo");
            match error {
                crate::db::project_repos::ProjectRepoError::NotFound => {
                    ErrorResponse::new(StatusCode::NOT_FOUND, "repository not found in project")
                }
                _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error"),
            }
        })?;

    // Return the repo details
    let repo = RepoRepository::find_by_id(state.pool(), repo_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %repo_id, "failed to load repo");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load repository")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "repository not found"))?;

    Ok(ApiResponse::success(repo))
}

/// Remove a repository from a project
#[instrument(
    name = "projects.delete_repository",
    skip(state, ctx),
    fields(project_id = %project_id, repo_id = %repo_id, user_id = %ctx.user.id)
)]
async fn delete_project_repository(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((project_id, repo_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ApiResponse<()>>, ErrorResponse> {
    // Verify project exists and user has access
    let project = ProjectRepository::fetch_by_id(state.pool(), project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to load project")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "project not found"))?;

    ensure_member_access(state.pool(), project.organization_id, ctx.user.id).await?;

    // Unlink the repo from the project
    ProjectRepoRepository::unlink(state.pool(), project_id, repo_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, %repo_id, "failed to unlink repo from project");
            match error {
                crate::db::project_repos::ProjectRepoError::NotFound => {
                    ErrorResponse::new(StatusCode::NOT_FOUND, "repository not found in project")
                }
                _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error"),
            }
        })?;

    tracing::info!(%project_id, %repo_id, "unlinked repository from project");

    Ok(ApiResponse::success(()))
}

fn to_remote_project(project: Project) -> RemoteProject {
    RemoteProject {
        id: project.id,
        organization_id: project.organization_id,
        name: project.name,
        metadata: project.metadata,
        priority: project.priority,
        lead_id: project.lead_id,
        start_date: project.start_date,
        target_date: project.target_date,
        status: project.status.as_str().to_string(),
        health: project.health,
        description: project.description,
        summary: project.summary,
        icon: project.icon,
        created_at: project.created_at,
        updated_at: project.updated_at,
    }
}

fn normalize_metadata(value: Value) -> Option<Value> {
    match value {
        Value::Null => Some(Value::Object(serde_json::Map::new())),
        Value::Object(_) => Some(value),
        _ => None,
    }
}
