//! Billing API routes for plan limits and usage (IKA-182, IKA-238, IKA-229)

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    routing::get,
};
use db_crate::models::plan_limits::{PLAN_HOBBY, PLAN_PRO, PLAN_STARTER, PlanLimits};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    middleware::usage_limits::{
        WorkspaceCreationCheck, WorkspaceUsageSummary, check_workspace_creation_limit_by_uuid,
        get_usage_summary,
    },
};

/// Public routes - no authentication required (IKA-238)
pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/plan-limits", get(get_plan_limits))
        .route("/billing/plans", get(get_all_plans)) // Public - plans don't need auth
}

/// Protected routes - require authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/billing/usage", get(get_workspace_usage))
        .route(
            "/billing/workspace-creation-check",
            get(check_workspace_creation),
        )
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
    pub max_workspaces: i64,
    pub max_teams: i64,
    pub max_projects: i64,
    pub max_members: i64,
    pub max_storage_gb: i64,
    pub max_ai_requests_per_month: i64,
    pub price_monthly: Option<i32>,
    pub is_free: bool,
    pub requires_stripe: bool,
    pub is_unlimited_workspaces: bool,
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
            max_workspaces: p.max_workspaces,
            max_teams: p.max_teams,
            max_projects: p.max_projects,
            max_members: p.max_members,
            max_storage_gb: p.max_storage_gb,
            max_ai_requests_per_month: p.max_ai_requests_per_month,
            price_monthly: get_plan_price(&p.plan_name),
            is_free: p.is_free(),
            requires_stripe: p.requires_stripe(),
            is_unlimited_workspaces: p.has_unlimited_workspaces(),
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
// Public API Types (IKA-238) - For unauthenticated PricingPage
// ============================================================================

/// Feature item for pricing display
#[derive(Debug, Serialize)]
pub struct PlanFeature {
    pub text: String,
    pub included: bool,
}

/// Public plan information for PricingPage
#[derive(Debug, Serialize)]
pub struct PublicPlanInfo {
    pub name: String,
    pub description: String,
    pub monthly_price: i32,
    pub yearly_price: i32,
    pub icon: String,
    pub is_popular: bool,
    pub cta_text: String,
    pub cta_link: String,
    pub limits: PublicPlanLimits,
    pub features: Vec<PlanFeature>,
}

/// Plan limits formatted for display
#[derive(Debug, Serialize)]
pub struct PublicPlanLimits {
    pub teams: String,
    pub projects: String,
    pub members: String,
    pub support: String,
}

/// Response for /plan-limits endpoint
#[derive(Debug, Serialize)]
pub struct PlanLimitsResponse {
    pub plans: Vec<PublicPlanInfo>,
}

// ============================================================================
// Route Handlers
// ============================================================================

/// Get all available plans and their limits (public - no auth required)
async fn get_all_plans(
    State(state): State<AppState>,
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

/// Check if the current user can create a new workspace (IKA-229)
async fn check_workspace_creation(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<WorkspaceCreationCheck>, BillingRouteError> {
    let check = check_workspace_creation_limit_by_uuid(state.pool(), ctx.user.id)
        .await
        .map_err(|e| BillingRouteError::UsageError(e.to_string()))?;

    Ok(Json(check))
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get monthly price for a plan (in cents)
fn get_plan_price(plan_name: &str) -> Option<i32> {
    match plan_name {
        PLAN_HOBBY => Some(0),      // Free
        PLAN_STARTER => Some(1900), // $19/month
        PLAN_PRO => Some(3900),     // $39/month
        _ => None,
    }
}

/// Get yearly price for a plan (in dollars, with 17% discount)
fn get_yearly_price(plan_name: &str) -> i32 {
    match plan_name {
        PLAN_HOBBY => 0,
        PLAN_STARTER => 16, // ~17% off $19/month
        PLAN_PRO => 32,     // ~17% off $39/month
        _ => 0,
    }
}

/// Build public plan info from database plan limits (IKA-238)
fn build_public_plan_info(plan: &PlanLimits) -> PublicPlanInfo {
    let (description, icon, is_popular, cta_text, features) = match plan.plan_name.as_str() {
        PLAN_HOBBY => (
            "Perfect for personal projects and learning iKanban".to_string(),
            "hobby".to_string(),
            false,
            "Get Started Free".to_string(),
            vec![
                PlanFeature {
                    text: "Basic kanban boards".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "Task management".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "Document storage (500MB)".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: format!("AI task updates ({}/month)", plan.max_ai_requests_per_month),
                    included: true,
                },
                PlanFeature {
                    text: "Email support".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "6 month data retention".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "GitHub integration".to_string(),
                    included: false,
                },
                PlanFeature {
                    text: "MCP server access".to_string(),
                    included: false,
                },
            ],
        ),
        PLAN_STARTER => (
            "For small teams and startups getting serious".to_string(),
            "starter".to_string(),
            true,
            "Start Free Trial".to_string(),
            vec![
                PlanFeature {
                    text: "Everything in Hobby".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "GitHub integration".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: format!("Document management ({}GB)", plan.max_storage_gb),
                    included: true,
                },
                PlanFeature {
                    text: "MCP server access".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: format!("AI task updates ({}/month)", plan.max_ai_requests_per_month),
                    included: true,
                },
                PlanFeature {
                    text: "1 year data retention".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "Advanced analytics".to_string(),
                    included: false,
                },
                PlanFeature {
                    text: "Team permissions".to_string(),
                    included: false,
                },
            ],
        ),
        PLAN_PRO => (
            "Advanced features for growing development teams".to_string(),
            "professional".to_string(),
            false,
            "Start Free Trial".to_string(),
            vec![
                PlanFeature {
                    text: "Everything in Starter".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "Advanced analytics dashboard".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "Multiple AI agent support".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "Custom project templates".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: format!("AI task updates ({}/month)", plan.max_ai_requests_per_month),
                    included: true,
                },
                PlanFeature {
                    text: "Priority email + chat support".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "Team roles & permissions".to_string(),
                    included: true,
                },
                PlanFeature {
                    text: "2 year data retention".to_string(),
                    included: true,
                },
            ],
        ),
        _ => (
            "Custom plan".to_string(),
            "custom".to_string(),
            false,
            "Contact Us".to_string(),
            vec![],
        ),
    };

    let support = match plan.plan_name.as_str() {
        PLAN_HOBBY => "Email",
        PLAN_STARTER => "Email",
        PLAN_PRO => "Priority",
        _ => "Standard",
    };

    let display_name = match plan.plan_name.as_str() {
        PLAN_HOBBY => "Hobby",
        PLAN_STARTER => "Starter",
        PLAN_PRO => "Professional",
        name => name,
    };

    PublicPlanInfo {
        name: display_name.to_string(),
        description,
        monthly_price: get_plan_price(&plan.plan_name).unwrap_or(0) / 100,
        yearly_price: get_yearly_price(&plan.plan_name),
        icon,
        is_popular,
        cta_text,
        cta_link: format!("/sign-up?plan={}", plan.plan_name),
        limits: PublicPlanLimits {
            teams: format_limit(plan.max_teams, "teams"),
            projects: format_limit(plan.max_projects, "projects"),
            members: format_limit(plan.max_members, "users"),
            support: support.to_string(),
        },
        features,
    }
}

/// Format limit value for display (handles -1 = unlimited)
fn format_limit(limit: i64, unit: &str) -> String {
    if PlanLimits::is_unlimited(limit) {
        format!("Unlimited {}", unit)
    } else {
        format!("{} {}", limit, unit)
    }
}

// ============================================================================
// Public Route Handlers (IKA-238)
// ============================================================================

/// Get all plan limits (public endpoint, no auth required)
async fn get_plan_limits(
    State(state): State<AppState>,
) -> Result<Json<PlanLimitsResponse>, BillingRouteError> {
    let plans = PlanLimits::find_all(state.pool())
        .await
        .map_err(|e| BillingRouteError::Database(e.to_string()))?;

    let public_plans: Vec<PublicPlanInfo> = plans.iter().map(build_public_plan_info).collect();

    Ok(Json(PlanLimitsResponse {
        plans: public_plans,
    }))
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
