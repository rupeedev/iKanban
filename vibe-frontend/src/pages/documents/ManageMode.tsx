import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Folder,
  FileText,
  FolderPlus,
  ChevronRight,
  Search,
  Pin,
  Trash2,
  ArrowLeft,
  LayoutGrid,
  List,
  GripVertical,
  Loader2,
  Upload,
  Download,
  BookOpen,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDocuments } from '@/hooks/useDocuments';
import { documentsApi } from '@/lib/api';
import type { Document, DocumentFolder, UploadResult } from 'shared/types';
import type { ViewMode } from './types';

interface ManageModeProps {
  teamId: string;
  teamName: string;
  teamIcon?: string;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ManageMode({
  teamId,
  teamName,
  teamIcon,
  onViewModeChange,
}: ManageModeProps) {
  const {
    documents,
    folders,
    currentFolderId,
    setCurrentFolderId,
    createDocument,
    updateDocument,
    deleteDocument,
    createFolder,
    deleteFolder,
    refresh,
  } = useDocuments(teamId);

  // State
  const [isCreateDocOpen, setIsCreateDocOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Breadcrumb path
  const breadcrumbs = useMemo(() => {
    const path: DocumentFolder[] = [];
    if (!currentFolderId) return path;

    let folderId: string | null = currentFolderId;
    while (folderId) {
      const folder = folders.find((f) => f.id === folderId);
      if (folder) {
        path.unshift(folder);
        folderId = folder.parent_id;
      } else {
        break;
      }
    }
    return path;
  }, [folders, currentFolderId]);

  // Filter items for current folder
  const currentFolders = useMemo(() => {
    return folders.filter((f) => f.parent_id === currentFolderId);
  }, [folders, currentFolderId]);

  // Helper to get document title (API returns 'name' but frontend type expects 'title')
  const getDocTitle = useCallback((doc: Document): string => {
    return (
      (doc as unknown as { name?: string }).name || doc.title || 'Untitled'
    );
  }, []);

  const currentDocuments = useMemo(() => {
    if (searchQuery) {
      return documents.filter((d) =>
        getDocTitle(d).toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return documents.filter((d) => d.folder_id === currentFolderId);
  }, [documents, currentFolderId, searchQuery, getDocTitle]);

  // Handlers
  const handleCreateDocument = useCallback(async () => {
    if (!newDocTitle.trim()) return;
    try {
      await createDocument({
        title: newDocTitle,
        content: newDocContent || null,
        folder_id: currentFolderId,
        file_type: 'markdown',
        icon: null,
        file_path: null,
        file_size: null,
        mime_type: null,
        storage_provider: null,
        storage_key: null,
      });
      setIsCreateDocOpen(false);
      setNewDocTitle('');
      setNewDocContent('');
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  }, [newDocTitle, newDocContent, currentFolderId, createDocument]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder({
        name: newFolderName,
        parent_id: currentFolderId,
        icon: null,
        color: null,
        local_path: null,
      });
      setIsCreateFolderOpen(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [newFolderName, currentFolderId, createFolder]);

  const handleNavigateToFolder = useCallback(
    (folderId: string | null) => {
      setCurrentFolderId(folderId);
      setSearchQuery('');
    },
    [setCurrentFolderId]
  );

  const handleDeleteDocument = useCallback(
    async (docId: string) => {
      try {
        await deleteDocument(docId);
      } catch (err) {
        console.error('Failed to delete document:', err);
      }
    },
    [deleteDocument]
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await deleteFolder(folderId);
      } catch (err) {
        console.error('Failed to delete folder:', err);
      }
    },
    [deleteFolder]
  );

  const handleDownloadDocument = useCallback(
    async (doc: Document) => {
      if (doc.file_path?.startsWith('http')) {
        window.open(doc.file_path, '_blank');
      } else {
        const fileUrl = documentsApi.getFileUrl(teamId, doc.id);
        window.open(fileUrl, '_blank');
      }
    },
    [teamId]
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setIsUploading(true);
      setUploadResult(null);
      try {
        const formData = new FormData();
        if (currentFolderId) formData.append('folder_id', currentFolderId);
        for (const file of files) formData.append('files[]', file);
        const result = await documentsApi.upload(teamId, formData);
        setUploadResult(result);
        if (result.uploaded > 0) refresh();
      } catch (err) {
        console.error('Failed to upload files:', err);
        setUploadResult({
          uploaded: 0,
          skipped: 0,
          errors: ['Upload failed. Please try again.'],
          uploaded_titles: [],
        });
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [teamId, currentFolderId, refresh]
  );

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, docId: string) => {
    e.dataTransfer.setData('text/plain', docId);
    setDraggedDocId(docId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedDocId(null);
    setDragOverFolderId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverFolderId(folderId);
  }, []);

  const handleDragLeave = useCallback(() => setDragOverFolderId(null), []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetFolderId: string) => {
      e.preventDefault();
      const docId = e.dataTransfer.getData('text/plain');
      if (!docId) return;
      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;
      try {
        await updateDocument(doc.id, {
          folder_id: targetFolderId,
          title: getDocTitle(doc),
          content: doc.content,
          icon: doc.icon,
          is_pinned: doc.is_pinned,
          is_archived: doc.is_archived,
          position: doc.position,
        });
      } catch (err) {
        console.error('Failed to move document:', err);
      }
      setDraggedDocId(null);
      setDragOverFolderId(null);
    },
    [documents, updateDocument, getDocTitle]
  );

  // File drop zone
  const handleDragEnterZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  }, []);

  const handleDragLeaveZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX >= rect.right ||
      e.clientY < rect.top ||
      e.clientY >= rect.bottom
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDropFiles = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length === 0) return;
      setIsUploading(true);
      setUploadResult(null);
      try {
        const formData = new FormData();
        if (currentFolderId) formData.append('folder_id', currentFolderId);
        for (const file of files) formData.append('files[]', file);
        const result = await documentsApi.upload(teamId, formData);
        setUploadResult(result);
        if (result.uploaded > 0) refresh();
      } catch (err) {
        console.error('Failed to upload files:', err);
        setUploadResult({
          uploaded: 0,
          skipped: 0,
          errors: ['Upload failed.'],
          uploaded_titles: [],
        });
      } finally {
        setIsUploading(false);
      }
    },
    [teamId, currentFolderId, refresh]
  );

  const hasContent = currentFolders.length > 0 || currentDocuments.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewModeChange('reader')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Reader
            </Button>
            <span className="text-xl">{teamIcon || '📁'}</span>
            <h1 className="text-lg font-semibold">
              {teamName} - Manage Documents
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept=".md,.txt,.pdf,.csv,.json,.xml,.html,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg"
              onChange={handleFileUpload}
            />
            <Button
              variant="default"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="ml-1">Upload</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateFolderOpen(true)}
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              Folder
            </Button>
            <Button size="sm" onClick={() => setIsCreateDocOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Document
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewModeChange('reader')}
              title="Reader mode"
            >
              <BookOpen className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div
            className={`mt-2 text-sm ${uploadResult.errors.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {uploadResult.uploaded > 0 && (
              <span>
                Uploaded {uploadResult.uploaded} file
                {uploadResult.uploaded !== 1 ? 's' : ''}
              </span>
            )}
            {uploadResult.skipped > 0 && (
              <span>
                {uploadResult.uploaded > 0 ? ', ' : ''}Skipped{' '}
                {uploadResult.skipped}
              </span>
            )}
            {uploadResult.errors.length > 0 && (
              <span className="text-destructive">
                {' '}
                Errors: {uploadResult.errors.join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
          <button
            onClick={() => handleNavigateToFolder(null)}
            className="hover:text-foreground"
          >
            Documents
          </button>
          {breadcrumbs.map((folder) => (
            <div key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4" />
              <button
                onClick={() => handleNavigateToFolder(folder.id)}
                className="hover:text-foreground"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search and view toggle */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-r-none"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-l-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 min-h-0 overflow-auto p-4 relative"
        onDragEnter={handleDragEnterZone}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragLeave={handleDragLeaveZone}
        onDrop={handleDropFiles}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="border-2 border-dashed border-primary rounded-lg p-12 text-center">
              <Upload className="h-12 w-12 mx-auto text-primary mb-4" />
              <p className="text-lg font-medium">Drop files here</p>
            </div>
          </div>
        )}

        {!hasContent && !searchQuery ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents yet</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateFolderOpen(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create Folder
                </Button>
                <Button onClick={() => setIsCreateDocOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Document
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                : 'space-y-2'
            }
          >
            {/* Folders */}
            {currentFolders.map((folder) => (
              <div
                key={folder.id}
                className={`${viewMode === 'grid' ? 'flex flex-col items-center p-4 rounded-lg border hover:bg-accent cursor-pointer group text-center' : 'flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer group'} ${dragOverFolderId === folder.id ? 'ring-2 ring-primary bg-primary/10' : ''}`}
                onClick={() => handleNavigateToFolder(folder.id)}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, folder.id)}
              >
                {viewMode === 'grid' ? (
                  <>
                    <Folder className="h-12 w-12 text-blue-500 mb-2" />
                    <span className="font-medium text-sm truncate w-full">
                      {folder.name}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Folder className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">{folder.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFolder(folder.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}

            {/* Documents */}
            {currentDocuments.map((doc) => (
              <div
                key={doc.id}
                draggable
                onDragStart={(e) => handleDragStart(e, doc.id)}
                onDragEnd={handleDragEnd}
                className={`${viewMode === 'grid' ? 'flex flex-col items-center p-4 rounded-lg border hover:bg-accent cursor-pointer group text-center' : 'flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer group'} ${draggedDocId === doc.id ? 'opacity-50' : ''}`}
              >
                {viewMode === 'grid' ? (
                  <>
                    <FileText className="h-12 w-12 text-gray-500 mb-2" />
                    <span className="font-medium text-sm truncate w-full">
                      {getDocTitle(doc)}
                    </span>
                    {doc.is_pinned && (
                      <Pin className="h-3 w-3 text-amber-500" />
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {getDocTitle(doc)}
                          </span>
                          {doc.is_pinned && (
                            <Pin className="h-3 w-3 text-amber-500" />
                          )}
                          <span className="text-xs text-muted-foreground uppercase">
                            {doc.file_type}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => handleDownloadDocument(doc)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {searchQuery && currentDocuments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No documents found matching "{searchQuery}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Document Dialog */}
      <Dialog open={isCreateDocOpen} onOpenChange={setIsCreateDocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Document</DialogTitle>
            <DialogDescription>
              Create a new markdown document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>
            <div>
              <Label htmlFor="doc-content">Content (optional)</Label>
              <Textarea
                id="doc-content"
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="Start writing..."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDocOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateDocument}
              disabled={!newDocTitle.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a folder to organize documents.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateFolderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ManageMode;
