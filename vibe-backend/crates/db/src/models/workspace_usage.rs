use chrono::{DateTime, Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// WorkspaceUsage Model
// ============================================================================

/// Tracks resource usage per workspace per billing period
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkspaceUsage {
    pub id: Uuid,
    pub tenant_workspace_id: Uuid,
    #[ts(type = "string")]
    pub period_start: NaiveDate,
    #[ts(type = "string")]
    pub period_end: NaiveDate,
    pub teams_count: i32,
    pub projects_count: i32,
    pub members_count: i32,
    pub tasks_count: i32,
    pub ai_requests_count: i32,
    pub storage_bytes: i64,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Helper struct for FromRow conversion
#[derive(FromRow)]
struct WorkspaceUsageRow {
    id: Uuid,
    tenant_workspace_id: Uuid,
    period_start: NaiveDate,
    period_end: NaiveDate,
    teams_count: i32,
    projects_count: i32,
    members_count: i32,
    tasks_count: i32,
    ai_requests_count: i32,
    storage_bytes: i64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<WorkspaceUsageRow> for WorkspaceUsage {
    fn from(row: WorkspaceUsageRow) -> Self {
        WorkspaceUsage {
            id: row.id,
            tenant_workspace_id: row.tenant_workspace_id,
            period_start: row.period_start,
            period_end: row.period_end,
            teams_count: row.teams_count,
            projects_count: row.projects_count,
            members_count: row.members_count,
            tasks_count: row.tasks_count,
            ai_requests_count: row.ai_requests_count,
            storage_bytes: row.storage_bytes,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceUsageError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Usage record not found")]
    NotFound,
    #[error("Invalid period: start must be before end")]
    InvalidPeriod,
}

// ============================================================================
// UsageAction Enum - For limit checking
// ============================================================================

/// Actions that consume workspace resources
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UsageAction {
    CreateTeam,
    CreateProject,
    InviteMember,
    CreateTask,
    AiRequest,
    UploadStorage(i64), // bytes to add
}

// ============================================================================
// LimitCheckResult - Result of checking usage against limits
// ============================================================================

/// Result of checking if an action would exceed limits
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LimitCheckResult {
    /// Whether the action is allowed
    pub allowed: bool,
    /// Whether the user is approaching the limit (>80%)
    pub warning: bool,
    /// Whether the limit has been exceeded (soft limit mode still allows)
    pub exceeded: bool,
    /// Current usage count for this resource
    pub current: i64,
    /// Maximum allowed for this resource
    pub limit: i64,
    /// Percentage of limit used (0-100+)
    pub percentage: f64,
    /// Human-readable message
    pub message: Option<String>,
}

impl LimitCheckResult {
    /// Create a result indicating the action is allowed
    pub fn allowed(current: i64, limit: i64) -> Self {
        let percentage = if limit > 0 {
            (current as f64 / limit as f64) * 100.0
        } else {
            0.0
        };

        let warning = percentage >= 80.0;
        let message = if warning {
            Some(format!(
                "Approaching limit: {} of {} used ({:.0}%)",
                current, limit, percentage
            ))
        } else {
            None
        };

        Self {
            allowed: true,
            warning,
            exceeded: false,
            current,
            limit,
            percentage,
            message,
        }
    }

    /// Create a result indicating soft limit exceeded (still allowed but warn)
    pub fn soft_exceeded(current: i64, limit: i64) -> Self {
        let percentage = if limit > 0 {
            (current as f64 / limit as f64) * 100.0
        } else {
            100.0
        };

        Self {
            allowed: true, // Soft limits still allow the action
            warning: true,
            exceeded: true,
            current,
            limit,
            percentage,
            message: Some(format!(
                "Limit exceeded: {} of {} used. Consider upgrading your plan.",
                current, limit
            )),
        }
    }

    /// Create a result indicating hard limit exceeded (action blocked)
    pub fn hard_exceeded(current: i64, limit: i64) -> Self {
        let percentage = if limit > 0 {
            (current as f64 / limit as f64) * 100.0
        } else {
            100.0
        };

        Self {
            allowed: false,
            warning: true,
            exceeded: true,
            current,
            limit,
            percentage,
            message: Some(format!(
                "Limit reached: {} of {}. Upgrade your plan to continue.",
                current, limit
            )),
        }
    }

    /// Create a result for unlimited resources (enterprise plan)
    pub fn unlimited(current: i64) -> Self {
        Self {
            allowed: true,
            warning: false,
            exceeded: false,
            current,
            limit: -1, // -1 indicates unlimited
            percentage: 0.0,
            message: None,
        }
    }
}

// ============================================================================
// WorkspaceUsage Implementation
// ============================================================================

impl WorkspaceUsage {
    /// Get the current billing period start date (first day of current month)
    pub fn current_period_start() -> NaiveDate {
        let now = Utc::now();
        NaiveDate::from_ymd_opt(now.year(), now.month(), 1).unwrap_or_else(|| now.date_naive())
    }

    /// Get the current billing period end date (last day of current month)
    pub fn current_period_end() -> NaiveDate {
        let start = Self::current_period_start();
        // Get first day of next month, then subtract one day
        let next_month = if start.month() == 12 {
            NaiveDate::from_ymd_opt(start.year() + 1, 1, 1)
        } else {
            NaiveDate::from_ymd_opt(start.year(), start.month() + 1, 1)
        };
        next_month.unwrap_or(start).pred_opt().unwrap_or(start)
    }

    /// Find or create usage record for current billing period
    pub async fn find_or_create_current(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let period_start = Self::current_period_start();
        let period_end = Self::current_period_end();

        // Try to find existing
        if let Some(usage) =
            Self::find_by_workspace_period(pool, workspace_id, period_start).await?
        {
            return Ok(usage);
        }

        // Create new
        Self::create(pool, workspace_id, period_start, period_end).await
    }

    /// Create a new usage record
    pub async fn create(
        pool: &PgPool,
        workspace_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<Self, WorkspaceUsageError> {
        if period_start >= period_end {
            return Err(WorkspaceUsageError::InvalidPeriod);
        }

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"INSERT INTO workspace_usage
                   (tenant_workspace_id, period_start, period_end)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_workspace_id, period_start)
               DO UPDATE SET updated_at = NOW()
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            workspace_id,
            period_start,
            period_end
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Find usage by workspace and period start
    pub async fn find_by_workspace_period(
        pool: &PgPool,
        workspace_id: Uuid,
        period_start: NaiveDate,
    ) -> Result<Option<Self>, WorkspaceUsageError> {
        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"SELECT id as "id!: Uuid",
                      tenant_workspace_id as "tenant_workspace_id!: Uuid",
                      period_start,
                      period_end,
                      teams_count,
                      projects_count,
                      members_count,
                      tasks_count,
                      ai_requests_count,
                      storage_bytes,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM workspace_usage
               WHERE tenant_workspace_id = $1 AND period_start = $2"#,
            workspace_id,
            period_start
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Increment teams count atomically
    pub async fn increment_teams(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET teams_count = teams_count + 1
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Decrement teams count atomically (on deletion)
    pub async fn decrement_teams(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET teams_count = GREATEST(0, teams_count - 1)
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Increment projects count atomically
    pub async fn increment_projects(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET projects_count = projects_count + 1
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Decrement projects count atomically
    pub async fn decrement_projects(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET projects_count = GREATEST(0, projects_count - 1)
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Increment members count atomically
    pub async fn increment_members(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET members_count = members_count + 1
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Decrement members count atomically
    pub async fn decrement_members(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET members_count = GREATEST(0, members_count - 1)
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Increment tasks count atomically
    pub async fn increment_tasks(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET tasks_count = tasks_count + 1
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Decrement tasks count atomically
    pub async fn decrement_tasks(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET tasks_count = GREATEST(0, tasks_count - 1)
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Increment AI requests count atomically
    pub async fn increment_ai_requests(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET ai_requests_count = ai_requests_count + 1
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Add storage bytes atomically
    pub async fn add_storage(
        pool: &PgPool,
        workspace_id: Uuid,
        bytes: i64,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET storage_bytes = storage_bytes + $2
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id,
            bytes
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Remove storage bytes atomically
    pub async fn remove_storage(
        pool: &PgPool,
        workspace_id: Uuid,
        bytes: i64,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage
               SET storage_bytes = GREATEST(0, storage_bytes - $2)
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id,
            bytes
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Recalculate actual counts from database (for data integrity)
    pub async fn recalculate_counts(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Self, WorkspaceUsageError> {
        let usage = Self::find_or_create_current(pool, workspace_id).await?;

        // Count actual resources from related tables
        let row = sqlx::query_as!(
            WorkspaceUsageRow,
            r#"UPDATE workspace_usage wu
               SET teams_count = COALESCE((
                       SELECT COUNT(*)::INTEGER FROM teams t WHERE t.tenant_workspace_id = $2
                   ), 0),
                   projects_count = COALESCE((
                       SELECT COUNT(*)::INTEGER FROM projects p WHERE p.tenant_workspace_id = $2
                   ), 0),
                   members_count = COALESCE((
                       SELECT COUNT(*)::INTEGER FROM tenant_workspace_members twm
                       WHERE twm.tenant_workspace_id = $2
                   ), 0)
               WHERE wu.id = $1
               RETURNING id as "id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         period_start,
                         period_end,
                         teams_count,
                         projects_count,
                         members_count,
                         tasks_count,
                         ai_requests_count,
                         storage_bytes,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            usage.id,
            workspace_id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Get storage usage in GB
    pub fn storage_gb(&self) -> f64 {
        self.storage_bytes as f64 / (1024.0 * 1024.0 * 1024.0)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_period_dates() {
        let start = WorkspaceUsage::current_period_start();
        let end = WorkspaceUsage::current_period_end();

        assert!(start <= end);
        assert_eq!(start.day(), 1);
    }

    #[test]
    fn test_limit_check_result_allowed() {
        let result = LimitCheckResult::allowed(5, 10);

        assert!(result.allowed);
        assert!(!result.warning);
        assert!(!result.exceeded);
        assert_eq!(result.current, 5);
        assert_eq!(result.limit, 10);
        assert_eq!(result.percentage, 50.0);
        assert!(result.message.is_none());
    }

    #[test]
    fn test_limit_check_result_warning() {
        let result = LimitCheckResult::allowed(8, 10);

        assert!(result.allowed);
        assert!(result.warning);
        assert!(!result.exceeded);
        assert_eq!(result.percentage, 80.0);
        assert!(result.message.is_some());
    }

    #[test]
    fn test_limit_check_result_soft_exceeded() {
        let result = LimitCheckResult::soft_exceeded(10, 10);

        assert!(result.allowed); // Soft limits allow
        assert!(result.warning);
        assert!(result.exceeded);
        assert_eq!(result.percentage, 100.0);
        assert!(result.message.is_some());
    }

    #[test]
    fn test_limit_check_result_hard_exceeded() {
        let result = LimitCheckResult::hard_exceeded(10, 10);

        assert!(!result.allowed); // Hard limits block
        assert!(result.warning);
        assert!(result.exceeded);
        assert_eq!(result.percentage, 100.0);
        assert!(result.message.is_some());
    }

    #[test]
    fn test_limit_check_result_unlimited() {
        let result = LimitCheckResult::unlimited(1000);

        assert!(result.allowed);
        assert!(!result.warning);
        assert!(!result.exceeded);
        assert_eq!(result.limit, -1);
        assert!(result.message.is_none());
    }

    #[test]
    fn test_storage_gb_conversion() {
        let usage = WorkspaceUsage {
            id: Uuid::new_v4(),
            tenant_workspace_id: Uuid::new_v4(),
            period_start: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            period_end: NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
            teams_count: 0,
            projects_count: 0,
            members_count: 0,
            tasks_count: 0,
            ai_requests_count: 0,
            storage_bytes: 1073741824, // 1 GB in bytes
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!((usage.storage_gb() - 1.0).abs() < 0.001);
    }
}
