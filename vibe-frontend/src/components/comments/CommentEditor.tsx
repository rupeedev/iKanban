import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  List,
  ListOrdered,
  Table,
  Paperclip,
  LayoutPanelTop,
  Send,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentMentions, type AgentMention } from '@/hooks/useAgentMentions';
import { AgentMentionSuggestions } from '@/components/tasks/TaskDetails/AgentMentionSuggestions';

interface CommentEditorProps {
  onSubmit: (content: string, isInternal: boolean) => Promise<void>;
  onSubmitAndClose?: (content: string, isInternal: boolean) => Promise<void>;
  isSubmitting?: boolean;
  placeholder?: string;
  authorName?: string;
  showCloseButton?: boolean;
}

export function CommentEditor({
  onSubmit,
  onSubmitAndClose,
  isSubmitting = false,
  placeholder = 'Add a comment...',
  showCloseButton = false,
}: CommentEditorProps) {
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Agent mentions hook for autocomplete
  const { filterMentions, getMentionPosition } = useAgentMentions();

  // Get current mention state
  const mentionState = getMentionPosition(content, cursorPosition);
  const filteredSuggestions = mentionState
    ? filterMentions(mentionState.searchTerm)
    : [];

  // Show suggestions when typing @
  useEffect(() => {
    setShowSuggestions(mentionState !== null && filteredSuggestions.length > 0);
    setSelectedSuggestionIndex(0);
  }, [mentionState, filteredSuggestions.length]);

  const insertFormatting = useCallback((prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText = content.substring(0, start) + prefix + selectedText + suffix + content.substring(end);

    setContent(newText);

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
    }, 0);
  }, [content]);

  const handleBold = () => insertFormatting('**');
  const handleItalic = () => insertFormatting('*');
  const handleStrikethrough = () => insertFormatting('~~');
  const handleCode = () => insertFormatting('`');
  const handleLink = () => insertFormatting('[', '](url)');
  const handleBulletList = () => insertFormatting('- ');
  const handleNumberedList = () => insertFormatting('1. ');
  const handleTable = () => insertFormatting('\n| Header | Header |\n|--------|--------|\n| Cell   | Cell   |\n', '');
  const handlePanel = () => insertFormatting('\n> **Note:** ', '\n');

  // Handle text change with cursor tracking
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      setCursorPosition(e.target.selectionStart || 0);
    },
    []
  );

  // Handle cursor position changes
  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      setCursorPosition(target.selectionStart || 0);
    },
    []
  );

  // Handle agent selection from suggestions
  const handleAgentSelect = useCallback(
    (agent: AgentMention) => {
      if (!mentionState) return;

      // Replace the @mention with the selected agent's trigger
      const beforeMention = content.slice(0, mentionState.start);
      const afterMention = content.slice(cursorPosition);
      const newText = `${beforeMention}${agent.trigger} ${afterMention}`;

      setContent(newText);
      setShowSuggestions(false);

      // Focus back to textarea and set cursor after the inserted mention
      const newCursorPos = mentionState.start + agent.trigger.length + 1;
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPosition(newCursorPos);
      }, 0);
    },
    [content, cursorPosition, mentionState]
  );

  // Handle suggestion navigation
  const handleNavigate = useCallback(
    (direction: 'up' | 'down') => {
      setSelectedSuggestionIndex((prev) => {
        if (direction === 'down') {
          return prev < filteredSuggestions.length - 1 ? prev + 1 : 0;
        }
        return prev > 0 ? prev - 1 : filteredSuggestions.length - 1;
      });
    },
    [filteredSuggestions.length]
  );

  // Handle keyboard for suggestions
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // If suggestions are shown, let AgentMentionSuggestions handle navigation keys
      if (showSuggestions && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
        return;
      }
    },
    [showSuggestions]
  );

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;
    await onSubmit(content.trim(), isInternal);
    setContent('');
    setIsInternal(false);
  };

  const handleSubmitAndClose = async () => {
    if (!content.trim() || isSubmitting || !onSubmitAndClose) return;
    await onSubmitAndClose(content.trim(), isInternal);
    setContent('');
    setIsInternal(false);
  };

  const toolbarButtons = [
    { icon: Bold, onClick: handleBold, title: 'Bold' },
    { icon: Italic, onClick: handleItalic, title: 'Italic' },
    { icon: Strikethrough, onClick: handleStrikethrough, title: 'Strikethrough' },
    { icon: Code, onClick: handleCode, title: 'Code' },
    { icon: Link, onClick: handleLink, title: 'Link' },
    { type: 'divider' as const },
    { icon: List, onClick: handleBulletList, title: 'Bullet list' },
    { icon: ListOrdered, onClick: handleNumberedList, title: 'Numbered list' },
    { icon: Table, onClick: handleTable, title: 'Table' },
    { type: 'divider' as const },
    { icon: Paperclip, onClick: () => {}, title: 'Attach file', disabled: true },
    { icon: LayoutPanelTop, onClick: handlePanel, title: 'Info panel' },
  ];

  return (
    <div className="border rounded-lg bg-card">
      {/* Formatting toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30">
        {toolbarButtons.map((btn, idx) =>
          btn.type === 'divider' ? (
            <div key={idx} className="w-px h-5 bg-border mx-1" />
          ) : (
            <Button
              key={idx}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={btn.onClick}
              disabled={btn.disabled || isSubmitting}
              title={btn.title}
            >
              <btn.icon className="h-4 w-4" />
            </Button>
          )
        )}
      </div>

      {/* Text area with agent suggestions */}
      <div className="relative">
        <AgentMentionSuggestions
          suggestions={filteredSuggestions}
          selectedIndex={selectedSuggestionIndex}
          onSelect={handleAgentSelect}
          onClose={() => setShowSuggestions(false)}
          onNavigate={handleNavigate}
          visible={showSuggestions}
        />
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleTextChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[120px] border-0 rounded-none focus-visible:ring-0 resize-none"
          disabled={isSubmitting}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20">
        {/* Internal note checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="internal-note"
            checked={isInternal}
            onCheckedChange={(checked) => setIsInternal(checked === true)}
            disabled={isSubmitting}
          />
          <Label
            htmlFor="internal-note"
            className={cn(
              "text-sm cursor-pointer select-none",
              isInternal ? "text-yellow-600 dark:text-yellow-400 font-medium" : "text-muted-foreground"
            )}
          >
            Make this an internal note
          </Label>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {showCloseButton && onSubmitAndClose && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmitAndClose}
              disabled={!content.trim() || isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Close issue
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!content.trim() || isSubmitting}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
