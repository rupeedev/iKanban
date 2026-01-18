import { useMemo, useCallback, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import type {
  OnlineMember,
  ChatMessage,
  ChatMessageFromApi,
} from '@/types/chat';

interface TeamInfo {
  id: string;
  name: string;
}

interface TeamChatPanelProps {
  workspaceName?: string;
  teams?: TeamInfo[];
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
  teams = [],
  members = [],
}: TeamChatPanelProps) {
  const { isOpen, close, activeTeamId, activeConversationId, setActiveTeamId } =
    useChatPanelStore();

  // Fetch conversations for the active team
  const { data: conversations, isLoading: conversationsLoading } =
    useConversations(activeTeamId || undefined);

  // Get the active conversation or the first one
  const currentConversationId = activeConversationId || conversations?.[0]?.id;

  // Fetch messages for the current conversation
  const { data: messagesData, isLoading: messagesLoading } = useMessages(
    currentConversationId
  );

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

  // Auto-select first team when panel opens and no team is selected
  useEffect(() => {
    if (isOpen && !activeTeamId && teams.length > 0) {
      setActiveTeamId(teams[0].id);
    }
  }, [isOpen, activeTeamId, teams, setActiveTeamId]);

  // Handle team tab click
  const handleTeamClick = useCallback(
    (teamId: string) => {
      setActiveTeamId(teamId);
    },
    [setActiveTeamId]
  );

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
          <SheetDescription className="text-xs" asChild>
            <div>
              {teams.length > 0 ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {teams.map((team, idx) => (
                    <span key={team.id} className="inline-flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTeamClick(team.id)}
                        className={cn(
                          'h-auto px-1.5 py-0.5 text-[10px] font-medium rounded',
                          activeTeamId === team.id
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'bg-muted hover:bg-muted/80'
                        )}
                      >
                        {team.name}
                      </Button>
                      {idx < teams.length - 1 && (
                        <span className="mx-0.5 text-muted-foreground">
                          &bull;
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <span>{workspaceName}</span>
              )}
              {onlineCount > 0 && (
                <span className="ml-2 text-green-600 dark:text-green-400">
                  {onlineCount} online
                </span>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <OnlineMembersList members={members} />

        <ChatMessageList messages={displayMessages} isLoading={isLoading} />

        <ChatInput
          disabled={!hasConversation || sendMessage.isPending}
          onSend={handleSend}
        />
      </SheetContent>
    </Sheet>
  );
}
