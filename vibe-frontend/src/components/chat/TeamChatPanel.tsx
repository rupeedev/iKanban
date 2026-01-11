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
import type { OnlineMember, ChatMessage } from '@/types/chat';

interface TeamChatPanelProps {
  workspaceName?: string;
  teamNames?: string[];
  members?: OnlineMember[];
  messages?: ChatMessage[];
}

export function TeamChatPanel({
  workspaceName = 'Workspace',
  teamNames = [],
  members = [],
  messages = [],
}: TeamChatPanelProps) {
  const { isOpen, close } = useChatPanelStore();

  const onlineCount = members.filter((m) => m.isOnline).length;

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

        <ChatMessageList messages={messages} />

        <ChatInput disabled />
      </SheetContent>
    </Sheet>
  );
}
