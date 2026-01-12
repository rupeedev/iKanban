import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/lib/api';
import type {
  MessagesResponse,
  CreateDirectConversation,
  CreateGroupConversation,
} from '@/types/chat';

// Query keys
export const chatKeys = {
  all: ['chat'] as const,
  conversations: (teamId: string) => [...chatKeys.all, 'conversations', teamId] as const,
  conversation: (conversationId: string) => [...chatKeys.all, 'conversation', conversationId] as const,
  messages: (conversationId: string) => [...chatKeys.all, 'messages', conversationId] as const,
};

/**
 * Hook to list conversations for a team
 */
export function useConversations(teamId: string | undefined) {
  return useQuery({
    queryKey: chatKeys.conversations(teamId || ''),
    queryFn: () => chatApi.listConversations(teamId!),
    enabled: !!teamId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get a single conversation
 */
export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: chatKeys.conversation(conversationId || ''),
    queryFn: () => chatApi.getConversation(conversationId!),
    enabled: !!conversationId,
  });
}

/**
 * Hook to get messages in a conversation with pagination
 */
export function useMessages(
  conversationId: string | undefined,
  options?: { before?: string; limit?: number }
) {
  return useQuery({
    queryKey: [...chatKeys.messages(conversationId || ''), options],
    queryFn: () => chatApi.getMessages(conversationId!, options),
    enabled: !!conversationId,
  });
}

/**
 * Hook to create a direct message conversation
 */
export function useCreateDirectConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: CreateDirectConversation }) =>
      chatApi.createDirectConversation(teamId, data),
    onSuccess: (_, { teamId }) => {
      // Invalidate conversations list - mark stale but don't refetch immediately
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations(teamId), refetchType: 'none' });
    },
  });
}

/**
 * Hook to create a group conversation
 */
export function useCreateGroupConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: CreateGroupConversation }) =>
      chatApi.createGroupConversation(teamId, data),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations(teamId), refetchType: 'none' });
    },
  });
}

/**
 * Hook to send a message
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      chatApi.sendMessage(conversationId, { content }),
    onSuccess: (newMessage, { conversationId }) => {
      // Optimistically add the message to the cache
      queryClient.setQueryData<MessagesResponse>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return { messages: [newMessage], has_more: false };
          return {
            ...old,
            messages: [newMessage, ...old.messages],
          };
        }
      );
      // Also invalidate to ensure consistency - mark stale but don't refetch immediately
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId), refetchType: 'none' });
    },
  });
}

/**
 * Hook to update a message
 */
export function useUpdateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
      content,
    }: {
      conversationId: string;
      messageId: string;
      content: string;
    }) => chatApi.updateMessage(conversationId, messageId, { content }),
    onSuccess: (updatedMessage, { conversationId }) => {
      queryClient.setQueryData<MessagesResponse>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === updatedMessage.id ? updatedMessage : m
            ),
          };
        }
      );
    },
  });
}

/**
 * Hook to delete a message
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => chatApi.deleteMessage(conversationId, messageId),
    onSuccess: (_, { conversationId, messageId }) => {
      queryClient.setQueryData<MessagesResponse>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === messageId ? { ...m, is_deleted: true, content: 'This message was deleted' } : m
            ),
          };
        }
      );
    },
  });
}

/**
 * Hook to mark messages as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => chatApi.markAsRead(conversationId),
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId), refetchType: 'none' });
    },
  });
}

/**
 * Hook to leave a conversation
 */
export function useLeaveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => chatApi.leaveConversation(conversationId),
    onSuccess: () => {
      // Invalidate all conversations as we don't know the team ID - mark stale but don't refetch immediately
      queryClient.invalidateQueries({ queryKey: chatKeys.all, refetchType: 'none' });
    },
  });
}
