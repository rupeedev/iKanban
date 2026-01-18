import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useProjects } from '@/hooks/useProjects';
import { ProjectListPanel } from '@/components/settings/ProjectListPanel';
import { RepositoryPanel } from '@/components/settings/RepositoryPanel';
import type { Project } from 'shared/types';

export function ProjectSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('settings');

  // Fetch all projects
  const {
    projects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useProjects();

  // Selected project state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    searchParams.get('projectId')
  );

  // Handle project selection from left panel
  const handleSelectProject = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      setSearchParams({ projectId });
    },
    [setSearchParams]
  );

  // Get the selected project object
  const selectedProject: Project | null =
    projects.find((p) => p.id === selectedProjectId) ?? null;

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.projects.loading')}</span>
      </div>
    );
  }

  if (projectsError) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertDescription>
            {projectsError instanceof Error
              ? projectsError.message
              : t('settings.projects.loadError')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">
          {t('settings.projects.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('settings.projects.description')}
        </p>
      </div>

      {/* Split Panel Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left Panel - Project List */}
        <ResizablePanel
          defaultSize={30}
          minSize={20}
          maxSize={40}
          className="border-r"
        >
          <ProjectListPanel
            selectedProjectId={selectedProjectId}
            onSelectProject={handleSelectProject}
          />
        </ResizablePanel>

        {/* Resize Handle */}
        <ResizableHandle withHandle />

        {/* Right Panel - Repository Management */}
        <ResizablePanel defaultSize={70} minSize={50}>
          <RepositoryPanel project={selectedProject} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
