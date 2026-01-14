import { TagChip } from './TagChip';
import { TagSelector } from './TagSelector';
import { useTaskTags } from '@/hooks/useTaskTags';
import { Loader2, Tag as TagIcon } from 'lucide-react';

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
    addTag,
    removeTag,
    isAdding,
    isRemoving,
  } = useTaskTags(taskId);

  const handleAddTag = async (tagId: string) => {
    try {
      await addTag(tagId);
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      await removeTag(tagId);
    } catch (err) {
      console.error('Failed to remove tag:', err);
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
