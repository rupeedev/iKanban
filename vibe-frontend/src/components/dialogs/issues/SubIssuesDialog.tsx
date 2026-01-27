import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Link2, X, Loader2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { teamsApi } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskWithAttemptStatus } from 'shared/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { showIssueFormDialog } from './IssueFormDialog';

export interface SubIssuesDialogProps {
  issueId: string;
  issueTitle: string;
  teamId: string;
  projectId?: string;
}

export type SubIssuesDialogResult = 'linked' | 'canceled';

// Status badge colors
const statusColors: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  inprogress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  inreview:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const SubIssuesDialogImpl = NiceModal.create(
  ({ issueId, issueTitle, teamId, projectId }: SubIssuesDialogProps) => {
    const modal = useModal();
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch all team issues to use for search/linking
    const { issues: teamIssues, isLoading: isLoadingTeamIssues } =
      useTeamIssues(teamId);

    // Fetch sub-issues for current issue
    const {
      data: subIssues = [],
      isLoading: isLoadingSubIssues,
      refetch: refetchSubIssues,
    } = useQuery({
      queryKey: ['subIssues', teamId, issueId],
      queryFn: () => teamsApi.getSubIssues(teamId, issueId),
      enabled: !!teamId && !!issueId,
    });

    // Mutation to link an issue as sub-issue
    const linkMutation = useMutation({
      mutationFn: (childIssueId: string) =>
        teamsApi.updateIssue(teamId, childIssueId, { parent_id: issueId }),
      onSuccess: () => {
        refetchSubIssues();
        queryClient.invalidateQueries({ queryKey: ['teamIssues', teamId] });
      },
    });

    // Mutation to unlink a sub-issue (set parent_id to null UUID to clear)
    const unlinkMutation = useMutation({
      mutationFn: (childIssueId: string) =>
        teamsApi.updateIssue(teamId, childIssueId, {
          parent_id: '00000000-0000-0000-0000-000000000000',
        }),
      onSuccess: () => {
        refetchSubIssues();
        queryClient.invalidateQueries({ queryKey: ['teamIssues', teamId] });
      },
    });

    // Filter out current issue and already-linked issues from search results
    const subIssueIds = useMemo(
      () => new Set(subIssues.map((i: TaskWithAttemptStatus) => i.id)),
      [subIssues]
    );

    // Filter issues that can be linked (not current, not already linked)
    const availableIssues = useMemo(() => {
      if (!teamIssues) return [];
      return teamIssues.filter((issue) => {
        // Exclude current issue
        if (issue.id === issueId) return false;
        // Exclude already linked sub-issues
        if (subIssueIds.has(issue.id)) return false;
        return true;
      });
    }, [teamIssues, issueId, subIssueIds]);

    // Filter by search query
    const filteredIssues = useMemo(() => {
      if (!searchQuery.trim()) return [];
      const query = searchQuery.toLowerCase();
      return availableIssues
        .filter(
          (issue) =>
            issue.title.toLowerCase().includes(query) ||
            (issue.issue_number && `#${issue.issue_number}`.includes(query)) ||
            issue.id.toLowerCase().includes(query)
        )
        .slice(0, 10); // Limit results
    }, [availableIssues, searchQuery]);

    const handleClose = useCallback(() => {
      modal.resolve('canceled' as SubIssuesDialogResult);
      modal.hide();
    }, [modal]);

    const handleLinkIssue = useCallback(
      async (childIssue: TaskWithAttemptStatus) => {
        await linkMutation.mutateAsync(childIssue.id);
        setSearchQuery('');
      },
      [linkMutation]
    );

    const handleUnlinkIssue = useCallback(
      async (childIssueId: string) => {
        await unlinkMutation.mutateAsync(childIssueId);
      },
      [unlinkMutation]
    );

    const handleCreateSubIssue = useCallback(async () => {
      if (!projectId) return;

      const result = await showIssueFormDialog({
        teamId,
        projectId,
        parentId: issueId,
        mode: 'create',
        title: 'Create Sub-issue',
      });

      if (result === 'created') {
        refetchSubIssues();
        queryClient.invalidateQueries({ queryKey: ['teamIssues', teamId] });
      }
    }, [teamId, projectId, issueId, refetchSubIssues, queryClient]);

    const isLoading = isLoadingTeamIssues || isLoadingSubIssues;
    const isMutating = linkMutation.isPending || unlinkMutation.isPending;

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
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for issues to link..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                disabled={isLoading}
              />
            </div>

            {/* Search results dropdown */}
            {searchQuery.trim() && filteredIssues.length > 0 && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {filteredIssues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => handleLinkIssue(issue)}
                    disabled={isMutating}
                    className={cn(
                      'w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-2',
                      'border-b last:border-b-0',
                      isMutating && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span className="text-muted-foreground text-xs">
                      #{issue.issue_number}
                    </span>
                    <span className="flex-1 truncate text-sm">
                      {issue.title}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn('text-xs', statusColors[issue.status])}
                    >
                      {issue.status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {/* No search results message */}
            {searchQuery.trim() &&
              filteredIssues.length === 0 &&
              !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No matching issues found
                </p>
              )}

            {/* Linked sub-issues list */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                Linked Sub-issues ({subIssues.length})
              </h4>
              {isLoadingSubIssues ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : subIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    No sub-issues linked yet
                  </p>
                </div>
              ) : (
                <div className="border rounded-md divide-y">
                  {subIssues.map((issue: TaskWithAttemptStatus) => (
                    <div
                      key={issue.id}
                      className="px-3 py-2 flex items-center gap-2"
                    >
                      <span className="text-muted-foreground text-xs">
                        #{issue.issue_number}
                      </span>
                      <span className="flex-1 truncate text-sm">
                        {issue.title}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn('text-xs', statusColors[issue.status])}
                      >
                        {issue.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleUnlinkIssue(issue.id)}
                        disabled={isMutating}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create sub-issue button */}
            {projectId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCreateSubIssue}
                disabled={isLoading || isMutating}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create new sub-issue
              </Button>
            )}
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
