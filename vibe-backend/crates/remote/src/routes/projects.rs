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

use super::error::{ApiResponse, ErrorResponse};
use super::organization_members::ensure_member_access;
use crate::{
    AppState,
    auth::RequestContext,
    db::projects::{CreateProjectData, Project, ProjectError, ProjectRepository},
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

    let projects: Vec<RemoteProject> = match ProjectRepository::list_by_organization(state.pool(), workspace_id).await {
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
