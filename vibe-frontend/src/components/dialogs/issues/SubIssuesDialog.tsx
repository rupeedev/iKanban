import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Link2, AlertCircle } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface SubIssuesDialogProps {
  issueId: string;
  issueTitle: string;
  teamId?: string;
}

export type SubIssuesDialogResult = 'linked' | 'canceled';

const SubIssuesDialogImpl = NiceModal.create(
  ({ issueTitle }: SubIssuesDialogProps) => {
    const modal = useModal();
    const [searchQuery, setSearchQuery] = useState('');

    const handleClose = useCallback(() => {
      modal.resolve('canceled' as SubIssuesDialogResult);
      modal.hide();
    }, [modal]);

    const handleCreateSubIssue = useCallback(() => {
      // TODO: Implement when backend supports parent_id
      // For now, show alert that this is coming soon
    }, []);

    return (
      <Dialog open={modal.visible} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Add Sub-issues
            </DialogTitle>
            <DialogDescription>
              Link existing issues or create new sub-issues for "{issueTitle}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Coming soon alert */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Sub-issue linking is coming soon. This feature will allow you to
                create hierarchical issue relationships and track progress
                across related tasks.
              </AlertDescription>
            </Alert>

            {/* Search input - disabled for now */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for issues to link..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                disabled
              />
            </div>

            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-muted p-3 mb-3">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                No sub-issues linked yet
              </p>
              <Button variant="outline" disabled onClick={handleCreateSubIssue}>
                <Plus className="h-4 w-4 mr-2" />
                Create sub-issue
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export const SubIssuesDialog = defineModal<
  SubIssuesDialogProps,
  SubIssuesDialogResult
>(SubIssuesDialogImpl);

// Convenience function to show the dialog
export function showSubIssuesDialog(
  props: SubIssuesDialogProps
): Promise<SubIssuesDialogResult> {
  return SubIssuesDialog.show(props);
}
