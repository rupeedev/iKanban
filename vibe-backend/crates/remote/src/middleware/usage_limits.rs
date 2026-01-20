//! Usage limit enforcement middleware for soft limits (IKA-180)
//!
//! This middleware checks workspace resource usage against plan limits.
//! In soft limit mode, actions are allowed but warnings are returned.

use db::models::{
    plan_limits::PlanLimits,
    tenant_workspace::TenantWorkspace,
    workspace_usage::{LimitCheckResult, UsageAction, WorkspaceUsage},
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{info, warn};
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum UsageLimitError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(Uuid),
    #[error("Plan not found: {0}")]
    PlanNotFound(String),
    #[error("Usage tracking error: {0}")]
    UsageError(String),
}

impl From<db::models::workspace_usage::WorkspaceUsageError> for UsageLimitError {
    fn from(e: db::models::workspace_usage::WorkspaceUsageError) -> Self {
        UsageLimitError::UsageError(e.to_string())
    }
}

impl From<db::models::plan_limits::PlanLimitsError> for UsageLimitError {
    fn from(e: db::models::plan_limits::PlanLimitsError) -> Self {
        match e {
            db::models::plan_limits::PlanLimitsError::PlanNotFound(name) => {
                UsageLimitError::PlanNotFound(name)
            }
            db::models::plan_limits::PlanLimitsError::Database(e) => {
                UsageLimitError::Database(e)
            }
        }
    }
}

impl From<db::models::tenant_workspace::TenantWorkspaceError> for UsageLimitError {
    fn from(e: db::models::tenant_workspace::TenantWorkspaceError) -> Self {
        match e {
            db::models::tenant_workspace::TenantWorkspaceError::NotFound => {
                UsageLimitError::WorkspaceNotFound(Uuid::nil())
            }
            db::models::tenant_workspace::TenantWorkspaceError::Database(e) => {
                UsageLimitError::Database(e)
            }
            _ => UsageLimitError::UsageError(e.to_string()),
        }
    }
}

// ============================================================================
// Usage Check Response (for API responses)
// ============================================================================

/// Response structure for usage limit checks to include in API responses
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UsageLimitResponse {
    /// Whether the action is allowed
    pub allowed: bool,
    /// Limit check details (if limits apply)
    pub limit_check: Option<LimitCheckResult>,
    /// Warning message to show the user
    pub warning: Option<String>,
}

impl UsageLimitResponse {
    /// Create response for allowed action with no warnings
    pub fn allowed() -> Self {
        Self {
            allowed: true,
            limit_check: None,
            warning: None,
        }
    }

    /// Create response from limit check result
    pub fn from_check(check: LimitCheckResult) -> Self {
        let warning = if check.warning || check.exceeded {
            check.message.clone()
        } else {
            None
        };

        Self {
            allowed: check.allowed,
            limit_check: Some(check),
            warning,
        }
    }
}

// ============================================================================
// Core Limit Checking Functions
// ============================================================================

/// Check if an action would exceed workspace limits (soft limit mode)
///
/// Returns LimitCheckResult indicating if action is allowed and any warnings.
/// In soft limit mode, actions are always allowed but warnings are returned
/// when approaching or exceeding limits.
pub async fn check_usage_limits(
    pool: &PgPool,
    workspace_id: Uuid,
    action: UsageAction,
) -> Result<LimitCheckResult, UsageLimitError> {
    // Get workspace to find plan
    let workspace = TenantWorkspace::find_by_id(pool, workspace_id)
        .await?
        .ok_or(UsageLimitError::WorkspaceNotFound(workspace_id))?;

    // Get plan limits
    let limits = match PlanLimits::find_by_plan_name(pool, &workspace.plan).await? {
        Some(limits) => limits,
        None => {
            // Default to free plan limits if plan not found
            warn!(
                plan = workspace.plan,
                "Plan not found, using workspace limits"
            );
            return check_against_workspace_limits(&workspace, action, pool).await;
        }
    };

    // Get current usage
    let usage = WorkspaceUsage::find_or_create_current(pool, workspace_id).await?;

    // Check based on action type
    let result = match action {
        UsageAction::CreateTeam => check_limit(usage.teams_count as i64, limits.max_teams, "teams"),
        UsageAction::CreateProject => {
            check_limit(usage.projects_count as i64, limits.max_projects, "projects")
        }
        UsageAction::InviteMember => {
            check_limit(usage.members_count as i64, limits.max_members, "members")
        }
        UsageAction::CreateTask => {
            // Tasks don't have a specific limit in plan_limits, use max i64
            LimitCheckResult::unlimited(usage.tasks_count as i64)
        }
        UsageAction::AiRequest => check_limit(
            usage.ai_requests_count as i64,
            limits.max_ai_requests_per_month,
            "AI requests",
        ),
        UsageAction::UploadStorage(bytes) => {
            let current_gb = usage.storage_gb();
            let bytes_gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
            let total_gb = current_gb + bytes_gb;
            check_limit(total_gb.ceil() as i64, limits.max_storage_gb, "storage GB")
        }
    };

    // Log if limit exceeded
    if result.exceeded {
        warn!(
            workspace_id = %workspace_id,
            action = ?action,
            current = result.current,
            limit = result.limit,
            "Soft limit exceeded"
        );
    } else if result.warning {
        info!(
            workspace_id = %workspace_id,
            action = ?action,
            current = result.current,
            limit = result.limit,
            "Approaching limit"
        );
    }

    Ok(result)
}

/// Check against workspace-embedded limits (fallback)
async fn check_against_workspace_limits(
    workspace: &TenantWorkspace,
    action: UsageAction,
    pool: &PgPool,
) -> Result<LimitCheckResult, UsageLimitError> {
    let usage = WorkspaceUsage::find_or_create_current(pool, workspace.id).await?;

    let result = match action {
        UsageAction::CreateTeam => {
            check_limit(usage.teams_count as i64, workspace.max_teams, "teams")
        }
        UsageAction::CreateProject => check_limit(
            usage.projects_count as i64,
            workspace.max_projects,
            "projects",
        ),
        UsageAction::InviteMember => {
            check_limit(usage.members_count as i64, workspace.max_members, "members")
        }
        UsageAction::CreateTask => LimitCheckResult::unlimited(usage.tasks_count as i64),
        UsageAction::AiRequest => LimitCheckResult::unlimited(usage.ai_requests_count as i64),
        UsageAction::UploadStorage(bytes) => {
            let current_gb = usage.storage_gb();
            let bytes_gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
            let total_gb = current_gb + bytes_gb;
            check_limit(
                total_gb.ceil() as i64,
                workspace.max_storage_gb,
                "storage GB",
            )
        }
    };

    Ok(result)
}

/// Check a specific limit and return appropriate result
fn check_limit(current: i64, limit: i64, resource_name: &str) -> LimitCheckResult {
    // -1 or very large values indicate unlimited
    if limit < 0 || limit == i64::MAX {
        return LimitCheckResult::unlimited(current);
    }

    let percentage = if limit > 0 {
        (current as f64 / limit as f64) * 100.0
    } else {
        100.0
    };

    if current >= limit {
        // Exceeded - soft limit allows but warns
        LimitCheckResult::soft_exceeded(current, limit)
    } else if percentage >= 80.0 {
        // Approaching limit - warn
        let mut result = LimitCheckResult::allowed(current, limit);
        result.message = Some(format!(
            "Approaching {} limit: {} of {} used ({:.0}%)",
            resource_name, current, limit, percentage
        ));
        result
    } else {
        // Under limit - no warning
        LimitCheckResult::allowed(current, limit)
    }
}

// ============================================================================
// Usage Tracking Functions
// ============================================================================

/// Track team creation and check limits
pub async fn track_team_creation(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<UsageLimitResponse, UsageLimitError> {
    let check = check_usage_limits(pool, workspace_id, UsageAction::CreateTeam).await?;

    // In soft limit mode, always allow and track
    let _ = WorkspaceUsage::increment_teams(pool, workspace_id).await?;

    Ok(UsageLimitResponse::from_check(check))
}

/// Track team deletion
pub async fn track_team_deletion(pool: &PgPool, workspace_id: Uuid) -> Result<(), UsageLimitError> {
    let _ = WorkspaceUsage::decrement_teams(pool, workspace_id).await?;
    Ok(())
}

/// Track project creation and check limits
pub async fn track_project_creation(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<UsageLimitResponse, UsageLimitError> {
    let check = check_usage_limits(pool, workspace_id, UsageAction::CreateProject).await?;

    // In soft limit mode, always allow and track
    let _ = WorkspaceUsage::increment_projects(pool, workspace_id).await?;

    Ok(UsageLimitResponse::from_check(check))
}

/// Track project deletion
pub async fn track_project_deletion(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<(), UsageLimitError> {
    let _ = WorkspaceUsage::decrement_projects(pool, workspace_id).await?;
    Ok(())
}

/// Track member invitation and check limits
pub async fn track_member_invitation(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<UsageLimitResponse, UsageLimitError> {
    let check = check_usage_limits(pool, workspace_id, UsageAction::InviteMember).await?;

    // In soft limit mode, always allow and track
    let _ = WorkspaceUsage::increment_members(pool, workspace_id).await?;

    Ok(UsageLimitResponse::from_check(check))
}

/// Track member removal
pub async fn track_member_removal(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<(), UsageLimitError> {
    let _ = WorkspaceUsage::decrement_members(pool, workspace_id).await?;
    Ok(())
}

/// Track task creation
pub async fn track_task_creation(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<UsageLimitResponse, UsageLimitError> {
    let check = check_usage_limits(pool, workspace_id, UsageAction::CreateTask).await?;
    let _ = WorkspaceUsage::increment_tasks(pool, workspace_id).await?;
    Ok(UsageLimitResponse::from_check(check))
}

/// Track task deletion
pub async fn track_task_deletion(pool: &PgPool, workspace_id: Uuid) -> Result<(), UsageLimitError> {
    let _ = WorkspaceUsage::decrement_tasks(pool, workspace_id).await?;
    Ok(())
}

/// Track AI request and check limits
pub async fn track_ai_request(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<UsageLimitResponse, UsageLimitError> {
    let check = check_usage_limits(pool, workspace_id, UsageAction::AiRequest).await?;
    let _ = WorkspaceUsage::increment_ai_requests(pool, workspace_id).await?;
    Ok(UsageLimitResponse::from_check(check))
}

/// Track storage upload and check limits
pub async fn track_storage_upload(
    pool: &PgPool,
    workspace_id: Uuid,
    bytes: i64,
) -> Result<UsageLimitResponse, UsageLimitError> {
    let check = check_usage_limits(pool, workspace_id, UsageAction::UploadStorage(bytes)).await?;
    let _ = WorkspaceUsage::add_storage(pool, workspace_id, bytes).await?;
    Ok(UsageLimitResponse::from_check(check))
}

/// Track storage deletion
pub async fn track_storage_deletion(
    pool: &PgPool,
    workspace_id: Uuid,
    bytes: i64,
) -> Result<(), UsageLimitError> {
    let _ = WorkspaceUsage::remove_storage(pool, workspace_id, bytes).await?;
    Ok(())
}

// ============================================================================
// Helper: Get Workspace Usage Summary
// ============================================================================

/// Summary of workspace usage for API responses
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkspaceUsageSummary {
    pub teams: UsageDetail,
    pub projects: UsageDetail,
    pub members: UsageDetail,
    pub tasks: UsageDetail,
    pub ai_requests: UsageDetail,
    pub storage: StorageDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UsageDetail {
    pub current: i64,
    pub limit: i64,
    pub percentage: f64,
    pub warning: bool,
    pub exceeded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StorageDetail {
    pub used_bytes: i64,
    pub used_gb: f64,
    pub limit_gb: i64,
    pub percentage: f64,
    pub warning: bool,
    pub exceeded: bool,
}

/// Get workspace usage summary
pub async fn get_usage_summary(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<WorkspaceUsageSummary, UsageLimitError> {
    let workspace = TenantWorkspace::find_by_id(pool, workspace_id)
        .await?
        .ok_or(UsageLimitError::WorkspaceNotFound(workspace_id))?;

    let limits = PlanLimits::find_by_plan_name(pool, &workspace.plan)
        .await?
        .unwrap_or_else(|| {
            // Create a synthetic limits from workspace defaults
            create_default_limits(&workspace)
        });

    let usage = WorkspaceUsage::find_or_create_current(pool, workspace_id).await?;

    Ok(WorkspaceUsageSummary {
        teams: create_usage_detail(usage.teams_count as i64, limits.max_teams),
        projects: create_usage_detail(usage.projects_count as i64, limits.max_projects),
        members: create_usage_detail(usage.members_count as i64, limits.max_members),
        tasks: create_usage_detail(usage.tasks_count as i64, i64::MAX), // Unlimited
        ai_requests: create_usage_detail(
            usage.ai_requests_count as i64,
            limits.max_ai_requests_per_month,
        ),
        storage: create_storage_detail(usage.storage_bytes, limits.max_storage_gb),
    })
}

fn create_usage_detail(current: i64, limit: i64) -> UsageDetail {
    let (percentage, warning, exceeded) = if limit < 0 || limit == i64::MAX {
        (0.0, false, false)
    } else {
        let pct = (current as f64 / limit as f64) * 100.0;
        (pct, pct >= 80.0, current >= limit)
    };

    UsageDetail {
        current,
        limit,
        percentage,
        warning,
        exceeded,
    }
}

fn create_storage_detail(used_bytes: i64, limit_gb: i64) -> StorageDetail {
    let used_gb = used_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    let (percentage, warning, exceeded) = if limit_gb < 0 || limit_gb == i64::MAX {
        (0.0, false, false)
    } else {
        let pct = (used_gb / limit_gb as f64) * 100.0;
        (pct, pct >= 80.0, used_gb >= limit_gb as f64)
    };

    StorageDetail {
        used_bytes,
        used_gb,
        limit_gb,
        percentage,
        warning,
        exceeded,
    }
}

fn create_default_limits(workspace: &TenantWorkspace) -> PlanLimits {
    PlanLimits {
        id: Uuid::nil(),
        plan_name: workspace.plan.clone(),
        max_teams: workspace.max_teams,
        max_projects: workspace.max_projects,
        max_members: workspace.max_members,
        max_storage_gb: workspace.max_storage_gb,
        max_ai_requests_per_month: 100, // Default
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_limit_under() {
        let result = check_limit(5, 10, "teams");
        assert!(result.allowed);
        assert!(!result.warning);
        assert!(!result.exceeded);
        assert_eq!(result.percentage, 50.0);
    }

    #[test]
    fn test_check_limit_warning() {
        let result = check_limit(8, 10, "teams");
        assert!(result.allowed);
        assert!(result.warning);
        assert!(!result.exceeded);
        assert_eq!(result.percentage, 80.0);
    }

    #[test]
    fn test_check_limit_exceeded() {
        let result = check_limit(10, 10, "teams");
        assert!(result.allowed); // Soft limit
        assert!(result.warning);
        assert!(result.exceeded);
        assert_eq!(result.percentage, 100.0);
    }

    #[test]
    fn test_check_limit_unlimited() {
        let result = check_limit(1000, -1, "teams");
        assert!(result.allowed);
        assert!(!result.warning);
        assert!(!result.exceeded);
        assert_eq!(result.limit, -1);
    }

    #[test]
    fn test_usage_limit_response() {
        let response = UsageLimitResponse::allowed();
        assert!(response.allowed);
        assert!(response.limit_check.is_none());

        let check = LimitCheckResult::soft_exceeded(10, 10);
        let response = UsageLimitResponse::from_check(check);
        assert!(response.allowed);
        assert!(response.warning.is_some());
    }

    #[test]
    fn test_usage_detail_creation() {
        let detail = create_usage_detail(5, 10);
        assert_eq!(detail.current, 5);
        assert_eq!(detail.limit, 10);
        assert_eq!(detail.percentage, 50.0);
        assert!(!detail.warning);
        assert!(!detail.exceeded);

        let detail = create_usage_detail(10, 10);
        assert!(detail.exceeded);
    }

    #[test]
    fn test_storage_detail_creation() {
        // 1 GB in bytes
        let detail = create_storage_detail(1073741824, 10);
        assert_eq!(detail.used_bytes, 1073741824);
        assert!((detail.used_gb - 1.0).abs() < 0.001);
        assert_eq!(detail.limit_gb, 10);
        assert_eq!(detail.percentage, 10.0);
        assert!(!detail.warning);
        assert!(!detail.exceeded);
    }
}
