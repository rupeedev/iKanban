//! AI Provider Keys API routes
//!
//! Routes for managing AI provider API keys (Anthropic, Google, OpenAI)

use axum::{
    extract::{Path, State},
    response::Json as ResponseJson,
    routing::{delete, get, post},
    Json, Router,
};
use db::models::ai_provider_key::{AiProviderKey, AiProviderKeyInfo, UpsertAiProviderKey};
use db::models::tenant_workspace::TenantWorkspace;
use utils::response::ApiResponse;

use crate::{
    error::ApiError,
    middleware::auth::ClerkUser,
    DeploymentImpl,
};
use deployment::Deployment;

/// Get the tenant workspace ID for the current user
/// Auto-provisions user to default workspace if no membership exists
async fn get_user_tenant_workspace(
    pool: &sqlx::PgPool,
    user_id: &str,
    email: Option<&str>,
) -> Result<uuid::Uuid, ApiError> {
    // First, try to find existing membership
    let workspace_id: Option<uuid::Uuid> = sqlx::query_scalar!(
        r#"SELECT tenant_workspace_id as "id: uuid::Uuid"
           FROM tenant_workspace_members
           WHERE user_id = $1
           LIMIT 1"#,
        user_id
    )
    .fetch_optional(pool)
    .await?;

    if let Some(id) = workspace_id {
        return Ok(id);
    }

    // Auto-provision: find or create default workspace and add user as member
    tracing::info!("Auto-provisioning user {} to default workspace", user_id);

    let default_workspace = TenantWorkspace::find_or_create_default(pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to create default workspace: {}", e);
            ApiError::BadRequest(format!("Failed to initialize workspace: {}", e))
        })?;

    // Use provided email or generate a placeholder
    let generated_email = format!("{}@user.local", user_id);
    let user_email = email.unwrap_or(&generated_email);

    TenantWorkspace::ensure_user_is_member(pool, default_workspace.id, user_id, user_email)
        .await
        .map_err(|e| {
            tracing::error!("Failed to add user to workspace: {}", e);
            ApiError::BadRequest(format!("Failed to add user to workspace: {}", e))
        })?;

    tracing::info!("User {} added to workspace {}", user_id, default_workspace.id);
    Ok(default_workspace.id)
}

/// List all configured AI provider keys
pub async fn list_ai_keys(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<AiProviderKeyInfo>>>, ApiError> {
    let tenant_workspace_id = get_user_tenant_workspace(
        &deployment.db().pool,
        &user.user_id,
        user.email.as_deref(),
    ).await?;
    let keys = AiProviderKey::list(&deployment.db().pool, tenant_workspace_id).await?;
    Ok(ResponseJson(ApiResponse::success(keys)))
}

/// Create or update an AI provider key
pub async fn upsert_ai_key(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<UpsertAiProviderKey>,
) -> Result<ResponseJson<ApiResponse<AiProviderKeyInfo>>, ApiError> {
    // Validate provider name
    let provider = request.provider.to_lowercase();
    if !["anthropic", "google", "openai"].contains(&provider.as_str()) {
        return Err(ApiError::BadRequest(format!(
            "Invalid provider: {}. Must be one of: anthropic, google, openai",
            request.provider
        )));
    }

    // Validate API key format
    let valid_prefix = match provider.as_str() {
        "anthropic" => request.api_key.starts_with("sk-ant-"),
        "google" => request.api_key.starts_with("AIza"),
        "openai" => request.api_key.starts_with("sk-"),
        _ => false,
    };

    if !valid_prefix {
        return Err(ApiError::BadRequest(format!(
            "Invalid API key format for {}",
            provider
        )));
    }

    let tenant_workspace_id = get_user_tenant_workspace(
        &deployment.db().pool,
        &user.user_id,
        user.email.as_deref(),
    ).await?;
    let key = AiProviderKey::upsert(&deployment.db().pool, tenant_workspace_id, &request).await?;
    Ok(ResponseJson(ApiResponse::success(key)))
}

/// Delete an AI provider key
pub async fn delete_ai_key(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(provider): Path<String>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let tenant_workspace_id = get_user_tenant_workspace(
        &deployment.db().pool,
        &user.user_id,
        user.email.as_deref(),
    ).await?;
    let deleted = AiProviderKey::delete(&deployment.db().pool, tenant_workspace_id, &provider).await?;

    if deleted {
        Ok(ResponseJson(ApiResponse::success(())))
    } else {
        Err(ApiError::NotFound(format!(
            "AI provider key not found: {}",
            provider
        )))
    }
}

/// Test an AI provider key by making a simple API call
pub async fn test_ai_key(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(provider): Path<String>,
) -> Result<ResponseJson<ApiResponse<bool>>, ApiError> {
    let tenant_workspace_id = get_user_tenant_workspace(
        &deployment.db().pool,
        &user.user_id,
        user.email.as_deref(),
    ).await?;

    let api_key = AiProviderKey::get_key(&deployment.db().pool, tenant_workspace_id, &provider)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("No API key configured for: {}", provider)))?;

    // Test the API key by making a simple request
    let is_valid = test_provider_key(&provider, &api_key).await;

    // Update validation status in database
    AiProviderKey::update_validation(&deployment.db().pool, tenant_workspace_id, &provider, is_valid)
        .await?;

    Ok(ResponseJson(ApiResponse::success(is_valid)))
}

/// Test an API key by making a minimal request to the provider
async fn test_provider_key(provider: &str, api_key: &str) -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    match provider.to_lowercase().as_str() {
        "anthropic" => {
            // Test Claude API with a minimal request
            let response = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&serde_json::json!({
                    "model": "claude-3-5-haiku-20241022",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "hi"}]
                }))
                .send()
                .await;

            match response {
                Ok(res) => res.status().is_success() || res.status().as_u16() == 400,
                Err(_) => false,
            }
        }
        "google" => {
            // Test Gemini API
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models?key={}",
                api_key
            );
            let response = client.get(&url).send().await;

            match response {
                Ok(res) => res.status().is_success(),
                Err(_) => false,
            }
        }
        "openai" => {
            // Test OpenAI API by listing models
            let response = client
                .get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await;

            match response {
                Ok(res) => res.status().is_success(),
                Err(_) => false,
            }
        }
        _ => false,
    }
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/ai-keys", get(list_ai_keys))
        .route("/ai-keys", post(upsert_ai_key))
        .route("/ai-keys/{provider}", delete(delete_ai_key))
        .route("/ai-keys/{provider}/test", post(test_ai_key))
}
