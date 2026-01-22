use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::user_registration::{CreateUserRegistration, RegistrationStatus, UserRegistration};
use deployment::Deployment;
use serde::Deserialize;
use sqlx::FromRow;
use tracing::{info, warn};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::auth::ClerkUser};

// SQLx row type for runtime type checking
#[derive(FromRow)]
struct ExistingMemberRow {
    team_name: String,
}

/// Query params for listing registrations
#[derive(Debug, Deserialize)]
pub struct ListRegistrationsQuery {
    pub status: Option<String>,
}

/// Get current user's registration status by Clerk user ID
/// For existing team members without a registration, auto-create an approved registration
pub async fn get_my_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
) -> Result<ResponseJson<ApiResponse<Option<UserRegistration>>>, ApiError> {
    // First check for existing registration
    let registration =
        UserRegistration::find_by_clerk_id(&deployment.db().pool, &user.user_id).await?;

    if registration.is_some() {
        return Ok(ResponseJson(ApiResponse::success(registration)));
    }

    // No registration - check if user is already a team member (existing user before registration system)
    // Runtime type checking for SQLx cache compatibility
    let existing_member = sqlx::query_as::<_, ExistingMemberRow>(
        r#"SELECT t.name as team_name
           FROM team_members tm
           JOIN teams t ON t.id = tm.team_id
           WHERE tm.clerk_user_id = $1
           LIMIT 1"#,
    )
    .bind(&user.user_id)
    .fetch_optional(&deployment.db().pool)
    .await?;

    if let Some(member) = existing_member {
        // Existing team member - auto-create an approved registration
        let auto_registration = CreateUserRegistration {
            clerk_user_id: user.user_id.clone(),
            email: user.email.clone().unwrap_or_default(),
            first_name: None, // Will be populated from Clerk on next login
            last_name: None,
            workspace_name: member.team_name.clone(),
            planned_teams: Some(1),
            planned_projects: Some(3),
            selected_plan: Some("hobby".to_string()),
            company_name: None,
            use_case: None,
            requested_workspace_name: Some(member.team_name),
        };

        // Create the registration as auto-approved
        let new_registration =
            UserRegistration::create_auto_approved(&deployment.db().pool, &auto_registration)
                .await?;

        return Ok(ResponseJson(ApiResponse::success(Some(new_registration))));
    }

    // No registration and not an existing team member
    Ok(ResponseJson(ApiResponse::success(None)))
}

/// Create a new user registration
pub async fn create_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Json(mut payload): Json<CreateUserRegistration>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    // Ensure the clerk_user_id matches the authenticated user
    payload.clerk_user_id = user.user_id.clone();

    // Check if user already has a registration
    let existing = UserRegistration::find_by_clerk_id(&deployment.db().pool, &user.user_id).await?;
    if existing.is_some() {
        return Err(ApiError::BadRequest(
            "User already has a registration".to_string(),
        ));
    }

    let registration = UserRegistration::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "user_registration_created",
            serde_json::json!({
                "registration_id": registration.id.to_string(),
                "workspace_name": registration.workspace_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// List all registrations (admin only - for now, list pending registrations)
pub async fn list_registrations(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<ListRegistrationsQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<UserRegistration>>>, ApiError> {
    let registrations = match &params.status {
        None => {
            // Default to pending registrations when no status filter provided
            UserRegistration::list_pending(&deployment.db().pool).await?
        }
        Some(status_str) => {
            let status_filter = status_str.parse::<RegistrationStatus>().ok();
            UserRegistration::list_all(&deployment.db().pool, status_filter).await?
        }
    };

    Ok(ResponseJson(ApiResponse::success(registrations)))
}

/// Get a single registration by ID
pub async fn get_registration(
    State(deployment): State<DeploymentImpl>,
    Path(registration_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    let registration = UserRegistration::find_by_id(&deployment.db().pool, registration_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Registration not found".to_string()))?;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// Approve a user registration
/// Creates a workspace for the user and adds them as owner
pub async fn approve_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(registration_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    // Try to find the admin's team member ID (they should be an owner somewhere)
    let reviewer_id = find_admin_member_id(&deployment, &user.user_id).await?;

    // First, get the pending registration
    let pending_registration = UserRegistration::find_by_id(&deployment.db().pool, registration_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Registration not found".to_string()))?;

    if pending_registration.status != RegistrationStatus::Pending {
        return Err(ApiError::BadRequest(
            "Registration is not pending".to_string(),
        ));
    }

    // Create or find the user in the users table
    let new_user_id = find_or_create_user(
        &deployment,
        &pending_registration.clerk_user_id,
        &pending_registration.email,
        pending_registration.first_name.as_deref(),
        pending_registration.last_name.as_deref(),
    )
    .await?;

    // Create the workspace for the user
    let workspace_name = pending_registration
        .requested_workspace_name
        .as_ref()
        .unwrap_or(&pending_registration.workspace_name);
    let workspace_slug = generate_workspace_slug(workspace_name);

    let workspace_result =
        create_workspace_for_user(&deployment, workspace_name, &workspace_slug, new_user_id).await;

    match &workspace_result {
        Ok(org) => {
            info!(
                registration_id = %registration_id,
                user_id = %new_user_id,
                workspace_id = %org.id,
                workspace_name = %org.name,
                "Created workspace for approved user"
            );
        }
        Err(e) => {
            warn!(
                registration_id = %registration_id,
                error = %e,
                "Failed to create workspace, but continuing with approval"
            );
        }
    }

    // Approve the registration
    let registration =
        UserRegistration::approve(&deployment.db().pool, registration_id, reviewer_id).await?;

    deployment
        .track_if_analytics_allowed(
            "user_registration_approved",
            serde_json::json!({
                "registration_id": registration_id.to_string(),
                "reviewer_user_id": user.user_id,
                "new_user_id": new_user_id.to_string(),
                "workspace_created": workspace_result.is_ok(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// Reject a user registration
#[derive(Debug, Deserialize)]
pub struct RejectRequest {
    pub reason: Option<String>,
}

pub async fn reject_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(registration_id): Path<Uuid>,
    Json(payload): Json<RejectRequest>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    let reviewer_id = find_admin_member_id(&deployment, &user.user_id).await?;

    let registration = UserRegistration::reject(
        &deployment.db().pool,
        registration_id,
        reviewer_id,
        payload.reason.as_deref(),
    )
    .await?;

    deployment
        .track_if_analytics_allowed(
            "user_registration_rejected",
            serde_json::json!({
                "registration_id": registration_id.to_string(),
                "reviewer_user_id": user.user_id,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// Helper to find the team member ID for an admin user
/// Returns the first team member ID where the user has owner role
async fn find_admin_member_id(
    deployment: &DeploymentImpl,
    clerk_user_id: &str,
) -> Result<Uuid, ApiError> {
    // Query to find a team member with owner role for this clerk user
    // Runtime type checking for SQLx cache compatibility
    let result = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id FROM team_members WHERE clerk_user_id = $1 AND role = 'owner' LIMIT 1"#,
    )
    .bind(clerk_user_id)
    .fetch_optional(&deployment.db().pool)
    .await?;

    result
        .ok_or_else(|| ApiError::Forbidden("Only team owners can review registrations".to_string()))
}

/// Find or create a user in the users table based on clerk_user_id
/// Returns the internal user UUID
async fn find_or_create_user(
    deployment: &DeploymentImpl,
    clerk_user_id: &str,
    email: &str,
    first_name: Option<&str>,
    last_name: Option<&str>,
) -> Result<Uuid, ApiError> {
    // First, check if user exists via oauth_accounts
    let existing_user = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT user_id FROM oauth_accounts WHERE provider = 'clerk' AND provider_user_id = $1"#,
    )
    .bind(clerk_user_id)
    .fetch_optional(&deployment.db().pool)
    .await?;

    if let Some(user_id) = existing_user {
        return Ok(user_id);
    }

    // Create a new user
    let user_id = Uuid::new_v4();

    // Insert into users table
    sqlx::query(
        r#"INSERT INTO users (id, email, first_name, last_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING"#,
    )
    .bind(user_id)
    .bind(email)
    .bind(first_name)
    .bind(last_name)
    .execute(&deployment.db().pool)
    .await?;

    // Insert into oauth_accounts to link clerk_user_id to user_id
    sqlx::query(
        r#"INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
           VALUES ($1, 'clerk', $2, $3)
           ON CONFLICT (provider, provider_user_id) DO NOTHING"#,
    )
    .bind(user_id)
    .bind(clerk_user_id)
    .bind(email)
    .execute(&deployment.db().pool)
    .await?;

    info!(
        user_id = %user_id,
        clerk_user_id = %clerk_user_id,
        email = %email,
        "Created new user for approved registration"
    );

    Ok(user_id)
}

/// Generate a URL-safe slug from a workspace name
fn generate_workspace_slug(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();

    // Remove consecutive dashes and trim
    let mut result = String::new();
    let mut prev_dash = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_dash && !result.is_empty() {
                result.push(c);
                prev_dash = true;
            }
        } else {
            result.push(c);
            prev_dash = false;
        }
    }

    // Trim trailing dash
    while result.ends_with('-') {
        result.pop();
    }

    // Add a random suffix to avoid conflicts
    let suffix: u32 = rand::random::<u32>() % 10000;
    format!("{}-{:04}", result, suffix)
}

/// Organization struct for workspace creation response
#[derive(Debug)]
struct WorkspaceInfo {
    id: Uuid,
    name: String,
}

/// Create a workspace (organization) for a user and add them as admin
async fn create_workspace_for_user(
    deployment: &DeploymentImpl,
    name: &str,
    slug: &str,
    user_id: Uuid,
) -> Result<WorkspaceInfo, ApiError> {
    // Start a transaction
    let mut tx = deployment.db().pool.begin().await?;

    // Create the organization
    let org = sqlx::query_as::<_, (Uuid, String)>(
        r#"INSERT INTO organizations (name, slug)
           VALUES ($1, $2)
           RETURNING id, name"#,
    )
    .bind(name)
    .bind(slug)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if let Some(db_err) = e.as_database_error()
            && db_err.is_unique_violation()
        {
            return ApiError::BadRequest(
                "An organization with this name already exists".to_string(),
            );
        }
        ApiError::Database(e)
    })?;

    // Add user as admin member
    sqlx::query(
        r#"INSERT INTO organization_member_metadata (organization_id, user_id, role)
           VALUES ($1, $2, 'admin')"#,
    )
    .bind(org.0)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(WorkspaceInfo {
        id: org.0,
        name: org.1,
    })
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/", get(list_registrations).post(create_registration))
        .route("/me", get(get_my_registration))
        .route("/{registration_id}", get(get_registration))
        .route("/{registration_id}/approve", post(approve_registration))
        .route("/{registration_id}/reject", post(reject_registration))
}
