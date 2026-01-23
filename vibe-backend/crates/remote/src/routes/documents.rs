//! Document routes - CRUD operations for documents

use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
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
        teams::TeamRepository,
    },
};

#[derive(Debug, Deserialize)]
pub struct ListDocumentsQuery {
    pub team_id: Uuid,
    pub folder_id: Option<Uuid>,
    pub include_archived: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ListFoldersQuery {
    pub team_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CreateDocumentRequest {
    pub team_id: Uuid,
    #[serde(flatten)]
    pub data: CreateDocument,
}

#[derive(Debug, Deserialize)]
pub struct CreateFolderRequest {
    pub team_id: Uuid,
    #[serde(flatten)]
    pub data: CreateDocumentFolder,
}

pub fn router() -> Router<AppState> {
    Router::new()
        // Document CRUD
        .route("/documents", get(list_documents).post(create_document))
        .route(
            "/documents/{document_id}",
            get(get_document)
                .put(update_document)
                .delete(delete_document),
        )
        // Folder CRUD
        .route("/folders", get(list_folders).post(create_folder))
        .route(
            "/folders/{folder_id}",
            get(get_folder).put(update_folder).delete(delete_folder),
        )
}

/// List documents (optionally filtered by folder)
#[instrument(
    name = "documents.list_documents",
    skip(state, ctx, params),
    fields(user_id = %ctx.user.id, team_id = %params.team_id)
)]
async fn list_documents(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ListDocumentsQuery>,
) -> Result<Json<ApiResponse<Vec<Document>>>, ErrorResponse> {
    // Verify user has access to team
    verify_team_access(&state, ctx.user.id, params.team_id).await?;

    let include_archived = params.include_archived.unwrap_or(false);

    let documents = if params.folder_id.is_some() {
        DocumentRepository::find_by_folder(state.pool(), params.team_id, params.folder_id)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to list documents by folder");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list documents",
                )
            })?
    } else {
        DocumentRepository::find_all_by_team(state.pool(), params.team_id, include_archived)
            .await
            .map_err(|error| {
                tracing::error!(?error, "failed to list documents");
                ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to list documents",
                )
            })?
    };

    Ok(ApiResponse::success(documents))
}

/// Get a specific document
#[instrument(
    name = "documents.get_document",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, document_id = %document_id)
)]
async fn get_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(document_id): Path<Uuid>,
) -> Result<Json<ApiResponse<Document>>, ErrorResponse> {
    let document = DocumentRepository::find_by_id(state.pool(), document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to get document");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get document")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "document not found"))?;

    // Verify user has access to document's team
    verify_team_access(&state, ctx.user.id, document.team_id).await?;

    Ok(ApiResponse::success(document))
}

/// Create a new document
#[instrument(
    name = "documents.create_document",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %payload.team_id)
)]
async fn create_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateDocumentRequest>,
) -> Result<Json<ApiResponse<Document>>, ErrorResponse> {
    verify_team_access(&state, ctx.user.id, payload.team_id).await?;

    let document = DocumentRepository::create(state.pool(), payload.team_id, &payload.data)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to create document",
            )
        })?;

    Ok(ApiResponse::success(document))
}

/// Update a document
#[instrument(
    name = "documents.update_document",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, document_id = %document_id)
)]
async fn update_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(document_id): Path<Uuid>,
    Json(payload): Json<UpdateDocument>,
) -> Result<Json<ApiResponse<Document>>, ErrorResponse> {
    // First check document exists and user has access
    let existing = DocumentRepository::find_by_id(state.pool(), document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to find document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to update document",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "document not found"))?;

    verify_team_access(&state, ctx.user.id, existing.team_id).await?;

    let document = DocumentRepository::update(state.pool(), document_id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to update document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to update document",
            )
        })?;

    Ok(ApiResponse::success(document))
}

/// Delete a document
#[instrument(
    name = "documents.delete_document",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, document_id = %document_id)
)]
async fn delete_document(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(document_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    // First check document exists and user has access
    let existing = DocumentRepository::find_by_id(state.pool(), document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to find document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete document",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "document not found"))?;

    verify_team_access(&state, ctx.user.id, existing.team_id).await?;

    DocumentRepository::delete(state.pool(), document_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %document_id, "failed to delete document");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete document",
            )
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// List folders
#[instrument(
    name = "documents.list_folders",
    skip(state, ctx, params),
    fields(user_id = %ctx.user.id, team_id = %params.team_id)
)]
async fn list_folders(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ListFoldersQuery>,
) -> Result<Json<ApiResponse<Vec<DocumentFolder>>>, ErrorResponse> {
    verify_team_access(&state, ctx.user.id, params.team_id).await?;

    let folders = DocumentFolderRepository::find_all_by_team(state.pool(), params.team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to list folders");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to list folders")
        })?;

    Ok(ApiResponse::success(folders))
}

/// Get a specific folder
#[instrument(
    name = "documents.get_folder",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, folder_id = %folder_id)
)]
async fn get_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(folder_id): Path<Uuid>,
) -> Result<Json<ApiResponse<DocumentFolder>>, ErrorResponse> {
    let folder = DocumentFolderRepository::find_by_id(state.pool(), folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to get folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to get folder")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "folder not found"))?;

    verify_team_access(&state, ctx.user.id, folder.team_id).await?;

    Ok(ApiResponse::success(folder))
}

/// Create a new folder
#[instrument(
    name = "documents.create_folder",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, team_id = %payload.team_id)
)]
async fn create_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateFolderRequest>,
) -> Result<Json<ApiResponse<DocumentFolder>>, ErrorResponse> {
    verify_team_access(&state, ctx.user.id, payload.team_id).await?;

    let folder = DocumentFolderRepository::create(state.pool(), payload.team_id, &payload.data)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to create folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to create folder")
        })?;

    Ok(ApiResponse::success(folder))
}

/// Update a folder
#[instrument(
    name = "documents.update_folder",
    skip(state, ctx, payload),
    fields(user_id = %ctx.user.id, folder_id = %folder_id)
)]
async fn update_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(folder_id): Path<Uuid>,
    Json(payload): Json<UpdateDocumentFolder>,
) -> Result<Json<ApiResponse<DocumentFolder>>, ErrorResponse> {
    let existing = DocumentFolderRepository::find_by_id(state.pool(), folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to find folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update folder")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "folder not found"))?;

    verify_team_access(&state, ctx.user.id, existing.team_id).await?;

    let folder = DocumentFolderRepository::update(state.pool(), folder_id, &payload)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to update folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to update folder")
        })?;

    Ok(ApiResponse::success(folder))
}

/// Delete a folder
#[instrument(
    name = "documents.delete_folder",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, folder_id = %folder_id)
)]
async fn delete_folder(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(folder_id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let existing = DocumentFolderRepository::find_by_id(state.pool(), folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to find folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete folder")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "folder not found"))?;

    verify_team_access(&state, ctx.user.id, existing.team_id).await?;

    DocumentFolderRepository::delete(state.pool(), folder_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %folder_id, "failed to delete folder");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to delete folder")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// Helper: Verify user has access to team's workspace
async fn verify_team_access(
    state: &AppState,
    user_id: Uuid,
    team_id: Uuid,
) -> Result<(), ErrorResponse> {
    if let Some(workspace_id) = TeamRepository::workspace_id(state.pool(), team_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %team_id, "failed to get team workspace");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "failed to verify access")
        })?
    {
        ensure_member_access(state.pool(), workspace_id, user_id).await?;
    }
    Ok(())
}
