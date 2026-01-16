import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tagsApi } from "@/lib/api";
import { CreateTag, Tag, UpdateTag } from "shared/types";

export function useTags(teamId?: string) {
  const queryClient = useQueryClient();

  const tagsQuery = useQuery({
    queryKey: ["tags", teamId],
    queryFn: () => tagsApi.list({ team_id: teamId }),
    // Cache for 5 minutes
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const createTagMutation = useMutation({
    mutationFn: (data: CreateTag) => tagsApi.create(data),
    onSuccess: (newTag) => {
      queryClient.setQueryData<Tag[]>(["tags", teamId], (old) => {
        if (!old) return [newTag];
        return [...old, newTag].sort((a, b) =>
          a.tag_name.localeCompare(b.tag_name)
        );
      });
      // Also invalidate the general tags query if teamId is specified
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: ["tags", undefined], refetchType: 'none' });
      }
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: ({ tagId, data }: { tagId: string; data: UpdateTag }) =>
      tagsApi.update(tagId, data),
    onSuccess: (updatedTag) => {
      queryClient.setQueryData<Tag[]>(["tags", teamId], (old) =>
        old?.map((t) => (t.id === updatedTag.id ? updatedTag : t)) ?? []
      );
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: string) => tagsApi.delete(tagId),
    onSuccess: (_, tagId) => {
      queryClient.setQueryData<Tag[]>(["tags", teamId], (old) =>
        old?.filter((t) => t.id !== tagId) ?? []
      );
      // Invalidate all task-tags queries since a tag was deleted
      queryClient.invalidateQueries({ queryKey: ["task-tags"], refetchType: 'none' });
    },
  });

  return {
    tags: tagsQuery.data ?? [],
    isLoading: tagsQuery.isLoading,
    error: tagsQuery.error,
    createTag: createTagMutation.mutateAsync,
    updateTag: updateTagMutation.mutateAsync,
    deleteTag: deleteTagMutation.mutateAsync,
    isCreating: createTagMutation.isPending,
    isUpdating: updateTagMutation.isPending,
    isDeleting: deleteTagMutation.isPending,
  };
}
