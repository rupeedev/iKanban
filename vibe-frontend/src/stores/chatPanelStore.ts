import { create } from 'zustand';
import type { ChatPanelState } from '@/types/chat';

export const useChatPanelStore = create<ChatPanelState>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
