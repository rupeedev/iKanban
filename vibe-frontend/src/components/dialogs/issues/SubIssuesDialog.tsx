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
import { Plus, Search, Link2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeams } from '@/hooks/useTeams';
import { teamsApi } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskWithAttemptStatus } from 'shared/types';
import { showIssueFormDialog } from './IssueFormDialog';
import {
  StatusFilterTabs,
  AvailableIssuesList,
  LinkedSubIssuesList,
  STATUS_PRIORITY,
  type StatusFilter,
} from './SubIssuesComponents';

export interface SubIssuesDialogProps {
  issueId: string;
  issueTitle: string;
  teamId: string;
  projectId?: string;
}

export type SubIssuesDialogResult = 'linked' | 'canceled';

const SubIssuesDialogImpl = NiceModal.create(
  ({ issueId, issueTitle, teamId, projectId }: SubIssuesDialogProps) => {
    const modal = useModal();
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const { teamsById } = useTeams();
    const team = teamsById[teamId];
    const teamPrefix =
      team?.identifier || team?.name?.slice(0, 3).toUpperCase() || '';

    const { issues: teamIssues, isLoading: isLoadingTeamIssues } =
      useTeamIssues(teamId);

    const {
      data: subIssues = [],
      isLoading: isLoadingSubIssues,
      refetch: refetchSubIssues,
    } = useQuery({
      queryKey: ['subIssues', teamId, issueId],
      queryFn: () => teamsApi.getSubIssues(teamId, issueId),
      enabled: !!teamId && !!issueId,
    });

    const linkMutation = useMutation({
      mutationFn: (childIssueId: string) =>
        teamsApi.updateIssue(teamId, childIssueId, { parent_id: issueId }),
      onSuccess: () => {
        refetchSubIssues();
        queryClient.invalidateQueries({ queryKey: ['teamIssues', teamId] });
      },
    });

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

    const subIssueIds = useMemo(
      () => new Set(subIssues.map((i: TaskWithAttemptStatus) => i.id)),
      [subIssues]
    );

    // Smart sort: active work (todo/inprogress) first for Epic management
    const availableIssues = useMemo(() => {
      if (!teamIssues) return [];
      return teamIssues
        .filter((issue) => {
          if (issue.id === issueId) return false;
          if (subIssueIds.has(issue.id)) return false;
          return true;
        })
        .sort((a, b) => {
          const priorityA = STATUS_PRIORITY[a.status] ?? 5;
          const priorityB = STATUS_PRIORITY[b.status] ?? 5;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
    }, [teamIssues, issueId, subIssueIds]);

    const getIssueKey = useCallback(
      (issue: TaskWithAttemptStatus) => {
        if (!issue.issue_number) return '';
        return teamPrefix
          ? `${teamPrefix}-${issue.issue_number}`
          : `#${issue.issue_number}`;
      },
      [teamPrefix]
    );

    // Filter by status, then by search (25 issues for Epic management)
    const filteredIssues = useMemo(() => {
      const query = searchQuery.trim().toLowerCase();
      let filtered = availableIssues;

      if (statusFilter !== 'all') {
        filtered = filtered.filter((issue) => issue.status === statusFilter);
      }

      if (query) {
        filtered = filtered.filter((issue) => {
          const issueKey = getIssueKey(issue).toLowerCase();
          return (
            issue.title.toLowerCase().includes(query) ||
            issueKey.includes(query) ||
            (issue.issue_number && `#${issue.issue_number}`.includes(query)) ||
            (issue.issue_number && `${issue.issue_number}`.includes(query)) ||
            issue.id.toLowerCase().includes(query)
          );
        });
      }

      return filtered.slice(0, 25);
    }, [availableIssues, searchQuery, statusFilter, getIssueKey]);

    const handleClose = useCallback(() => {
      modal.resolve('canceled' as SubIssuesDialogResult);
      modal.hide();
    }, [modal]);

    const handleLinkIssue = useCallback(
      async (childIssue: TaskWithAttemptStatus) => {
        await linkMutation.mutateAsync(childIssue.id);
        setSearchQuery('');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(childIssue.id);
          return next;
        });
      },
      [linkMutation]
    );

    const toggleSelection = useCallback((id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);

    const toggleSelectAll = useCallback(() => {
      const visibleIds = filteredIssues.map((i) => i.id);
      const allSelected = visibleIds.every((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) =>
          allSelected ? next.delete(id) : next.add(id)
        );
        return next;
      });
    }, [filteredIssues, selectedIds]);

    const handleBulkLink = useCallback(async () => {
      for (const id of Array.from(selectedIds)) {
        await linkMutation.mutateAsync(id);
      }
      setSelectedIds(new Set());
      setSearchQuery('');
    }, [selectedIds, linkMutation]);

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

    const handleFilterChange = useCallback((filter: StatusFilter) => {
      setStatusFilter(filter);
      setSelectedIds(new Set());
    }, []);

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

            <StatusFilterTabs
              statusFilter={statusFilter}
              onFilterChange={handleFilterChange}
            />

            <AvailableIssuesList
              issues={filteredIssues}
              selectedIds={selectedIds}
              isMutating={isMutating}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              getIssueKey={getIssueKey}
              onToggleSelection={toggleSelection}
              onToggleSelectAll={toggleSelectAll}
              onLinkIssue={handleLinkIssue}
              onBulkLink={handleBulkLink}
            />

            {searchQuery.trim() &&
              filteredIssues.length === 0 &&
              !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No matching issues found
                </p>
              )}
            {!searchQuery.trim() &&
              filteredIssues.length === 0 &&
              !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No available issues to link
                </p>
              )}

            <LinkedSubIssuesList
              subIssues={subIssues}
              isLoading={isLoadingSubIssues}
              isMutating={isMutating}
              getIssueKey={getIssueKey}
              onUnlink={handleUnlinkIssue}
            />

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

export function showSubIssuesDialog(
  props: SubIssuesDialogProps
): Promise<SubIssuesDialogResult> {
  return SubIssuesDialog.show(props);
}
