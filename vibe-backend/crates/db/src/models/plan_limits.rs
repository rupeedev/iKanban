use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// PlanLimits Model
// ============================================================================

/// Defines resource limits for each subscription plan
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PlanLimits {
    pub id: Uuid,
    pub plan_name: String,
    /// Maximum teams allowed (-1 = unlimited)
    pub max_teams: i64,
    /// Maximum projects allowed (-1 = unlimited)
    pub max_projects: i64,
    /// Maximum members allowed (-1 = unlimited)
    pub max_members: i64,
    /// Maximum storage in GB (-1 = unlimited)
    pub max_storage_gb: i64,
    /// Maximum AI requests per month (-1 = unlimited)
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
    /// Find plan limits by plan name
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

    /// Get all plan limits
    pub async fn find_all(pool: &PgPool) -> Result<Vec<Self>, PlanLimitsError> {
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
               ORDER BY
                   CASE plan_name
                       WHEN 'free' THEN 1
                       WHEN 'starter' THEN 2
                       WHEN 'pro' THEN 3
                       WHEN 'enterprise' THEN 4
                       ELSE 5
                   END"#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Get default free plan limits (fallback if database lookup fails)
    pub fn default_free() -> Self {
        PlanLimits {
            id: Uuid::nil(),
            plan_name: "free".to_string(),
            max_teams: 2,
            max_projects: 5,
            max_members: 3,
            max_storage_gb: 1,
            max_ai_requests_per_month: 50,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Check if a limit value means unlimited
    pub fn is_unlimited(limit: i64) -> bool {
        limit < 0 || limit == i64::MAX
    }

    /// Check if this plan has unlimited teams
    pub fn has_unlimited_teams(&self) -> bool {
        Self::is_unlimited(self.max_teams)
    }

    /// Check if this plan has unlimited projects
    pub fn has_unlimited_projects(&self) -> bool {
        Self::is_unlimited(self.max_projects)
    }

    /// Check if this plan has unlimited members
    pub fn has_unlimited_members(&self) -> bool {
        Self::is_unlimited(self.max_members)
    }

    /// Check if this plan has unlimited storage
    pub fn has_unlimited_storage(&self) -> bool {
        Self::is_unlimited(self.max_storage_gb)
    }

    /// Check if this plan has unlimited AI requests
    pub fn has_unlimited_ai_requests(&self) -> bool {
        Self::is_unlimited(self.max_ai_requests_per_month)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_free_plan() {
        let plan = PlanLimits::default_free();

        assert_eq!(plan.plan_name, "free");
        assert_eq!(plan.max_teams, 2);
        assert_eq!(plan.max_projects, 5);
        assert_eq!(plan.max_members, 3);
        assert_eq!(plan.max_storage_gb, 1);
        assert_eq!(plan.max_ai_requests_per_month, 50);
    }

    #[test]
    fn test_is_unlimited() {
        assert!(PlanLimits::is_unlimited(-1));
        assert!(PlanLimits::is_unlimited(i64::MAX));
        assert!(!PlanLimits::is_unlimited(0));
        assert!(!PlanLimits::is_unlimited(100));
    }

    #[test]
    fn test_unlimited_checks() {
        let limited = PlanLimits::default_free();
        assert!(!limited.has_unlimited_teams());
        assert!(!limited.has_unlimited_projects());

        let unlimited = PlanLimits {
            id: Uuid::nil(),
            plan_name: "enterprise".to_string(),
            max_teams: -1,
            max_projects: -1,
            max_members: -1,
            max_storage_gb: -1,
            max_ai_requests_per_month: -1,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!(unlimited.has_unlimited_teams());
        assert!(unlimited.has_unlimited_projects());
        assert!(unlimited.has_unlimited_members());
        assert!(unlimited.has_unlimited_storage());
        assert!(unlimited.has_unlimited_ai_requests());
    }
}
