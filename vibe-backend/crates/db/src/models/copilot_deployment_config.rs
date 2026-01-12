use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// Merge method for auto-merging PRs
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub enum MergeMethod {
    #[serde(rename = "squash")]
    Squash,
    #[serde(rename = "merge")]
    Merge,
    #[serde(rename = "rebase")]
    Rebase,
}

impl MergeMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Squash => "squash",
            Self::Merge => "merge",
            Self::Rebase => "rebase",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "squash" => Self::Squash,
            "merge" => Self::Merge,
            "rebase" => Self::Rebase,
            _ => Self::Squash,
        }
    }
}

/// Configuration for Copilot auto-merge and deployment per repository
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CopilotDeploymentConfig {
    pub id: Uuid,
    pub repository_id: Uuid,
    // Auto-merge settings
    pub auto_merge_enabled: bool,
    pub merge_method: MergeMethod,
    // Deployment settings
    pub deploy_workflow_enabled: bool,
    pub deploy_workflow_name: Option<String>,
    pub deploy_workflow_ref: Option<String>,
    // CI requirements
    pub required_ci_checks: Option<Vec<String>>,
    pub wait_for_all_checks: bool,
    // Task status management
    pub auto_mark_task_done: bool,
    // Timestamps
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Request to create or update deployment config
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpsertCopilotDeploymentConfig {
    pub auto_merge_enabled: Option<bool>,
    pub merge_method: Option<String>,
    pub deploy_workflow_enabled: Option<bool>,
    pub deploy_workflow_name: Option<String>,
    pub deploy_workflow_ref: Option<String>,
    pub required_ci_checks: Option<Vec<String>>,
    pub wait_for_all_checks: Option<bool>,
    pub auto_mark_task_done: Option<bool>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct CopilotDeploymentConfigRow {
    id: Uuid,
    repository_id: Uuid,
    auto_merge_enabled: bool,
    merge_method: String,
    deploy_workflow_enabled: bool,
    deploy_workflow_name: Option<String>,
    deploy_workflow_ref: Option<String>,
    required_ci_checks: Option<Vec<String>>,
    wait_for_all_checks: bool,
    auto_mark_task_done: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<CopilotDeploymentConfigRow> for CopilotDeploymentConfig {
    fn from(row: CopilotDeploymentConfigRow) -> Self {
        Self {
            id: row.id,
            repository_id: row.repository_id,
            auto_merge_enabled: row.auto_merge_enabled,
            merge_method: MergeMethod::parse(&row.merge_method),
            deploy_workflow_enabled: row.deploy_workflow_enabled,
            deploy_workflow_name: row.deploy_workflow_name,
            deploy_workflow_ref: row.deploy_workflow_ref,
            required_ci_checks: row.required_ci_checks,
            wait_for_all_checks: row.wait_for_all_checks,
            auto_mark_task_done: row.auto_mark_task_done,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl CopilotDeploymentConfig {
    /// Find config by repository ID
    pub async fn find_by_repository_id(
        pool: &PgPool,
        repository_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            CopilotDeploymentConfigRow,
            r#"SELECT id as "id!: Uuid",
                      repository_id as "repository_id!: Uuid",
                      auto_merge_enabled,
                      merge_method,
                      deploy_workflow_enabled,
                      deploy_workflow_name,
                      deploy_workflow_ref,
                      required_ci_checks,
                      wait_for_all_checks,
                      auto_mark_task_done,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM copilot_deployment_config
               WHERE repository_id = $1"#,
            repository_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find config by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            CopilotDeploymentConfigRow,
            r#"SELECT id as "id!: Uuid",
                      repository_id as "repository_id!: Uuid",
                      auto_merge_enabled,
                      merge_method,
                      deploy_workflow_enabled,
                      deploy_workflow_name,
                      deploy_workflow_ref,
                      required_ci_checks,
                      wait_for_all_checks,
                      auto_mark_task_done,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM copilot_deployment_config
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create or update deployment config for a repository
    pub async fn upsert(
        pool: &PgPool,
        repository_id: Uuid,
        payload: &UpsertCopilotDeploymentConfig,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_repository_id(pool, repository_id).await?;

        let auto_merge_enabled = payload.auto_merge_enabled.unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|e| e.auto_merge_enabled)
                .unwrap_or(true)
        });
        let merge_method = payload.merge_method.clone().unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|e| e.merge_method.as_str().to_string())
                .unwrap_or_else(|| "squash".to_string())
        });
        let deploy_workflow_enabled = payload.deploy_workflow_enabled.unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|e| e.deploy_workflow_enabled)
                .unwrap_or(false)
        });
        let deploy_workflow_name = payload
            .deploy_workflow_name
            .clone()
            .or_else(|| existing.as_ref().and_then(|e| e.deploy_workflow_name.clone()));
        let deploy_workflow_ref = payload
            .deploy_workflow_ref
            .clone()
            .or_else(|| existing.as_ref().and_then(|e| e.deploy_workflow_ref.clone()))
            .or(Some("main".to_string()));
        let required_ci_checks = payload
            .required_ci_checks
            .clone()
            .or_else(|| existing.as_ref().and_then(|e| e.required_ci_checks.clone()));
        let wait_for_all_checks = payload.wait_for_all_checks.unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|e| e.wait_for_all_checks)
                .unwrap_or(true)
        });
        let auto_mark_task_done = payload.auto_mark_task_done.unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|e| e.auto_mark_task_done)
                .unwrap_or(true)
        });

        let row = sqlx::query_as!(
            CopilotDeploymentConfigRow,
            r#"INSERT INTO copilot_deployment_config
               (repository_id, auto_merge_enabled, merge_method, deploy_workflow_enabled,
                deploy_workflow_name, deploy_workflow_ref, required_ci_checks,
                wait_for_all_checks, auto_mark_task_done, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
               ON CONFLICT (repository_id) DO UPDATE SET
                   auto_merge_enabled = $2,
                   merge_method = $3,
                   deploy_workflow_enabled = $4,
                   deploy_workflow_name = $5,
                   deploy_workflow_ref = $6,
                   required_ci_checks = $7,
                   wait_for_all_checks = $8,
                   auto_mark_task_done = $9,
                   updated_at = NOW()
               RETURNING id as "id!: Uuid",
                         repository_id as "repository_id!: Uuid",
                         auto_merge_enabled,
                         merge_method,
                         deploy_workflow_enabled,
                         deploy_workflow_name,
                         deploy_workflow_ref,
                         required_ci_checks,
                         wait_for_all_checks,
                         auto_mark_task_done,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            repository_id,
            auto_merge_enabled,
            merge_method,
            deploy_workflow_enabled,
            deploy_workflow_name,
            deploy_workflow_ref,
            required_ci_checks.as_deref(),
            wait_for_all_checks,
            auto_mark_task_done
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Delete config for a repository
    pub async fn delete_by_repository_id(
        pool: &PgPool,
        repository_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM copilot_deployment_config WHERE repository_id = $1",
            repository_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Get config for a copilot assignment's repository
    /// Looks up the repository from the assignment's repo_owner/repo_name
    pub async fn find_by_assignment_repo(
        pool: &PgPool,
        repo_owner: &str,
        repo_name: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            CopilotDeploymentConfigRow,
            r#"SELECT cdc.id as "id!: Uuid",
                      cdc.repository_id as "repository_id!: Uuid",
                      cdc.auto_merge_enabled,
                      cdc.merge_method,
                      cdc.deploy_workflow_enabled,
                      cdc.deploy_workflow_name,
                      cdc.deploy_workflow_ref,
                      cdc.required_ci_checks,
                      cdc.wait_for_all_checks,
                      cdc.auto_mark_task_done,
                      cdc.created_at as "created_at!: DateTime<Utc>",
                      cdc.updated_at as "updated_at!: DateTime<Utc>"
               FROM copilot_deployment_config cdc
               JOIN github_repositories gr ON gr.id = cdc.repository_id
               WHERE gr.repo_owner = $1 AND gr.repo_name = $2"#,
            repo_owner,
            repo_name
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }
}
