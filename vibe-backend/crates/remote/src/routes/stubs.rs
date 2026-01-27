//! Stub endpoints for local-only features
//!
//! These endpoints exist in the local Tauri app but have no meaning in the remote server.
//! We return sensible defaults to prevent frontend errors.

use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Extension, Path, Query},
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::error::ApiResponse;
use crate::{AppState, auth::RequestContext};

pub fn router() -> Router<AppState> {
    Router::new()
        // User system info - returns default config for web users
        .route("/info", get(get_user_system_info))
        // Config - update user config (stub, returns success)
        .route("/config", put(update_config))
        // Profiles - executor profiles for agent settings
        .route("/profiles", get(get_profiles).put(update_profiles))
        // MCP config - stub for MCP server configuration
        .route("/mcp-config", get(get_mcp_config).post(update_mcp_config))
        // Task attempts - local-only feature for managing coding agent workspaces
        .route("/task-attempts", get(list_task_attempts))
        .route("/task-attempts/{attempt_id}", get(get_task_attempt))
        .route(
            "/task-attempts/{attempt_id}/children",
            get(get_attempt_children),
        )
        .route("/task-attempts/{attempt_id}/repos", get(get_attempt_repos))
        .route(
            "/task-attempts/{attempt_id}/branch-status",
            get(get_branch_status),
        )
    // NOTE: Project repository routes have been moved to routes/projects.rs
    // They now properly store GitHub/GitLab repo links in the database
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct TaskAttemptsQuery {
    task_id: Option<Uuid>,
}

/// List task attempts - returns empty array (local-only feature)
async fn list_task_attempts(
    Extension(_ctx): Extension<RequestContext>,
    Query(_params): Query<TaskAttemptsQuery>,
) -> Json<ApiResponse<Vec<Value>>> {
    // Task attempts are local-only for managing coding agent workspaces
    ApiResponse::success(vec![])
}

/// Get a single task attempt - returns not found (local-only feature)
async fn get_task_attempt(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<()>> {
    ApiResponse::error("Task attempts are only available in the local desktop app")
}

/// Get task attempt children - returns empty (local-only feature)
async fn get_attempt_children(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<AttemptChildrenResponse>> {
    ApiResponse::success(AttemptChildrenResponse {
        parent: None,
        children: vec![],
    })
}

#[derive(Debug, serde::Serialize)]
struct AttemptChildrenResponse {
    parent: Option<Value>,
    children: Vec<Value>,
}

/// Get task attempt repos - returns empty array (local-only feature)
async fn get_attempt_repos(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<Value>>> {
    ApiResponse::success(vec![])
}

/// Get branch status - returns empty array (local-only feature)
async fn get_branch_status(
    Extension(_ctx): Extension<RequestContext>,
    Path(_attempt_id): Path<Uuid>,
) -> Json<ApiResponse<Vec<Value>>> {
    ApiResponse::success(vec![])
}

// ============================================================================
// User System Info & Config Stubs (for Settings pages)
// ============================================================================

/// Environment info for web users
#[derive(Debug, Serialize)]
struct Environment {
    os_type: String,
    os_version: String,
    os_architecture: String,
    bitness: String,
}

impl Default for Environment {
    fn default() -> Self {
        Self {
            os_type: "web".to_string(),
            os_version: "1.0".to_string(),
            os_architecture: "wasm".to_string(),
            bitness: "64".to_string(),
        }
    }
}

/// Login status for web users
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum LoginStatus {
    LoggedIn,
}

/// Notification configuration
#[derive(Debug, Serialize, Deserialize)]
struct NotificationConfig {
    sound_enabled: bool,
    push_enabled: bool,
    sound_file: String,
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            push_enabled: false,
            sound_file: "ABSTRACT_SOUND1".to_string(),
        }
    }
}

/// Editor configuration
#[derive(Debug, Serialize, Deserialize)]
struct EditorConfig {
    editor_type: String,
    custom_command: Option<String>,
    remote_ssh_host: Option<String>,
    remote_ssh_user: Option<String>,
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            editor_type: "VS_CODE".to_string(),
            custom_command: None,
            remote_ssh_host: None,
            remote_ssh_user: None,
        }
    }
}

/// GitHub configuration
#[derive(Debug, Serialize, Deserialize)]
struct GitHubConfig {
    pat: Option<String>,
    oauth_token: Option<String>,
    username: Option<String>,
    primary_email: Option<String>,
    default_pr_base: Option<String>,
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            pat: None,
            oauth_token: None,
            username: None,
            primary_email: None,
            default_pr_base: None,
        }
    }
}

/// Executor profile ID
#[derive(Debug, Serialize, Deserialize)]
struct ExecutorProfileId {
    executor: String,
    variant: String,
}

impl Default for ExecutorProfileId {
    fn default() -> Self {
        Self {
            executor: "CLAUDE_CODE".to_string(),
            variant: "DEFAULT".to_string(),
        }
    }
}

/// Showcase state
#[derive(Debug, Serialize, Deserialize)]
struct ShowcaseState {
    seen_features: Vec<String>,
}

impl Default for ShowcaseState {
    fn default() -> Self {
        Self {
            seen_features: vec![],
        }
    }
}

/// User configuration - matches frontend Config type
#[derive(Debug, Serialize, Deserialize)]
struct Config {
    config_version: String,
    theme: String,
    executor_profile: ExecutorProfileId,
    disclaimer_acknowledged: bool,
    onboarding_acknowledged: bool,
    notifications: NotificationConfig,
    editor: EditorConfig,
    github: GitHubConfig,
    analytics_enabled: bool,
    workspace_dir: Option<String>,
    last_app_version: Option<String>,
    show_release_notes: bool,
    language: String,
    git_branch_prefix: String,
    showcases: ShowcaseState,
    pr_auto_description_enabled: bool,
    pr_auto_description_prompt: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            config_version: "1.0".to_string(),
            theme: "SYSTEM".to_string(),
            executor_profile: ExecutorProfileId::default(),
            disclaimer_acknowledged: true,
            onboarding_acknowledged: true,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: false,
            workspace_dir: None,
            last_app_version: None,
            show_release_notes: false,
            language: "BROWSER".to_string(),
            git_branch_prefix: "feature".to_string(),
            showcases: ShowcaseState::default(),
            pr_auto_description_enabled: false,
            pr_auto_description_prompt: None,
        }
    }
}

/// User system info response - matches frontend UserSystemInfo type
#[derive(Debug, Serialize)]
struct UserSystemInfo {
    config: Config,
    analytics_user_id: String,
    login_status: LoginStatus,
    environment: Environment,
    /// Capabilities supported per executor
    capabilities: HashMap<String, Vec<String>>,
    /// Executor configurations
    executors: HashMap<String, Value>,
}

/// Get user system info - returns default config for web users
async fn get_user_system_info(
    Extension(_ctx): Extension<RequestContext>,
) -> Json<ApiResponse<UserSystemInfo>> {
    let user_system_info = UserSystemInfo {
        config: Config::default(),
        analytics_user_id: "web-user".to_string(),
        login_status: LoginStatus::LoggedIn,
        environment: Environment::default(),
        capabilities: HashMap::new(),
        executors: HashMap::new(),
    };

    ApiResponse::success(user_system_info)
}

/// Update user config - stub that returns success
async fn update_config(
    Extension(_ctx): Extension<RequestContext>,
    Json(config): Json<Config>,
) -> Json<ApiResponse<Config>> {
    // For web users, we just acknowledge the config but don't persist it
    // In the future, this could save to the database per-user
    ApiResponse::success(config)
}

// ============================================================================
// Profiles Stubs (for Agent Settings page)
// ============================================================================

/// Profiles content response
#[derive(Debug, Serialize)]
struct ProfilesContent {
    content: String,
    path: String,
}

/// Default executor profiles JSON
fn default_profiles_json() -> String {
    serde_json::json!({
        "executors": {
            "CLAUDE_CODE": {
                "DEFAULT": {
                    "CLAUDE_CODE": {
                        "model": "claude-sonnet-4-20250514"
                    }
                }
            }
        },
        "visibility": {}
    })
    .to_string()
}

/// Get executor profiles - returns default profiles for web users
async fn get_profiles(
    Extension(_ctx): Extension<RequestContext>,
) -> Json<ApiResponse<ProfilesContent>> {
    ApiResponse::success(ProfilesContent {
        content: default_profiles_json(),
        path: "~/.config/ikanban/profiles.json".to_string(),
    })
}

/// Update executor profiles - stub that returns the input
async fn update_profiles(
    Extension(_ctx): Extension<RequestContext>,
    body: String,
) -> Json<ApiResponse<ProfilesContent>> {
    // For web users, we acknowledge the update but don't persist
    // Validate that it's valid JSON
    match serde_json::from_str::<Value>(&body) {
        Ok(_) => ApiResponse::success(ProfilesContent {
            content: body,
            path: "~/.config/ikanban/profiles.json".to_string(),
        }),
        Err(e) => ApiResponse::error(&format!("Invalid JSON: {}", e)),
    }
}

// ============================================================================
// MCP Config Stubs (for MCP Settings page)
// ============================================================================

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct McpServerQuery {
    executor: Option<String>,
}

/// MCP config response
#[derive(Debug, Serialize)]
struct McpConfigResponse {
    mcp_config: McpConfig,
    config_path: String,
}

/// MCP configuration
#[derive(Debug, Serialize)]
struct McpConfig {
    servers: HashMap<String, Value>,
    servers_path: Vec<String>,
    config_format: String,
    preconfigured: HashMap<String, Value>,
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            servers: HashMap::new(),
            servers_path: vec!["mcpServers".to_string()],
            config_format: "json".to_string(),
            preconfigured: HashMap::new(),
        }
    }
}

/// Get MCP servers configuration
async fn get_mcp_config(
    Extension(_ctx): Extension<RequestContext>,
    Query(_query): Query<McpServerQuery>,
) -> Json<ApiResponse<McpConfigResponse>> {
    ApiResponse::success(McpConfigResponse {
        mcp_config: McpConfig::default(),
        config_path: "~/.config/ikanban/mcp.json".to_string(),
    })
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct UpdateMcpServersBody {
    servers: HashMap<String, Value>,
}

/// Update MCP servers configuration - stub
async fn update_mcp_config(
    Extension(_ctx): Extension<RequestContext>,
    Query(_query): Query<McpServerQuery>,
    Json(_payload): Json<UpdateMcpServersBody>,
) -> Json<ApiResponse<String>> {
    // For web users, we acknowledge but don't persist
    ApiResponse::success("MCP servers updated".to_string())
}
