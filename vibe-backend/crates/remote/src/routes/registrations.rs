//! Registration routes for superadmin registration management.
//!
//! These routes handle user registration approval/rejection with email notifications.
//! IKA-232: Add email notifications for registration events

use axum::{
    Extension, Json, Router,
    extract::State,
    routing::{get, post},
};
use db_crate::models::user_registration::{RegistrationStatus, UserRegistration};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use crate::{AppState, auth::RequestContext, db::superadmins::SuperadminRepository};

/// Response wrapper for API responses
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// Query params for listing registrations
#[derive(Debug, Deserialize)]
pub struct ListRegistrationsQuery {
    pub status: Option<String>,
}

/// Request body for rejecting a registration
#[derive(Debug, Deserialize)]
pub struct RejectRequest {
    pub reason: Option<String>,
}

/// Router for superadmin registration routes (requires superadmin auth)
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/registrations", get(list_registrations))
        .route("/registrations/{registration_id}", get(get_registration))
        .route(
            "/registrations/{registration_id}/approve",
            post(approve_registration),
        )
        .route(
            "/registrations/{registration_id}/reject",
            post(reject_registration),
        )
}

/// List all registrations with optional status filter
#[instrument(name = "registrations.list", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn list_registrations(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    axum::extract::Query(params): axum::extract::Query<ListRegistrationsQuery>,
) -> Json<ApiResponse<Vec<UserRegistration>>> {
    let pool = state.pool();

    let registrations: Vec<UserRegistration> = match &params.status {
        None => {
            // Default to pending registrations when no status filter provided
            match UserRegistration::list_pending(pool).await {
                Ok(list) => list,
                Err(e) => {
                    tracing::error!(?e, "Failed to list pending registrations");
                    return Json(ApiResponse::error("Failed to list registrations".into()));
                }
            }
        }
        Some(status_str) => {
            let status_filter = status_str.parse::<RegistrationStatus>().ok();
            match UserRegistration::list_all(pool, status_filter).await {
                Ok(list) => list,
                Err(e) => {
                    tracing::error!(?e, "Failed to list registrations");
                    return Json(ApiResponse::error("Failed to list registrations".into()));
                }
            }
        }
    };

    tracing::debug!(
        user_id = %ctx.user.id,
        count = registrations.len(),
        "Listed registrations"
    );

    Json(ApiResponse::success(registrations))
}

/// Get a single registration by ID
#[instrument(name = "registrations.get", skip(state, _ctx))]
async fn get_registration(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
    axum::extract::Path(registration_id): axum::extract::Path<Uuid>,
) -> Json<ApiResponse<UserRegistration>> {
    let pool = state.pool();

    match UserRegistration::find_by_id(pool, registration_id).await {
        Ok(Some(registration)) => Json(ApiResponse::success(registration)),
        Ok(None) => Json(ApiResponse::error("Registration not found".into())),
        Err(e) => {
            tracing::error!(?e, "Failed to get registration");
            Json(ApiResponse::error("Failed to get registration".into()))
        }
    }
}

/// Approve a user registration and send email notification
#[instrument(name = "registrations.approve", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn approve_registration(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    axum::extract::Path(registration_id): axum::extract::Path<Uuid>,
) -> Json<ApiResponse<UserRegistration>> {
    let pool = state.pool();

    // Get the pending registration first
    let pending = match UserRegistration::find_by_id(pool, registration_id).await {
        Ok(Some(reg)) if reg.status == RegistrationStatus::Pending => reg,
        Ok(Some(_)) => {
            return Json(ApiResponse::error("Registration is not pending".into()));
        }
        Ok(None) => {
            return Json(ApiResponse::error("Registration not found".into()));
        }
        Err(e) => {
            tracing::error!(?e, "Failed to find registration");
            return Json(ApiResponse::error("Failed to find registration".into()));
        }
    };

    // Get reviewer ID (superadmin's user ID)
    let reviewer_id = ctx.user.id;

    // Approve the registration
    let registration = match UserRegistration::approve(pool, registration_id, reviewer_id).await {
        Ok(reg) => reg,
        Err(e) => {
            tracing::error!(?e, "Failed to approve registration");
            return Json(ApiResponse::error("Failed to approve registration".into()));
        }
    };

    // Send approval email notification (IKA-232)
    let user_name = pending.first_name.as_deref().unwrap_or(&pending.email);
    let workspace_name = pending
        .requested_workspace_name
        .as_ref()
        .unwrap_or(&pending.workspace_name);
    let login_url = format!("{}/login", state.server_public_base_url);

    state
        .mailer
        .send_registration_approved(&pending.email, user_name, workspace_name, &login_url)
        .await;

    tracing::info!(
        registration_id = %registration_id,
        user_email = %pending.email,
        reviewer_id = %reviewer_id,
        "Registration approved and email notification sent"
    );

    Json(ApiResponse::success(registration))
}

/// Reject a user registration and send email notification
#[instrument(name = "registrations.reject", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn reject_registration(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    axum::extract::Path(registration_id): axum::extract::Path<Uuid>,
    Json(payload): Json<RejectRequest>,
) -> Json<ApiResponse<UserRegistration>> {
    let pool = state.pool();

    // Get the pending registration first
    let pending = match UserRegistration::find_by_id(pool, registration_id).await {
        Ok(Some(reg)) if reg.status == RegistrationStatus::Pending => reg,
        Ok(Some(_)) => {
            return Json(ApiResponse::error("Registration is not pending".into()));
        }
        Ok(None) => {
            return Json(ApiResponse::error("Registration not found".into()));
        }
        Err(e) => {
            tracing::error!(?e, "Failed to find registration");
            return Json(ApiResponse::error("Failed to find registration".into()));
        }
    };

    // Get reviewer ID (superadmin's user ID)
    let reviewer_id = ctx.user.id;

    // Reject the registration
    let registration = match UserRegistration::reject(
        pool,
        registration_id,
        reviewer_id,
        payload.reason.as_deref(),
    )
    .await
    {
        Ok(reg) => reg,
        Err(e) => {
            tracing::error!(?e, "Failed to reject registration");
            return Json(ApiResponse::error("Failed to reject registration".into()));
        }
    };

    // Send rejection email notification (IKA-232)
    let user_name = pending.first_name.as_deref().unwrap_or(&pending.email);

    state
        .mailer
        .send_registration_rejected(&pending.email, user_name, payload.reason.as_deref())
        .await;

    tracing::info!(
        registration_id = %registration_id,
        user_email = %pending.email,
        reviewer_id = %reviewer_id,
        reason = ?payload.reason,
        "Registration rejected and email notification sent"
    );

    Json(ApiResponse::success(registration))
}

/// Notify superadmins about a new registration (helper function)
/// Called from registration creation flow
pub async fn notify_superadmins_of_new_registration(
    state: &AppState,
    registration: &UserRegistration,
) {
    let pool = state.pool();
    let repo = SuperadminRepository::new(pool);

    // Get all active superadmins
    let superadmins = match repo.list_all().await {
        Ok(list) => list.into_iter().filter(|s| s.is_active).collect::<Vec<_>>(),
        Err(e) => {
            tracing::error!(?e, "Failed to list superadmins for notification");
            return;
        }
    };

    if superadmins.is_empty() {
        tracing::warn!("No active superadmins to notify about new registration");
        return;
    }

    let user_name = registration
        .first_name
        .as_deref()
        .unwrap_or(&registration.email);
    let workspace_name = registration
        .requested_workspace_name
        .as_ref()
        .unwrap_or(&registration.workspace_name);
    let review_url = format!(
        "{}/superadmin/registrations/{}",
        state.server_public_base_url, registration.id
    );

    let superadmin_count = superadmins.len();

    // Send email to each superadmin
    for superadmin in superadmins {
        state
            .mailer
            .send_registration_submitted_to_admin(
                &superadmin.email,
                &registration.email,
                user_name,
                workspace_name,
                &review_url,
            )
            .await;

        tracing::debug!(
            superadmin_email = %superadmin.email,
            registration_id = %registration.id,
            "Sent new registration notification to superadmin"
        );
    }

    tracing::info!(
        registration_id = %registration.id,
        superadmin_count,
        "Notified superadmins of new registration"
    );
}
