use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// Status of a Copilot assignment (Phase 1 + Phase 2 statuses)
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub enum CopilotAssignmentStatus {
    // Phase 1 statuses
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
    // Phase 2 statuses (IKA-94)
    #[serde(rename = "ci_pending")]
    CiPending,
    #[serde(rename = "ci_passed")]
    CiPassed,
    #[serde(rename = "ci_failed")]
    CiFailed,
    #[serde(rename = "merging")]
    Merging,
    #[serde(rename = "merged")]
    Merged,
    #[serde(rename = "merge_failed")]
    MergeFailed,
    #[serde(rename = "deploying")]
    Deploying,
    #[serde(rename = "deployed")]
    Deployed,
    #[serde(rename = "deploy_failed")]
    DeployFailed,
}

impl CopilotAssignmentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::IssueCreated => "issue_created",
            Self::PrCreated => "pr_created",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::CiPending => "ci_pending",
            Self::CiPassed => "ci_passed",
            Self::CiFailed => "ci_failed",
            Self::Merging => "merging",
            Self::Merged => "merged",
            Self::MergeFailed => "merge_failed",
            Self::Deploying => "deploying",
            Self::Deployed => "deployed",
            Self::DeployFailed => "deploy_failed",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "pending" => Self::Pending,
            "issue_created" => Self::IssueCreated,
            "pr_created" => Self::PrCreated,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "ci_pending" => Self::CiPending,
            "ci_passed" => Self::CiPassed,
            "ci_failed" => Self::CiFailed,
            "merging" => Self::Merging,
            "merged" => Self::Merged,
            "merge_failed" => Self::MergeFailed,
            "deploying" => Self::Deploying,
            "deployed" => Self::Deployed,
            "deploy_failed" => Self::DeployFailed,
            _ => Self::Pending,
        }
    }

    /// Check if this status indicates the assignment is terminal (no more transitions)
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed
                | Self::Failed
                | Self::Deployed
                | Self::CiFailed
                | Self::MergeFailed
                | Self::DeployFailed
        )
    }

    /// Check if this status indicates CI is in progress or complete
    pub fn is_ci_related(&self) -> bool {
        matches!(self, Self::CiPending | Self::CiPassed | Self::CiFailed)
    }
}

/// A Copilot assignment tracking @copilot mentions and their GitHub processing
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CopilotAssignment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub github_issue_id: Option<i64>,
    pub github_issue_url: Option<String>,
    pub github_pr_id: Option<i64>,
    pub github_pr_url: Option<String>,
    // Phase 2: Repository tracking for webhook matching
    pub github_repo_owner: Option<String>,
    pub github_repo_name: Option<String>,
    // Phase 2: CI status tracking
    pub ci_status: Option<String>,
    pub ci_checks_url: Option<String>,
    #[ts(type = "Date | null")]
    pub ci_completed_at: Option<DateTime<Utc>>,
    // Phase 2: Deployment tracking
    pub deployment_workflow_run_id: Option<i64>,
    pub deployment_url: Option<String>,
    #[ts(type = "Date | null")]
    pub deployed_at: Option<DateTime<Utc>>,
    // Status and request details
    pub status: CopilotAssignmentStatus,
    pub prompt: String,
    pub error_message: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date | null")]
    pub completed_at: Option<DateTime<Utc>>,
}

/// Request to create a Copilot assignment
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateCopilotAssignment {
    pub prompt: String,
    pub github_issue_id: Option<i64>,
    pub github_issue_url: Option<String>,
    pub github_repo_owner: Option<String>,
    pub github_repo_name: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
}

fn default_status() -> String {
    "pending".to_string()
}

/// Request to update a Copilot assignment
#[derive(Debug, Default, Deserialize, TS)]
#[ts(export)]
pub struct UpdateCopilotAssignment {
    pub github_issue_id: Option<i64>,
    pub github_issue_url: Option<String>,
    pub github_pr_id: Option<i64>,
    pub github_pr_url: Option<String>,
    pub github_repo_owner: Option<String>,
    pub github_repo_name: Option<String>,
    // Phase 2 fields
    pub ci_status: Option<String>,
    pub ci_checks_url: Option<String>,
    #[ts(type = "Date | null")]
    pub ci_completed_at: Option<DateTime<Utc>>,
    pub deployment_workflow_run_id: Option<i64>,
    pub deployment_url: Option<String>,
    #[ts(type = "Date | null")]
    pub deployed_at: Option<DateTime<Utc>>,
    // Status fields
    pub status: Option<String>,
    pub error_message: Option<String>,
    #[ts(type = "Date | null")]
    pub completed_at: Option<DateTime<Utc>>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct CopilotAssignmentRow {
    id: Uuid,
    task_id: Uuid,
    github_issue_id: Option<i64>,
    github_issue_url: Option<String>,
    github_pr_id: Option<i64>,
    github_pr_url: Option<String>,
    github_repo_owner: Option<String>,
    github_repo_name: Option<String>,
    ci_status: Option<String>,
    ci_checks_url: Option<String>,
    ci_completed_at: Option<DateTime<Utc>>,
    deployment_workflow_run_id: Option<i64>,
    deployment_url: Option<String>,
    deployed_at: Option<DateTime<Utc>>,
    status: String,
    prompt: String,
    error_message: Option<String>,
    created_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
}

impl From<CopilotAssignmentRow> for CopilotAssignment {
    fn from(row: CopilotAssignmentRow) -> Self {
        Self {
            id: row.id,
            task_id: row.task_id,
            github_issue_id: row.github_issue_id,
            github_issue_url: row.github_issue_url,
            github_pr_id: row.github_pr_id,
            github_pr_url: row.github_pr_url,
            github_repo_owner: row.github_repo_owner,
            github_repo_name: row.github_repo_name,
            ci_status: row.ci_status,
            ci_checks_url: row.ci_checks_url,
            ci_completed_at: row.ci_completed_at,
            deployment_workflow_run_id: row.deployment_workflow_run_id,
            deployment_url: row.deployment_url,
            deployed_at: row.deployed_at,
            status: CopilotAssignmentStatus::parse(&row.status),
            prompt: row.prompt,
            error_message: row.error_message,
            created_at: row.created_at,
            completed_at: row.completed_at,
        }
    }
}

impl CopilotAssignment {
    /// Find all assignments for a task, ordered by creation time (newest first)
    pub async fn find_by_task_id(pool: &PgPool, task_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            CopilotAssignmentRow,
            r#"SELECT id as "id!: Uuid",
                      task_id as "task_id!: Uuid",
                      github_issue_id,
                      github_issue_url,
                      github_pr_id,
                      github_pr_url,
                      github_repo_owner,
                      github_repo_name,
                      ci_status,
                      ci_checks_url,
                      ci_completed_at as "ci_completed_at: DateTime<Utc>",
                      deployment_workflow_run_id,
                      deployment_url,
                      deployed_at as "deployed_at: DateTime<Utc>",
                      status,
                      prompt,
                      error_message,
                      created_at as "created_at!: DateTime<Utc>",
                      completed_at as "completed_at: DateTime<Utc>"
               FROM copilot_assignments
               WHERE task_id = $1
               ORDER BY created_at DESC"#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find the most recent assignment for a task
    pub async fn find_latest_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            CopilotAssignmentRow,
            r#"SELECT id as "id!: Uuid",
                      task_id as "task_id!: Uuid",
                      github_issue_id,
                      github_issue_url,
                      github_pr_id,
                      github_pr_url,
                      github_repo_owner,
                      github_repo_name,
                      ci_status,
                      ci_checks_url,
                      ci_completed_at as "ci_completed_at: DateTime<Utc>",
                      deployment_workflow_run_id,
                      deployment_url,
                      deployed_at as "deployed_at: DateTime<Utc>",
                      status,
                      prompt,
                      error_message,
                      created_at as "created_at!: DateTime<Utc>",
                      completed_at as "completed_at: DateTime<Utc>"
               FROM copilot_assignments
               WHERE task_id = $1
               ORDER BY created_at DESC
               LIMIT 1"#,
            task_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find a single assignment by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            CopilotAssignmentRow,
            r#"SELECT id as "id!: Uuid",
                      task_id as "task_id!: Uuid",
                      github_issue_id,
                      github_issue_url,
                      github_pr_id,
                      github_pr_url,
                      github_repo_owner,
                      github_repo_name,
                      ci_status,
                      ci_checks_url,
                      ci_completed_at as "ci_completed_at: DateTime<Utc>",
                      deployment_workflow_run_id,
                      deployment_url,
                      deployed_at as "deployed_at: DateTime<Utc>",
                      status,
                      prompt,
                      error_message,
                      created_at as "created_at!: DateTime<Utc>",
                      completed_at as "completed_at: DateTime<Utc>"
               FROM copilot_assignments
               WHERE id = $1::uuid"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find assignment by PR (for webhook matching)
    pub async fn find_by_pr(
        pool: &PgPool,
        repo_owner: &str,
        repo_name: &str,
        pr_id: i64,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            CopilotAssignmentRow,
            r#"SELECT id as "id!: Uuid",
                      task_id as "task_id!: Uuid",
                      github_issue_id,
                      github_issue_url,
                      github_pr_id,
                      github_pr_url,
                      github_repo_owner,
                      github_repo_name,
                      ci_status,
                      ci_checks_url,
                      ci_completed_at as "ci_completed_at: DateTime<Utc>",
                      deployment_workflow_run_id,
                      deployment_url,
                      deployed_at as "deployed_at: DateTime<Utc>",
                      status,
                      prompt,
                      error_message,
                      created_at as "created_at!: DateTime<Utc>",
                      completed_at as "completed_at: DateTime<Utc>"
               FROM copilot_assignments
               WHERE github_repo_owner = $1
                 AND github_repo_name = $2
                 AND github_pr_id = $3
               ORDER BY created_at DESC
               LIMIT 1"#,
            repo_owner,
            repo_name,
            pr_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find assignment by deployment workflow run ID (for webhook matching)
    pub async fn find_by_workflow_run(
        pool: &PgPool,
        workflow_run_id: i64,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            CopilotAssignmentRow,
            r#"SELECT id as "id!: Uuid",
                      task_id as "task_id!: Uuid",
                      github_issue_id,
                      github_issue_url,
                      github_pr_id,
                      github_pr_url,
                      github_repo_owner,
                      github_repo_name,
                      ci_status,
                      ci_checks_url,
                      ci_completed_at as "ci_completed_at: DateTime<Utc>",
                      deployment_workflow_run_id,
                      deployment_url,
                      deployed_at as "deployed_at: DateTime<Utc>",
                      status,
                      prompt,
                      error_message,
                      created_at as "created_at!: DateTime<Utc>",
                      completed_at as "completed_at: DateTime<Utc>"
               FROM copilot_assignments
               WHERE deployment_workflow_run_id = $1
               ORDER BY created_at DESC
               LIMIT 1"#,
            workflow_run_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create a new assignment
    pub async fn create(
        pool: &PgPool,
        task_id: Uuid,
        payload: &CreateCopilotAssignment,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        let row = sqlx::query_as!(
            CopilotAssignmentRow,
            r#"INSERT INTO copilot_assignments
               (id, task_id, github_issue_id, github_issue_url, github_repo_owner, github_repo_name, status, prompt, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
               RETURNING id as "id!: Uuid",
                         task_id as "task_id!: Uuid",
                         github_issue_id,
                         github_issue_url,
                         github_pr_id,
                         github_pr_url,
                         github_repo_owner,
                         github_repo_name,
                         ci_status,
                         ci_checks_url,
                         ci_completed_at as "ci_completed_at: DateTime<Utc>",
                         deployment_workflow_run_id,
                         deployment_url,
                         deployed_at as "deployed_at: DateTime<Utc>",
                         status,
                         prompt,
                         error_message,
                         created_at as "created_at!: DateTime<Utc>",
                         completed_at as "completed_at: DateTime<Utc>""#,
            id,
            task_id,
            payload.github_issue_id,
            payload.github_issue_url,
            payload.github_repo_owner,
            payload.github_repo_name,
            payload.status,
            payload.prompt
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Update an existing assignment
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateCopilotAssignment,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let github_issue_id = payload.github_issue_id.or(existing.github_issue_id);
        let github_issue_url = payload
            .github_issue_url
            .clone()
            .or(existing.github_issue_url);
        let github_pr_id = payload.github_pr_id.or(existing.github_pr_id);
        let github_pr_url = payload.github_pr_url.clone().or(existing.github_pr_url);
        let github_repo_owner = payload
            .github_repo_owner
            .clone()
            .or(existing.github_repo_owner);
        let github_repo_name = payload
            .github_repo_name
            .clone()
            .or(existing.github_repo_name);
        let ci_status = payload.ci_status.clone().or(existing.ci_status);
        let ci_checks_url = payload.ci_checks_url.clone().or(existing.ci_checks_url);
        let ci_completed_at = payload.ci_completed_at.or(existing.ci_completed_at);
        let deployment_workflow_run_id = payload
            .deployment_workflow_run_id
            .or(existing.deployment_workflow_run_id);
        let deployment_url = payload.deployment_url.clone().or(existing.deployment_url);
        let deployed_at = payload.deployed_at.or(existing.deployed_at);
        let status = payload
            .status
            .clone()
            .unwrap_or_else(|| existing.status.as_str().to_string());
        let error_message = payload.error_message.clone().or(existing.error_message);
        let completed_at = payload.completed_at.or(existing.completed_at);

        let row = sqlx::query_as!(
            CopilotAssignmentRow,
            r#"UPDATE copilot_assignments
               SET github_issue_id = $2,
                   github_issue_url = $3,
                   github_pr_id = $4,
                   github_pr_url = $5,
                   github_repo_owner = $6,
                   github_repo_name = $7,
                   ci_status = $8,
                   ci_checks_url = $9,
                   ci_completed_at = $10,
                   deployment_workflow_run_id = $11,
                   deployment_url = $12,
                   deployed_at = $13,
                   status = $14,
                   error_message = $15,
                   completed_at = $16
               WHERE id = $1::uuid
               RETURNING id as "id!: Uuid",
                         task_id as "task_id!: Uuid",
                         github_issue_id,
                         github_issue_url,
                         github_pr_id,
                         github_pr_url,
                         github_repo_owner,
                         github_repo_name,
                         ci_status,
                         ci_checks_url,
                         ci_completed_at as "ci_completed_at: DateTime<Utc>",
                         deployment_workflow_run_id,
                         deployment_url,
                         deployed_at as "deployed_at: DateTime<Utc>",
                         status,
                         prompt,
                         error_message,
                         created_at as "created_at!: DateTime<Utc>",
                         completed_at as "completed_at: DateTime<Utc>""#,
            id,
            github_issue_id,
            github_issue_url,
            github_pr_id,
            github_pr_url,
            github_repo_owner,
            github_repo_name,
            ci_status,
            ci_checks_url,
            ci_completed_at,
            deployment_workflow_run_id,
            deployment_url,
            deployed_at,
            status,
            error_message,
            completed_at
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Update just the status field (convenience method)
    pub async fn update_status(pool: &PgPool, id: Uuid, status: &str) -> Result<Self, sqlx::Error> {
        Self::update(
            pool,
            id,
            &UpdateCopilotAssignment {
                status: Some(status.to_string()),
                ..Default::default()
            },
        )
        .await
    }

    /// Delete an assignment
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM copilot_assignments WHERE id = $1::uuid", id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
}
