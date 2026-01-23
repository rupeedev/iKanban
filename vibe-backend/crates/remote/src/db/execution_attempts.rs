//! Execution Attempts Repository (IKA-252)
//! Individual execution attempts with retry support

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Attempt status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum AttemptStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
    Timeout,
}

impl Default for AttemptStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// Execution attempt record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct ExecutionAttempt {
    pub id: Uuid,
    pub execution_id: Uuid,
    pub attempt_number: i32,
    pub status: String,
    pub worker_id: Option<String>,
    pub worker_region: Option<String>,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
    pub ai_model: Option<String>,
    pub ai_provider: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// Data for creating a new execution attempt
#[derive(Debug, Clone, Deserialize)]
pub struct CreateExecutionAttempt {
    pub execution_id: Uuid,
    pub attempt_number: i32,
    pub worker_id: Option<String>,
    pub worker_region: Option<String>,
    pub ai_model: Option<String>,
    pub ai_provider: Option<String>,
}

/// Data for completing an execution attempt
#[derive(Debug, Clone, Deserialize)]
pub struct CompleteAttempt {
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
}

#[derive(Debug, Error)]
pub enum ExecutionAttemptError {
    #[error("execution attempt not found")]
    NotFound,
    #[error("duplicate attempt number")]
    DuplicateAttempt,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct ExecutionAttemptRepository;

impl ExecutionAttemptRepository {
    /// Find attempt by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<ExecutionAttempt>, ExecutionAttemptError> {
        let attempt = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            SELECT
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            FROM execution_attempts
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(attempt)
    }

    /// List attempts by execution ID
    pub async fn list_by_execution(
        pool: &PgPool,
        execution_id: Uuid,
    ) -> Result<Vec<ExecutionAttempt>, ExecutionAttemptError> {
        let attempts = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            SELECT
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            FROM execution_attempts
            WHERE execution_id = $1
            ORDER BY attempt_number ASC
            "#,
            execution_id
        )
        .fetch_all(pool)
        .await?;

        Ok(attempts)
    }

    /// Get latest attempt for an execution
    pub async fn get_latest(
        pool: &PgPool,
        execution_id: Uuid,
    ) -> Result<Option<ExecutionAttempt>, ExecutionAttemptError> {
        let attempt = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            SELECT
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            FROM execution_attempts
            WHERE execution_id = $1
            ORDER BY attempt_number DESC
            LIMIT 1
            "#,
            execution_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(attempt)
    }

    /// Create a new execution attempt
    pub async fn create(
        pool: &PgPool,
        data: CreateExecutionAttempt,
    ) -> Result<ExecutionAttempt, ExecutionAttemptError> {
        let attempt = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            INSERT INTO execution_attempts (
                execution_id, attempt_number, worker_id, worker_region,
                ai_model, ai_provider
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            "#,
            data.execution_id,
            data.attempt_number,
            data.worker_id,
            data.worker_region,
            data.ai_model,
            data.ai_provider
        )
        .fetch_one(pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                if db_err.constraint() == Some("uq_execution_attempt") {
                    return ExecutionAttemptError::DuplicateAttempt;
                }
            }
            ExecutionAttemptError::Database(e)
        })?;

        Ok(attempt)
    }

    /// Mark attempt as started
    pub async fn mark_started(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<ExecutionAttempt, ExecutionAttemptError> {
        let attempt = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            UPDATE execution_attempts
            SET status = 'running', started_at = NOW()
            WHERE id = $1
            RETURNING
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            "#,
            id
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ExecutionAttemptError::NotFound)?;

        Ok(attempt)
    }

    /// Mark attempt as completed
    pub async fn mark_completed(
        pool: &PgPool,
        id: Uuid,
        data: CompleteAttempt,
    ) -> Result<ExecutionAttempt, ExecutionAttemptError> {
        let attempt = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            UPDATE execution_attempts
            SET status = 'completed',
                completed_at = NOW(),
                exit_code = $2,
                error_message = $3,
                input_tokens = $4,
                output_tokens = $5,
                cache_read_tokens = $6,
                cache_write_tokens = $7
            WHERE id = $1
            RETURNING
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            "#,
            id,
            data.exit_code,
            data.error_message,
            data.input_tokens,
            data.output_tokens,
            data.cache_read_tokens,
            data.cache_write_tokens
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ExecutionAttemptError::NotFound)?;

        Ok(attempt)
    }

    /// Mark attempt as failed
    pub async fn mark_failed(
        pool: &PgPool,
        id: Uuid,
        error_message: &str,
    ) -> Result<ExecutionAttempt, ExecutionAttemptError> {
        let attempt = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            UPDATE execution_attempts
            SET status = 'failed', completed_at = NOW(), error_message = $2
            WHERE id = $1
            RETURNING
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            "#,
            id,
            error_message
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ExecutionAttemptError::NotFound)?;

        Ok(attempt)
    }

    /// Update token counts
    pub async fn update_tokens(
        pool: &PgPool,
        id: Uuid,
        input_tokens: i32,
        output_tokens: i32,
        cache_read_tokens: Option<i32>,
        cache_write_tokens: Option<i32>,
    ) -> Result<ExecutionAttempt, ExecutionAttemptError> {
        let attempt = sqlx::query_as!(
            ExecutionAttempt,
            r#"
            UPDATE execution_attempts
            SET input_tokens = COALESCE(input_tokens, 0) + $2,
                output_tokens = COALESCE(output_tokens, 0) + $3,
                cache_read_tokens = COALESCE(cache_read_tokens, 0) + COALESCE($4, 0),
                cache_write_tokens = COALESCE(cache_write_tokens, 0) + COALESCE($5, 0)
            WHERE id = $1
            RETURNING
                id, execution_id, attempt_number, status,
                worker_id, worker_region, exit_code, error_message,
                ai_model, ai_provider,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                created_at, started_at, completed_at
            "#,
            id,
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_write_tokens
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ExecutionAttemptError::NotFound)?;

        Ok(attempt)
    }

    /// Get total token usage for an execution
    pub async fn get_total_tokens(
        pool: &PgPool,
        execution_id: Uuid,
    ) -> Result<TokenUsageSummary, ExecutionAttemptError> {
        let summary = sqlx::query_as!(
            TokenUsageSummary,
            r#"
            SELECT
                COALESCE(SUM(input_tokens), 0)::bigint AS "input_tokens!",
                COALESCE(SUM(output_tokens), 0)::bigint AS "output_tokens!",
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS "cache_read_tokens!",
                COALESCE(SUM(cache_write_tokens), 0)::bigint AS "cache_write_tokens!"
            FROM execution_attempts
            WHERE execution_id = $1
            "#,
            execution_id
        )
        .fetch_one(pool)
        .await?;

        Ok(summary)
    }
}

/// Token usage summary
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct TokenUsageSummary {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
}
