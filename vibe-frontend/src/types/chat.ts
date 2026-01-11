/**
 * Types for Team Chat feature
 * IKA-60: People Online & Team Chat
 * IKA-65: Team Chat Backend with Privacy Controls
 */

// Online member in a workspace
export interface OnlineMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  teamName: string | null;
  isOnline: boolean;
}

// Chat message in team chat (display format)
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  senderTeam: string | null;
  content: string;
  timestamp: string;
}

// Chat panel state
export interface ChatPanelState {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

// ============================================================================
// IKA-65: Backend Types for Team Chat with Privacy Controls
// ============================================================================

// Conversation type
export type ConversationType = 'direct' | 'group';

// Conversation from API
export interface Conversation {
  id: string;
  team_id: string;
  tenant_workspace_id: string;
  name: string | null;
  conversation_type: ConversationType;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Participant info from API
export interface ParticipantInfo {
  id: string;
  conversation_id: string;
  user_id: string;
  team_member_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
  joined_at: string;
  last_read_at: string | null;
}

// Chat message from API
export interface ChatMessageFromApi {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  is_deleted: boolean;
}

// Last message preview
export interface LastMessageInfo {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// Conversation with enriched data
export interface ConversationListItem {
  id: string;
  team_id: string;
  tenant_workspace_id: string;
  name: string | null;
  conversation_type: ConversationType;
  created_by: string;
  created_at: string;
  updated_at: string;
  participants: ParticipantInfo[];
  unread_count: number;
  last_message: ChatMessageFromApi | null;
}

// Messages response with pagination
export interface MessagesResponse {
  messages: ChatMessageFromApi[];
  has_more: boolean;
}

// Create direct conversation request
export interface CreateDirectConversation {
  recipient_user_id: string;
}

// Create group conversation request
export interface CreateGroupConversation {
  name: string;
  participant_user_ids: string[];
}

// Create message request
export interface CreateChatMessage {
  content: string;
}

// Update message request
export interface UpdateChatMessage {
  content: string;
}
