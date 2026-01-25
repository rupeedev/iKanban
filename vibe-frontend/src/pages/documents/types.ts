import type { Document, DocumentFolder } from 'shared/types';

// Navigation tree node type
export interface NavItem {
  id: string;
  name: string;
  type: 'folder' | 'document';
  slug?: string;
  parentId: string | null;
  children: NavItem[];
  document?: Document;
  folder?: DocumentFolder;
}

// Document content state
export interface DocumentState {
  document: Document | null;
  content: string;
  isLoading: boolean;
  error: string | null;
}

// Search result type
export interface SearchResult {
  document: Document;
  matchContext: string;
}

// View mode
export type ViewMode = 'reader' | 'manage';
