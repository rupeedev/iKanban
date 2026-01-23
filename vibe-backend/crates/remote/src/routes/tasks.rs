use axum::{
    Json, Router,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{Span, instrument};
use ts_rs::TS;
use uuid::Uuid;

use super::{
    error::{ApiResponse, identity_error_response, task_error_response},
    organization_members::{ensure_project_access, ensure_task_access},
};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        organization_members,
        tags::TagRepository,
        task_comments::{CreateTaskComment, TaskCommentRepository},
        task_document_links::TaskDocumentLinkRepository,
        task_tags::TaskTagRepository,
        tasks::{
            AssignTaskData, CreateSharedTaskData, DeleteTaskData, SharedTask, SharedTaskError,
            SharedTaskRepository, SharedTaskWithUser, TaskStatus, UpdateSharedTaskData,
            ensure_text_size,
        },
        teams::TeamRepository,
        users::{UserData, UserRepository},
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks", post(create_shared_task))
        .route("/tasks/check", post(check_tasks_existence))
        .route("/tasks/{task_id}", patch(update_shared_task))
        .route("/tasks/{task_id}", delete(delete_shared_task))
        .route("/tasks/{task_id}/assign", post(assign_task))
        .route(
            "/tasks/{task_id}/comments",
            get(get_task_comments).post(create_task_comment),
        )
        .route(
            "/tasks/{task_id}/comments/{comment_id}",
            delete(delete_task_comment),
        )
        .route(
            "/tasks/{task_id}/tags",
            get(get_task_tags).post(add_task_tag),
        )
        .route("/tasks/{task_id}/tags/{tag_id}", delete(remove_task_tag))
        .route(
            "/tasks/{task_id}/links",
            get(get_task_links).post(add_task_link),
        )
        .route(
            "/tasks/{task_id}/links/{document_id}",
            delete(remove_task_link),
        )
        .route("/tasks/assignees", get(get_task_assignees_by_project))
        // Copilot/Claude assignment routes
        .route(
            "/tasks/{task_id}/copilot",
            get(super::copilot_claude::get_copilot_assignments)
                .post(super::copilot_claude::assign_task_to_copilot),
        )
        .route(
            "/tasks/{task_id}/claude",
            get(super::copilot_claude::get_claude_assignments)
                .post(super::copilot_claude::assign_task_to_claude),
        )
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct AssigneesQuery {
    pub project_id: Uuid,
}

#[instrument(
    name = "tasks.get_task_assignees_by_project",
    skip(state, ctx, query),
    fields(user_id = %ctx.user.id, project_id = %query.project_id, org_id = tracing::field::Empty)
)]
pub async fn get_task_assignees_by_project(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<AssigneesQuery>,
) -> Response {
    let pool = state.pool();

    let _org_id = match ensure_project_access(pool, ctx.user.id, query.project_id).await {
        Ok(org) => {
            Span::current().record("org_id", format_args!("{org}"));
            org
        }
        Err(error) => return error.into_response(),
    };

    let user_repo = UserRepository::new(pool);
    let assignees = match user_repo.fetch_assignees_by_project(query.project_id).await {
        Ok(names) => names,
        Err(e) => {
            tracing::error!(?e, "failed to load assignees");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "failed to load assignees"})),
            )
                .into_response();
        }
    };

    (StatusCode::OK, Json(assignees)).into_response()
}

#[instrument(
    name = "tasks.create_shared_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, org_id = tracing::field::Empty)
)]
pub async fn create_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateSharedTaskRequest>,
) -> Response {
    let pool = state.pool();
    let repo = SharedTaskRepository::new(pool);
    let user_repo = UserRepository::new(pool);
    let CreateSharedTaskRequest {
        project_id,
        title,
        description,
        assignee_user_id,
    } = payload;

    if let Err(error) = ensure_text_size(&title, description.as_deref()) {
        return task_error_response(error, "shared task payload too large");
    }

    let organization_id = match ensure_project_access(pool, ctx.user.id, project_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    if let Some(assignee) = assignee_user_id.as_ref() {
        if let Err(err) = user_repo.fetch_user(*assignee).await {
            return identity_error_response(err, "assignee not found or inactive");
        }
        if let Err(err) =
            organization_members::assert_membership(pool, organization_id, *assignee).await
        {
            return identity_error_response(err, "assignee not part of organization");
        }
    }

    let data = CreateSharedTaskData {
        project_id,
        title,
        description,
        creator_user_id: ctx.user.id,
        assignee_user_id,
    };

    match repo.create(data).await {
        Ok(task) => (StatusCode::CREATED, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to create shared task"),
    }
}

#[instrument(
    name = "tasks.update_shared_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn update_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdateSharedTaskRequest>,
) -> Response {
    let pool = state.pool();
    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let repo = SharedTaskRepository::new(pool);
    let existing = match repo.find_by_id(task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_ref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    let UpdateSharedTaskRequest {
        title,
        description,
        status,
    } = payload;

    let next_title = title.as_deref().unwrap_or(existing.title.as_str());
    let next_description = description.as_deref().or(existing.description.as_deref());

    if let Err(error) = ensure_text_size(next_title, next_description) {
        return task_error_response(error, "shared task payload too large");
    }

    let data = UpdateSharedTaskData {
        title,
        description,
        status,
        acting_user_id: ctx.user.id,
    };

    match repo.update(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to update shared task"),
    }
}

#[instrument(
    name = "tasks.assign_shared_task",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn assign_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AssignSharedTaskRequest>,
) -> Response {
    let pool = state.pool();
    let organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let repo = SharedTaskRepository::new(pool);
    let user_repo = UserRepository::new(pool);

    let existing = match repo.find_by_id(task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_ref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    if let Some(assignee) = payload.new_assignee_user_id.as_ref() {
        if let Err(err) = user_repo.fetch_user(*assignee).await {
            return identity_error_response(err, "assignee not found or inactive");
        }
        if let Err(err) =
            organization_members::assert_membership(pool, organization_id, *assignee).await
        {
            return identity_error_response(err, "assignee not part of organization");
        }
    }

    let data = AssignTaskData {
        new_assignee_user_id: payload.new_assignee_user_id,
        previous_assignee_user_id: Some(ctx.user.id),
    };

    match repo.assign_task(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to transfer task assignment"),
    }
}

#[instrument(
    name = "tasks.delete_shared_task",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn delete_shared_task(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();
    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let repo = SharedTaskRepository::new(pool);

    let existing = match repo.find_by_id(task_id).await {
        Ok(Some(task)) => task,
        Ok(None) => {
            return task_error_response(SharedTaskError::NotFound, "shared task not found");
        }
        Err(error) => {
            return task_error_response(error, "failed to load shared task");
        }
    };

    if existing.assignee_user_id.as_ref() != Some(&ctx.user.id) {
        return task_error_response(
            SharedTaskError::Forbidden,
            "acting user is not the task assignee",
        );
    }

    let data = DeleteTaskData {
        acting_user_id: ctx.user.id,
    };

    match repo.delete_task(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(SharedTaskResponse::from(task))).into_response(),
        Err(error) => task_error_response(error, "failed to delete shared task"),
    }
}

#[instrument(
    name = "tasks.check_existence",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id)
)]
pub async fn check_tasks_existence(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CheckTasksRequest>,
) -> Response {
    let pool = state.pool();
    let repo = SharedTaskRepository::new(pool);

    match repo.check_existence(&payload.task_ids, ctx.user.id).await {
        Ok(existing_ids) => (StatusCode::OK, Json(existing_ids)).into_response(),
        Err(error) => task_error_response(error, "failed to check tasks existence"),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckTasksRequest {
    pub task_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSharedTaskRequest {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSharedTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignSharedTaskRequest {
    pub new_assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SharedTaskResponse {
    pub task: SharedTask,
    pub user: Option<UserData>,
}

impl From<SharedTaskWithUser> for SharedTaskResponse {
    fn from(v: SharedTaskWithUser) -> Self {
        Self {
            task: v.task,
            user: v.user,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Comments Handlers
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskCommentRequest {
    pub content: String,
    #[serde(default)]
    pub is_internal: bool,
}

#[instrument(
    name = "tasks.get_task_comments",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn get_task_comments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    match TaskCommentRepository::find_by_task_id(pool, task_id).await {
        Ok(comments) => (StatusCode::OK, ApiResponse::success(comments)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to load task comments");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to load task comments"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "tasks.create_task_comment",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn create_task_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<CreateTaskCommentRequest>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    let user_repo = UserRepository::new(pool);
    let user = match user_repo.fetch_user(ctx.user.id).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!(?e, "failed to fetch user for comment");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to fetch user"})),
            )
                .into_response();
        }
    };

    // Construct author name from first_name and last_name
    let author_name = match (&user.first_name, &user.last_name) {
        (Some(first), Some(last)) => format!("{} {}", first, last),
        (Some(first), None) => first.clone(),
        (None, Some(last)) => last.clone(),
        (None, None) => user.email.clone(),
    };

    // Resolve author_id to team_members.id
    // First find the task to get its team_id
    let team_id = match SharedTaskRepository::get_team_id(pool, task_id).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(?e, "failed to load task team info for comment");
            None
        }
    };

    let author_id = if let Some(tid) = team_id {
        match TeamRepository::find_member_by_email(pool, tid, &user.email).await {
            Ok(Some(member)) => Some(member.id),
            _ => None,
        }
    } else {
        None
    };

    let create_data = CreateTaskComment {
        content: payload.content,
        is_internal: payload.is_internal,
        author_name,
        author_email: Some(user.email),
        author_id,
    };

    match TaskCommentRepository::create(pool, task_id, &create_data).await {
        Ok(comment) => {
            // Check for @claude mention to trigger assignment
            if comment.content.to_lowercase().contains("@claude") {
                let pool_clone = pool.clone();
                let task_id = task_id;
                let user_id = ctx.user.id;
                let prompt = comment.content.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = super::copilot_claude::trigger_claude_assignment(
                        &pool_clone,
                        task_id,
                        user_id,
                        prompt,
                    )
                    .await
                    {
                        tracing::error!("Failed to trigger Claude assignment from comment: {}", e);
                    }
                });
            }

            // Check for @copilot mention to trigger assignment
            if comment.content.to_lowercase().contains("@copilot") {
                let pool_clone = pool.clone();
                let task_id = task_id;
                let user_id = ctx.user.id;
                let prompt = comment.content.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = super::copilot_claude::trigger_copilot_assignment(
                        &pool_clone,
                        task_id,
                        user_id,
                        prompt,
                    )
                    .await
                    {
                        tracing::error!("Failed to trigger Copilot assignment from comment: {}", e);
                    }
                });
            }

            (StatusCode::CREATED, ApiResponse::success(comment)).into_response()
        }
        Err(e) => {
            tracing::error!(?e, "failed to create task comment");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": format!("failed to create task comment: {}", e)})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "tasks.delete_task_comment",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, comment_id = %comment_id, org_id = tracing::field::Empty)
)]
pub async fn delete_task_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((task_id, comment_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    // Check if comment exists and belongs to this task
    let comment = match TaskCommentRepository::find_by_id(pool, comment_id).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"success": false, "message": "comment not found"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to find comment");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to find comment"})),
            )
                .into_response();
        }
    };

    if comment.task_id != task_id {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "message": "comment does not belong to this task"})),
        )
            .into_response();
    }

    // Only allow author or task assignee to delete
    if comment.author_id != Some(ctx.user.id) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"success": false, "message": "only comment author can delete"})),
        )
            .into_response();
    }

    match TaskCommentRepository::delete(pool, comment_id).await {
        Ok(true) => (StatusCode::OK, ApiResponse::success(())).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "message": "comment not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to delete comment");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to delete comment"})),
            )
                .into_response()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Tags Handlers
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddTagRequest {
    pub tag_id: Uuid,
}

#[instrument(
    name = "tasks.get_task_tags",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn get_task_tags(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    match TaskTagRepository::find_by_task_id(pool, task_id).await {
        Ok(tags) => (StatusCode::OK, ApiResponse::success(tags)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to load task tags");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to load task tags"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "tasks.add_task_tag",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn add_task_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AddTagRequest>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    // Verify tag exists
    match TagRepository::find_by_id(pool, payload.tag_id).await {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"success": false, "message": "tag not found"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(?e, "failed to find tag");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to find tag"})),
            )
                .into_response();
        }
    }

    match TaskTagRepository::add_tag(pool, task_id, payload.tag_id).await {
        Ok(task_tag) => (StatusCode::CREATED, ApiResponse::success(task_tag)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to add tag to task");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to add tag to task"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "tasks.remove_task_tag",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, tag_id = %tag_id, org_id = tracing::field::Empty)
)]
pub async fn remove_task_tag(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((task_id, tag_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    match TaskTagRepository::remove_tag(pool, task_id, tag_id).await {
        Ok(true) => (StatusCode::OK, ApiResponse::success(())).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "message": "tag not found on task"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to remove tag from task");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to remove tag from task"})),
            )
                .into_response()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Document Links Handlers
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddDocumentLinkRequest {
    pub document_id: Uuid,
}

#[instrument(
    name = "tasks.get_task_links",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn get_task_links(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    match TaskDocumentLinkRepository::find_by_task_id(pool, task_id).await {
        Ok(links) => (StatusCode::OK, ApiResponse::success(links)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to load task document links");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to load task document links"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "tasks.add_task_link",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, task_id = %task_id, org_id = tracing::field::Empty)
)]
pub async fn add_task_link(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<AddDocumentLinkRequest>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    match TaskDocumentLinkRepository::link_document(pool, task_id, payload.document_id).await {
        Ok(link) => (StatusCode::CREATED, ApiResponse::success(link)).into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to link document to task");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to link document to task"})),
            )
                .into_response()
        }
    }
}

#[instrument(
    name = "tasks.remove_task_link",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, task_id = %task_id, document_id = %document_id, org_id = tracing::field::Empty)
)]
pub async fn remove_task_link(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path((task_id, document_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let pool = state.pool();

    let _organization_id = match ensure_task_access(pool, ctx.user.id, task_id).await {
        Ok(org_id) => {
            Span::current().record("org_id", format_args!("{org_id}"));
            org_id
        }
        Err(error) => return error.into_response(),
    };

    match TaskDocumentLinkRepository::unlink_document(pool, task_id, document_id).await {
        Ok(true) => (StatusCode::OK, ApiResponse::success(())).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "message": "document link not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!(?e, "failed to unlink document from task");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "failed to unlink document from task"})),
            )
                .into_response()
        }
    }
}
