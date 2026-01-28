import { useState } from 'react';
import { FileText, Link as LinkIcon, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskDocumentLinks } from '@/hooks/useTaskDocumentLinks';
import { useNavigateWithSearch } from '@/hooks';
import { LinkDocumentsDialog } from '@/components/dialogs/issues/LinkDocumentsDialog';

interface IssueLinkedDocumentsProps {
  issueId: string;
  teamId?: string;
}

export function IssueLinkedDocuments({
  issueId,
  teamId,
}: IssueLinkedDocumentsProps) {
  const navigate = useNavigateWithSearch();
  const [showLinkDocsDialog, setShowLinkDocsDialog] = useState(false);

  const {
    links: linkedDocuments,
    isLoading: linksLoading,
    linkDocuments,
    unlinkDocument,
    isLinking,
    isUnlinking,
  } = useTaskDocumentLinks(issueId);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {linkedDocuments.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {linkedDocuments.length}
            </Badge>
          )}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setShowLinkDocsDialog(true)}
          disabled={!teamId}
        >
          <LinkIcon className="h-3 w-3" />
          Link
        </Button>
      </div>
      {linksLoading ? (
        <div className="space-y-1">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-md border bg-muted/10">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : linkedDocuments.length === 0 ? (
        <div
          className="text-sm text-muted-foreground italic p-2 border rounded-md bg-muted/20 cursor-pointer hover:bg-muted/40"
          onClick={() => teamId && setShowLinkDocsDialog(true)}
        >
          No documents linked yet. Click to add.
        </div>
      ) : (
        <div className="space-y-1">
          {linkedDocuments.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between p-2 rounded-md border bg-muted/10 hover:bg-muted/30 group cursor-pointer"
              onClick={() =>
                teamId &&
                navigate(`/teams/${teamId}/documents?doc=${link.document_id}`)
              }
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate text-indigo-600 dark:text-indigo-400 hover:underline">
                    {link.document_title}
                  </p>
                  {link.folder_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {link.folder_name}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  unlinkDocument(link.document_id);
                }}
                disabled={isUnlinking}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Link Documents Dialog */}
      {teamId && (
        <LinkDocumentsDialog
          open={showLinkDocsDialog}
          onOpenChange={setShowLinkDocsDialog}
          teamId={teamId}
          existingLinks={linkedDocuments}
          onLink={linkDocuments}
          isLinking={isLinking}
        />
      )}
    </div>
  );
}
