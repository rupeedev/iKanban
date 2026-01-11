-- Create chat tables for team messaging with privacy controls
-- Privacy: Only same-team members within same workspace can chat

-- Conversations table (DMs and group chats)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tenant_workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,
    name TEXT, -- NULL for direct messages, required for groups
    conversation_type TEXT NOT NULL DEFAULT 'direct' CHECK(conversation_type IN ('direct', 'group')),
    created_by TEXT NOT NULL, -- Clerk user ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_team ON conversations(team_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(tenant_workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);

-- Conversation participants (who's in each conversation)
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, -- Clerk user ID
    team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ, -- For unread message tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Indexes for participants
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_team_member ON conversation_participants(team_member_id);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL, -- Clerk user ID
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_not_deleted ON chat_messages(conversation_id) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE conversations IS 'Chat conversations (DMs and group chats) within a team';
COMMENT ON TABLE conversation_participants IS 'Members participating in a conversation';
COMMENT ON TABLE chat_messages IS 'Individual chat messages within conversations';
COMMENT ON COLUMN conversations.team_id IS 'Team this conversation belongs to - enforces same-team only messaging';
COMMENT ON COLUMN conversations.conversation_type IS 'Type: direct (2 people) or group (3+ people)';
COMMENT ON COLUMN conversation_participants.last_read_at IS 'Timestamp of last read message for unread tracking';
COMMENT ON COLUMN chat_messages.deleted_at IS 'Soft delete timestamp - message hidden but preserved';
