//! Billing API routes for plan limits and usage (IKA-182)

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    routing::get,
};
use db_crate::models::plan_limits::PlanLimits;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    middleware::usage_limits::{WorkspaceUsageSummary, get_usage_summary},
};

/// Protected routes - require authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/billing/plans", get(get_all_plans))
        .route("/billing/usage", get(get_workspace_usage))
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct GetUsageRequest {
    pub workspace_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct PlanInfo {
    pub plan_name: String,
    pub max_teams: i64,
    pub max_projects: i64,
    pub max_members: i64,
    pub max_storage_gb: i64,
    pub max_ai_requests_per_month: i64,
    pub price_monthly: Option<i32>,
    pub is_unlimited_teams: bool,
    pub is_unlimited_projects: bool,
    pub is_unlimited_members: bool,
    pub is_unlimited_storage: bool,
    pub is_unlimited_ai: bool,
}

impl From<PlanLimits> for PlanInfo {
    fn from(p: PlanLimits) -> Self {
        PlanInfo {
            plan_name: p.plan_name.clone(),
            max_teams: p.max_teams,
            max_projects: p.max_projects,
            max_members: p.max_members,
            max_storage_gb: p.max_storage_gb,
            max_ai_requests_per_month: p.max_ai_requests_per_month,
            price_monthly: get_plan_price(&p.plan_name),
            is_unlimited_teams: p.has_unlimited_teams(),
            is_unlimited_projects: p.has_unlimited_projects(),
            is_unlimited_members: p.has_unlimited_members(),
            is_unlimited_storage: p.has_unlimited_storage(),
            is_unlimited_ai: p.has_unlimited_ai_requests(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct PlansResponse {
    pub plans: Vec<PlanInfo>,
}

#[derive(Debug, Serialize)]
pub struct UsageResponse {
    pub workspace_id: Uuid,
    pub plan: String,
    pub usage: WorkspaceUsageSummary,
}

// ============================================================================
// Route Handlers
// ============================================================================

/// Get all available plans and their limits
async fn get_all_plans(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
) -> Result<Json<PlansResponse>, BillingRouteError> {
    let plans = PlanLimits::find_all(state.pool())
        .await
        .map_err(|e| BillingRouteError::Database(e.to_string()))?;

    let plan_infos: Vec<PlanInfo> = plans.into_iter().map(|p| p.into()).collect();

    Ok(Json(PlansResponse { plans: plan_infos }))
}

/// Get current usage for a workspace
async fn get_workspace_usage(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    Query(query): Query<GetUsageRequest>,
) -> Result<Json<UsageResponse>, BillingRouteError> {
    // Get workspace plan
    let workspace = sqlx::query_as::<_, (Uuid, String)>(
        r#"SELECT id, plan FROM tenant_workspaces WHERE id = $1"#,
    )
    .bind(query.workspace_id)
    .fetch_optional(state.pool())
    .await
    .map_err(|e| BillingRouteError::Database(e.to_string()))?
    .ok_or(BillingRouteError::WorkspaceNotFound)?;

    // Get usage summary
    let usage = get_usage_summary(state.pool(), query.workspace_id)
        .await
        .map_err(|e| BillingRouteError::UsageError(e.to_string()))?;

    Ok(Json(UsageResponse {
        workspace_id: query.workspace_id,
        plan: workspace.1,
        usage,
    }))
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get monthly price for a plan (in cents)
fn get_plan_price(plan_name: &str) -> Option<i32> {
    match plan_name {
        "free" => Some(0),
        "starter" => Some(1200), // $12/month
        "pro" => Some(2500),     // $25/month
        "enterprise" => None,    // Custom pricing
        _ => None,
    }
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum BillingRouteError {
    #[error("Database error: {0}")]
    Database(String),
    #[error("Workspace not found")]
    WorkspaceNotFound,
    #[error("Usage error: {0}")]
    UsageError(String),
}

impl axum::response::IntoResponse for BillingRouteError {
    fn into_response(self) -> axum::response::Response {
        use axum::http::StatusCode;

        let (status, message) = match &self {
            BillingRouteError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            BillingRouteError::WorkspaceNotFound => (StatusCode::NOT_FOUND, "Workspace not found"),
            BillingRouteError::UsageError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Usage tracking error")
            }
        };

        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}
