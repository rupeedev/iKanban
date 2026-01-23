//! Execution Logs Repository
//! Streaming log output from execution attempts

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Log type enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LogType {
    Stdout,
    Stderr,
    System,
    ToolCall,
    ToolResult,
    Thinking,
    Assistant,
}

/// Execution log entry
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct ExecutionLog {
    pub id: Uuid,
    pub attempt_id: Uuid,
    pub log_type: String,
    pub sequence_number: i64,
    pub content: String,
    pub content_type: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
    pub tool_output: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

/// Data for creating a new log entry
#[derive(Debug, Clone, Deserialize)]
pub struct CreateExecutionLog {
    pub attempt_id: Uuid,
    pub log_type: String,
    pub content: String,
    pub content_type: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
    pub tool_output: Option<serde_json::Value>,
}

#[derive(Debug, Error)]
pub enum ExecutionLogError {
    #[error("log entry not found")]
    NotFound,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct ExecutionLogRepository;

impl ExecutionLogRepository {
    /// List logs by attempt (ordered by sequence)
    pub async fn list_by_attempt(
        pool: &PgPool,
        attempt_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ExecutionLog>, ExecutionLogError> {
        let logs = sqlx::query_as!(
            ExecutionLog,
            r#"
            SELECT
                id, attempt_id, log_type, sequence_number,
                content, content_type, tool_name, tool_input, tool_output,
                created_at
            FROM execution_logs
            WHERE attempt_id = $1
            ORDER BY sequence_number ASC
            LIMIT $2 OFFSET $3
            "#,
            attempt_id,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        Ok(logs)
    }

    /// Get logs after a specific sequence number (for streaming)
    pub async fn get_after_sequence(
        pool: &PgPool,
        attempt_id: Uuid,
        after_sequence: i64,
    ) -> Result<Vec<ExecutionLog>, ExecutionLogError> {
        let logs = sqlx::query_as!(
            ExecutionLog,
            r#"
            SELECT
                id, attempt_id, log_type, sequence_number,
                content, content_type, tool_name, tool_input, tool_output,
                created_at
            FROM execution_logs
            WHERE attempt_id = $1 AND sequence_number > $2
            ORDER BY sequence_number ASC
            "#,
            attempt_id,
            after_sequence
        )
        .fetch_all(pool)
        .await?;

        Ok(logs)
    }

    /// Get tool call logs only
    pub async fn list_tool_calls(
        pool: &PgPool,
        attempt_id: Uuid,
    ) -> Result<Vec<ExecutionLog>, ExecutionLogError> {
        let logs = sqlx::query_as!(
            ExecutionLog,
            r#"
            SELECT
                id, attempt_id, log_type, sequence_number,
                content, content_type, tool_name, tool_input, tool_output,
                created_at
            FROM execution_logs
            WHERE attempt_id = $1 AND log_type IN ('tool_call', 'tool_result')
            ORDER BY sequence_number ASC
            "#,
            attempt_id
        )
        .fetch_all(pool)
        .await?;

        Ok(logs)
    }

    /// Create a new log entry
    pub async fn create(
        pool: &PgPool,
        data: CreateExecutionLog,
    ) -> Result<ExecutionLog, ExecutionLogError> {
        // Get next sequence number
        let next_seq = sqlx::query_scalar!(
            r#"
            SELECT COALESCE(MAX(sequence_number), 0) + 1 as "seq!"
            FROM execution_logs
            WHERE attempt_id = $1
            "#,
            data.attempt_id
        )
        .fetch_one(pool)
        .await?;

        let log = sqlx::query_as!(
            ExecutionLog,
            r#"
            INSERT INTO execution_logs (
                attempt_id, log_type, sequence_number,
                content, content_type, tool_name, tool_input, tool_output
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                id, attempt_id, log_type, sequence_number,
                content, content_type, tool_name, tool_input, tool_output,
                created_at
            "#,
            data.attempt_id,
            data.log_type,
            next_seq,
            data.content,
            data.content_type,
            data.tool_name,
            data.tool_input,
            data.tool_output
        )
        .fetch_one(pool)
        .await?;

        Ok(log)
    }

    /// Bulk create logs (for batch inserts)
    pub async fn create_many(
        pool: &PgPool,
        logs: Vec<CreateExecutionLog>,
    ) -> Result<u64, ExecutionLogError> {
        if logs.is_empty() {
            return Ok(0);
        }

        let mut tx = pool.begin().await?;
        let mut count = 0u64;

        // Group by attempt_id for efficient sequence assignment
        for log in logs {
            let next_seq = sqlx::query_scalar!(
                r#"
                SELECT COALESCE(MAX(sequence_number), 0) + 1 as "seq!"
                FROM execution_logs
                WHERE attempt_id = $1
                "#,
                log.attempt_id
            )
            .fetch_one(&mut *tx)
            .await?;

            sqlx::query!(
                r#"
                INSERT INTO execution_logs (
                    attempt_id, log_type, sequence_number,
                    content, content_type, tool_name, tool_input, tool_output
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#,
                log.attempt_id,
                log.log_type,
                next_seq,
                log.content,
                log.content_type,
                log.tool_name,
                log.tool_input,
                log.tool_output
            )
            .execute(&mut *tx)
            .await?;

            count += 1;
        }

        tx.commit().await?;
        Ok(count)
    }

    /// Delete logs by attempt
    pub async fn delete_by_attempt(
        pool: &PgPool,
        attempt_id: Uuid,
    ) -> Result<u64, ExecutionLogError> {
        let result = sqlx::query!(
            r#"DELETE FROM execution_logs WHERE attempt_id = $1"#,
            attempt_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Get log count for an attempt
    pub async fn count_by_attempt(
        pool: &PgPool,
        attempt_id: Uuid,
    ) -> Result<i64, ExecutionLogError> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM execution_logs
            WHERE attempt_id = $1
            "#,
            attempt_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Get latest sequence number for an attempt
    pub async fn get_latest_sequence(
        pool: &PgPool,
        attempt_id: Uuid,
    ) -> Result<i64, ExecutionLogError> {
        let seq = sqlx::query_scalar!(
            r#"
            SELECT COALESCE(MAX(sequence_number), 0) as "seq!"
            FROM execution_logs
            WHERE attempt_id = $1
            "#,
            attempt_id
        )
        .fetch_one(pool)
        .await?;

        Ok(seq)
    }
}
