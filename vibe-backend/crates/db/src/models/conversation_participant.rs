use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// A participant in a conversation
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ConversationParticipant {
    pub id: Uuid,
    pub conversation_id: Uuid,
    /// Clerk user ID
    pub user_id: String,
    pub team_member_id: Uuid,
    #[ts(type = "Date")]
    pub joined_at: DateTime<Utc>,
    /// Last time the user read messages (for unread tracking)
    #[ts(type = "Date | null")]
    pub last_read_at: Option<DateTime<Utc>>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Participant with display info from team_members
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ParticipantWithInfo {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub user_id: String,
    pub team_member_id: Uuid,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: String,
    #[ts(type = "Date")]
    pub joined_at: DateTime<Utc>,
    #[ts(type = "Date | null")]
    pub last_read_at: Option<DateTime<Utc>>,
}

// Helper struct for joined query
#[derive(FromRow)]
struct ParticipantWithInfoRow {
    id: Uuid,
    conversation_id: Uuid,
    user_id: String,
    team_member_id: Uuid,
    display_name: Option<String>,
    avatar_url: Option<String>,
    email: String,
    joined_at: DateTime<Utc>,
    last_read_at: Option<DateTime<Utc>>,
}

impl From<ParticipantWithInfoRow> for ParticipantWithInfo {
    fn from(row: ParticipantWithInfoRow) -> Self {
        Self {
            id: row.id,
            conversation_id: row.conversation_id,
            user_id: row.user_id,
            team_member_id: row.team_member_id,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            email: row.email,
            joined_at: row.joined_at,
            last_read_at: row.last_read_at,
        }
    }
}

impl ConversationParticipant {
    /// Find all participants in a conversation
    pub async fn find_by_conversation(
        pool: &PgPool,
        conversation_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ConversationParticipant,
            r#"SELECT id as "id!: Uuid",
                      conversation_id as "conversation_id!: Uuid",
                      user_id,
                      team_member_id as "team_member_id!: Uuid",
                      joined_at as "joined_at!: DateTime<Utc>",
                      last_read_at as "last_read_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM conversation_participants
               WHERE conversation_id = $1
               ORDER BY joined_at ASC"#,
            conversation_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find all participants with their display info
    pub async fn find_by_conversation_with_info(
        pool: &PgPool,
        conversation_id: Uuid,
    ) -> Result<Vec<ParticipantWithInfo>, sqlx::Error> {
        let rows = sqlx::query_as!(
            ParticipantWithInfoRow,
            r#"SELECT cp.id as "id!: Uuid",
                      cp.conversation_id as "conversation_id!: Uuid",
                      cp.user_id,
                      cp.team_member_id as "team_member_id!: Uuid",
                      tm.display_name,
                      tm.avatar_url,
                      tm.email,
                      cp.joined_at as "joined_at!: DateTime<Utc>",
                      cp.last_read_at as "last_read_at: DateTime<Utc>"
               FROM conversation_participants cp
               INNER JOIN team_members tm ON cp.team_member_id = tm.id
               WHERE cp.conversation_id = $1
               ORDER BY cp.joined_at ASC"#,
            conversation_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find a participant by user_id and conversation_id
    pub async fn find_by_user_and_conversation(
        pool: &PgPool,
        user_id: &str,
        conversation_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ConversationParticipant,
            r#"SELECT id as "id!: Uuid",
                      conversation_id as "conversation_id!: Uuid",
                      user_id,
                      team_member_id as "team_member_id!: Uuid",
                      joined_at as "joined_at!: DateTime<Utc>",
                      last_read_at as "last_read_at: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM conversation_participants
               WHERE user_id = $1 AND conversation_id = $2"#,
            user_id,
            conversation_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Add a participant to a conversation
    pub async fn add(
        pool: &PgPool,
        conversation_id: Uuid,
        user_id: &str,
        team_member_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            ConversationParticipant,
            r#"INSERT INTO conversation_participants (id, conversation_id, user_id, team_member_id)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid",
                         conversation_id as "conversation_id!: Uuid",
                         user_id,
                         team_member_id as "team_member_id!: Uuid",
                         joined_at as "joined_at!: DateTime<Utc>",
                         last_read_at as "last_read_at: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            conversation_id,
            user_id,
            team_member_id
        )
        .fetch_one(pool)
        .await
    }

    /// Remove a participant from a conversation
    pub async fn remove(
        pool: &PgPool,
        conversation_id: Uuid,
        user_id: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2",
            conversation_id,
            user_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Update last_read_at to mark messages as read
    pub async fn mark_read(
        pool: &PgPool,
        conversation_id: Uuid,
        user_id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE conversation_participants SET last_read_at = NOW(), updated_at = NOW() WHERE conversation_id = $1 AND user_id = $2",
            conversation_id,
            user_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Get unread message count for a user in a conversation
    pub async fn get_unread_count(
        pool: &PgPool,
        conversation_id: Uuid,
        user_id: &str,
    ) -> Result<i64, sqlx::Error> {
        let count = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64"
               FROM chat_messages cm
               INNER JOIN conversation_participants cp
                   ON cm.conversation_id = cp.conversation_id
                   AND cp.user_id = $2
               WHERE cm.conversation_id = $1
                 AND cm.deleted_at IS NULL
                 AND cm.sender_id != $2
                 AND (cp.last_read_at IS NULL OR cm.created_at > cp.last_read_at)"#,
            conversation_id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(count)
    }
}
