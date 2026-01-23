//! Copilot/Claude assignment database operations
//!
//! Tracks @copilot and @claude mentions and their GitHub issue processing.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

/// Status of a Copilot/Claude assignment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CopilotAssignmentStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "issue_created")]
    IssueCreated,
    #[serde(rename = "pr_created")]
    PrCreated,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "failed")]
    Failed,
}

impl CopilotAssignmentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::IssueCreated => "issue_created",
            Self::PrCreated => "pr_created",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "pending" => Self::Pending,
            "issue_created" => Self::IssueCreated,
            "pr_created" => Self::PrCreated,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            _ => Self::Pending,
        }
    }
}

/// A Copilot/Claude assignment tracking @copilot/@claude mentions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotAssignment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub github_issue_id: Option<i64>,
    pub github_issue_url: Option<String>,
    pub github_pr_id: Option<i64>,
    pub github_pr_url: Option<String>,
    pub github_repo_owner: Option<String>,
    pub github_repo_name: Option<String>,
    pub status: CopilotAssignmentStatus,
    pub prompt: String,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

pub struct CopilotAssignmentRepository;

impl CopilotAssignmentRepository {
    /// Find all assignments for a task
    pub async fn find_copilot_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<CopilotAssignment>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id,
                task_id,
                github_issue_id,
                github_issue_url,
                github_pr_id,
                github_pr_url,
                github_repo_owner,
                github_repo_name,
                status,
                prompt,
                error_message,
                created_at,
                completed_at
            FROM copilot_assignments
            WHERE task_id = $1
            ORDER BY created_at DESC
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| CopilotAssignment {
                id: r.id,
                task_id: r.task_id,
                github_issue_id: r.github_issue_id,
                github_issue_url: r.github_issue_url,
                github_pr_id: r.github_pr_id,
                github_pr_url: r.github_pr_url,
                github_repo_owner: r.github_repo_owner,
                github_repo_name: r.github_repo_name,
                status: CopilotAssignmentStatus::parse(&r.status),
                prompt: r.prompt,
                error_message: r.error_message,
                created_at: r.created_at,
                completed_at: r.completed_at,
            })
            .collect())
    }

    /// Create a new copilot assignment
    pub async fn create_copilot(
        pool: &PgPool,
        task_id: Uuid,
        prompt: &str,
        repo_owner: Option<&str>,
        repo_name: Option<&str>,
    ) -> Result<CopilotAssignment, sqlx::Error> {
        let row = sqlx::query!(
            r#"
            INSERT INTO copilot_assignments
                (id, task_id, prompt, github_repo_owner, github_repo_name, status, created_at)
            VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
            RETURNING
                id,
                task_id,
                github_issue_id,
                github_issue_url,
                github_pr_id,
                github_pr_url,
                github_repo_owner,
                github_repo_name,
                status,
                prompt,
                error_message,
                created_at,
                completed_at
            "#,
            Uuid::new_v4(),
            task_id,
            prompt,
            repo_owner,
            repo_name
        )
        .fetch_one(pool)
        .await?;

        Ok(CopilotAssignment {
            id: row.id,
            task_id: row.task_id,
            github_issue_id: row.github_issue_id,
            github_issue_url: row.github_issue_url,
            github_pr_id: row.github_pr_id,
            github_pr_url: row.github_pr_url,
            github_repo_owner: row.github_repo_owner,
            github_repo_name: row.github_repo_name,
            status: CopilotAssignmentStatus::parse(&row.status),
            prompt: row.prompt,
            error_message: row.error_message,
            created_at: row.created_at,
            completed_at: row.completed_at,
        })
    }

    /// Update assignment with GitHub issue info
    pub async fn update_with_issue(
        pool: &PgPool,
        id: Uuid,
        issue_id: i64,
        issue_url: &str,
        status: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE copilot_assignments
            SET github_issue_id = $2,
                github_issue_url = $3,
                status = $4
            WHERE id = $1
            "#,
            id,
            issue_id,
            issue_url,
            status
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update assignment with error
    pub async fn update_with_error(
        pool: &PgPool,
        id: Uuid,
        error_message: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            UPDATE copilot_assignments
            SET status = 'failed',
                error_message = $2,
                completed_at = NOW()
            WHERE id = $1
            "#,
            id,
            error_message
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}
