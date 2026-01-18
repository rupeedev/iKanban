/**
 * MCP Key Reference Utilities
 *
 * Provides functionality to reference API keys stored in AI Provider Keys
 * within MCP server configurations using a secure reference syntax.
 *
 * Syntax: ${AI_KEY:provider_name}
 * Examples:
 *   - ${AI_KEY:openai} - References OpenAI API key
 *   - ${AI_KEY:anthropic} - References Anthropic/Claude API key
 *   - ${AI_KEY:google} - References Google/Gemini API key
 */

import type { JsonValue } from 'shared/types';

/**
 * Regex pattern to match AI key references
 * Matches: ${AI_KEY:provider_name}
 */
export const AI_KEY_REFERENCE_PATTERN = /\$\{AI_KEY:([a-z_]+)\}/gi;

/**
 * Supported AI providers that can be referenced
 */
export const SUPPORTED_PROVIDERS = ['anthropic', 'google', 'openai'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Information about a key reference found in configuration
 */
export interface KeyReference {
  /** The full reference string, e.g., "${AI_KEY:openai}" */
  fullMatch: string;
  /** The provider name, e.g., "openai" */
  provider: string;
  /** Whether the provider is valid/supported */
  isValid: boolean;
  /** Path in the JSON where the reference was found */
  path: string[];
}

/**
 * Result of analyzing a configuration for key references
 */
export interface KeyReferenceAnalysis {
  /** All key references found in the configuration */
  references: KeyReference[];
  /** Whether the configuration contains any key references */
  hasReferences: boolean;
  /** Unique providers referenced */
  referencedProviders: string[];
  /** Any invalid provider references */
  invalidReferences: KeyReference[];
}

/**
 * Check if a string contains an AI key reference
 */
export function containsKeyReference(value: string): boolean {
  AI_KEY_REFERENCE_PATTERN.lastIndex = 0;
  return AI_KEY_REFERENCE_PATTERN.test(value);
}

/**
 * Extract all key references from a string value
 */
export function extractKeyReferences(
  value: string,
  path: string[] = []
): KeyReference[] {
  const references: KeyReference[] = [];
  AI_KEY_REFERENCE_PATTERN.lastIndex = 0;

  let match;
  while ((match = AI_KEY_REFERENCE_PATTERN.exec(value)) !== null) {
    const provider = match[1].toLowerCase();
    references.push({
      fullMatch: match[0],
      provider,
      isValid: SUPPORTED_PROVIDERS.includes(provider as SupportedProvider),
      path,
    });
  }

  return references;
}

/**
 * Recursively analyze a JSON value for key references
 */
function analyzeValue(
  value: JsonValue,
  path: string[] = []
): KeyReference[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return extractKeyReferences(value, path);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      analyzeValue(item, [...path, `[${index}]`])
    );
  }

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, val]) =>
      val !== undefined ? analyzeValue(val, [...path, key]) : []
    );
  }

  return [];
}

/**
 * Analyze a configuration object for all key references
 */
export function analyzeConfigForKeyReferences(
  config: JsonValue
): KeyReferenceAnalysis {
  const references = analyzeValue(config);
  const referencedProviders = [...new Set(references.map((r) => r.provider))];
  const invalidReferences = references.filter((r) => !r.isValid);

  return {
    references,
    hasReferences: references.length > 0,
    referencedProviders,
    invalidReferences,
  };
}

/**
 * Create a key reference string for a given provider
 */
export function createKeyReference(provider: string): string {
  return `\${AI_KEY:${provider.toLowerCase()}}`;
}

/**
 * Get display name for a provider
 */
export function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    anthropic: 'Anthropic (Claude)',
    google: 'Google (Gemini)',
    openai: 'OpenAI (GPT)',
  };
  return displayNames[provider.toLowerCase()] || provider;
}

/**
 * Mask a key reference for display (security)
 * Instead of showing the actual key, show that it's a reference
 */
export function maskKeyReference(value: string): string {
  return value.replace(AI_KEY_REFERENCE_PATTERN, (_match, provider) => {
    return `[AI Key: ${getProviderDisplayName(provider)}]`;
  });
}

/**
 * Check if a server configuration uses any key references
 */
export function serverUsesKeyReferences(serverConfig: JsonValue): boolean {
  const analysis = analyzeConfigForKeyReferences(serverConfig);
  return analysis.hasReferences;
}

/**
 * Get key reference summary for a server
 */
export function getServerKeyReferenceSummary(
  serverConfig: JsonValue
): string | null {
  const analysis = analyzeConfigForKeyReferences(serverConfig);
  if (!analysis.hasReferences) {
    return null;
  }

  const providers = analysis.referencedProviders.map(getProviderDisplayName);
  if (providers.length === 1) {
    return `Uses ${providers[0]} key`;
  }
  return `Uses ${providers.join(', ')} keys`;
}
