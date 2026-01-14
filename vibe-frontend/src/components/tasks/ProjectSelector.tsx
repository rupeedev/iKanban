import { useState } from 'react';
import { Check, ChevronsUpDown, FolderKanban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTeamProjects } from '@/hooks/useTeamProjects';
import { tasksApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ProjectSelectorProps {
  taskId: string;
  currentProjectId: string;
  teamId: string;
  onMoved?: () => Promise<void>;
  disabled?: boolean;
}

export function ProjectSelector({
  taskId,
  currentProjectId,
  teamId,
  onMoved,
  disabled = false,
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const { projects, isLoading } = useTeamProjects(teamId);

  const currentProject = projects.find((p) => p.id === currentProjectId);

  const handleSelect = async (projectId: string) => {
    if (projectId === currentProjectId) {
      setOpen(false);
      return;
    }

    setIsMoving(true);
    try {
      await tasksApi.move(taskId, projectId);
      if (onMoved) await onMoved();
      setOpen(false);
    } catch (err) {
      console.error('Failed to move task:', err);
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FolderKanban className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Project</h3>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled || isMoving}
          >
            <span className="truncate">
              {currentProject?.name || 'Select project...'}
            </span>
            {isMoving ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search projects..." />
            <CommandList>
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading projects...
                </div>
              ) : (
                <>
                  <CommandEmpty>No projects found</CommandEmpty>
                  <CommandGroup>
                    {projects.map((project) => (
                      <CommandItem
                        key={project.id}
                        value={project.name}
                        onSelect={() => handleSelect(project.id)}
                        disabled={project.id === currentProjectId}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            currentProjectId === project.id
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <span
                          className={cn(
                            currentProjectId === project.id && 'font-medium'
                          )}
                        >
                          {project.name}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
