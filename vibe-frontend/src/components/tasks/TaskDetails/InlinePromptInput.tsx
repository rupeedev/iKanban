import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SendHorizonal, Loader2, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import {
  useAgentMentions,
  isCopilotMention,
  isClaudeMention,
  isGeminiMention,
  type AgentMention,
} from '@/hooks/useAgentMentions';
import { useAssignToCopilot } from '@/hooks/useCopilotAssignment';
import { useAssignToClaude } from '@/hooks/useClaudeAssignment';
import { useAssignToGemini } from '@/hooks/useGeminiAssignment';
import { useRepoBranchSelection } from '@/hooks/useRepoBranchSelection';
import { useProjectRepos, useNavigateWithSearch } from '@/hooks';
import { useProject } from '@/contexts/ProjectContext';
import { useTaskComments } from '@/hooks/useTaskComments';
import { useClerkUser } from '@/hooks/auth/useClerkAuth';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { paths } from '@/lib/paths';
import { AgentMentionSuggestions } from './AgentMentionSuggestions';
import { cn } from '@/lib/utils';

interface InlinePromptInputProps {
  taskId: string;
  teamId?: string;
  onAttemptCreated?: (workspaceId: string) => void;
  onCommentCreated?: () => void;
  className?: string;
}

export function InlinePromptInput({
  taskId,
  teamId,
  onAttemptCreated,
  onCommentCreated,
  className,
}: InlinePromptInputProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State
  const [promptText, setPromptText] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // User and team member hooks for comment authorship
  const { user } = useClerkUser();
  const { members } = useTeamMembers(teamId);

  // Extract user info from Clerk user
  const currentUser = useMemo(() => {
    if (!user) {
      return { id: null, name: 'Unknown', email: '' };
    }
    const userEmail = user.primaryEmailAddress?.emailAddress || '';
    const userName =
      user.fullName || user.firstName || userEmail.split('@')[0] || 'Unknown';
    const matchingMember = members?.find((m) => m.email === userEmail);
    return {
      id: matchingMember?.id ?? null,
      name: matchingMember?.display_name || userName,
      email: userEmail,
    };
  }, [user, members]);

  // Comment creation hook
  const { createComment, isCreating: isCreatingComment } =
    useTaskComments(taskId);

  // Hooks
  const {
    filterMentions,
    parseAllMentions,
    resolveMentionToProfile,
    getMentionPosition,
  } = useAgentMentions();

  const { data: projectRepos = [] } = useProjectRepos(projectId);

  const { getWorkspaceRepoInputs } = useRepoBranchSelection({
    repos: projectRepos,
    enabled: projectRepos.length > 0,
  });

  const { createAttempt, isCreating, error } = useAttemptCreation({
    taskId,
    onSuccess: (attempt) => {
      onAttemptCreated?.(attempt.id);
      if (projectId) {
        navigate(paths.attempt(projectId, taskId, attempt.id));
      }
    },
  });

  // Copilot assignment hook (IKA-93: GitHub Copilot Integration)
  const { mutateAsync: assignToCopilot, isPending: isAssigningCopilot } =
    useAssignToCopilot({
      onSuccess: () => {
        toast.success('Task assigned to Copilot', {
          description: 'GitHub issue will be created and processed.',
        });
        onCommentCreated?.();
      },
      onError: (error) => {
        console.error('Failed to assign to Copilot:', error);
        toast.error('Failed to assign to Copilot', {
          description: error.message || 'Please check GitHub connection.',
        });
      },
    });

  // Claude assignment hook (IKA-171: Claude Code Action Integration)
  const { mutateAsync: assignToClaude, isPending: isAssigningClaude } =
    useAssignToClaude({
      onSuccess: () => {
        toast.success('Task assigned to Claude', {
          description: 'GitHub issue will be created and processed.',
        });
        onCommentCreated?.();
      },
      onError: (error) => {
        console.error('Failed to assign to Claude:', error);
        toast.error('Failed to assign to Claude', {
          description: error.message || 'Please check GitHub connection.',
        });
      },
    });

  // Gemini assignment hook (NEW)
  const { mutateAsync: assignToGemini, isPending: isAssigningGemini } =
    useAssignToGemini({
      onSuccess: () => {
        toast.success('Task assigned to Gemini', {
          description: 'GitHub issue will be created and processed.',
        });
        onCommentCreated?.();
      },
      onError: (error) => {
        console.error('Failed to assign to Gemini:', error);
        toast.error('Failed to assign to Gemini', {
          description: error.message || 'Please check GitHub connection.',
        });
      },
    });

  // Get current mention state
  const mentionState = getMentionPosition(promptText, cursorPosition);
  const filteredSuggestions = mentionState
    ? filterMentions(mentionState.searchTerm)
    : [];

  // Show suggestions when typing @
  useEffect(() => {
    setShowSuggestions(mentionState !== null && filteredSuggestions.length > 0);
    setSelectedSuggestionIndex(0);
  }, [mentionState, filteredSuggestions.length]);

  // Handle text change
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPromptText(e.target.value);
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
      const beforeMention = promptText.slice(0, mentionState.start);
      const afterMention = promptText.slice(cursorPosition);
      const newText = `${beforeMention}${agent.trigger} ${afterMention}`;

      setPromptText(newText);
      setShowSuggestions(false);

      // Focus back to textarea and set cursor after the inserted mention
      const newCursorPos = mentionState.start + agent.trigger.length + 1;
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPosition(newCursorPos);
      }, 0);
    },
    [promptText, cursorPosition, mentionState]
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

  // Handle form submission - supports simple comments, AI agent prompts, @copilot, and @claude
  const handleSubmit = useCallback(async () => {
    if (
      !promptText.trim() ||
      isCreating ||
      isCreatingComment ||
      isAssigningCopilot ||
      isAssigningClaude ||
      isAssigningGemini
    )
      return;

    // Use memoized parse result (IKA-145: agent + location parsing)
    const { agent, location, cleanPrompt } = parseAllMentions(promptText);

    if (!cleanPrompt) {
      // Empty prompt after removing @mentions
      return;
    }

    // CASE 1: No @mention → Simple comment only
    if (!agent) {
      try {
        await createComment({
          content: promptText.trim(),
          is_internal: false,
          author_name: currentUser.name,
          author_email: currentUser.email,
          author_id: currentUser.id,
        });
        toast.success('Comment added');
        setPromptText('');
        onCommentCreated?.();
      } catch (err) {
        console.error('Failed to create comment:', err);
        toast.error('Failed to add comment');
      }
      return;
    }

    // CASE 2: @copilot mention → Comment + Copilot Assignment (GitHub Issue)
    if (isCopilotMention(agent)) {
      // First create the comment
      try {
        await createComment({
          content: promptText.trim(),
          is_internal: false,
          author_name: currentUser.name,
          author_email: currentUser.email,
          author_id: currentUser.id,
        });
      } catch (err) {
        console.error('Failed to create comment:', err);
        toast.error('Failed to add comment');
        return;
      }

      // Then assign to Copilot (creates GitHub Issue)
      try {
        await assignToCopilot({
          taskId,
          data: { prompt: cleanPrompt },
        });
        setPromptText('');
      } catch (err) {
        // Error is handled by onError callback
        setPromptText('');
      }
      return;
    }

    // CASE 2.5: @claude mention → Comment + Claude Assignment (GitHub Issue) (IKA-171)
    if (isClaudeMention(agent)) {
      // First create the comment
      try {
        await createComment({
          content: promptText.trim(),
          is_internal: false,
          author_name: currentUser.name,
          author_email: currentUser.email,
          author_id: currentUser.id,
        });
      } catch (err) {
        console.error('Failed to create comment:', err);
        toast.error('Failed to add comment');
        return;
      }

      // Then assign to Claude (creates GitHub Issue with @claude mention)
      try {
        await assignToClaude({
          taskId,
          data: { prompt: cleanPrompt },
        });
        setPromptText('');
      } catch (err) {
        // Error is handled by onError callback
        setPromptText('');
      }
      return;
    }

    // CASE 2.7: @gemini mention → Comment + Gemini Assignment (GitHub Issue)
    if (isGeminiMention(agent)) {
      // First create the comment
      try {
        await createComment({
          content: promptText.trim(),
          is_internal: false,
          author_name: currentUser.name,
          author_email: currentUser.email,
          author_id: currentUser.id,
        });
      } catch (err) {
        console.error('Failed to create comment:', err);
        toast.error('Failed to add comment');
        return;
      }

      // Then assign to Gemini (creates GitHub Issue with @gemini mention)
      try {
        await assignToGemini({
          taskId,
          data: { prompt: cleanPrompt },
        });
        setPromptText('');
      } catch (err) {
        // Error is handled by onError callback
        setPromptText('');
      }
      return;
    }

    // CASE 3: Other @mention → Comment + Local AI attempt
    // First create the comment
    try {
      await createComment({
        content: promptText.trim(),
        is_internal: false,
        author_name: currentUser.name,
        author_email: currentUser.email,
        author_id: currentUser.id,
      });
    } catch (err) {
      console.error('Failed to create comment:', err);
      toast.error('Failed to add comment');
      return;
    }

    // Then try to create AI attempt
    if (projectRepos.length === 0) {
      toast.info('Comment saved', {
        description:
          'AI agent requires a project with repositories configured.',
      });
      setPromptText('');
      onCommentCreated?.();
      return;
    }

    const profile = resolveMentionToProfile(agent);
    if (!profile) {
      toast.info('Comment saved', {
        description: `Agent "${agent.displayName}" is not available. Check your AI provider keys.`,
      });
      setPromptText('');
      onCommentCreated?.();
      return;
    }

    try {
      const repos = getWorkspaceRepoInputs();
      await createAttempt({
        profile,
        repos,
        prompt: cleanPrompt,
        executionLocation: location,
      });
      setPromptText('');
    } catch (err) {
      console.error('Failed to create AI attempt:', err);
      toast.error('Failed to start AI agent', {
        description: 'Comment was saved. Please try again.',
      });
      setPromptText('');
    }
  }, [
    promptText,
    isCreating,
    isCreatingComment,
    isAssigningCopilot,
    isAssigningClaude,
    isAssigningGemini,
    parseAllMentions,
    createComment,
    currentUser,
    onCommentCreated,
    taskId,
    assignToCopilot,
    assignToClaude,
    assignToGemini,
    projectRepos.length,
    resolveMentionToProfile,
    getWorkspaceRepoInputs,
    createAttempt,
  ]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // If suggestions are shown, let AgentMentionSuggestions handle navigation
      if (showSuggestions) {
        if (
          ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)
        ) {
          return; // Let the suggestions component handle these
        }
      }

      // Submit on Cmd/Ctrl + Enter
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showSuggestions, handleSubmit]
  );

  // Parse current prompt to show which agent and location will be used (IKA-145)
  const parsedPrompt = useMemo(
    () => parseAllMentions(promptText),
    [parseAllMentions, promptText]
  );
  const { agent: selectedAgent, location: selectedLocation } = parsedPrompt;

  // Only show agent indicator if there's an @mention (not for simple comments)
  const showAgentIndicator = selectedAgent !== null;

  // Can submit if there's text and not currently loading
  // No longer requires projectRepos for simple comments (only needed for AI)
  const canSubmit =
    promptText.trim().length > 0 &&
    !isCreating &&
    !isCreatingComment &&
    !isAssigningCopilot &&
    !isAssigningClaude &&
    !isAssigningGemini;

  return (
    <div className={cn('relative', className)}>
      {/* Agent and location indicator - only shown when @mention is detected (IKA-145) */}
      {showAgentIndicator && selectedAgent && (
        <div className="flex items-center gap-2 mb-1 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Bot className="h-3 w-3" />
            <span>{selectedAgent.displayName}</span>
          </div>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              selectedLocation === 'local'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            )}
          >
            {selectedLocation === 'local' ? 'Local' : 'Remote'}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="relative flex gap-2 items-end">
        <div className="relative flex-1">
          {/* Suggestions dropdown */}
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
            value={promptText}
            onChange={handleTextChange}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            placeholder={t(
              'inlinePrompt.placeholder',
              'Type a message or @agent to use AI...'
            )}
            className="min-h-[60px] max-h-[200px] resize-none pr-2"
            disabled={
              isCreating ||
              isCreatingComment ||
              isAssigningCopilot ||
              isAssigningClaude ||
              isAssigningGemini
            }
            data-testid="inline-prompt-input"
          />
        </div>

        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-10 w-10 flex-shrink-0"
          data-testid="inline-prompt-submit"
        >
          {isCreating ||
          isCreatingComment ||
          isAssigningCopilot ||
          isAssigningClaude ||
          isAssigningGemini ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Hint text */}
      <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
        <span>{t('inlinePrompt.hint', 'Cmd+Enter to submit')}</span>
        {error && (
          <span className="text-destructive">
            {t('inlinePrompt.error', 'Failed to create attempt')}
          </span>
        )}
      </div>
    </div>
  );
}
