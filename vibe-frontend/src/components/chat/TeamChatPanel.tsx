import { useMemo, useCallback, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { OnlineMembersList } from './OnlineMembersList';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkAsRead,
} from '@/hooks/useTeamChat';
import type { OnlineMember, ChatMessage, ChatMessageFromApi } from '@/types/chat';

interface TeamChatPanelProps {
  workspaceName?: string;
  teamNames?: string[];
  members?: OnlineMember[];
}

// Convert API message format to display format
function apiMessageToDisplay(msg: ChatMessageFromApi): ChatMessage {
  return {
    id: msg.id,
    senderId: msg.sender_id,
    senderName: msg.sender_name || 'Unknown',
    senderAvatarUrl: msg.sender_avatar,
    senderTeam: null, // Not available in API response yet
    content: msg.content,
    timestamp: msg.created_at,
  };
}

export function TeamChatPanel({
  workspaceName = 'Workspace',
  teamNames = [],
  members = [],
}: TeamChatPanelProps) {
  const { isOpen, close, activeTeamId, activeConversationId } = useChatPanelStore();

  // Fetch conversations for the active team
  const { data: conversations, isLoading: conversationsLoading } = useConversations(activeTeamId || undefined);

  // Get the active conversation or the first one
  const currentConversationId = activeConversationId || conversations?.[0]?.id;

  // Fetch messages for the current conversation
  const { data: messagesData, isLoading: messagesLoading } = useMessages(currentConversationId);

  // Send message mutation
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();

  // Convert messages to display format
  const displayMessages = useMemo(() => {
    if (!messagesData?.messages) return [];
    return messagesData.messages.map(apiMessageToDisplay);
  }, [messagesData]);

  // Handle sending a message
  const handleSend = useCallback(
    (content: string) => {
      if (!currentConversationId) return;
      sendMessage.mutate({ conversationId: currentConversationId, content });
    },
    [currentConversationId, sendMessage]
  );

  // Mark messages as read when conversation changes or panel opens
  useEffect(() => {
    if (isOpen && currentConversationId) {
      markAsRead.mutate(currentConversationId);
    }
  }, [isOpen, currentConversationId, markAsRead]);

  const onlineCount = members.filter((m) => m.isOnline).length;
  const isLoading = conversationsLoading || messagesLoading;
  const hasConversation = !!currentConversationId;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        className="w-full sm:w-[360px] sm:max-w-[360px] p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-base">Team Chat</SheetTitle>
          <SheetDescription className="text-xs">
            {teamNames.length > 0 ? (
              <span className="flex items-center gap-1 flex-wrap">
                {teamNames.map((name, idx) => (
                  <span key={name} className="inline-flex items-center">
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium">
                      {name}
                    </span>
                    {idx < teamNames.length - 1 && <span className="mx-0.5">&bull;</span>}
                  </span>
                ))}
              </span>
            ) : (
              workspaceName
            )}
            {onlineCount > 0 && (
              <span className="ml-2 text-green-600 dark:text-green-400">
                {onlineCount} online
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <OnlineMembersList members={members} />

        <ChatMessageList
          messages={displayMessages}
          isLoading={isLoading}
        />

        <ChatInput
          disabled={!hasConversation || sendMessage.isPending}
          onSend={handleSend}
        />
      </SheetContent>
    </Sheet>
  );
}
