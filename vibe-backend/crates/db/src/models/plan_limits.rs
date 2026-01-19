use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// PlanLimits Model
// ============================================================================

/// Resource limits for a subscription plan
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PlanLimits {
    pub id: Uuid,
    pub plan_name: String, // "free" | "pro" | "enterprise"
    pub max_teams: i64,
    pub max_projects: i64,
    pub max_members: i64,
    pub max_storage_gb: i64,
    pub max_ai_requests_per_month: i64,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Helper struct for FromRow conversion
#[derive(FromRow)]
struct PlanLimitsRow {
    id: Uuid,
    plan_name: String,
    max_teams: i64,
    max_projects: i64,
    max_members: i64,
    max_storage_gb: i64,
    max_ai_requests_per_month: i64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<PlanLimitsRow> for PlanLimits {
    fn from(row: PlanLimitsRow) -> Self {
        PlanLimits {
            id: row.id,
            plan_name: row.plan_name,
            max_teams: row.max_teams,
            max_projects: row.max_projects,
            max_members: row.max_members,
            max_storage_gb: row.max_storage_gb,
            max_ai_requests_per_month: row.max_ai_requests_per_month,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum PlanLimitsError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Plan not found: {0}")]
    PlanNotFound(String),
}

// ============================================================================
// PlanLimits Implementation
// ============================================================================

impl PlanLimits {
    /// Find plan limits by plan name (the main lookup)
    pub async fn find_by_plan_name(
        pool: &PgPool,
        plan_name: &str,
    ) -> Result<Option<Self>, PlanLimitsError> {
        let row = sqlx::query_as!(
            PlanLimitsRow,
            r#"SELECT id as "id!: Uuid",
                      plan_name,
                      max_teams,
                      max_projects,
                      max_members,
                      max_storage_gb,
                      max_ai_requests_per_month,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM plan_limits
               WHERE plan_name = $1"#,
            plan_name
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Get all plan limits (useful for admin dashboards)
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Self>, PlanLimitsError> {
        let rows = sqlx::query_as!(
            PlanLimitsRow,
            r#"SELECT id as "id!: Uuid",
                      plan_name,
                      max_teams,
                      max_projects,
                      max_members,
                      max_storage_gb,
                      max_ai_requests_per_month,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM plan_limits
               ORDER BY CASE plan_name
                   WHEN 'free' THEN 1
                   WHEN 'pro' THEN 2
                   WHEN 'enterprise' THEN 3
                   ELSE 4
               END"#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Get with fallback to error if not found
    pub async fn find_or_default(pool: &PgPool, plan_name: &str) -> Result<Self, PlanLimitsError> {
        Self::find_by_plan_name(pool, plan_name)
            .await?
            .ok_or_else(|| PlanLimitsError::PlanNotFound(plan_name.to_string()))
    }

    /// Check if adding a team would exceed the limit
    pub fn exceeds_team_limit(&self, current_count: i64) -> bool {
        current_count >= self.max_teams
    }

    /// Check if adding a project would exceed the limit
    pub fn exceeds_project_limit(&self, current_count: i64) -> bool {
        current_count >= self.max_projects
    }

    /// Check if adding a member would exceed the limit
    pub fn exceeds_member_limit(&self, current_count: i64) -> bool {
        current_count >= self.max_members
    }

    /// Check if storage usage exceeds the limit
    pub fn exceeds_storage_limit(&self, used_gb: i64) -> bool {
        used_gb >= self.max_storage_gb
    }

    /// Check if AI requests exceed the monthly limit
    pub fn exceeds_ai_requests_limit(&self, current_month_count: i64) -> bool {
        current_month_count >= self.max_ai_requests_per_month
    }

    /// Get remaining teams allowed
    pub fn remaining_teams(&self, current_count: i64) -> i64 {
        (self.max_teams - current_count).max(0)
    }

    /// Get remaining projects allowed
    pub fn remaining_projects(&self, current_count: i64) -> i64 {
        (self.max_projects - current_count).max(0)
    }

    /// Get remaining members allowed
    pub fn remaining_members(&self, current_count: i64) -> i64 {
        (self.max_members - current_count).max(0)
    }

    /// Get remaining storage in GB
    pub fn remaining_storage_gb(&self, used_gb: i64) -> i64 {
        (self.max_storage_gb - used_gb).max(0)
    }

    /// Get remaining AI requests for the month
    pub fn remaining_ai_requests(&self, current_month_count: i64) -> i64 {
        (self.max_ai_requests_per_month - current_month_count).max(0)
    }

    /// Check if this is the free plan
    pub fn is_free_plan(&self) -> bool {
        self.plan_name == "free"
    }

    /// Check if this is the pro plan
    pub fn is_pro_plan(&self) -> bool {
        self.plan_name == "pro"
    }

    /// Check if this is the enterprise plan
    pub fn is_enterprise_plan(&self) -> bool {
        self.plan_name == "enterprise"
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_plan(plan_name: &str, max_teams: i64, max_projects: i64) -> PlanLimits {
        PlanLimits {
            id: Uuid::new_v4(),
            plan_name: plan_name.to_string(),
            max_teams,
            max_projects,
            max_members: 3,
            max_storage_gb: 1,
            max_ai_requests_per_month: 100,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_exceeds_team_limit() {
        let plan = create_test_plan("free", 2, 5);

        // Under limit
        assert!(!plan.exceeds_team_limit(0));
        assert!(!plan.exceeds_team_limit(1));

        // At limit (cannot add more)
        assert!(plan.exceeds_team_limit(2));

        // Over limit
        assert!(plan.exceeds_team_limit(3));
        assert!(plan.exceeds_team_limit(10));
    }

    #[test]
    fn test_exceeds_project_limit() {
        let plan = create_test_plan("free", 2, 5);

        // Under limit
        assert!(!plan.exceeds_project_limit(0));
        assert!(!plan.exceeds_project_limit(4));

        // At limit
        assert!(plan.exceeds_project_limit(5));

        // Over limit
        assert!(plan.exceeds_project_limit(6));
    }

    #[test]
    fn test_exceeds_member_limit() {
        let plan = create_test_plan("free", 2, 5);

        assert!(!plan.exceeds_member_limit(0));
        assert!(!plan.exceeds_member_limit(2));
        assert!(plan.exceeds_member_limit(3));
        assert!(plan.exceeds_member_limit(10));
    }

    #[test]
    fn test_exceeds_storage_limit() {
        let plan = create_test_plan("free", 2, 5);

        assert!(!plan.exceeds_storage_limit(0));
        assert!(plan.exceeds_storage_limit(1));
        assert!(plan.exceeds_storage_limit(5));
    }

    #[test]
    fn test_exceeds_ai_requests_limit() {
        let plan = create_test_plan("free", 2, 5);

        assert!(!plan.exceeds_ai_requests_limit(0));
        assert!(!plan.exceeds_ai_requests_limit(99));
        assert!(plan.exceeds_ai_requests_limit(100));
        assert!(plan.exceeds_ai_requests_limit(200));
    }

    #[test]
    fn test_remaining_teams() {
        let plan = create_test_plan("free", 2, 5);

        assert_eq!(plan.remaining_teams(0), 2);
        assert_eq!(plan.remaining_teams(1), 1);
        assert_eq!(plan.remaining_teams(2), 0);
        assert_eq!(plan.remaining_teams(5), 0); // Cannot go negative
    }

    #[test]
    fn test_remaining_projects() {
        let plan = create_test_plan("free", 2, 5);

        assert_eq!(plan.remaining_projects(0), 5);
        assert_eq!(plan.remaining_projects(3), 2);
        assert_eq!(plan.remaining_projects(5), 0);
        assert_eq!(plan.remaining_projects(10), 0);
    }

    #[test]
    fn test_remaining_members() {
        let plan = create_test_plan("free", 2, 5);

        assert_eq!(plan.remaining_members(0), 3);
        assert_eq!(plan.remaining_members(2), 1);
        assert_eq!(plan.remaining_members(3), 0);
    }

    #[test]
    fn test_remaining_storage() {
        let plan = create_test_plan("free", 2, 5);

        assert_eq!(plan.remaining_storage_gb(0), 1);
        assert_eq!(plan.remaining_storage_gb(1), 0);
        assert_eq!(plan.remaining_storage_gb(5), 0);
    }

    #[test]
    fn test_remaining_ai_requests() {
        let plan = create_test_plan("free", 2, 5);

        assert_eq!(plan.remaining_ai_requests(0), 100);
        assert_eq!(plan.remaining_ai_requests(50), 50);
        assert_eq!(plan.remaining_ai_requests(100), 0);
        assert_eq!(plan.remaining_ai_requests(200), 0);
    }

    #[test]
    fn test_plan_type_checks() {
        let free = create_test_plan("free", 2, 5);
        assert!(free.is_free_plan());
        assert!(!free.is_pro_plan());
        assert!(!free.is_enterprise_plan());

        let pro = create_test_plan("pro", 10, 25);
        assert!(!pro.is_free_plan());
        assert!(pro.is_pro_plan());
        assert!(!pro.is_enterprise_plan());

        let enterprise = create_test_plan("enterprise", i64::MAX, i64::MAX);
        assert!(!enterprise.is_free_plan());
        assert!(!enterprise.is_pro_plan());
        assert!(enterprise.is_enterprise_plan());
    }

    #[test]
    fn test_enterprise_plan_effectively_unlimited() {
        let enterprise = PlanLimits {
            id: Uuid::new_v4(),
            plan_name: "enterprise".to_string(),
            max_teams: i64::MAX,
            max_projects: i64::MAX,
            max_members: i64::MAX,
            max_storage_gb: i64::MAX,
            max_ai_requests_per_month: i64::MAX,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        // Even with very large counts, enterprise should not exceed limits
        assert!(!enterprise.exceeds_team_limit(1_000_000));
        assert!(!enterprise.exceeds_project_limit(1_000_000));
        assert!(!enterprise.exceeds_member_limit(1_000_000));
        assert!(!enterprise.exceeds_storage_limit(1_000_000));
        assert!(!enterprise.exceeds_ai_requests_limit(1_000_000));
    }

    #[test]
    fn test_from_row_conversion() {
        let row = PlanLimitsRow {
            id: Uuid::new_v4(),
            plan_name: "pro".to_string(),
            max_teams: 10,
            max_projects: 25,
            max_members: 15,
            max_storage_gb: 50,
            max_ai_requests_per_month: 1000,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let plan: PlanLimits = row.into();

        assert_eq!(plan.plan_name, "pro");
        assert_eq!(plan.max_teams, 10);
        assert_eq!(plan.max_projects, 25);
        assert_eq!(plan.max_members, 15);
        assert_eq!(plan.max_storage_gb, 50);
        assert_eq!(plan.max_ai_requests_per_month, 1000);
    }
}
