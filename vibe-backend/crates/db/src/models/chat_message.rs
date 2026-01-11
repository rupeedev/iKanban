use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// A chat message
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ChatMessage {
    pub id: Uuid,
    pub conversation_id: Uuid,
    /// Clerk user ID of sender
    pub sender_id: String,
    pub content: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
    /// Soft delete timestamp
    #[ts(type = "Date | null")]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Chat message with sender details for display
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ChatMessageWithSender {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub sender_id: String,
    pub sender_name: Option<String>,
    pub sender_avatar: Option<String>,
    pub content: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
    pub is_edited: bool,
    pub is_deleted: bool,
}

/// Request to create a chat message
#[derive(Debug, Deserialize, TS)]
pub struct CreateChatMessage {
    pub content: String,
}

/// Request to update a chat message
#[derive(Debug, Deserialize, TS)]
pub struct UpdateChatMessage {
    pub content: String,
}

// Helper struct for joined query
#[derive(FromRow)]
struct ChatMessageWithSenderRow {
    id: Uuid,
    conversation_id: Uuid,
    sender_id: String,
    sender_name: Option<String>,
    sender_avatar: Option<String>,
    content: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    is_edited: bool,
    is_deleted: bool,
}

impl From<ChatMessageWithSenderRow> for ChatMessageWithSender {
    fn from(row: ChatMessageWithSenderRow) -> Self {
        Self {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            sender_name: row.sender_name,
            sender_avatar: row.sender_avatar,
            content: if row.is_deleted {
                "This message was deleted".to_string()
            } else {
                row.content
            },
            created_at: row.created_at,
            updated_at: row.updated_at,
            is_edited: row.is_edited,
            is_deleted: row.is_deleted,
        }
    }
}

/// Pagination cursor for messages
#[derive(Debug, Deserialize, TS)]
pub struct MessageCursor {
    /// ID of the last message seen (for cursor-based pagination)
    pub before: Option<Uuid>,
    /// Maximum number of messages to return
    pub limit: Option<i64>,
}

impl ChatMessage {
    /// Find messages in a conversation with cursor-based pagination
    /// Returns messages in reverse chronological order (newest first)
    pub async fn find_by_conversation(
        pool: &PgPool,
        conversation_id: Uuid,
        cursor: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<ChatMessageWithSender>, sqlx::Error> {
        let rows = if let Some(before_id) = cursor {
            // Get the created_at of the cursor message for proper pagination
            let cursor_msg = sqlx::query_scalar!(
                r#"SELECT created_at as "created_at!: DateTime<Utc>" FROM chat_messages WHERE id = $1"#,
                before_id
            )
            .fetch_optional(pool)
            .await?;

            if let Some(cursor_time) = cursor_msg {
                sqlx::query_as!(
                    ChatMessageWithSenderRow,
                    r#"SELECT cm.id as "id!: Uuid",
                              cm.conversation_id as "conversation_id!: Uuid",
                              cm.sender_id,
                              tm.display_name as sender_name,
                              tm.avatar_url as sender_avatar,
                              cm.content,
                              cm.created_at as "created_at!: DateTime<Utc>",
                              cm.updated_at as "updated_at!: DateTime<Utc>",
                              (cm.updated_at > cm.created_at) as "is_edited!: bool",
                              (cm.deleted_at IS NOT NULL) as "is_deleted!: bool"
                       FROM chat_messages cm
                       LEFT JOIN conversation_participants cp ON cm.conversation_id = cp.conversation_id AND cm.sender_id = cp.user_id
                       LEFT JOIN team_members tm ON cp.team_member_id = tm.id
                       WHERE cm.conversation_id = $1
                         AND cm.created_at < $2
                       ORDER BY cm.created_at DESC
                       LIMIT $3"#,
                    conversation_id,
                    cursor_time,
                    limit
                )
                .fetch_all(pool)
                .await?
            } else {
                Vec::new()
            }
        } else {
            sqlx::query_as!(
                ChatMessageWithSenderRow,
                r#"SELECT cm.id as "id!: Uuid",
                          cm.conversation_id as "conversation_id!: Uuid",
                          cm.sender_id,
                          tm.display_name as sender_name,
                          tm.avatar_url as sender_avatar,
                          cm.content,
                          cm.created_at as "created_at!: DateTime<Utc>",
                          cm.updated_at as "updated_at!: DateTime<Utc>",
                          (cm.updated_at > cm.created_at) as "is_edited!: bool",
                          (cm.deleted_at IS NOT NULL) as "is_deleted!: bool"
                   FROM chat_messages cm
                   LEFT JOIN conversation_participants cp ON cm.conversation_id = cp.conversation_id AND cm.sender_id = cp.user_id
                   LEFT JOIN team_members tm ON cp.team_member_id = tm.id
                   WHERE cm.conversation_id = $1
                   ORDER BY cm.created_at DESC
                   LIMIT $2"#,
                conversation_id,
                limit
            )
            .fetch_all(pool)
            .await?
        };

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find a message by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ChatMessage,
            r#"SELECT id as "id!: Uuid",
                      conversation_id as "conversation_id!: Uuid",
                      sender_id,
                      content,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      deleted_at as "deleted_at: DateTime<Utc>"
               FROM chat_messages
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new message
    pub async fn create(
        pool: &PgPool,
        conversation_id: Uuid,
        sender_id: &str,
        content: &str,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        let msg = sqlx::query_as!(
            ChatMessage,
            r#"INSERT INTO chat_messages (id, conversation_id, sender_id, content)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid",
                         conversation_id as "conversation_id!: Uuid",
                         sender_id,
                         content,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>",
                         deleted_at as "deleted_at: DateTime<Utc>""#,
            id,
            conversation_id,
            sender_id,
            content
        )
        .fetch_one(pool)
        .await?;

        // Update conversation's updated_at
        super::conversation::Conversation::touch(pool, conversation_id).await?;

        Ok(msg)
    }

    /// Update message content (only by sender, within time limit)
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        sender_id: &str,
        new_content: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            ChatMessage,
            r#"UPDATE chat_messages
               SET content = $3, updated_at = NOW()
               WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
               RETURNING id as "id!: Uuid",
                         conversation_id as "conversation_id!: Uuid",
                         sender_id,
                         content,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>",
                         deleted_at as "deleted_at: DateTime<Utc>""#,
            id,
            sender_id,
            new_content
        )
        .fetch_one(pool)
        .await
    }

    /// Soft delete a message (only by sender)
    pub async fn soft_delete(pool: &PgPool, id: Uuid, sender_id: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "UPDATE chat_messages SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL",
            id,
            sender_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Get the last message in a conversation for preview
    pub async fn get_last_message(
        pool: &PgPool,
        conversation_id: Uuid,
    ) -> Result<Option<ChatMessageWithSender>, sqlx::Error> {
        let row = sqlx::query_as!(
            ChatMessageWithSenderRow,
            r#"SELECT cm.id as "id!: Uuid",
                      cm.conversation_id as "conversation_id!: Uuid",
                      cm.sender_id,
                      tm.display_name as sender_name,
                      tm.avatar_url as sender_avatar,
                      cm.content,
                      cm.created_at as "created_at!: DateTime<Utc>",
                      cm.updated_at as "updated_at!: DateTime<Utc>",
                      (cm.updated_at > cm.created_at) as "is_edited!: bool",
                      (cm.deleted_at IS NOT NULL) as "is_deleted!: bool"
               FROM chat_messages cm
               LEFT JOIN conversation_participants cp ON cm.conversation_id = cp.conversation_id AND cm.sender_id = cp.user_id
               LEFT JOIN team_members tm ON cp.team_member_id = tm.id
               WHERE cm.conversation_id = $1
               ORDER BY cm.created_at DESC
               LIMIT 1"#,
            conversation_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }
}
