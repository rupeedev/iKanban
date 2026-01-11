import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  className?: string;
  disabled?: boolean;
  onSend?: (message: string) => void;
}

export function ChatInput({ className, disabled = true, onSend }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && onSend && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('px-4 py-3 border-t', className)}>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder={disabled ? 'Chat coming soon...' : 'Type a message...'}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={disabled}
          className="flex-1"
          aria-label="Chat message input"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || !message.trim()}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {disabled && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Real-time chat will be available soon
        </p>
      )}
    </form>
  );
}
