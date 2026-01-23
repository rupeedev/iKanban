//! Task Executions Repository
//! Main execution records for AI-assisted task completion (IKA-247)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Execution status enum matching the database constraint
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS, Default)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "VARCHAR", rename_all = "snake_case")]
#[ts(export)]
pub enum ExecutionStatus {
    #[default]
    Pending,
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
    Timeout,
}

/// Execution mode enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS, Default)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "VARCHAR", rename_all = "snake_case")]
#[ts(export)]
pub enum ExecutionMode {
    #[default]
    Standard,
    Fast,
    Thorough,
    Custom,
}

/// Task execution record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct TaskExecution {
    pub id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
    pub organization_id: Uuid,
    pub status: String,
    pub initiated_by: Uuid,
    pub execution_mode: String,
    pub max_attempts: i32,
    pub current_attempt: i32,
    pub max_duration_seconds: Option<i32>,
    pub max_tokens: Option<i32>,
    pub result_summary: Option<String>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Data for creating a new task execution
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTaskExecution {
    pub task_id: Uuid,
    pub project_id: Uuid,
    pub organization_id: Uuid,
    pub initiated_by: Uuid,
    pub execution_mode: Option<String>,
    pub max_attempts: Option<i32>,
    pub max_duration_seconds: Option<i32>,
    pub max_tokens: Option<i32>,
}

/// Data for updating a task execution
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTaskExecution {
    pub status: Option<String>,
    pub current_attempt: Option<i32>,
    pub result_summary: Option<String>,
    pub error_message: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Error)]
pub enum TaskExecutionError {
    #[error("task execution not found")]
    NotFound,
    #[error("operation forbidden")]
    Forbidden,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct TaskExecutionRepository;

impl TaskExecutionRepository {
    /// Find execution by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<TaskExecution>, TaskExecutionError> {
        let execution = sqlx::query_as!(
            TaskExecution,
            r#"
            SELECT
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            FROM task_executions
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(execution)
    }

    /// List executions by task ID
    pub async fn list_by_task(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<TaskExecution>, TaskExecutionError> {
        let executions = sqlx::query_as!(
            TaskExecution,
            r#"
            SELECT
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            FROM task_executions
            WHERE task_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            "#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(executions)
    }

    /// List executions by organization
    pub async fn list_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
        limit: i64,
    ) -> Result<Vec<TaskExecution>, TaskExecutionError> {
        let executions = sqlx::query_as!(
            TaskExecution,
            r#"
            SELECT
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            FROM task_executions
            WHERE organization_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT $2
            "#,
            organization_id,
            limit
        )
        .fetch_all(pool)
        .await?;

        Ok(executions)
    }

    /// Create a new task execution
    pub async fn create(
        pool: &PgPool,
        data: CreateTaskExecution,
    ) -> Result<TaskExecution, TaskExecutionError> {
        let execution = sqlx::query_as!(
            TaskExecution,
            r#"
            INSERT INTO task_executions (
                task_id, project_id, organization_id, initiated_by,
                execution_mode, max_attempts, max_duration_seconds, max_tokens
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            "#,
            data.task_id,
            data.project_id,
            data.organization_id,
            data.initiated_by,
            data.execution_mode
                .unwrap_or_else(|| "standard".to_string()),
            data.max_attempts.unwrap_or(3),
            data.max_duration_seconds,
            data.max_tokens
        )
        .fetch_one(pool)
        .await?;

        Ok(execution)
    }

    /// Update task execution status
    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        status: &str,
    ) -> Result<TaskExecution, TaskExecutionError> {
        let execution = sqlx::query_as!(
            TaskExecution,
            r#"
            UPDATE task_executions
            SET status = $2, updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            "#,
            id,
            status
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskExecutionError::NotFound)?;

        Ok(execution)
    }

    /// Mark execution as started
    pub async fn mark_started(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<TaskExecution, TaskExecutionError> {
        let execution = sqlx::query_as!(
            TaskExecution,
            r#"
            UPDATE task_executions
            SET status = 'running', started_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            "#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskExecutionError::NotFound)?;

        Ok(execution)
    }

    /// Mark execution as completed
    pub async fn mark_completed(
        pool: &PgPool,
        id: Uuid,
        result_summary: Option<&str>,
    ) -> Result<TaskExecution, TaskExecutionError> {
        let execution = sqlx::query_as!(
            TaskExecution,
            r#"
            UPDATE task_executions
            SET status = 'completed', completed_at = NOW(), result_summary = $2, updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            "#,
            id,
            result_summary
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskExecutionError::NotFound)?;

        Ok(execution)
    }

    /// Mark execution as failed
    pub async fn mark_failed(
        pool: &PgPool,
        id: Uuid,
        error_message: &str,
    ) -> Result<TaskExecution, TaskExecutionError> {
        let execution = sqlx::query_as!(
            TaskExecution,
            r#"
            UPDATE task_executions
            SET status = 'failed', completed_at = NOW(), error_message = $2, updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            "#,
            id,
            error_message
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskExecutionError::NotFound)?;

        Ok(execution)
    }

    /// Increment attempt counter
    pub async fn increment_attempt(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<TaskExecution, TaskExecutionError> {
        let execution = sqlx::query_as!(
            TaskExecution,
            r#"
            UPDATE task_executions
            SET current_attempt = current_attempt + 1, updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING
                id, task_id, project_id, organization_id,
                status, initiated_by, execution_mode,
                max_attempts, current_attempt,
                max_duration_seconds, max_tokens,
                result_summary, error_message,
                created_at, updated_at, started_at, completed_at, deleted_at
            "#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(TaskExecutionError::NotFound)?;

        Ok(execution)
    }

    /// Soft delete execution
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<bool, TaskExecutionError> {
        let result = sqlx::query!(
            r#"
            UPDATE task_executions
            SET deleted_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}
