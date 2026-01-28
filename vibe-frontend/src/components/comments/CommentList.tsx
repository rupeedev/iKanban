import { Skeleton } from '@/components/ui/skeleton';
import { CommentItem } from './CommentItem';
import type { TaskComment } from 'shared/types';

/** Skeleton loader for comments - shows animated placeholders instead of "Loading..." */
function CommentSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/30">
          {/* Avatar skeleton */}
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            {/* Name and date */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            {/* Comment text lines */}
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface CommentListProps {
  comments: TaskComment[];
  isLoading?: boolean;
  onUpdate: (
    commentId: string,
    content: string,
    isInternal: boolean
  ) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  /** Callback to refresh agent status for @copilot/@claude comments */
  onRefreshAgentStatus?: () => void;
  isUpdating?: boolean;
  isDeleting?: boolean;
  /** Whether an agent status refresh is in progress */
  isRefreshingAgentStatus?: boolean;
}

export function CommentList({
  comments,
  isLoading = false,
  onUpdate,
  onDelete,
  onRefreshAgentStatus,
  isUpdating = false,
  isDeleting = false,
  isRefreshingAgentStatus = false,
}: CommentListProps) {
  // Show skeleton loader instead of "Loading comments..." text
  if (isLoading) {
    return <CommentSkeleton />;
  }

  if (comments.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No comments yet. Be the first to comment!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment.id} className="group">
          <CommentItem
            comment={comment}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onRefreshAgentStatus={onRefreshAgentStatus}
            isUpdating={isUpdating}
            isDeleting={isDeleting}
            isRefreshingAgentStatus={isRefreshingAgentStatus}
          />
        </div>
      ))}
    </div>
  );
}
