import { create } from 'zustand';
import type { ChatPanelState } from '@/types/chat';

interface ExtendedChatPanelState extends ChatPanelState {
  // Active team for chat context
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
  // Active conversation
  activeConversationId: string | null;
  setActiveConversationId: (conversationId: string | null) => void;
}

export const useChatPanelStore = create<ExtendedChatPanelState>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, activeConversationId: null }),
  // Team context
  activeTeamId: null,
  setActiveTeamId: (teamId) => set({ activeTeamId: teamId }),
  // Conversation context
  activeConversationId: null,
  setActiveConversationId: (conversationId) => set({ activeConversationId: conversationId }),
}));
