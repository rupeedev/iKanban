//! Stripe API routes for subscription management (IKA-181)

use axum::{
    body::Bytes,
    extract::{Extension, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::{
    auth::RequestContext,
    stripe::{parse_webhook_event, verify_webhook_signature, StripeWebhookEvent},
    AppState,
};
use db_crate::models::workspace_subscription::{SubscriptionStatus, WorkspaceSubscription};

/// Protected routes - require authentication
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/stripe/checkout-session", post(create_checkout_session))
        .route("/stripe/portal-session", post(create_portal_session))
        .route("/stripe/subscription", get(get_subscription_status))
}

/// Public routes - no authentication (webhooks)
pub fn public_router() -> Router<AppState> {
    Router::new().route("/stripe/webhooks", post(handle_webhook))
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateCheckoutSessionRequest {
    pub workspace_id: Uuid,
    pub plan: String, // "pro" or "enterprise"
}

#[derive(Debug, Serialize)]
pub struct CreateCheckoutSessionResponse {
    pub checkout_url: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePortalSessionRequest {
    pub workspace_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct CreatePortalSessionResponse {
    pub portal_url: String,
}

#[derive(Debug, Deserialize)]
pub struct GetSubscriptionRequest {
    pub workspace_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct SubscriptionStatusResponse {
    pub workspace_id: Uuid,
    pub plan: String,
    pub status: String,
    pub current_period_end: Option<String>,
    pub stripe_customer_id: Option<String>,
    pub can_manage: bool, // true if user can access billing portal
}

// ============================================================================
// Route Handlers
// ============================================================================

/// Create a Stripe Checkout session for upgrading to a paid plan
async fn create_checkout_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(request): Json<CreateCheckoutSessionRequest>,
) -> Result<Json<CreateCheckoutSessionResponse>, StripeRouteError> {
    let stripe = state.stripe().ok_or(StripeRouteError::NotConfigured)?;

    // Validate plan
    if request.plan != "pro" && request.plan != "enterprise" {
        return Err(StripeRouteError::InvalidPlan(request.plan));
    }

    // Get user email from context
    let user_email = &ctx.user.email;

    info!(
        workspace_id = %request.workspace_id,
        plan = %request.plan,
        user_id = %ctx.user.id,
        "Creating checkout session"
    );

    let checkout_url = stripe
        .create_checkout_session(request.workspace_id, &request.plan, user_email)
        .await
        .map_err(|e| {
            error!(?e, "Failed to create checkout session");
            StripeRouteError::StripeError(e.to_string())
        })?;

    Ok(Json(CreateCheckoutSessionResponse { checkout_url }))
}

/// Create a Stripe Billing Portal session for managing subscriptions
async fn create_portal_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(request): Json<CreatePortalSessionRequest>,
) -> Result<Json<CreatePortalSessionResponse>, StripeRouteError> {
    let stripe = state.stripe().ok_or(StripeRouteError::NotConfigured)?;

    info!(
        workspace_id = %request.workspace_id,
        user_id = %ctx.user.id,
        "Creating portal session"
    );

    let portal_url = stripe
        .create_portal_session(state.pool(), request.workspace_id)
        .await
        .map_err(|e| {
            error!(?e, "Failed to create portal session");
            StripeRouteError::StripeError(e.to_string())
        })?;

    Ok(Json(CreatePortalSessionResponse { portal_url }))
}

/// Get current subscription status for a workspace
async fn get_subscription_status(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    axum::extract::Query(query): axum::extract::Query<GetSubscriptionRequest>,
) -> Result<Json<SubscriptionStatusResponse>, StripeRouteError> {
    // Get workspace plan (use runtime type checking for SQLx cache compatibility)
    let workspace = sqlx::query_as::<_, (Uuid, String)>(
        r#"SELECT id, plan FROM tenant_workspaces WHERE id = $1"#
    )
    .bind(query.workspace_id)
    .fetch_optional(state.pool())
    .await
    .map_err(|e| StripeRouteError::Database(e.to_string()))?
    .ok_or(StripeRouteError::WorkspaceNotFound)?;

    // Get subscription if exists
    let subscription = WorkspaceSubscription::find_by_workspace_id(state.pool(), query.workspace_id)
        .await
        .map_err(|e| StripeRouteError::Database(e.to_string()))?;

    let (status, current_period_end, stripe_customer_id) = match subscription {
        Some(sub) => (
            sub.status.to_string(),
            sub.current_period_end.map(|dt| dt.to_rfc3339()),
            sub.stripe_customer_id,
        ),
        None => ("trialing".to_string(), None, None),
    };

    // User can manage billing if they have a Stripe customer ID
    let can_manage = stripe_customer_id.is_some();

    Ok(Json(SubscriptionStatusResponse {
        workspace_id: query.workspace_id,
        plan: workspace.1, // tuple: (id, plan)
        status,
        current_period_end,
        stripe_customer_id,
        can_manage,
    }))
}

/// Handle Stripe webhook events
async fn handle_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, StripeRouteError> {
    let config = state
        .config()
        .stripe
        .as_ref()
        .ok_or(StripeRouteError::NotConfigured)?;

    // Get signature header
    let signature = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or(StripeRouteError::MissingSignature)?;

    // Verify signature
    verify_webhook_signature(&body, signature, config)
        .map_err(|e| StripeRouteError::InvalidSignature(e.to_string()))?;

    // Parse event
    let event = parse_webhook_event(&body)
        .map_err(|e| StripeRouteError::InvalidPayload(e.to_string()))?;

    // Handle event
    handle_stripe_event(&state, event).await?;

    Ok(StatusCode::OK)
}

/// Process Stripe webhook events
async fn handle_stripe_event(state: &AppState, event: StripeWebhookEvent) -> Result<(), StripeRouteError> {
    match event {
        StripeWebhookEvent::CheckoutSessionCompleted {
            session_id,
            customer_id,
            subscription_id,
            workspace_id,
        } => {
            info!(
                session_id = %session_id,
                customer_id = %customer_id,
                workspace_id = ?workspace_id,
                "Checkout session completed"
            );

            if let (Some(workspace_id_str), Some(sub_id)) = (workspace_id, subscription_id) {
                let workspace_id = Uuid::parse_str(&workspace_id_str)
                    .map_err(|_| StripeRouteError::InvalidWorkspaceId)?;

                // Sync subscription from Stripe
                if let Some(stripe) = state.stripe() {
                    let subscription = stripe.get_subscription(&sub_id).await.map_err(|e| {
                        error!(?e, "Failed to get subscription from Stripe");
                        StripeRouteError::StripeError(e.to_string())
                    })?;

                    stripe
                        .sync_subscription(state.pool(), &subscription, workspace_id)
                        .await
                        .map_err(|e| {
                            error!(?e, "Failed to sync subscription");
                            StripeRouteError::StripeError(e.to_string())
                        })?;

                    // Determine plan from price and update workspace
                    if let Some(first_item) = subscription.items.data.first() {
                        if let Some(price) = &first_item.price {
                            if let Some(plan) = stripe.plan_from_price_id(&price.id) {
                                stripe
                                    .update_workspace_plan(state.pool(), workspace_id, plan)
                                    .await
                                    .map_err(|e| {
                                        error!(?e, "Failed to update workspace plan");
                                        StripeRouteError::StripeError(e.to_string())
                                    })?;
                                info!(workspace_id = %workspace_id, plan = %plan, "Updated workspace plan");
                            }
                        }
                    }
                }
            }
        }
        StripeWebhookEvent::SubscriptionUpdated {
            subscription_id,
            customer_id: _,
            status,
            workspace_id,
            current_period_start,
            current_period_end,
        } => {
            info!(
                subscription_id = %subscription_id,
                status = %status,
                workspace_id = ?workspace_id,
                "Subscription updated"
            );

            if let Some(workspace_id_str) = workspace_id {
                let workspace_id = Uuid::parse_str(&workspace_id_str)
                    .map_err(|_| StripeRouteError::InvalidWorkspaceId)?;

                // Update subscription record
                if let Some(subscription) = WorkspaceSubscription::find_by_workspace_id(state.pool(), workspace_id)
                    .await
                    .map_err(|e| StripeRouteError::Database(e.to_string()))?
                {
                    let status = status.parse::<SubscriptionStatus>().ok();
                    let update = db_crate::models::workspace_subscription::UpdateWorkspaceSubscription {
                        stripe_customer_id: None,
                        stripe_subscription_id: Some(subscription_id),
                        current_period_start: current_period_start
                            .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0)),
                        current_period_end: current_period_end
                            .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0)),
                        status,
                    };

                    WorkspaceSubscription::update(state.pool(), subscription.id, &update)
                        .await
                        .map_err(|e| StripeRouteError::Database(e.to_string()))?;
                }
            }
        }
        StripeWebhookEvent::SubscriptionDeleted {
            subscription_id,
            workspace_id,
            ..
        } => {
            info!(
                subscription_id = %subscription_id,
                workspace_id = ?workspace_id,
                "Subscription deleted"
            );

            if let Some(workspace_id_str) = workspace_id {
                let workspace_id = Uuid::parse_str(&workspace_id_str)
                    .map_err(|_| StripeRouteError::InvalidWorkspaceId)?;

                // Update workspace to free plan
                if let Some(stripe) = state.stripe() {
                    stripe
                        .update_workspace_plan(state.pool(), workspace_id, "free")
                        .await
                        .map_err(|e| StripeRouteError::StripeError(e.to_string()))?;
                }

                // Update subscription status to canceled
                if let Some(subscription) = WorkspaceSubscription::find_by_workspace_id(state.pool(), workspace_id)
                    .await
                    .map_err(|e| StripeRouteError::Database(e.to_string()))?
                {
                    WorkspaceSubscription::update_status(
                        state.pool(),
                        subscription.id,
                        SubscriptionStatus::Canceled,
                    )
                    .await
                    .map_err(|e| StripeRouteError::Database(e.to_string()))?;
                }
            }
        }
        StripeWebhookEvent::InvoicePaymentFailed {
            invoice_id,
            subscription_id,
            ..
        } => {
            warn!(
                invoice_id = %invoice_id,
                subscription_id = ?subscription_id,
                "Invoice payment failed"
            );
            // Could send notification email here
        }
        StripeWebhookEvent::Unknown { event_type } => {
            info!(event_type = %event_type, "Received unhandled webhook event");
        }
        _ => {}
    }

    Ok(())
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum StripeRouteError {
    #[error("Stripe not configured")]
    NotConfigured,
    #[error("Invalid plan: {0}")]
    InvalidPlan(String),
    #[error("Stripe error: {0}")]
    StripeError(String),
    #[error("Database error: {0}")]
    Database(String),
    #[error("Workspace not found")]
    WorkspaceNotFound,
    #[error("Missing signature header")]
    MissingSignature,
    #[error("Invalid signature: {0}")]
    InvalidSignature(String),
    #[error("Invalid payload: {0}")]
    InvalidPayload(String),
    #[error("Invalid workspace ID")]
    InvalidWorkspaceId,
}

impl IntoResponse for StripeRouteError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            StripeRouteError::NotConfigured => (StatusCode::SERVICE_UNAVAILABLE, "Stripe not configured"),
            StripeRouteError::InvalidPlan(_) => (StatusCode::BAD_REQUEST, "Invalid plan"),
            StripeRouteError::StripeError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Stripe error"),
            StripeRouteError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            StripeRouteError::WorkspaceNotFound => (StatusCode::NOT_FOUND, "Workspace not found"),
            StripeRouteError::MissingSignature => (StatusCode::BAD_REQUEST, "Missing signature"),
            StripeRouteError::InvalidSignature(_) => (StatusCode::UNAUTHORIZED, "Invalid signature"),
            StripeRouteError::InvalidPayload(_) => (StatusCode::BAD_REQUEST, "Invalid payload"),
            StripeRouteError::InvalidWorkspaceId => (StatusCode::BAD_REQUEST, "Invalid workspace ID"),
        };

        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}
