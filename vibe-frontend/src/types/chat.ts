/**
 * Types for Team Chat feature
 * IKA-60: People Online & Team Chat
 */

// Online member in a workspace
export interface OnlineMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  teamName: string | null;
  isOnline: boolean;
}

// Chat message in team chat
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
