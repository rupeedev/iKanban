//! AI provider keys routes for managing Claude, Gemini, OpenAI API keys

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::Deserialize;
use tracing::instrument;
use uuid::Uuid;

use super::error::{ApiResponse, ErrorResponse};
use crate::{
    auth::RequestContext,
    db::ai_provider_keys::{AiProviderKeyInfo, AiProviderKeyRepository, UpsertAiProviderKeyRequest},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ai-keys", get(list_ai_keys).post(upsert_ai_key))
        .route("/ai-keys/{provider}", axum::routing::delete(delete_ai_key))
        .route("/ai-keys/{provider}/test", post(test_ai_key))
}

#[derive(Debug, Deserialize)]
struct WorkspaceQuery {
    workspace_id: Uuid,
}

/// List all AI provider keys for the current workspace
#[instrument(
    name = "ai_keys.list",
    skip(state, _ctx, query),
    fields(workspace_id = %query.workspace_id)
)]
async fn list_ai_keys(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Query(query): Query<WorkspaceQuery>,
) -> Result<Json<ApiResponse<Vec<AiProviderKeyInfo>>>, ErrorResponse> {
    let keys = AiProviderKeyRepository::list_by_workspace(state.pool(), query.workspace_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to list AI provider keys");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list AI provider keys",
            )
        })?;

    Ok(ApiResponse::success(keys))
}

/// Request body for upserting an AI provider key
#[derive(Debug, Deserialize)]
struct UpsertAiKeyRequest {
    workspace_id: Uuid,
    provider: String,
    api_key: String,
}

/// Create or update an AI provider key
#[instrument(
    name = "ai_keys.upsert",
    skip(state, _ctx, payload),
    fields(workspace_id = %payload.workspace_id, provider = %payload.provider)
)]
async fn upsert_ai_key(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Json(payload): Json<UpsertAiKeyRequest>,
) -> Result<Json<ApiResponse<AiProviderKeyInfo>>, ErrorResponse> {
    // Validate provider
    let valid_providers = ["anthropic", "google", "openai"];
    if !valid_providers.contains(&payload.provider.as_str()) {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Invalid provider. Must be one of: anthropic, google, openai",
        ));
    }

    // Validate API key is not empty
    if payload.api_key.trim().is_empty() {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "API key cannot be empty",
        ));
    }

    let request = UpsertAiProviderKeyRequest {
        provider: payload.provider,
        api_key: payload.api_key,
    };

    let key_info = AiProviderKeyRepository::upsert(state.pool(), payload.workspace_id, &request)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to upsert AI provider key");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to save AI provider key",
            )
        })?;

    Ok(ApiResponse::success(key_info))
}

#[derive(Debug, Deserialize)]
struct DeleteQuery {
    workspace_id: Uuid,
}

/// Delete an AI provider key
#[instrument(
    name = "ai_keys.delete",
    skip(state, _ctx, query),
    fields(workspace_id = %query.workspace_id, provider = %provider)
)]
async fn delete_ai_key(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(provider): Path<String>,
    Query(query): Query<DeleteQuery>,
) -> Result<StatusCode, ErrorResponse> {
    let deleted = AiProviderKeyRepository::delete(state.pool(), query.workspace_id, &provider)
        .await
        .map_err(|error| {
            tracing::error!(?error, %provider, "failed to delete AI provider key");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to delete AI provider key",
            )
        })?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "AI provider key not found",
        ))
    }
}

#[derive(Debug, Deserialize)]
struct TestQuery {
    workspace_id: Uuid,
}

/// Test an AI provider key (validate it works)
#[instrument(
    name = "ai_keys.test",
    skip(state, _ctx, query),
    fields(workspace_id = %query.workspace_id, provider = %provider)
)]
async fn test_ai_key(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Path(provider): Path<String>,
    Query(query): Query<TestQuery>,
) -> Result<Json<ApiResponse<bool>>, ErrorResponse> {
    // Get the key
    let key = AiProviderKeyRepository::get_key(state.pool(), query.workspace_id, &provider)
        .await
        .map_err(|error| {
            tracing::error!(?error, %provider, "failed to get AI provider key");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get AI provider key",
            )
        })?;

    let Some(api_key) = key else {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "AI provider key not found",
        ));
    };

    // Test the key by making a simple API call
    let is_valid = test_provider_key(&provider, &api_key).await;

    // Update the validation status
    AiProviderKeyRepository::update_validation_status(
        state.pool(),
        query.workspace_id,
        &provider,
        is_valid,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, %provider, "failed to update key validation status");
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to update key validation status",
        )
    })?;

    Ok(ApiResponse::success(is_valid))
}

/// Test a provider key by making a simple API call
async fn test_provider_key(provider: &str, api_key: &str) -> bool {
    let client = reqwest::Client::new();

    match provider {
        "anthropic" => {
            // Test Anthropic API with a minimal messages request
            let response = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": "claude-3-haiku-20240307",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "Hi"}]
                }))
                .send()
                .await;

            matches!(response, Ok(r) if r.status().is_success())
        }
        "google" => {
            // Test Google Gemini API
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models?key={}",
                api_key
            );
            let response = client.get(&url).send().await;

            matches!(response, Ok(r) if r.status().is_success())
        }
        "openai" => {
            // Test OpenAI API by listing models
            let response = client
                .get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await;

            matches!(response, Ok(r) if r.status().is_success())
        }
        _ => false,
    }
}
