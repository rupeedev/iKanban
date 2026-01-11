import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatMessageListProps {
  messages?: ChatMessageType[];
  className?: string;
}

export function ChatMessageList({ messages = [], className }: ChatMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center px-4 py-8', className)}>
        <div className="rounded-full bg-muted p-4 mb-4">
          <MessageCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No messages yet</p>
        <p className="text-xs text-muted-foreground text-center">
          Start the conversation with your team!
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex-1 overflow-y-auto', className)}>
      <div className="py-2">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}
