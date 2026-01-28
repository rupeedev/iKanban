import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeams } from '@/hooks/useTeams';
import { useTags } from '@/hooks/useTags';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHeaderCell,
  TableHead,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tag as TagIcon,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Tag } from 'shared/types';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Default preset colors for labels
const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#6B7280', // Gray
];

export function IssueLabelsSettings() {
  const { t } = useTranslation('settings');
  const { teams, isLoading: teamsLoading } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const {
    tags,
    isLoading: tagsLoading,
    createTag,
    updateTag,
    deleteTag,
  } = useTags(selectedTeamId);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  // Form states
  const [tagName, setTagName] = useState('');
  const [tagDescription, setTagDescription] = useState('');
  const [tagColor, setTagColor] = useState('#6B7280');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set initial selected team
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  const resetForm = () => {
    setTagName('');
    setTagDescription('');
    setTagColor('#6B7280');
    setError(null);
  };

  const handleCreateOpen = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const handleEditOpen = (tag: Tag) => {
    setSelectedTag(tag);
    setTagName(tag.tag_name);
    setTagDescription(tag.content || '');
    setTagColor(tag.color || '#6B7280');
    setError(null);
    setIsEditOpen(true);
  };

  const handleDeleteOpen = (tag: Tag) => {
    setSelectedTag(tag);
    setIsDeleteOpen(true);
  };

  const handleCreate = async () => {
    if (!selectedTeamId || !tagName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await createTag({
        team_id: selectedTeamId,
        tag_name: tagName.trim(),
        content: tagDescription.trim(),
        color: tagColor,
      });
      setIsCreateOpen(false);
      toast.success(
        t('settings.labels.createSuccess', 'Label created successfully')
      );
    } catch (err) {
      setError(t('settings.labels.createError', 'Failed to create label'));
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTag || !tagName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await updateTag({
        tagId: selectedTag.id,
        data: {
          tag_name: tagName.trim(),
          content: tagDescription.trim() || null,
          color: tagColor,
        },
      });
      setIsEditOpen(false);
      toast.success(
        t('settings.labels.updateSuccess', 'Label updated successfully')
      );
    } catch (err) {
      setError(t('settings.labels.updateError', 'Failed to update label'));
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTag) return;

    setIsSubmitting(true);
    try {
      await deleteTag(selectedTag.id);
      setIsDeleteOpen(false);
      toast.success(
        t('settings.labels.deleteSuccess', 'Label deleted successfully')
      );
    } catch (err) {
      toast.error(t('settings.labels.deleteError', 'Failed to delete label'));
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (teamsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TagIcon className="h-5 w-5" />
                {t('settings.labels.title', 'Issue Labels')}
              </CardTitle>
              <CardDescription>
                {t(
                  'settings.labels.description',
                  'Manage labels used for categorizing issues in your teams.'
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="team-select" className="shrink-0">
                {t('settings.labels.selectTeam', 'Select Team:')}
              </Label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger className="w-[250px]" id="team-select">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name} ({team.identifier})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleCreateOpen} disabled={!selectedTeamId}>
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.labels.newLabel', 'New Label')}
            </Button>
          </div>

          {!selectedTeamId ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t(
                  'settings.labels.noTeamSelected',
                  'Please select a team to manage its labels.'
                )}
              </AlertDescription>
            </Alert>
          ) : tagsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/20">
              <TagIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {t('settings.labels.noTags', 'No labels found for this team.')}
              </p>
              <Button
                variant="link"
                onClick={handleCreateOpen}
                className="mt-2"
              >
                {t('settings.labels.createFirst', 'Create your first label')}
              </Button>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>
                      {t('settings.labels.table.name', 'Name')}
                    </TableHeaderCell>
                    <TableHeaderCell>
                      {t('settings.labels.table.description', 'Description')}
                    </TableHeaderCell>
                    <TableHeaderCell className="w-[100px] text-right">
                      {t('settings.labels.table.actions', 'Actions')}
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tags.map((tag) => (
                    <TableRow key={tag.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: tag.color || '#6B7280' }}
                          />
                          <span className="font-medium">{tag.tag_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {tag.content || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditOpen(tag)}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteOpen(tag)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {t('settings.labels.create.title', 'Create Label')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'settings.labels.create.description',
                'Add a new label to organize issues.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="create-name">
                {t('settings.labels.form.name', 'Name')}
              </Label>
              <Input
                id="create-name"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Bug, Feature, etc."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-description">
                {t('settings.labels.form.description', 'Description')}
              </Label>
              <Input
                id="create-description"
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.labels.form.color', 'Color')}</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-6 h-6 rounded-full border border-background transition-transform hover:scale-110 ${
                      tagColor === color
                        ? 'ring-2 ring-primary ring-offset-2'
                        : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setTagColor(color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="w-8 h-8 rounded border shrink-0"
                  style={{ backgroundColor: tagColor }}
                />
                <Input
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  placeholder="#000000"
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!tagName.trim() || isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {t('settings.labels.edit.title', 'Edit Label')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.labels.edit.description', 'Update label details.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="edit-name">
                {t('settings.labels.form.name', 'Name')}
              </Label>
              <Input
                id="edit-name"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">
                {t('settings.labels.form.description', 'Description')}
              </Label>
              <Input
                id="edit-description"
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.labels.form.color', 'Color')}</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-6 h-6 rounded-full border border-background transition-transform hover:scale-110 ${
                      tagColor === color
                        ? 'ring-2 ring-primary ring-offset-2'
                        : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setTagColor(color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="w-8 h-8 rounded border shrink-0"
                  style={{ backgroundColor: tagColor }}
                />
                <Input
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!tagName.trim() || isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.labels.delete.title', 'Delete Label?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'settings.labels.delete.confirmation',
                'Are you sure you want to delete "{{name}}"? This action cannot be undone and will remove this label from all issues.',
                { name: selectedTag?.tag_name }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
