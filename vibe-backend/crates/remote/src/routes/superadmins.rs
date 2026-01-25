//! Superadmin routes for app-level administration.
//!
//! These routes are protected by the `require_superadmin` middleware and provide:
//! - Superadmin status check
//! - Dashboard statistics
//! - Superadmin list management
//! - Tenant metrics for comprehensive workspace oversight (IKA-288)

use axum::{Extension, Json, Router, extract::State, routing::get};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::instrument;

use super::error::ApiResponse;
use crate::{AppState, auth::RequestContext, db::superadmins::SuperadminRepository};

/// Response for the superadmin check endpoint
#[derive(Debug, Serialize, Deserialize)]
pub struct SuperadminCheckResponse {
    pub is_superadmin: bool,
    pub email: String,
}

/// Dashboard statistics for the superadmin panel
#[derive(Debug, Serialize, Deserialize)]
pub struct SuperadminStatsResponse {
    pub pending_registrations: i64,
    pub approved_today: i64,
    pub total_users: i64,
    pub total_workspaces: i64,
}

/// Superadmin info for list responses
#[derive(Debug, Serialize, Deserialize)]
pub struct SuperadminInfo {
    pub id: uuid::Uuid,
    pub email: String,
    pub name: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// =============================================================================
// Tenant Metrics Types (IKA-288)
// =============================================================================

/// Database row for tenant workspace with aggregated counts
#[derive(Debug, FromRow)]
struct TenantWorkspaceRow {
    id: uuid::Uuid,
    name: String,
    slug: String,
    plan: String,
    max_teams: i64,
    max_projects: i64,
    max_members: i64,
    max_storage_gb: i64,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    owner_email: Option<String>,
    owner_name: Option<String>,
    teams_count: i64,
    projects_count: i64,
    members_count: i64,
    issues_count: i64,
    documents_count: i64,
}

/// Comprehensive tenant/workspace metrics for superadmin dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct TenantMetrics {
    pub id: uuid::Uuid,
    pub name: String,
    pub slug: String,
    pub owner_email: Option<String>,
    pub owner_name: Option<String>,
    pub plan: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub limits: TenantLimits,
    pub usage: TenantUsage,
    pub status: TenantStatus,
}

/// Plan-based resource limits
#[derive(Debug, Serialize, Deserialize)]
pub struct TenantLimits {
    pub max_teams: i64,
    pub max_projects: i64,
    pub max_members: i64,
    pub max_storage_gb: i64,
}

/// Current resource usage
#[derive(Debug, Serialize, Deserialize)]
pub struct TenantUsage {
    pub teams_count: i64,
    pub projects_count: i64,
    pub members_count: i64,
    pub issues_count: i64,
    pub documents_count: i64,
}

/// Status indicators for limit proximity
#[derive(Debug, Serialize, Deserialize)]
pub struct TenantStatus {
    /// "ok" (< 80%), "warning" (80-99%), "critical" (>= 100%)
    pub teams: String,
    pub projects: String,
    pub members: String,
    pub overall: String,
}

/// Summary statistics across all tenants
#[derive(Debug, Serialize, Deserialize)]
pub struct TenantsSummary {
    pub total_workspaces: i64,
    pub total_teams: i64,
    pub total_projects: i64,
    pub total_members: i64,
    pub total_issues: i64,
    pub workspaces_at_limit: i64,
    pub workspaces_near_limit: i64,
}

/// Response containing both summary and individual tenant metrics
#[derive(Debug, Serialize, Deserialize)]
pub struct TenantsResponse {
    pub summary: TenantsSummary,
    pub tenants: Vec<TenantMetrics>,
}

/// Router for public superadmin routes (status check)
pub fn public_router() -> Router<AppState> {
    Router::new().route("/superadmin/check", get(check_superadmin_status))
}

/// Router for protected superadmin routes (requires superadmin auth)
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/superadmin/stats", get(get_stats))
        .route("/superadmin/list", get(list_superadmins))
        .route("/superadmin/tenants", get(list_tenants))
}

/// Check if the current authenticated user is a superadmin.
#[instrument(name = "superadmin.check", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn check_superadmin_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Json<ApiResponse<SuperadminCheckResponse>> {
    let pool = state.pool();
    let repo = SuperadminRepository::new(pool);

    let is_superadmin = match repo.find_by_email(&ctx.user.email).await {
        Ok(Some(superadmin)) => superadmin.is_active,
        Ok(None) => false,
        Err(error) => {
            tracing::warn!(?error, "Failed to check superadmin status");
            false
        }
    };

    ApiResponse::success(SuperadminCheckResponse {
        is_superadmin,
        email: ctx.user.email,
    })
}

/// Get dashboard statistics for the superadmin panel.
#[instrument(name = "superadmin.stats", skip(state, ctx), fields(user_id = %ctx.user.id))]
async fn get_stats(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Json<ApiResponse<SuperadminStatsResponse>> {
    let pool = state.pool();

    let total_users = sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!" FROM users"#)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let total_workspaces =
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!" FROM tenant_workspaces"#)
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    let pending_registrations = 0;
    let approved_today = 0;

    tracing::debug!(
        user_id = %ctx.user.id,
        total_users,
        total_workspaces,
        "Superadmin stats retrieved"
    );

    ApiResponse::success(SuperadminStatsResponse {
        pending_registrations,
        approved_today,
        total_users,
        total_workspaces,
    })
}

/// List all superadmins.
#[instrument(name = "superadmin.list", skip(state, _ctx))]
async fn list_superadmins(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
) -> Json<ApiResponse<Vec<SuperadminInfo>>> {
    let pool = state.pool();
    let repo = SuperadminRepository::new(pool);

    let superadmins = match repo.list_all().await {
        Ok(list) => list
            .into_iter()
            .map(|s| SuperadminInfo {
                id: s.id,
                email: s.email,
                name: s.name,
                is_active: s.is_active,
                created_at: s.created_at,
            })
            .collect(),
        Err(error) => {
            tracing::warn!(?error, "Failed to list superadmins");
            vec![]
        }
    };

    ApiResponse::success(superadmins)
}

// =============================================================================
// Tenant Metrics Handler (IKA-288)
// =============================================================================

/// Calculate usage status based on current usage vs limit
fn calculate_status(current: i64, limit: i64) -> String {
    if limit <= 0 {
        return "ok".to_string(); // Unlimited
    }
    let percentage = (current as f64 / limit as f64) * 100.0;
    if percentage >= 100.0 {
        "critical".to_string()
    } else if percentage >= 80.0 {
        "warning".to_string()
    } else {
        "ok".to_string()
    }
}

/// Calculate overall status (worst of individual statuses)
fn calculate_overall_status(teams: &str, projects: &str, members: &str) -> String {
    if teams == "critical" || projects == "critical" || members == "critical" {
        "critical".to_string()
    } else if teams == "warning" || projects == "warning" || members == "warning" {
        "warning".to_string()
    } else {
        "ok".to_string()
    }
}

/// List all tenant workspaces with comprehensive metrics.
/// IKA-288: Provides superadmin visibility into all tenants with usage vs limits.
#[instrument(name = "superadmin.tenants", skip(state, _ctx))]
async fn list_tenants(
    State(state): State<AppState>,
    Extension(_ctx): Extension<RequestContext>,
) -> Json<ApiResponse<TenantsResponse>> {
    let pool = state.pool();

    // Query all tenant workspaces with aggregated counts
    let rows: Vec<TenantWorkspaceRow> = match sqlx::query_as::<_, TenantWorkspaceRow>(
        r#"
        SELECT
            tw.id,
            tw.name,
            tw.slug,
            COALESCE(tw.plan, 'free') as plan,
            COALESCE(tw.max_teams, 2) as max_teams,
            COALESCE(tw.max_projects, 5) as max_projects,
            COALESCE(tw.max_members, 3) as max_members,
            COALESCE(tw.max_storage_gb, 1) as max_storage_gb,
            tw.created_at,
            tw.updated_at,
            -- Get owner (first member with 'owner' role, or first member)
            (
                SELECT email FROM tenant_workspace_members
                WHERE tenant_workspace_id = tw.id
                ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, joined_at
                LIMIT 1
            ) as owner_email,
            (
                SELECT display_name FROM tenant_workspace_members
                WHERE tenant_workspace_id = tw.id
                ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, joined_at
                LIMIT 1
            ) as owner_name,
            -- Count teams in this workspace
            (SELECT COUNT(*) FROM teams WHERE tenant_workspace_id = tw.id) as teams_count,
            -- Count projects in this workspace
            (SELECT COUNT(*) FROM projects WHERE tenant_workspace_id = tw.id) as projects_count,
            -- Count members in this workspace
            (SELECT COUNT(*) FROM tenant_workspace_members WHERE tenant_workspace_id = tw.id) as members_count,
            -- Count issues (tasks) in projects belonging to this workspace
            (
                SELECT COUNT(*) FROM tasks t
                JOIN projects p ON t.project_id = p.id
                WHERE p.tenant_workspace_id = tw.id
            ) as issues_count,
            -- Count documents in teams belonging to this workspace
            (
                SELECT COUNT(*) FROM documents d
                JOIN teams tm ON d.team_id = tm.id
                WHERE tm.tenant_workspace_id = tw.id
            ) as documents_count
        FROM tenant_workspaces tw
        ORDER BY tw.created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Failed to fetch tenant workspaces: {}", e);
            return ApiResponse::success(TenantsResponse {
                summary: TenantsSummary {
                    total_workspaces: 0,
                    total_teams: 0,
                    total_projects: 0,
                    total_members: 0,
                    total_issues: 0,
                    workspaces_at_limit: 0,
                    workspaces_near_limit: 0,
                },
                tenants: vec![],
            });
        }
    };

    // Transform rows into TenantMetrics
    let mut total_teams: i64 = 0;
    let mut total_projects: i64 = 0;
    let mut total_members: i64 = 0;
    let mut total_issues: i64 = 0;
    let mut workspaces_at_limit: i64 = 0;
    let mut workspaces_near_limit: i64 = 0;

    let tenants: Vec<TenantMetrics> = rows
        .into_iter()
        .map(|row| {
            // Accumulate totals
            total_teams += row.teams_count;
            total_projects += row.projects_count;
            total_members += row.members_count;
            total_issues += row.issues_count;

            // Calculate status for each resource
            let teams_status = calculate_status(row.teams_count, row.max_teams);
            let projects_status = calculate_status(row.projects_count, row.max_projects);
            let members_status = calculate_status(row.members_count, row.max_members);
            let overall =
                calculate_overall_status(&teams_status, &projects_status, &members_status);

            // Track limit status
            if overall == "critical" {
                workspaces_at_limit += 1;
            } else if overall == "warning" {
                workspaces_near_limit += 1;
            }

            TenantMetrics {
                id: row.id,
                name: row.name,
                slug: row.slug,
                owner_email: row.owner_email,
                owner_name: row.owner_name,
                plan: row.plan,
                created_at: row.created_at,
                updated_at: row.updated_at,
                limits: TenantLimits {
                    max_teams: row.max_teams,
                    max_projects: row.max_projects,
                    max_members: row.max_members,
                    max_storage_gb: row.max_storage_gb,
                },
                usage: TenantUsage {
                    teams_count: row.teams_count,
                    projects_count: row.projects_count,
                    members_count: row.members_count,
                    issues_count: row.issues_count,
                    documents_count: row.documents_count,
                },
                status: TenantStatus {
                    teams: teams_status,
                    projects: projects_status,
                    members: members_status,
                    overall,
                },
            }
        })
        .collect();

    let total_workspaces = tenants.len() as i64;

    tracing::info!(
        total_workspaces,
        total_teams,
        total_projects,
        workspaces_at_limit,
        "Superadmin tenant metrics retrieved"
    );

    ApiResponse::success(TenantsResponse {
        summary: TenantsSummary {
            total_workspaces,
            total_teams,
            total_projects,
            total_members,
            total_issues,
            workspaces_at_limit,
            workspaces_near_limit,
        },
        tenants,
    })
}
