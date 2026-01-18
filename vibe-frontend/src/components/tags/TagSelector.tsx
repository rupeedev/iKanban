import { useState } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTags } from '@/hooks/useTags';
import { TagChip } from './TagChip';
import type { Tag } from 'shared/types';

interface TagSelectorProps {
  teamId?: string;
  selectedTagIds: string[];
  onTagSelect: (tagId: string) => void;
  onTagCreate?: (name: string) => Promise<Tag | null>;
  disabled?: boolean;
}

export function TagSelector({
  teamId,
  selectedTagIds,
  onTagSelect,
  onTagCreate,
  disabled = false,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { tags, isLoading, createTag, isCreating } = useTags(teamId);

  const availableTags = tags.filter((tag) => !selectedTagIds.includes(tag.id));
  const filteredTags = availableTags.filter((tag) =>
    tag.tag_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (tagId: string) => {
    onTagSelect(tagId);
    setOpen(false);
    setSearch('');
  };

  const handleCreateTag = async () => {
    if (!search.trim()) return;

    try {
      if (onTagCreate) {
        const newTag = await onTagCreate(search.trim());
        if (newTag) {
          onTagSelect(newTag.id);
        }
      } else {
        const newTag = await createTag({
          tag_name: search.trim(),
          content: '',
          team_id: teamId,
          color: '#6B7280',
        });
        onTagSelect(newTag.id);
      }
      setSearch('');
      setOpen(false);
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
  };

  const showCreateOption =
    search.trim() &&
    !tags.some((t) => t.tag_name.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-7 text-xs gap-1"
          disabled={disabled}
        >
          <Plus className="h-3 w-3" />
          Add Tag
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search tags..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading tags...
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {showCreateOption ? (
                    <div className="py-2 px-2">
                      <span className="text-muted-foreground text-sm">
                        No tags found
                      </span>
                    </div>
                  ) : (
                    'No tags available'
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {filteredTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.tag_name}
                      onSelect={() => handleSelect(tag.id)}
                    >
                      <TagChip
                        name={tag.tag_name}
                        color={tag.color}
                        className="mr-2"
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
                {showCreateOption && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={handleCreateTag}
                        disabled={isCreating}
                        className="gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Create &quot;{search}&quot;
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
