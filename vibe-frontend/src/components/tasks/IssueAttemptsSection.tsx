import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/ui/table';
import { CreateAttemptDialog } from '@/components/dialogs/tasks/CreateAttemptDialog';
import { InlinePromptInput } from '@/components/tasks/TaskDetails/InlinePromptInput';
import { useTaskAttemptsWithSessions } from '@/hooks/useTaskAttempts';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import type { WorkspaceWithSession } from '@/types/attempt';

interface IssueAttemptsSectionProps {
  issueId: string;
  projectId: string;
  teamId?: string;
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const absSec = Math.round(Math.abs(diffMs) / 1000);

  const rtf =
    typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'
      ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
      : null;

  const to = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    rtf ? rtf.format(-value, unit) : `${value} ${unit}${value !== 1 ? 's' : ''} ago`;

  if (absSec < 60) return to(Math.round(absSec), 'second');
  const mins = Math.round(absSec / 60);
  if (mins < 60) return to(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return to(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return to(days, 'day');
  const months = Math.round(days / 30);
  if (months < 12) return to(months, 'month');
  const years = Math.round(months / 12);
  return to(years, 'year');
}

const attemptColumns: ColumnDef<WorkspaceWithSession>[] = [
  {
    id: 'executor',
    header: '',
    accessor: (attempt) => attempt.session?.executor || 'Base Agent',
    className: 'pr-4',
  },
  {
    id: 'branch',
    header: '',
    accessor: (attempt) => attempt.branch || '—',
    className: 'pr-4',
  },
  {
    id: 'time',
    header: '',
    accessor: (attempt) => formatTimeAgo(attempt.created_at),
    className: 'pr-0 text-right',
  },
];

export function IssueAttemptsSection({ issueId, projectId, teamId }: IssueAttemptsSectionProps) {
  const navigate = useNavigateWithSearch();

  const {
    data: attempts = [],
    isLoading: isAttemptsLoading,
    isError: isAttemptsError,
  } = useTaskAttemptsWithSessions(issueId);

  const displayedAttempts = useMemo(
    () =>
      [...attempts].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [attempts]
  );

  const handleRowClick = (attempt: WorkspaceWithSession) => {
    if (projectId && issueId) {
      navigate(paths.attempt(projectId, issueId, attempt.id));
    }
  };

  const handleCreateAttempt = () => {
    CreateAttemptDialog.show({ taskId: issueId });
  };

  return (
    <div className="space-y-4">
      {/* ATTEMPTS Section */}
      <div>
        {isAttemptsLoading ? (
          <div className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/20">
            Loading attempts...
          </div>
        ) : isAttemptsError ? (
          <div className="text-sm text-destructive p-2 border rounded-md bg-destructive/10">
            Error loading attempts
          </div>
        ) : (
          <DataTable
            data={displayedAttempts}
            columns={attemptColumns}
            keyExtractor={(attempt) => attempt.id}
            onRowClick={handleRowClick}
            emptyState="No attempts yet"
            headerContent={
              <div className="w-full flex items-center">
                <span className="flex-1 font-semibold uppercase text-xs tracking-wide">
                  ATTEMPTS ({displayedAttempts.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleCreateAttempt}
                  data-testid="create-attempt-button"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            }
          />
        )}
      </div>

      {/* Inline Prompt Input - handles both comments and AI prompts */}
      <InlinePromptInput taskId={issueId} teamId={teamId} data-testid="issue-inline-prompt" />
    </div>
  );
}
