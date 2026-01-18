use std::str::FromStr;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// Type of conversation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "lowercase")]
pub enum ConversationType {
    /// Direct message between two users
    #[default]
    Direct,
    /// Group chat with 3+ users
    Group,
}

impl std::fmt::Display for ConversationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Direct => write!(f, "direct"),
            Self::Group => write!(f, "group"),
        }
    }
}

impl FromStr for ConversationType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "direct" => Ok(Self::Direct),
            "group" => Ok(Self::Group),
            _ => Err(format!("Unknown conversation type: {}", s)),
        }
    }
}

/// A chat conversation (DM or group chat)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Conversation {
    pub id: Uuid,
    pub team_id: Uuid,
    pub tenant_workspace_id: Uuid,
    /// Name of the conversation (null for DMs, required for groups)
    pub name: Option<String>,
    pub conversation_type: ConversationType,
    /// Clerk user ID of creator
    pub created_by: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Conversation with participant details for listing
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ConversationWithParticipants {
    #[serde(flatten)]
    pub conversation: Conversation,
    pub participants: Vec<ConversationParticipantInfo>,
    pub unread_count: i64,
    pub last_message: Option<LastMessageInfo>,
}

/// Minimal participant info for conversation listing
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ConversationParticipantInfo {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

/// Last message preview
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LastMessageInfo {
    pub id: Uuid,
    pub sender_id: String,
    pub content: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Request to create a direct message conversation
#[derive(Debug, Deserialize, TS)]
pub struct CreateDirectConversation {
    /// Clerk user ID of the other participant
    pub recipient_user_id: String,
}

/// Request to create a group conversation
#[derive(Debug, Deserialize, TS)]
pub struct CreateGroupConversation {
    pub name: String,
    /// Clerk user IDs of participants (excluding creator)
    pub participant_user_ids: Vec<String>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct ConversationRow {
    id: Uuid,
    team_id: Uuid,
    tenant_workspace_id: Uuid,
    name: Option<String>,
    conversation_type: String,
    created_by: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<ConversationRow> for Conversation {
    fn from(row: ConversationRow) -> Self {
        Self {
            id: row.id,
            team_id: row.team_id,
            tenant_workspace_id: row.tenant_workspace_id,
            name: row.name,
            conversation_type: ConversationType::from_str(&row.conversation_type)
                .unwrap_or_default(),
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl Conversation {
    /// Find all conversations for a user within a team
    pub async fn find_by_user_and_team(
        pool: &PgPool,
        user_id: &str,
        team_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            ConversationRow,
            r#"SELECT c.id as "id!: Uuid",
                      c.team_id as "team_id!: Uuid",
                      c.tenant_workspace_id as "tenant_workspace_id!: Uuid",
                      c.name,
                      c.conversation_type,
                      c.created_by,
                      c.created_at as "created_at!: DateTime<Utc>",
                      c.updated_at as "updated_at!: DateTime<Utc>"
               FROM conversations c
               INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
               WHERE cp.user_id = $1 AND c.team_id = $2
               ORDER BY c.updated_at DESC"#,
            user_id,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find conversation by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            ConversationRow,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      tenant_workspace_id as "tenant_workspace_id!: Uuid",
                      name,
                      conversation_type,
                      created_by,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM conversations
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Find existing direct conversation between two users in a team
    pub async fn find_direct_between_users(
        pool: &PgPool,
        user1_id: &str,
        user2_id: &str,
        team_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            ConversationRow,
            r#"SELECT c.id as "id!: Uuid",
                      c.team_id as "team_id!: Uuid",
                      c.tenant_workspace_id as "tenant_workspace_id!: Uuid",
                      c.name,
                      c.conversation_type,
                      c.created_by,
                      c.created_at as "created_at!: DateTime<Utc>",
                      c.updated_at as "updated_at!: DateTime<Utc>"
               FROM conversations c
               WHERE c.team_id = $3
                 AND c.conversation_type = 'direct'
                 AND EXISTS (
                     SELECT 1 FROM conversation_participants cp1
                     WHERE cp1.conversation_id = c.id AND cp1.user_id = $1
                 )
                 AND EXISTS (
                     SELECT 1 FROM conversation_participants cp2
                     WHERE cp2.conversation_id = c.id AND cp2.user_id = $2
                 )
               LIMIT 1"#,
            user1_id,
            user2_id,
            team_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create a new direct message conversation
    pub async fn create_direct(
        pool: &PgPool,
        team_id: Uuid,
        workspace_id: Uuid,
        creator_id: &str,
        recipient_id: &str,
        creator_team_member_id: Uuid,
        recipient_team_member_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        // Check if conversation already exists
        if let Some(existing) =
            Self::find_direct_between_users(pool, creator_id, recipient_id, team_id).await?
        {
            return Ok(existing);
        }

        let id = Uuid::new_v4();

        // Create conversation
        let row = sqlx::query_as!(
            ConversationRow,
            r#"INSERT INTO conversations (id, team_id, tenant_workspace_id, conversation_type, created_by)
               VALUES ($1, $2, $3, 'direct', $4)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         name,
                         conversation_type,
                         created_by,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            team_id,
            workspace_id,
            creator_id
        )
        .fetch_one(pool)
        .await?;

        // Add participants
        sqlx::query!(
            r#"INSERT INTO conversation_participants (id, conversation_id, user_id, team_member_id)
               VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)"#,
            Uuid::new_v4(),
            id,
            creator_id,
            creator_team_member_id,
            Uuid::new_v4(),
            recipient_id,
            recipient_team_member_id
        )
        .execute(pool)
        .await?;

        Ok(row.into())
    }

    /// Create a new group conversation
    pub async fn create_group(
        pool: &PgPool,
        team_id: Uuid,
        workspace_id: Uuid,
        name: &str,
        creator_id: &str,
        creator_team_member_id: Uuid,
        participant_ids: &[(String, Uuid)], // (user_id, team_member_id) pairs
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        // Create conversation
        let row = sqlx::query_as!(
            ConversationRow,
            r#"INSERT INTO conversations (id, team_id, tenant_workspace_id, name, conversation_type, created_by)
               VALUES ($1, $2, $3, $4, 'group', $5)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         tenant_workspace_id as "tenant_workspace_id!: Uuid",
                         name,
                         conversation_type,
                         created_by,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            team_id,
            workspace_id,
            name,
            creator_id
        )
        .fetch_one(pool)
        .await?;

        // Add creator as participant
        sqlx::query!(
            r#"INSERT INTO conversation_participants (id, conversation_id, user_id, team_member_id)
               VALUES ($1, $2, $3, $4)"#,
            Uuid::new_v4(),
            id,
            creator_id,
            creator_team_member_id
        )
        .execute(pool)
        .await?;

        // Add other participants
        for (user_id, team_member_id) in participant_ids {
            sqlx::query!(
                r#"INSERT INTO conversation_participants (id, conversation_id, user_id, team_member_id)
                   VALUES ($1, $2, $3, $4)"#,
                Uuid::new_v4(),
                id,
                user_id,
                team_member_id
            )
            .execute(pool)
            .await?;
        }

        Ok(row.into())
    }

    /// Update conversation updated_at (called when new message arrives)
    pub async fn touch(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Delete a conversation
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM conversations WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Check if user is participant in conversation
    pub async fn is_participant(
        pool: &PgPool,
        conversation_id: Uuid,
        user_id: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(
                SELECT 1 FROM conversation_participants
                WHERE conversation_id = $1 AND user_id = $2
            ) as "exists!: bool""#,
            conversation_id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }
}
