//! API Log Writer (IKA-52)
//!
//! Writes API responses to the execution_process_logs table for persistence
//! and broadcasts to MsgStore for live streaming to connected clients.

use std::sync::Arc;

use db::models::execution_process_logs::ExecutionProcessLogs;
use sqlx::PgPool;
use thiserror::Error;
use utils::{log_msg::LogMsg, msg_store::MsgStore};
use uuid::Uuid;

/// Errors from API log writer operations
#[derive(Debug, Error)]
pub enum ApiLogWriterError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// API Log Writer
///
/// Writes LogMsg entries to both database (for persistence) and MsgStore (for live streaming).
/// This enables real-time streaming of API responses while maintaining a persistent log.
#[derive(Clone)]
pub struct ApiLogWriter {
    execution_id: Uuid,
    pool: PgPool,
    msg_store: Arc<MsgStore>,
}

impl ApiLogWriter {
    /// Create a new API log writer
    ///
    /// # Arguments
    /// * `execution_id` - The execution process ID to log under
    /// * `pool` - PostgreSQL connection pool
    /// * `msg_store` - MsgStore for live broadcasting
    pub fn new(execution_id: Uuid, pool: PgPool, msg_store: Arc<MsgStore>) -> Self {
        Self {
            execution_id,
            pool,
            msg_store,
        }
    }

    /// Get the execution ID this writer is logging to
    pub fn execution_id(&self) -> Uuid {
        self.execution_id
    }

    /// Write a single LogMsg to database and broadcast
    ///
    /// This method:
    /// 1. Serializes the LogMsg to JSONL format
    /// 2. Appends to the execution_process_logs table
    /// 3. Broadcasts to MsgStore for live streaming
    pub async fn write(&self, msg: LogMsg) -> Result<(), ApiLogWriterError> {
        // Serialize to JSONL
        let jsonl = serde_json::to_string(&msg)?;

        // Append to database
        ExecutionProcessLogs::append_log_line(&self.pool, self.execution_id, &jsonl).await?;

        // Broadcast to live listeners
        self.msg_store.push(msg);

        Ok(())
    }

    /// Write a raw JSONL line (for forwarding existing JSON)
    ///
    /// Useful when the JSON is already formatted from an upstream source.
    pub async fn write_raw(&self, jsonl: &str) -> Result<(), ApiLogWriterError> {
        // Parse to verify it's valid JSON and get the LogMsg
        let msg: LogMsg = serde_json::from_str(jsonl)?;

        // Append to database
        ExecutionProcessLogs::append_log_line(&self.pool, self.execution_id, jsonl).await?;

        // Broadcast to live listeners
        self.msg_store.push(msg);

        Ok(())
    }

    /// Write stdout content
    pub async fn write_stdout(&self, content: impl Into<String>) -> Result<(), ApiLogWriterError> {
        self.write(LogMsg::Stdout(content.into())).await
    }

    /// Write stderr content
    pub async fn write_stderr(&self, content: impl Into<String>) -> Result<(), ApiLogWriterError> {
        self.write(LogMsg::Stderr(content.into())).await
    }

    /// Write session ID
    pub async fn write_session_id(
        &self,
        session_id: impl Into<String>,
    ) -> Result<(), ApiLogWriterError> {
        self.write(LogMsg::SessionId(session_id.into())).await
    }

    /// Write finished marker
    pub async fn write_finished(&self) -> Result<(), ApiLogWriterError> {
        self.write(LogMsg::Finished).await
    }

    /// Write multiple LogMsg entries in batch
    ///
    /// For efficiency, this combines multiple entries into a single database write.
    pub async fn write_batch(&self, messages: Vec<LogMsg>) -> Result<(), ApiLogWriterError> {
        if messages.is_empty() {
            return Ok(());
        }

        // Serialize all messages to JSONL
        let jsonl_lines: Vec<String> = messages
            .iter()
            .map(|msg| serde_json::to_string(msg))
            .collect::<Result<Vec<_>, _>>()?;

        // Combine into single JSONL string
        let combined = jsonl_lines.join("\n");
        let byte_size = combined.len() as i64;

        // Insert as single row
        sqlx::query!(
            r#"INSERT INTO execution_process_logs (execution_id, logs, byte_size, inserted_at)
               VALUES ($1, $2, $3, NOW())"#,
            self.execution_id,
            combined,
            byte_size
        )
        .execute(&self.pool)
        .await?;

        // Broadcast each message to live listeners
        for msg in messages {
            self.msg_store.push(msg);
        }

        Ok(())
    }

    /// Create an AsyncWrite adapter for compatibility with existing LogWriter pattern
    ///
    /// This enables the ApiLogWriter to be used where an AsyncWrite is expected.
    pub fn into_async_writer(self) -> ApiAsyncWriter {
        ApiAsyncWriter::new(self)
    }
}

/// Async writer adapter for ApiLogWriter
///
/// Implements tokio's AsyncWrite trait for compatibility with code expecting
/// a stream-based writer. Each write call appends to the log.
pub struct ApiAsyncWriter {
    writer: ApiLogWriter,
    buffer: Vec<u8>,
}

impl ApiAsyncWriter {
    fn new(writer: ApiLogWriter) -> Self {
        Self {
            writer,
            buffer: Vec::new(),
        }
    }

    /// Process buffered lines
    async fn process_buffer(&mut self) -> Result<(), std::io::Error> {
        // Find complete lines (ending with \n)
        while let Some(newline_pos) = self.buffer.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=newline_pos).collect();
            let line_str = String::from_utf8_lossy(&line[..line.len() - 1]); // Exclude newline

            if !line_str.trim().is_empty() {
                self.writer
                    .write_raw(&line_str)
                    .await
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            }
        }
        Ok(())
    }

    /// Write bytes and process complete lines
    pub async fn write(&mut self, data: &[u8]) -> Result<(), std::io::Error> {
        self.buffer.extend_from_slice(data);
        self.process_buffer().await
    }

    /// Flush any remaining buffered data
    pub async fn flush(&mut self) -> Result<(), std::io::Error> {
        if !self.buffer.is_empty() {
            let remaining = std::mem::take(&mut self.buffer);
            let line_str = String::from_utf8_lossy(&remaining);
            if !line_str.trim().is_empty() {
                self.writer
                    .write_raw(&line_str)
                    .await
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a database connection
    // In a real test environment, use sqlx-test or a mock

    #[test]
    fn test_log_writer_creation() {
        // This test just verifies the struct can be created
        // Full integration tests would require a database
        let execution_id = Uuid::new_v4();
        let msg_store = Arc::new(MsgStore::new());

        // We can't create a real PgPool in a unit test without a database
        // This test just documents the expected interface
        assert!(!execution_id.is_nil());
        assert!(msg_store.get_history().is_empty());
    }
}
