import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader } from '@/components/ui/loader';
import { useDocuments } from '@/hooks/useDocuments';
import { useTeams } from '@/hooks/useTeams';
import { documentsApi } from '@/lib/api';
import { DocsHeader } from './DocsHeader';
import { DocsSidebar } from './DocsSidebar';
import { DocsContent } from './DocsContent';
import { useDocsNavigation } from './useDocsNavigation';
import type { ViewMode, NavItem } from './types';
import type { Document, DocumentContentResponse } from 'shared/types';

// Lazy load the manage mode component
const ManageMode = React.lazy(() => import('./ManageMode'));
import React from 'react';

export function DocumentsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { resolveTeam, isLoading: teamsLoading } = useTeams();
  const team = teamId ? resolveTeam(teamId) : null;
  const actualTeamId = team?.id || '';

  const { documents, folders, isLoading, error } = useDocuments(actualTeamId);

  // Navigation state
  const {
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
  } = useDocsNavigation(folders, documents);

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('reader');

  // Document content state
  const [docContent, setDocContent] = useState<DocumentContentResponse | null>(
    null
  );
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // Load document content when selection changes
  useEffect(() => {
    if (!selectedDocument || !teamId) {
      setDocContent(null);
      return;
    }

    setIsLoadingContent(true);

    documentsApi
      .getContent(teamId, selectedDocument.id)
      .then((content) => {
        setDocContent(content);
      })
      .catch((err) => {
        console.error('Failed to load document content:', err);
        // Fallback to stored content
        setDocContent({
          document_id: selectedDocument.id,
          content_type: 'text',
          content: selectedDocument.content || '',
          csv_data: null,
          file_path: selectedDocument.file_path,
          file_type: selectedDocument.file_type,
          mime_type: selectedDocument.mime_type,
        });
      })
      .finally(() => {
        setIsLoadingContent(false);
      });
  }, [selectedDocument, teamId]);

  // Handle document selection from sidebar
  const handleSelectDocument = useCallback(
    (item: NavItem) => {
      if (item.type === 'document' && item.document) {
        setSelectedDocId(item.slug || item.id);
      }
    },
    [setSelectedDocId]
  );

  // Handle search result selection
  const handleSearchSelect = useCallback(
    (doc: Document) => {
      setSelectedDocId(doc.slug || doc.id);
      setSearchQuery('');
    },
    [setSelectedDocId, setSearchQuery]
  );

  // Get file URL for viewers
  const fileUrl =
    selectedDocument && teamId
      ? documentsApi.getFileUrl(teamId, selectedDocument.id)
      : null;

  // Error state
  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load documents'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Loading state
  if (isLoading || teamsLoading) {
    return <Loader message="Loading documents..." size={32} className="py-8" />;
  }

  // Team not found
  if (!team) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Team not found</AlertTitle>
          <AlertDescription>
            The team you're looking for doesn't exist.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Manage mode - lazy loaded
  if (viewMode === 'manage') {
    return (
      <React.Suspense
        fallback={<Loader message="Loading..." size={32} className="py-8" />}
      >
        <ManageMode
          teamId={actualTeamId}
          teamName={team.name}
          teamIcon={team.icon ?? undefined}
          onViewModeChange={setViewMode}
        />
      </React.Suspense>
    );
  }

  // Reader mode - documentation view
  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs and search */}
      <DocsHeader
        teamName={team.name}
        teamIcon={team.icon ?? undefined}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        onSearchSelect={handleSearchSelect}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex">
        {/* Left sidebar */}
        <aside className="w-64 shrink-0 border-r overflow-y-auto bg-muted/30">
          <DocsSidebar
            items={navTree}
            activeCategory={activeCategory}
            selectedDocId={selectedDocId}
            expandedIds={expandedIds}
            onSelect={handleSelectDocument}
            onToggle={toggleExpanded}
          />
        </aside>

        {/* Content area */}
        <DocsContent
          document={selectedDocument}
          content={docContent}
          isLoading={isLoadingContent}
          fileUrl={fileUrl}
          className="flex-1"
        />
      </div>
    </div>
  );
}

export default DocumentsPage;
