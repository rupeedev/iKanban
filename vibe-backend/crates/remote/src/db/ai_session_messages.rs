//! AI Session Messages Repository (IKA-256)
//! Conversation history within AI sessions (stored in ai_session_messages table)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// Message role enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

/// Chat message record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct ChatMessage {
    pub id: Uuid,
    pub session_id: Uuid,
    pub role: String,
    pub content: String,
    pub content_type: Option<String>,
    pub tool_use_id: Option<String>,
    pub tool_name: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub metadata: Option<serde_json::Value>,
    pub sequence_number: i64,
    pub created_at: DateTime<Utc>,
}

/// Data for creating a new chat message
#[derive(Debug, Clone, Deserialize)]
pub struct CreateChatMessage {
    pub session_id: Uuid,
    pub role: String,
    pub content: String,
    pub content_type: Option<String>,
    pub tool_use_id: Option<String>,
    pub tool_name: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

/// Paginated message result
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PaginatedMessages {
    pub messages: Vec<ChatMessage>,
    pub total: i64,
    pub has_more: bool,
}

#[derive(Debug, Error)]
pub enum ChatMessageError {
    #[error("chat message not found")]
    NotFound,
    #[error("session not found")]
    SessionNotFound,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct ChatMessageRepository;

impl ChatMessageRepository {
    /// Find message by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<ChatMessage>, ChatMessageError> {
        let message = sqlx::query_as!(
            ChatMessage,
            r#"
            SELECT
                id, session_id, role, content, content_type,
                tool_use_id, tool_name,
                input_tokens, output_tokens,
                metadata, sequence_number, created_at
            FROM ai_session_messages
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(message)
    }

    /// List messages by session (ordered by sequence)
    pub async fn list_by_session(
        pool: &PgPool,
        session_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<PaginatedMessages, ChatMessageError> {
        // Get total count
        let total = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM ai_session_messages
            WHERE session_id = $1
            "#,
            session_id
        )
        .fetch_one(pool)
        .await?;

        // Get messages
        let messages = sqlx::query_as!(
            ChatMessage,
            r#"
            SELECT
                id, session_id, role, content, content_type,
                tool_use_id, tool_name,
                input_tokens, output_tokens,
                metadata, sequence_number, created_at
            FROM ai_session_messages
            WHERE session_id = $1
            ORDER BY sequence_number ASC
            LIMIT $2 OFFSET $3
            "#,
            session_id,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        let has_more = (offset + limit) < total;

        Ok(PaginatedMessages {
            messages,
            total,
            has_more,
        })
    }

    /// Get recent messages (last N messages by sequence)
    pub async fn get_recent(
        pool: &PgPool,
        session_id: Uuid,
        count: i64,
    ) -> Result<Vec<ChatMessage>, ChatMessageError> {
        let messages = sqlx::query_as!(
            ChatMessage,
            r#"
            SELECT
                id, session_id, role, content, content_type,
                tool_use_id, tool_name,
                input_tokens, output_tokens,
                metadata, sequence_number, created_at
            FROM ai_session_messages
            WHERE session_id = $1
            ORDER BY sequence_number DESC
            LIMIT $2
            "#,
            session_id,
            count
        )
        .fetch_all(pool)
        .await?;

        // Reverse to get chronological order
        let mut messages = messages;
        messages.reverse();
        Ok(messages)
    }

    /// Get messages after a specific sequence number (for streaming updates)
    pub async fn get_after_sequence(
        pool: &PgPool,
        session_id: Uuid,
        after_sequence: i64,
    ) -> Result<Vec<ChatMessage>, ChatMessageError> {
        let messages = sqlx::query_as!(
            ChatMessage,
            r#"
            SELECT
                id, session_id, role, content, content_type,
                tool_use_id, tool_name,
                input_tokens, output_tokens,
                metadata, sequence_number, created_at
            FROM ai_session_messages
            WHERE session_id = $1 AND sequence_number > $2
            ORDER BY sequence_number ASC
            "#,
            session_id,
            after_sequence
        )
        .fetch_all(pool)
        .await?;

        Ok(messages)
    }

    /// Create a new chat message
    pub async fn create(
        pool: &PgPool,
        data: CreateChatMessage,
    ) -> Result<ChatMessage, ChatMessageError> {
        // Get next sequence number
        let next_seq = sqlx::query_scalar!(
            r#"
            SELECT COALESCE(MAX(sequence_number), 0) + 1 as "seq!"
            FROM ai_session_messages
            WHERE session_id = $1
            "#,
            data.session_id
        )
        .fetch_one(pool)
        .await?;

        let message = sqlx::query_as!(
            ChatMessage,
            r#"
            INSERT INTO ai_session_messages (
                session_id, role, content, content_type,
                tool_use_id, tool_name,
                input_tokens, output_tokens,
                metadata, sequence_number
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
                id, session_id, role, content, content_type,
                tool_use_id, tool_name,
                input_tokens, output_tokens,
                metadata, sequence_number, created_at
            "#,
            data.session_id,
            data.role,
            data.content,
            data.content_type,
            data.tool_use_id,
            data.tool_name,
            data.input_tokens,
            data.output_tokens,
            data.metadata,
            next_seq
        )
        .fetch_one(pool)
        .await?;

        Ok(message)
    }

    /// Bulk create messages (for importing conversation history)
    pub async fn create_many(
        pool: &PgPool,
        session_id: Uuid,
        messages: Vec<CreateChatMessage>,
    ) -> Result<Vec<ChatMessage>, ChatMessageError> {
        let mut tx = pool.begin().await?;

        // Get starting sequence number
        let start_seq = sqlx::query_scalar!(
            r#"
            SELECT COALESCE(MAX(sequence_number), 0) + 1 as "seq!"
            FROM ai_session_messages
            WHERE session_id = $1
            "#,
            session_id
        )
        .fetch_one(&mut *tx)
        .await?;

        let mut created = Vec::new();
        for (i, msg) in messages.into_iter().enumerate() {
            let seq = start_seq + i as i64;
            let message = sqlx::query_as!(
                ChatMessage,
                r#"
                INSERT INTO ai_session_messages (
                    session_id, role, content, content_type,
                    tool_use_id, tool_name,
                    input_tokens, output_tokens,
                    metadata, sequence_number
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING
                    id, session_id, role, content, content_type,
                    tool_use_id, tool_name,
                    input_tokens, output_tokens,
                    metadata, sequence_number, created_at
                "#,
                session_id,
                msg.role,
                msg.content,
                msg.content_type,
                msg.tool_use_id,
                msg.tool_name,
                msg.input_tokens,
                msg.output_tokens,
                msg.metadata,
                seq
            )
            .fetch_one(&mut *tx)
            .await?;
            created.push(message);
        }

        tx.commit().await?;
        Ok(created)
    }

    /// Delete all messages in a session
    pub async fn delete_by_session(
        pool: &PgPool,
        session_id: Uuid,
    ) -> Result<u64, ChatMessageError> {
        let result = sqlx::query!(
            r#"
            DELETE FROM ai_session_messages
            WHERE session_id = $1
            "#,
            session_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Get total token usage for a session
    pub async fn get_session_tokens(
        pool: &PgPool,
        session_id: Uuid,
    ) -> Result<SessionTokens, ChatMessageError> {
        let tokens = sqlx::query_as!(
            SessionTokens,
            r#"
            SELECT
                COALESCE(SUM(input_tokens), 0)::bigint AS "input_tokens!",
                COALESCE(SUM(output_tokens), 0)::bigint AS "output_tokens!",
                COUNT(*) AS "message_count!"
            FROM ai_session_messages
            WHERE session_id = $1
            "#,
            session_id
        )
        .fetch_one(pool)
        .await?;

        Ok(tokens)
    }

    /// Get message count for a session
    pub async fn count_by_session(
        pool: &PgPool,
        session_id: Uuid,
    ) -> Result<i64, ChatMessageError> {
        let count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM ai_session_messages
            WHERE session_id = $1
            "#,
            session_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count)
    }
}

/// Session token usage summary
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct SessionTokens {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub message_count: i64,
}
