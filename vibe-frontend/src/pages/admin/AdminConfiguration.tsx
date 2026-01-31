import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  Globe,
  Mail,
  Clock,
  Users,
  Shield,
  Github,
  Bell,
  Lock,
  AlertCircle,
  Loader2,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  useAdminConfiguration,
  useAdminConfigurationMutations,
} from '@/hooks/useAdmin';
import { AdminConfiguration } from '@/lib/api';
import { toast } from 'sonner';

function ConfigSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdminConfiguration() {
  const { currentWorkspaceId } = useWorkspace();
  const {
    data: configData,
    isLoading,
    error,
  } = useAdminConfiguration(currentWorkspaceId ?? undefined);
  const { updateConfiguration, isUpdating } = useAdminConfigurationMutations(
    currentWorkspaceId ?? undefined
  );

  const [config, setConfig] = useState<AdminConfiguration | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync with server data
  useEffect(() => {
    if (configData) {
      setConfig(configData);
      setHasChanges(false);
    }
  }, [configData]);

  const handleChange = (field: keyof AdminConfiguration, value: string | number | boolean) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      await updateConfiguration(config);
      toast.success('Configuration saved successfully');
      setHasChanges(false);
    } catch (err) {
      toast.error('Failed to save configuration');
    }
  };

  const handleReset = () => {
    if (configData) {
      setConfig(configData);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Configuration</h2>
          <p className="text-sm text-muted-foreground">
            System settings and preferences
          </p>
        </div>
        <ConfigSkeleton />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Configuration</h2>
          <p className="text-sm text-muted-foreground">
            System settings and preferences
          </p>
        </div>
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Failed to load configuration
              </p>
              <p className="text-sm text-muted-foreground">
                {error?.message || 'Unable to fetch configuration'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Configuration</h2>
          <p className="text-sm text-muted-foreground">
            System settings and preferences
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={handleReset} disabled={isUpdating}>
              Reset
            </Button>
          )}
          <Button onClick={handleSave} disabled={!hasChanges || isUpdating}>
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>General Settings</CardTitle>
          </div>
          <CardDescription>Basic workspace configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">Application Name</Label>
            <Input
              id="app-name"
              value={config.app_name}
              onChange={(e) => handleChange('app_name', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="language">
                <Globe className="h-4 w-4 inline mr-2" />
                Default Language
              </Label>
              <Select
                value={config.default_language}
                onValueChange={(value) => handleChange('default_language', value)}
              >
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">
                <Clock className="h-4 w-4 inline mr-2" />
                Timezone
              </Label>
              <Select
                value={config.timezone}
                onValueChange={(value) => handleChange('timezone', value)}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Europe/Paris">Paris</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-email">
              <Mail className="h-4 w-4 inline mr-2" />
              Support Email
            </Label>
            <Input
              id="support-email"
              type="email"
              value={config.support_email}
              onChange={(e) => handleChange('support_email', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Workspace Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Workspace Settings</CardTitle>
          </div>
          <CardDescription>Default workspace configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-color">Default Workspace Color</Label>
              <Input
                id="workspace-color"
                type="color"
                value={config.default_workspace_color}
                onChange={(e) => handleChange('default_workspace_color', e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-role">Default Member Role</Label>
              <Select
                value={config.default_member_role}
                onValueChange={(value) => handleChange('default_member_role', value)}
              >
                <SelectTrigger id="default-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-members">Max Members per Workspace</Label>
            <Input
              id="max-members"
              type="number"
              min="1"
              max="1000"
              value={config.max_members_per_workspace}
              onChange={(e) =>
                handleChange('max_members_per_workspace', parseInt(e.target.value))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-create Project</Label>
              <p className="text-sm text-muted-foreground">
                Automatically create a default project for new workspaces
              </p>
            </div>
            <Switch
              checked={config.auto_create_project}
              onCheckedChange={(checked) => handleChange('auto_create_project', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* GitHub Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            <CardTitle>GitHub Integration</CardTitle>
          </div>
          <CardDescription>GitHub repository integration settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable GitHub Integration</Label>
              <p className="text-sm text-muted-foreground">
                Allow GitHub repository connections
              </p>
            </div>
            <Switch
              checked={config.github_enabled}
              onCheckedChange={(checked) => handleChange('github_enabled', checked)}
            />
          </div>
          {config.github_enabled && (
            <div className="space-y-2">
              <Label htmlFor="github-org">GitHub Organization</Label>
              <Input
                id="github-org"
                value={config.github_org}
                onChange={(e) => handleChange('github_org', e.target.value)}
                placeholder="your-org"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Allow in-app notifications
              </p>
            </div>
            <Switch
              checked={config.notifications_enabled}
              onCheckedChange={(checked) => handleChange('notifications_enabled', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Send notifications via email
              </p>
            </div>
            <Switch
              checked={config.email_notifications}
              onCheckedChange={(checked) => handleChange('email_notifications', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Security Settings</CardTitle>
          </div>
          <CardDescription>Authentication and security configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="session-timeout">
                <Clock className="h-4 w-4 inline mr-2" />
                Session Timeout (minutes)
              </Label>
              <Input
                id="session-timeout"
                type="number"
                min="5"
                max="10080"
                value={config.session_timeout_minutes}
                onChange={(e) =>
                  handleChange('session_timeout_minutes', parseInt(e.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-password">
                <Lock className="h-4 w-4 inline mr-2" />
                Min Password Length
              </Label>
              <Input
                id="min-password"
                type="number"
                min="6"
                max="32"
                value={config.min_password_length}
                onChange={(e) =>
                  handleChange('min_password_length', parseInt(e.target.value))
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require Multi-Factor Authentication</Label>
              <p className="text-sm text-muted-foreground">
                Force all users to enable MFA
              </p>
            </div>
            <Switch
              checked={config.require_mfa}
              onCheckedChange={(checked) => handleChange('require_mfa', checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
