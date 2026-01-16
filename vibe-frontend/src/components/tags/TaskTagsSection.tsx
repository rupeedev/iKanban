import { TagChip } from './TagChip';
import { TagSelector } from './TagSelector';
import { useTaskTags } from '@/hooks/useTaskTags';
import { Loader2, Tag as TagIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TaskTagsSectionProps {
  taskId: string;
  teamId?: string;
  editable?: boolean;
}

export function TaskTagsSection({
  taskId,
  teamId,
  editable = true,
}: TaskTagsSectionProps) {
  const {
    tags,
    isLoading,
    error,
    refetch,
    addTag,
    removeTag,
    isAdding,
    isRemoving,
  } = useTaskTags(taskId);

  const handleAddTag = async (tagId: string) => {
    try {
      await addTag(tagId);
      toast.success('Tag added successfully');
    } catch (err) {
      console.error('Failed to add tag:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to add tag');
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      await removeTag(tagId);
      toast.success('Tag removed successfully');
    } catch (err) {
      console.error('Failed to remove tag:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to remove tag');
    }
  };

  const selectedTagIds = tags.map((t) => t.tag_id);
  const isProcessing = isAdding || isRemoving;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TagIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Tags</h3>
        {isProcessing && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tags...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load tags</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-destructive underline"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.tag_name}
              color={tag.color}
              removable={editable}
              onRemove={() => handleRemoveTag(tag.tag_id)}
            />
          ))}
          {editable && (
            <TagSelector
              teamId={teamId}
              selectedTagIds={selectedTagIds}
              onTagSelect={handleAddTag}
              disabled={isProcessing}
            />
          )}
          {!editable && tags.length === 0 && (
            <span className="text-sm text-muted-foreground italic">
              No tags
            </span>
          )}
        </div>
      )}
    </div>
  );
}
