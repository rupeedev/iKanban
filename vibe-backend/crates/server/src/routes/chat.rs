use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{delete, get, post, put},
};
use db::models::chat_message::{ChatMessage, ChatMessageWithSender, CreateChatMessage, UpdateChatMessage};
use db::models::conversation::{
    Conversation, ConversationType, CreateDirectConversation, CreateGroupConversation,
};
use db::models::conversation_participant::{ConversationParticipant, ParticipantWithInfo};
use db::models::team_member::TeamMember;
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::auth::ClerkUser};

// ============================================================================
// Request/Response Types
// ============================================================================

/// Query parameters for listing conversations
#[derive(Debug, Deserialize)]
pub struct ListConversationsQuery {
    /// Team ID to filter conversations
    pub team_id: Uuid,
}

/// Query parameters for listing messages with cursor-based pagination
#[derive(Debug, Deserialize)]
pub struct ListMessagesQuery {
    /// ID of the message to start before (for pagination)
    pub before: Option<Uuid>,
    /// Maximum number of messages to return (default: 50)
    pub limit: Option<i64>,
}

/// Response for conversation list
#[derive(Debug, Serialize, TS)]
pub struct ConversationListItem {
    #[serde(flatten)]
    pub conversation: Conversation,
    pub participants: Vec<ParticipantWithInfo>,
    pub unread_count: i64,
    pub last_message: Option<ChatMessageWithSender>,
}

/// Response for messages list
#[derive(Debug, Serialize, TS)]
pub struct MessagesResponse {
    pub messages: Vec<ChatMessageWithSender>,
    /// True if there are more messages before the first one
    pub has_more: bool,
}

// ============================================================================
// Privacy Helper Functions
// ============================================================================

/// Check if two users share a team (can message each other)
async fn users_share_team(
    pool: &sqlx::PgPool,
    user1_id: &str,
    user2_id: &str,
) -> Result<bool, ApiError> {
    let result = sqlx::query_scalar!(
        r#"SELECT EXISTS(
            SELECT 1 FROM team_members tm1
            JOIN team_members tm2 ON tm1.team_id = tm2.team_id
            WHERE tm1.clerk_user_id = $1 AND tm2.clerk_user_id = $2
        ) as "exists!: bool""#,
        user1_id,
        user2_id
    )
    .fetch_one(pool)
    .await?;

    Ok(result)
}

/// Get the team member record for a user in a specific team
async fn get_team_member(
    pool: &sqlx::PgPool,
    user_id: &str,
    team_id: Uuid,
) -> Result<Option<TeamMember>, ApiError> {
    // Use the public method from TeamMember
    let member = TeamMember::find_by_clerk_id(pool, team_id, user_id).await?;
    Ok(member)
}

/// Verify user has access to a conversation
async fn verify_conversation_access(
    pool: &sqlx::PgPool,
    user_id: &str,
    conversation_id: Uuid,
) -> Result<Conversation, ApiError> {
    // First check if user is participant
    let is_participant = Conversation::is_participant(pool, conversation_id, user_id).await?;
    if !is_participant {
        return Err(ApiError::Forbidden(
            "You don't have access to this conversation".to_string(),
        ));
    }

    // Get the conversation
    let conversation = Conversation::find_by_id(pool, conversation_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Conversation not found".to_string()))?;

    Ok(conversation)
}

// ============================================================================
// Route Handlers
// ============================================================================

/// List all conversations for the current user in a team
pub async fn list_conversations(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Query(query): Query<ListConversationsQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<ConversationListItem>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify user is member of the team
    let _member = get_team_member(pool, &user.user_id, query.team_id)
        .await?
        .ok_or_else(|| ApiError::Forbidden("You are not a member of this team".to_string()))?;

    // Get conversations
    let conversations =
        Conversation::find_by_user_and_team(pool, &user.user_id, query.team_id).await?;

    // Enrich with participants, unread counts, and last message
    let mut items = Vec::with_capacity(conversations.len());
    for conv in conversations {
        let participants =
            ConversationParticipant::find_by_conversation_with_info(pool, conv.id).await?;
        let unread_count =
            ConversationParticipant::get_unread_count(pool, conv.id, &user.user_id).await?;
        let last_message = ChatMessage::get_last_message(pool, conv.id).await?;

        items.push(ConversationListItem {
            conversation: conv,
            participants,
            unread_count,
            last_message,
        });
    }

    Ok(ResponseJson(ApiResponse::success(items)))
}

/// Create a new direct message conversation
pub async fn create_direct_conversation(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Query(query): Query<ListConversationsQuery>,
    Json(payload): Json<CreateDirectConversation>,
) -> Result<ResponseJson<ApiResponse<Conversation>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get creator's team member record
    let creator_member = get_team_member(pool, &user.user_id, query.team_id)
        .await?
        .ok_or_else(|| ApiError::Forbidden("You are not a member of this team".to_string()))?;

    // Get recipient's team member record - PRIVACY CHECK: recipient must be in same team
    let recipient_member = get_team_member(pool, &payload.recipient_user_id, query.team_id)
        .await?
        .ok_or_else(|| {
            ApiError::Forbidden("Recipient is not a member of this team".to_string())
        })?;

    // Get workspace ID from team
    let workspace_id = sqlx::query_scalar!(
        r#"SELECT tenant_workspace_id as "workspace_id: Uuid" FROM teams WHERE id = $1"#,
        query.team_id
    )
    .fetch_one(pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Team has no workspace".to_string()))?;

    // Create or get existing DM
    let conversation = Conversation::create_direct(
        pool,
        query.team_id,
        workspace_id,
        &user.user_id,
        &payload.recipient_user_id,
        creator_member.id,
        recipient_member.id,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(conversation)))
}

/// Create a new group conversation
pub async fn create_group_conversation(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Query(query): Query<ListConversationsQuery>,
    Json(payload): Json<CreateGroupConversation>,
) -> Result<ResponseJson<ApiResponse<Conversation>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get creator's team member record
    let creator_member = get_team_member(pool, &user.user_id, query.team_id)
        .await?
        .ok_or_else(|| ApiError::Forbidden("You are not a member of this team".to_string()))?;

    // Verify all participants are in the same team and collect their team_member_ids
    let mut participant_pairs = Vec::with_capacity(payload.participant_user_ids.len());
    for participant_id in &payload.participant_user_ids {
        let member = get_team_member(pool, participant_id, query.team_id)
            .await?
            .ok_or_else(|| {
                ApiError::Forbidden(format!(
                    "User {} is not a member of this team",
                    participant_id
                ))
            })?;
        participant_pairs.push((participant_id.clone(), member.id));
    }

    // Get workspace ID
    let workspace_id = sqlx::query_scalar!(
        r#"SELECT tenant_workspace_id as "workspace_id: Uuid" FROM teams WHERE id = $1"#,
        query.team_id
    )
    .fetch_one(pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Team has no workspace".to_string()))?;

    // Create group conversation
    let conversation = Conversation::create_group(
        pool,
        query.team_id,
        workspace_id,
        &payload.name,
        &user.user_id,
        creator_member.id,
        &participant_pairs,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(conversation)))
}

/// Get a single conversation
pub async fn get_conversation(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(conversation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ConversationListItem>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify access
    let conversation = verify_conversation_access(pool, &user.user_id, conversation_id).await?;

    // Get enriched data
    let participants =
        ConversationParticipant::find_by_conversation_with_info(pool, conversation_id).await?;
    let unread_count =
        ConversationParticipant::get_unread_count(pool, conversation_id, &user.user_id).await?;
    let last_message = ChatMessage::get_last_message(pool, conversation_id).await?;

    Ok(ResponseJson(ApiResponse::success(ConversationListItem {
        conversation,
        participants,
        unread_count,
        last_message,
    })))
}

/// Get messages in a conversation
pub async fn get_messages(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(conversation_id): Path<Uuid>,
    Query(query): Query<ListMessagesQuery>,
) -> Result<ResponseJson<ApiResponse<MessagesResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify access
    let _conversation = verify_conversation_access(pool, &user.user_id, conversation_id).await?;

    let limit = query.limit.unwrap_or(50).min(100); // Max 100 messages per request
    let messages =
        ChatMessage::find_by_conversation(pool, conversation_id, query.before, limit + 1).await?;

    // Check if there are more messages
    let has_more = messages.len() > limit as usize;
    let messages: Vec<_> = messages.into_iter().take(limit as usize).collect();

    Ok(ResponseJson(ApiResponse::success(MessagesResponse {
        messages,
        has_more,
    })))
}

/// Send a message to a conversation
pub async fn send_message(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(conversation_id): Path<Uuid>,
    Json(payload): Json<CreateChatMessage>,
) -> Result<ResponseJson<ApiResponse<ChatMessage>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify access
    let _conversation = verify_conversation_access(pool, &user.user_id, conversation_id).await?;

    // Validate content
    if payload.content.trim().is_empty() {
        return Err(ApiError::BadRequest("Message content cannot be empty".to_string()));
    }

    if payload.content.len() > 10000 {
        return Err(ApiError::BadRequest(
            "Message content too long (max 10000 characters)".to_string(),
        ));
    }

    // Create message
    let message =
        ChatMessage::create(pool, conversation_id, &user.user_id, &payload.content).await?;

    // TODO: Broadcast message via EventService for real-time updates

    Ok(ResponseJson(ApiResponse::success(message)))
}

/// Update a message (only by sender)
pub async fn update_message(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path((conversation_id, message_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateChatMessage>,
) -> Result<ResponseJson<ApiResponse<ChatMessage>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify access
    let _conversation = verify_conversation_access(pool, &user.user_id, conversation_id).await?;

    // Validate content
    if payload.content.trim().is_empty() {
        return Err(ApiError::BadRequest("Message content cannot be empty".to_string()));
    }

    // Update message (only works if user is sender)
    let message = ChatMessage::update(pool, message_id, &user.user_id, &payload.content)
        .await
        .map_err(|_| ApiError::Forbidden("You can only edit your own messages".to_string()))?;

    Ok(ResponseJson(ApiResponse::success(message)))
}

/// Delete a message (soft delete, only by sender)
pub async fn delete_message(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path((conversation_id, message_id)): Path<(Uuid, Uuid)>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify access
    let _conversation = verify_conversation_access(pool, &user.user_id, conversation_id).await?;

    // Soft delete message (only works if user is sender)
    let deleted = ChatMessage::soft_delete(pool, message_id, &user.user_id).await?;
    if !deleted {
        return Err(ApiError::Forbidden(
            "You can only delete your own messages".to_string(),
        ));
    }

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Mark messages in a conversation as read
pub async fn mark_read(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(conversation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify access
    let _conversation = verify_conversation_access(pool, &user.user_id, conversation_id).await?;

    // Mark as read
    ConversationParticipant::mark_read(pool, conversation_id, &user.user_id).await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Leave a conversation (for group chats)
pub async fn leave_conversation(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(conversation_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify access
    let conversation = verify_conversation_access(pool, &user.user_id, conversation_id).await?;

    // Can only leave group conversations
    if conversation.conversation_type == ConversationType::Direct {
        return Err(ApiError::BadRequest(
            "Cannot leave a direct message conversation".to_string(),
        ));
    }

    // Remove participant
    ConversationParticipant::remove(pool, conversation_id, &user.user_id).await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

// ============================================================================
// Router
// ============================================================================

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        // Conversations
        .route("/chat/conversations", get(list_conversations))
        .route("/chat/conversations/direct", post(create_direct_conversation))
        .route("/chat/conversations/group", post(create_group_conversation))
        .route("/chat/conversations/:id", get(get_conversation))
        .route("/chat/conversations/:id/leave", post(leave_conversation))
        .route("/chat/conversations/:id/read", post(mark_read))
        // Messages
        .route("/chat/conversations/:id/messages", get(get_messages))
        .route("/chat/conversations/:id/messages", post(send_message))
        .route(
            "/chat/conversations/:id/messages/:message_id",
            put(update_message),
        )
        .route(
            "/chat/conversations/:id/messages/:message_id",
            delete(delete_message),
        )
}
