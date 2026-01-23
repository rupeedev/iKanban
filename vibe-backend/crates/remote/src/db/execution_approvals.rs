//! Execution Approvals Repository (IKA-258)
//! Human-in-the-loop approval workflow for sensitive actions

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Approval type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ApprovalType {
    ToolExecution,
    FileWrite,
    DestructiveAction,
    ExternalApi,
    Custom,
}

/// Risk level enum
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RiskLevel {
    Low,
    #[default]
    Medium,
    High,
    Critical,
}

/// Approval status enum
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ApprovalStatus {
    #[default]
    Pending,
    Approved,
    Rejected,
    Expired,
    AutoApproved,
}

/// Execution approval record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct ExecutionApproval {
    pub id: Uuid,
    pub execution_id: Uuid,
    pub attempt_id: Option<Uuid>,
    pub approval_type: String,
    pub action_description: String,
    pub action_details: Option<serde_json::Value>,
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
    pub risk_level: Option<String>,
    pub status: String,
    pub decided_by: Option<Uuid>,
    pub decision_reason: Option<String>,
    pub auto_approve_rule: Option<String>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub decided_at: Option<DateTime<Utc>>,
}

/// Data for creating a new approval request
#[derive(Debug, Clone, Deserialize)]
pub struct CreateApprovalRequest {
    pub execution_id: Uuid,
    pub attempt_id: Option<Uuid>,
    pub approval_type: String,
    pub action_description: String,
    pub action_details: Option<serde_json::Value>,
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
    pub risk_level: Option<String>,
    pub expires_in_seconds: Option<i64>,
}

/// Data for deciding on an approval
#[derive(Debug, Clone, Deserialize)]
pub struct DecideApproval {
    pub approved: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Error)]
pub enum ApprovalError {
    #[error("approval not found")]
    NotFound,
    #[error("approval already decided")]
    AlreadyDecided,
    #[error("approval expired")]
    Expired,
    #[error("operation forbidden")]
    Forbidden,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct ExecutionApprovalRepository;

impl ExecutionApprovalRepository {
    /// Find approval by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<ExecutionApproval>, ApprovalError> {
        let approval = sqlx::query_as!(
            ExecutionApproval,
            r#"
            SELECT
                id, execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, status, decided_by, decision_reason,
                auto_approve_rule, created_at, expires_at, decided_at
            FROM execution_approvals
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(approval)
    }

    /// List pending approvals for an execution
    pub async fn list_pending_by_execution(
        pool: &PgPool,
        execution_id: Uuid,
    ) -> Result<Vec<ExecutionApproval>, ApprovalError> {
        let approvals = sqlx::query_as!(
            ExecutionApproval,
            r#"
            SELECT
                id, execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, status, decided_by, decision_reason,
                auto_approve_rule, created_at, expires_at, decided_at
            FROM execution_approvals
            WHERE execution_id = $1 AND status = 'pending'
            ORDER BY created_at ASC
            "#,
            execution_id
        )
        .fetch_all(pool)
        .await?;

        Ok(approvals)
    }

    /// List all approvals for an execution
    pub async fn list_by_execution(
        pool: &PgPool,
        execution_id: Uuid,
    ) -> Result<Vec<ExecutionApproval>, ApprovalError> {
        let approvals = sqlx::query_as!(
            ExecutionApproval,
            r#"
            SELECT
                id, execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, status, decided_by, decision_reason,
                auto_approve_rule, created_at, expires_at, decided_at
            FROM execution_approvals
            WHERE execution_id = $1
            ORDER BY created_at DESC
            "#,
            execution_id
        )
        .fetch_all(pool)
        .await?;

        Ok(approvals)
    }

    /// List pending approvals for a user's executions (for dashboard)
    pub async fn list_pending_for_user(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<ExecutionApproval>, ApprovalError> {
        let approvals = sqlx::query_as!(
            ExecutionApproval,
            r#"
            SELECT
                a.id, a.execution_id, a.attempt_id, a.approval_type,
                a.action_description, a.action_details, a.tool_name, a.tool_input,
                a.risk_level, a.status, a.decided_by, a.decision_reason,
                a.auto_approve_rule, a.created_at, a.expires_at, a.decided_at
            FROM execution_approvals a
            JOIN task_executions e ON a.execution_id = e.id
            WHERE e.initiated_by = $1 AND a.status = 'pending'
            ORDER BY a.created_at ASC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(approvals)
    }

    /// Create a new approval request
    pub async fn create(
        pool: &PgPool,
        data: CreateApprovalRequest,
    ) -> Result<ExecutionApproval, ApprovalError> {
        let expires_at = data
            .expires_in_seconds
            .map(|secs| Utc::now() + chrono::Duration::seconds(secs));

        let approval = sqlx::query_as!(
            ExecutionApproval,
            r#"
            INSERT INTO execution_approvals (
                execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                id, execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, status, decided_by, decision_reason,
                auto_approve_rule, created_at, expires_at, decided_at
            "#,
            data.execution_id,
            data.attempt_id,
            data.approval_type,
            data.action_description,
            data.action_details,
            data.tool_name,
            data.tool_input,
            data.risk_level,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(approval)
    }

    /// Approve an approval request
    pub async fn approve(
        pool: &PgPool,
        id: Uuid,
        decided_by: Uuid,
        reason: Option<&str>,
    ) -> Result<ExecutionApproval, ApprovalError> {
        // First check current status
        let current = Self::find_by_id(pool, id)
            .await?
            .ok_or(ApprovalError::NotFound)?;

        if current.status != "pending" {
            return Err(ApprovalError::AlreadyDecided);
        }

        if let Some(expires_at) = current.expires_at
            && expires_at < Utc::now()
        {
            // Mark as expired
            let _ = sqlx::query!(
                r#"UPDATE execution_approvals SET status = 'expired' WHERE id = $1"#,
                id
            )
            .execute(pool)
            .await;
            return Err(ApprovalError::Expired);
        }

        let approval = sqlx::query_as!(
            ExecutionApproval,
            r#"
            UPDATE execution_approvals
            SET status = 'approved', decided_by = $2, decision_reason = $3, decided_at = NOW()
            WHERE id = $1
            RETURNING
                id, execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, status, decided_by, decision_reason,
                auto_approve_rule, created_at, expires_at, decided_at
            "#,
            id,
            decided_by,
            reason
        )
        .fetch_one(pool)
        .await?;

        Ok(approval)
    }

    /// Reject an approval request
    pub async fn reject(
        pool: &PgPool,
        id: Uuid,
        decided_by: Uuid,
        reason: Option<&str>,
    ) -> Result<ExecutionApproval, ApprovalError> {
        // First check current status
        let current = Self::find_by_id(pool, id)
            .await?
            .ok_or(ApprovalError::NotFound)?;

        if current.status != "pending" {
            return Err(ApprovalError::AlreadyDecided);
        }

        let approval = sqlx::query_as!(
            ExecutionApproval,
            r#"
            UPDATE execution_approvals
            SET status = 'rejected', decided_by = $2, decision_reason = $3, decided_at = NOW()
            WHERE id = $1
            RETURNING
                id, execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, status, decided_by, decision_reason,
                auto_approve_rule, created_at, expires_at, decided_at
            "#,
            id,
            decided_by,
            reason
        )
        .fetch_one(pool)
        .await?;

        Ok(approval)
    }

    /// Auto-approve based on a rule
    pub async fn auto_approve(
        pool: &PgPool,
        id: Uuid,
        rule: &str,
    ) -> Result<ExecutionApproval, ApprovalError> {
        let approval = sqlx::query_as!(
            ExecutionApproval,
            r#"
            UPDATE execution_approvals
            SET status = 'auto_approved', auto_approve_rule = $2, decided_at = NOW()
            WHERE id = $1 AND status = 'pending'
            RETURNING
                id, execution_id, attempt_id, approval_type,
                action_description, action_details, tool_name, tool_input,
                risk_level, status, decided_by, decision_reason,
                auto_approve_rule, created_at, expires_at, decided_at
            "#,
            id,
            rule
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ApprovalError::NotFound)?;

        Ok(approval)
    }

    /// Expire old pending approvals
    pub async fn expire_old(pool: &PgPool) -> Result<u64, ApprovalError> {
        let result = sqlx::query!(
            r#"
            UPDATE execution_approvals
            SET status = 'expired'
            WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()
            "#
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Check if there are pending approvals blocking an execution
    pub async fn has_pending(pool: &PgPool, execution_id: Uuid) -> Result<bool, ApprovalError> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM execution_approvals
            WHERE execution_id = $1 AND status = 'pending'
            "#,
            execution_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count > 0)
    }
}
