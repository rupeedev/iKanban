import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Document, DocumentFolder } from 'shared/types';
import type { NavItem } from './types';

/**
 * Get display name for a document with smart fallbacks.
 * Priority: title > slug (humanized) > file_path filename > "Untitled Document"
 */
function getDocumentDisplayName(doc: Document): string {
  // 1. Use title if non-empty
  if (doc.title && doc.title.trim()) {
    return doc.title;
  }

  // 2. Use slug, converted to readable format
  if (doc.slug) {
    // Convert slug like "my-document-name" to "My Document Name"
    return doc.slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // 3. Use file_path filename
  if (doc.file_path) {
    // Extract filename from path, remove extension
    const filename = doc.file_path.split('/').pop() || '';
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    if (nameWithoutExt) {
      // Convert underscores/dashes to spaces, capitalize
      return nameWithoutExt
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }

  // 4. Fallback
  return 'Untitled Document';
}

interface UseDocsNavigationResult {
  navTree: NavItem[];
  categories: NavItem[];
  activeCategory: NavItem | null;
  setActiveCategory: (category: NavItem | null) => void;
  selectedDocId: string | null;
  setSelectedDocId: (id: string | null) => void;
  selectedDocument: Document | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: Document[];
}

/**
 * Builds a navigation tree from flat folders and documents
 */
function buildNavTree(
  folders: DocumentFolder[],
  documents: Document[]
): NavItem[] {
  const folderMap = new Map<string, NavItem>();
  const rootItems: NavItem[] = [];

  // Create folder nodes
  folders.forEach((folder) => {
    const node: NavItem = {
      id: folder.id,
      name: folder.name ?? 'Untitled Folder',
      type: 'folder',
      parentId: folder.parent_id,
      children: [],
      folder,
    };
    folderMap.set(folder.id, node);
  });

  // Add documents to their folders
  documents.forEach((doc) => {
    const docNode: NavItem = {
      id: doc.id,
      name: getDocumentDisplayName(doc),
      type: 'document',
      slug: doc.slug ?? undefined,
      parentId: doc.folder_id,
      children: [],
      document: doc,
    };

    if (doc.folder_id && folderMap.has(doc.folder_id)) {
      folderMap.get(doc.folder_id)!.children.push(docNode);
    } else {
      rootItems.push(docNode);
    }
  });

  // Build folder hierarchy
  folderMap.forEach((node) => {
    if (node.parentId && folderMap.has(node.parentId)) {
      folderMap.get(node.parentId)!.children.push(node);
    } else if (!node.parentId) {
      rootItems.push(node);
    }
  });

  // Sort: folders first, then documents, alphabetically
  const sortChildren = (items: NavItem[]): NavItem[] => {
    return items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      // Defensive: handle undefined names
      const aName = a.name ?? '';
      const bName = b.name ?? '';
      return aName.localeCompare(bName);
    });
  };

  const sortRecursive = (items: NavItem[]): NavItem[] => {
    return sortChildren(items).map((item) => ({
      ...item,
      children: sortRecursive(item.children),
    }));
  };

  return sortRecursive(rootItems);
}

// Helper to find root folder of a document
function findRootFolder(
  folderId: string,
  folders: DocumentFolder[]
): string | null {
  let currentId = folderId;
  let iterations = 0;
  const maxIterations = 100;

  while (iterations < maxIterations) {
    const folder = folders.find((f) => f.id === currentId);
    if (!folder) return null;
    if (!folder.parent_id) return currentId;
    currentId = folder.parent_id;
    iterations++;
  }

  return null;
}

/**
 * Hook for managing documentation navigation state
 */
export function useDocsNavigation(
  folders: DocumentFolder[],
  documents: Document[]
): UseDocsNavigationResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<NavItem | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Use ref to track if we've already expanded for this document
  const lastExpandedDocRef = useRef<string | null>(null);

  // Get selected doc from URL
  const selectedDocId = searchParams.get('doc');

  // Build full navigation tree
  const navTree = useMemo(
    () => buildNavTree(folders, documents),
    [folders, documents]
  );

  // Extract top-level folders as categories
  const categories = useMemo(
    () => navTree.filter((item) => item.type === 'folder'),
    [navTree]
  );

  // Find selected document
  const selectedDocument = useMemo(() => {
    if (!selectedDocId) return null;
    return (
      documents.find(
        (d) => d.id === selectedDocId || d.slug === selectedDocId
      ) ?? null
    );
  }, [selectedDocId, documents]);

  // Auto-select first category on mount
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
      setExpandedIds(new Set([categories[0].id]));
    }
  }, [categories, activeCategory]);

  // Auto-expand parent folders when a document is selected
  useEffect(() => {
    if (!selectedDocument?.folder_id) return;
    // Skip if we already expanded for this document
    if (lastExpandedDocRef.current === selectedDocument.id) return;
    lastExpandedDocRef.current = selectedDocument.id;

    setExpandedIds((prev) => {
      const toExpand = new Set(prev);
      let folderId: string | null = selectedDocument.folder_id;

      // Walk up the folder tree and expand all parents
      while (folderId) {
        toExpand.add(folderId);
        const folder = folders.find((f) => f.id === folderId);
        folderId = folder?.parent_id ?? null;
      }
      return toExpand;
    });

    // Set active category to root folder
    const rootFolderId = findRootFolder(selectedDocument.folder_id, folders);
    if (rootFolderId) {
      const category = categories.find((c) => c.id === rootFolderId);
      if (category) setActiveCategory(category);
    }
  }, [selectedDocument, folders, categories]);

  // Set selected document ID
  const setSelectedDocId = useCallback(
    (id: string | null) => {
      if (id) {
        setSearchParams({ doc: id }, { replace: true });
      } else {
        searchParams.delete('doc');
        setSearchParams(searchParams, { replace: true });
      }
    },
    [searchParams, setSearchParams]
  );

  // Toggle folder expansion
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(query) ||
        doc.content?.toLowerCase().includes(query)
    );
  }, [searchQuery, documents]);

  return {
    navTree,
    categories,
    activeCategory,
    setActiveCategory,
    selectedDocId,
    setSelectedDocId,
    selectedDocument,
    expandedIds,
    toggleExpanded,
    searchQuery,
    setSearchQuery,
    searchResults,
  };
}
