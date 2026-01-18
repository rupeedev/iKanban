use std::{fmt, str::FromStr};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

// ============================================================================
// WorkspaceSubscription Model
// ============================================================================

/// Subscription tracking for tenant workspaces (Stripe integration)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkspaceSubscription {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    #[ts(type = "Date | null")]
    pub current_period_start: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub current_period_end: Option<DateTime<Utc>>,
    pub status: SubscriptionStatus,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Helper struct for FromRow conversion
#[derive(FromRow)]
struct WorkspaceSubscriptionRow {
    id: Uuid,
    workspace_id: Uuid,
    stripe_customer_id: Option<String>,
    stripe_subscription_id: Option<String>,
    current_period_start: Option<DateTime<Utc>>,
    current_period_end: Option<DateTime<Utc>>,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<WorkspaceSubscriptionRow> for WorkspaceSubscription {
    fn from(row: WorkspaceSubscriptionRow) -> Self {
        WorkspaceSubscription {
            id: row.id,
            workspace_id: row.workspace_id,
            stripe_customer_id: row.stripe_customer_id,
            stripe_subscription_id: row.stripe_subscription_id,
            current_period_start: row.current_period_start,
            current_period_end: row.current_period_end,
            status: SubscriptionStatus::from_str(&row.status)
                .unwrap_or(SubscriptionStatus::Trialing),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

// ============================================================================
// SubscriptionStatus Enum
// ============================================================================

/// Stripe subscription status values
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionStatus {
    Trialing,
    Active,
    Canceled,
    PastDue,
    Unpaid,
    Incomplete,
    IncompleteExpired,
    Paused,
}

impl fmt::Display for SubscriptionStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SubscriptionStatus::Trialing => write!(f, "trialing"),
            SubscriptionStatus::Active => write!(f, "active"),
            SubscriptionStatus::Canceled => write!(f, "canceled"),
            SubscriptionStatus::PastDue => write!(f, "past_due"),
            SubscriptionStatus::Unpaid => write!(f, "unpaid"),
            SubscriptionStatus::Incomplete => write!(f, "incomplete"),
            SubscriptionStatus::IncompleteExpired => write!(f, "incomplete_expired"),
            SubscriptionStatus::Paused => write!(f, "paused"),
        }
    }
}

impl FromStr for SubscriptionStatus {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "trialing" => Ok(SubscriptionStatus::Trialing),
            "active" => Ok(SubscriptionStatus::Active),
            "canceled" => Ok(SubscriptionStatus::Canceled),
            "past_due" => Ok(SubscriptionStatus::PastDue),
            "unpaid" => Ok(SubscriptionStatus::Unpaid),
            "incomplete" => Ok(SubscriptionStatus::Incomplete),
            "incomplete_expired" => Ok(SubscriptionStatus::IncompleteExpired),
            "paused" => Ok(SubscriptionStatus::Paused),
            _ => Err(()),
        }
    }
}

// ============================================================================
// Request/Response DTOs
// ============================================================================

#[derive(Debug, Deserialize, TS)]
pub struct CreateWorkspaceSubscription {
    pub workspace_id: Uuid,
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    #[ts(type = "Date | null")]
    pub current_period_start: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub current_period_end: Option<DateTime<Utc>>,
    pub status: Option<SubscriptionStatus>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkspaceSubscription {
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    #[ts(type = "Date | null")]
    pub current_period_start: Option<DateTime<Utc>>,
    #[ts(type = "Date | null")]
    pub current_period_end: Option<DateTime<Utc>>,
    pub status: Option<SubscriptionStatus>,
}

// ============================================================================
// Errors
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceSubscriptionError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Subscription not found")]
    NotFound,
    #[error("Workspace not found")]
    WorkspaceNotFound,
}

// ============================================================================
// WorkspaceSubscription Implementation
// ============================================================================

impl WorkspaceSubscription {
    /// Create a new subscription for a workspace
    pub async fn create(
        pool: &PgPool,
        data: &CreateWorkspaceSubscription,
    ) -> Result<Self, WorkspaceSubscriptionError> {
        let status = data
            .status
            .unwrap_or(SubscriptionStatus::Trialing)
            .to_string();

        let row = sqlx::query_as!(
            WorkspaceSubscriptionRow,
            r#"INSERT INTO workspace_subscriptions
                   (workspace_id, stripe_customer_id, stripe_subscription_id,
                    current_period_start, current_period_end, status)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id as "id!: Uuid",
                         workspace_id as "workspace_id!: Uuid",
                         stripe_customer_id,
                         stripe_subscription_id,
                         current_period_start as "current_period_start: DateTime<Utc>",
                         current_period_end as "current_period_end: DateTime<Utc>",
                         status,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            data.workspace_id,
            data.stripe_customer_id,
            data.stripe_subscription_id,
            data.current_period_start,
            data.current_period_end,
            status
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Find a subscription by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<Self>, WorkspaceSubscriptionError> {
        let row = sqlx::query_as!(
            WorkspaceSubscriptionRow,
            r#"SELECT id as "id!: Uuid",
                      workspace_id as "workspace_id!: Uuid",
                      stripe_customer_id,
                      stripe_subscription_id,
                      current_period_start as "current_period_start: DateTime<Utc>",
                      current_period_end as "current_period_end: DateTime<Utc>",
                      status,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM workspace_subscriptions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find subscription by workspace ID
    pub async fn find_by_workspace_id(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Option<Self>, WorkspaceSubscriptionError> {
        let row = sqlx::query_as!(
            WorkspaceSubscriptionRow,
            r#"SELECT id as "id!: Uuid",
                      workspace_id as "workspace_id!: Uuid",
                      stripe_customer_id,
                      stripe_subscription_id,
                      current_period_start as "current_period_start: DateTime<Utc>",
                      current_period_end as "current_period_end: DateTime<Utc>",
                      status,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM workspace_subscriptions
               WHERE workspace_id = $1
               ORDER BY created_at DESC
               LIMIT 1"#,
            workspace_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find subscription by Stripe customer ID
    pub async fn find_by_stripe_customer_id(
        pool: &PgPool,
        stripe_customer_id: &str,
    ) -> Result<Option<Self>, WorkspaceSubscriptionError> {
        let row = sqlx::query_as!(
            WorkspaceSubscriptionRow,
            r#"SELECT id as "id!: Uuid",
                      workspace_id as "workspace_id!: Uuid",
                      stripe_customer_id,
                      stripe_subscription_id,
                      current_period_start as "current_period_start: DateTime<Utc>",
                      current_period_end as "current_period_end: DateTime<Utc>",
                      status,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM workspace_subscriptions
               WHERE stripe_customer_id = $1"#,
            stripe_customer_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find subscription by Stripe subscription ID
    pub async fn find_by_stripe_subscription_id(
        pool: &PgPool,
        stripe_subscription_id: &str,
    ) -> Result<Option<Self>, WorkspaceSubscriptionError> {
        let row = sqlx::query_as!(
            WorkspaceSubscriptionRow,
            r#"SELECT id as "id!: Uuid",
                      workspace_id as "workspace_id!: Uuid",
                      stripe_customer_id,
                      stripe_subscription_id,
                      current_period_start as "current_period_start: DateTime<Utc>",
                      current_period_end as "current_period_end: DateTime<Utc>",
                      status,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM workspace_subscriptions
               WHERE stripe_subscription_id = $1"#,
            stripe_subscription_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Update a subscription
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateWorkspaceSubscription,
    ) -> Result<Self, WorkspaceSubscriptionError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(WorkspaceSubscriptionError::NotFound)?;

        let stripe_customer_id = data
            .stripe_customer_id
            .as_ref()
            .or(existing.stripe_customer_id.as_ref());
        let stripe_subscription_id = data
            .stripe_subscription_id
            .as_ref()
            .or(existing.stripe_subscription_id.as_ref());
        let current_period_start = data.current_period_start.or(existing.current_period_start);
        let current_period_end = data.current_period_end.or(existing.current_period_end);
        let status = data
            .status
            .map(|s| s.to_string())
            .unwrap_or_else(|| existing.status.to_string());

        let row = sqlx::query_as!(
            WorkspaceSubscriptionRow,
            r#"UPDATE workspace_subscriptions
               SET stripe_customer_id = $2,
                   stripe_subscription_id = $3,
                   current_period_start = $4,
                   current_period_end = $5,
                   status = $6,
                   updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         workspace_id as "workspace_id!: Uuid",
                         stripe_customer_id,
                         stripe_subscription_id,
                         current_period_start as "current_period_start: DateTime<Utc>",
                         current_period_end as "current_period_end: DateTime<Utc>",
                         status,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            stripe_customer_id,
            stripe_subscription_id,
            current_period_start,
            current_period_end,
            status
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Update subscription status only
    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        status: SubscriptionStatus,
    ) -> Result<Self, WorkspaceSubscriptionError> {
        let status_str = status.to_string();

        let row = sqlx::query_as!(
            WorkspaceSubscriptionRow,
            r#"UPDATE workspace_subscriptions
               SET status = $2, updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         workspace_id as "workspace_id!: Uuid",
                         stripe_customer_id,
                         stripe_subscription_id,
                         current_period_start as "current_period_start: DateTime<Utc>",
                         current_period_end as "current_period_end: DateTime<Utc>",
                         status,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            status_str
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Delete a subscription
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, WorkspaceSubscriptionError> {
        let result = sqlx::query!("DELETE FROM workspace_subscriptions WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Check if subscription is active (not canceled, past_due, etc.)
    pub fn is_active(&self) -> bool {
        matches!(
            self.status,
            SubscriptionStatus::Active | SubscriptionStatus::Trialing
        )
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subscription_status_display() {
        assert_eq!(SubscriptionStatus::Trialing.to_string(), "trialing");
        assert_eq!(SubscriptionStatus::Active.to_string(), "active");
        assert_eq!(SubscriptionStatus::Canceled.to_string(), "canceled");
        assert_eq!(SubscriptionStatus::PastDue.to_string(), "past_due");
        assert_eq!(SubscriptionStatus::Unpaid.to_string(), "unpaid");
        assert_eq!(SubscriptionStatus::Incomplete.to_string(), "incomplete");
        assert_eq!(
            SubscriptionStatus::IncompleteExpired.to_string(),
            "incomplete_expired"
        );
        assert_eq!(SubscriptionStatus::Paused.to_string(), "paused");
    }

    #[test]
    fn test_subscription_status_from_str() {
        assert_eq!(
            SubscriptionStatus::from_str("trialing").unwrap(),
            SubscriptionStatus::Trialing
        );
        assert_eq!(
            SubscriptionStatus::from_str("active").unwrap(),
            SubscriptionStatus::Active
        );
        assert_eq!(
            SubscriptionStatus::from_str("canceled").unwrap(),
            SubscriptionStatus::Canceled
        );
        assert_eq!(
            SubscriptionStatus::from_str("past_due").unwrap(),
            SubscriptionStatus::PastDue
        );
        assert_eq!(
            SubscriptionStatus::from_str("ACTIVE").unwrap(),
            SubscriptionStatus::Active
        );
        assert!(SubscriptionStatus::from_str("invalid").is_err());
    }

    #[test]
    fn test_is_active() {
        let mut subscription = WorkspaceSubscription {
            id: Uuid::new_v4(),
            workspace_id: Uuid::new_v4(),
            stripe_customer_id: None,
            stripe_subscription_id: None,
            current_period_start: None,
            current_period_end: None,
            status: SubscriptionStatus::Active,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!(subscription.is_active());

        subscription.status = SubscriptionStatus::Trialing;
        assert!(subscription.is_active());

        subscription.status = SubscriptionStatus::Canceled;
        assert!(!subscription.is_active());

        subscription.status = SubscriptionStatus::PastDue;
        assert!(!subscription.is_active());
    }
}
