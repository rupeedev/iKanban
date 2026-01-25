import { useMemo, useCallback } from 'react';
import { useUserSystem } from '@/components/ConfigProvider';
import type {
  ExecutorProfileId,
  BaseCodingAgent,
  ExecutorConfig,
} from 'shared/types';

export interface AgentMention {
  trigger: string;
  executor: BaseCodingAgent;
  variant: string | null;
  displayName: string;
  available: boolean;
}

/** Execution location for agent tasks (IKA-145) */
export type ExecutionLocation = 'local' | 'remote';

interface ParsedMention {
  agent: AgentMention | null;
  cleanPrompt: string;
}

/** Enhanced multi-mention parser result (IKA-145) */
export interface ParsedMentions {
  agent: AgentMention | null;
  location: ExecutionLocation;
  cleanPrompt: string;
}

// Special agent that uses GitHub Copilot Workspace API (IKA-93)
const COPILOT_MENTION: AgentMention = {
  trigger: '@copilot',
  executor: 'COPILOT' as BaseCodingAgent,
  variant: null,
  displayName: 'GitHub Copilot',
  available: true, // Always available if GitHub is connected
};

// Special agent that uses Claude Code Action (IKA-171)
// Note: 'CLAUDE' is a special value for GitHub integration, not a local executor
const CLAUDE_EXECUTOR = 'CLAUDE' as unknown as BaseCodingAgent;
const CLAUDE_MENTION: AgentMention = {
  trigger: '@claude',
  executor: CLAUDE_EXECUTOR,
  variant: null,
  displayName: 'Claude Code',
  available: true, // Always available if GitHub is connected with Claude Code Action
};

// Special agent that uses Gemini CLI via GitHub Action (NEW)
const GEMINI_EXECUTOR = 'GEMINI' as unknown as BaseCodingAgent;
const GEMINI_MENTION: AgentMention = {
  trigger: '@gemini',
  executor: GEMINI_EXECUTOR,
  variant: null,
  displayName: 'Google Gemini',
  available: true,
};

/**
 * Check if an agent mention is the special Copilot integration
 * Copilot uses a different flow - creates GitHub Issue instead of local workspace
 */
export function isCopilotMention(agent: AgentMention | null): boolean {
  return agent?.executor === 'COPILOT';
}

/**
 * Check if an agent mention is the special Claude integration (IKA-171)
 * Claude uses a different flow - creates GitHub Issue and triggers Claude Code Action
 */
export function isClaudeMention(agent: AgentMention | null): boolean {
  return (agent?.executor as unknown as string) === 'CLAUDE';
}

/**
 * Check if an agent mention is the special Gemini integration
 * Gemini uses a different flow - creates GitHub Issue and triggers Gemini CLI Action
 */
export function isGeminiMention(agent: AgentMention | null): boolean {
  return (agent?.executor as unknown as string) === 'GEMINI';
}

// Whitelist of allowed agents for @mentions
// Only these agents will appear in the mention dropdown
const ALLOWED_PROFILE_AGENTS = new Set(['GEMINI', 'CODEX']);

// Map of common @mention triggers to executor profiles
function buildAgentMentions(
  profiles: Record<string, ExecutorConfig> | null
): AgentMention[] {
  const mentions: AgentMention[] = [];

  // Always add the special Copilot mention (uses GitHub Copilot Workspace API)
  mentions.push(COPILOT_MENTION);

  // Always add the special Claude mention (uses Claude Code Action - IKA-171)
  mentions.push(CLAUDE_MENTION);

  // Always add the special Gemini mention
  mentions.push(GEMINI_MENTION);

  if (!profiles) return mentions;

  for (const [executor, config] of Object.entries(profiles)) {
    // Skip COPILOT, CLAUDE, and GEMINI since we handle them specially
    if (
      executor === 'COPILOT' ||
      executor === 'CLAUDE' ||
      executor === 'GEMINI'
    )
      continue;

    // Only include whitelisted agents
    if (!ALLOWED_PROFILE_AGENTS.has(executor)) continue;

    // Add base agent mention (e.g., @gemini, @codex)
    const baseTrigger = `@${executor.toLowerCase().replace(/_/g, '-')}`;
    mentions.push({
      trigger: baseTrigger,
      executor: executor as BaseCodingAgent,
      variant: null,
      displayName: executor.replace(/_/g, ' '),
      available: true,
    });

    // Add variant mentions if available (e.g., @gemini-pro)
    if (config && typeof config === 'object' && 'configs' in config) {
      const configs = config.configs as Record<string, unknown> | undefined;
      if (configs) {
        for (const variant of Object.keys(configs)) {
          if (variant.toLowerCase() !== 'default') {
            const variantTrigger = `${baseTrigger}-${variant.toLowerCase()}`;
            mentions.push({
              trigger: variantTrigger,
              executor: executor as BaseCodingAgent,
              variant,
              displayName: `${executor.replace(/_/g, ' ')} (${variant})`,
              available: true,
            });
          }
        }
      }
    }
  }

  return mentions.sort((a, b) => a.trigger.localeCompare(b.trigger));
}

export function useAgentMentions() {
  const { profiles, config } = useUserSystem();

  const agentMentions = useMemo(() => buildAgentMentions(profiles), [profiles]);

  const defaultProfile: ExecutorProfileId | null = useMemo(() => {
    return config?.executor_profile ?? null;
  }, [config?.executor_profile]);

  const filterMentions = useCallback(
    (searchTerm: string): AgentMention[] => {
      if (!searchTerm) return agentMentions;
      const lowerSearch = searchTerm.toLowerCase();
      return agentMentions.filter(
        (m) =>
          m.trigger.toLowerCase().includes(lowerSearch) ||
          m.displayName.toLowerCase().includes(lowerSearch)
      );
    },
    [agentMentions]
  );

  const parseMentions = useCallback(
    (text: string): ParsedMention => {
      // Find @mentions in the text
      const mentionRegex = /@[\w-]+/g;
      const matches = text.match(mentionRegex);

      if (!matches || matches.length === 0) {
        return { agent: null, cleanPrompt: text.trim() };
      }

      // Use the first @mention found
      const mention = matches[0].toLowerCase();
      const matchedAgent = agentMentions.find(
        (m) => m.trigger.toLowerCase() === mention
      );

      // Remove all @mentions from the prompt
      const cleanPrompt = text.replace(mentionRegex, '').trim();

      return {
        agent: matchedAgent || null,
        cleanPrompt,
      };
    },
    [agentMentions]
  );

  /**
   * Parse all @mentions including agent and location (IKA-145)
   * Supports: @claude @local fix the bug
   * Returns: { agent, location: 'local'|'remote', cleanPrompt }
   */
  const parseAllMentions = useCallback(
    (text: string): ParsedMentions => {
      const mentionRegex = /@[\w-]+/g;
      const matches = text.match(mentionRegex) || [];

      let agent: AgentMention | null = null;
      let location: ExecutionLocation = 'remote'; // default

      for (const match of matches) {
        const mention = match.toLowerCase();

        // Check for location mentions
        if (mention === '@local') {
          location = 'local';
          continue;
        }
        if (mention === '@remote') {
          location = 'remote';
          continue;
        }

        // Check if it's an agent mention (only use first agent found)
        if (!agent) {
          const matchedAgent = agentMentions.find(
            (m) => m.trigger.toLowerCase() === mention
          );
          if (matchedAgent) {
            agent = matchedAgent;
          }
        }
      }

      // Remove all @mentions from the prompt
      const cleanPrompt = text.replace(mentionRegex, '').trim();

      return { agent, location, cleanPrompt };
    },
    [agentMentions]
  );

  const resolveMentionToProfile = useCallback(
    (mention: AgentMention | null): ExecutorProfileId | null => {
      if (!mention) return defaultProfile;
      return {
        executor: mention.executor,
        variant: mention.variant,
      };
    },
    [defaultProfile]
  );

  const getMentionPosition = useCallback(
    (
      text: string,
      cursorPosition: number
    ): { start: number; searchTerm: string } | null => {
      // Find if we're currently in an @mention
      const beforeCursor = text.slice(0, cursorPosition);
      const atIndex = beforeCursor.lastIndexOf('@');

      if (atIndex === -1) return null;

      // Check if there's a space between @ and cursor
      const textAfterAt = beforeCursor.slice(atIndex + 1);
      if (textAfterAt.includes(' ')) return null;

      return {
        start: atIndex,
        searchTerm: textAfterAt,
      };
    },
    []
  );

  return {
    agentMentions,
    defaultProfile,
    filterMentions,
    parseMentions,
    parseAllMentions,
    resolveMentionToProfile,
    getMentionPosition,
  };
}
