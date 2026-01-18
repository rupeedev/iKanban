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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  Building2,
  Link2,
  Shield,
  Save,
  RotateCcw,
  Upload,
  Globe,
  Clock,
  Database,
  Cloud,
  Github,
  Bell,
  Lock,
  KeyRound,
  Timer,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  useAdminConfiguration,
  useAdminConfigurationMutations,
} from '@/hooks/useAdmin';
import { AdminConfiguration as AdminConfigurationType } from '@/lib/api';
import { toast } from 'sonner';

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
];

const workspaceColors = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'teal', label: 'Teal', class: 'bg-teal-500' },
];

function ConfigSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
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

  // Local state for form
  const [config, setConfig] = useState<Partial<AdminConfigurationType>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Sync with server data
  useEffect(() => {
    if (configData) {
      setConfig(configData);
      setHasChanges(false);
    }
  }, [configData]);

  const handleChange = <K extends keyof AdminConfigurationType>(
    key: K,
    value: AdminConfigurationType[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const resetChanges = () => {
    if (configData) {
      setConfig(configData);
      setHasChanges(false);
    }
  };

  const saveChanges = async () => {
    try {
      await updateConfiguration(config as AdminConfigurationType);
      toast.success('Configuration saved');
      setHasChanges(false);
    } catch (err) {
      toast.error('Failed to save configuration');
    }
  };

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
        {hasChanges && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={resetChanges}
              disabled={isUpdating}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button onClick={saveChanges} disabled={isUpdating}>
              {isUpdating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Failed to load configuration
              </p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="workspace" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Workspace</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic application configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <ConfigSkeleton />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="appName">Application Name</Label>
                      <Input
                        id="appName"
                        value={config.app_name || ''}
                        onChange={(e) =>
                          handleChange('app_name', e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supportEmail">Support Email</Label>
                      <Input
                        id="supportEmail"
                        type="email"
                        value={config.support_email || ''}
                        onChange={(e) =>
                          handleChange('support_email', e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="language">Default Language</Label>
                      <Select
                        value={config.default_language || 'en'}
                        onValueChange={(v) =>
                          handleChange('default_language', v)
                        }
                      >
                        <SelectTrigger>
                          <Globe className="h-4 w-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Default Timezone</Label>
                      <Select
                        value={config.timezone || 'UTC'}
                        onValueChange={(v) => handleChange('timezone', v)}
                      >
                        <SelectTrigger>
                          <Clock className="h-4 w-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {timezones.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Application Logo</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <Button variant="outline" size="sm" disabled>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workspace Settings */}
        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Defaults</CardTitle>
              <CardDescription>
                Default settings for new workspaces
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <ConfigSkeleton />
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Default Color</Label>
                    <div className="flex gap-2">
                      {workspaceColors.map((color) => (
                        <button
                          key={color.value}
                          onClick={() =>
                            handleChange('default_workspace_color', color.value)
                          }
                          className={cn(
                            'w-8 h-8 rounded-full transition-transform',
                            color.class,
                            config.default_workspace_color === color.value &&
                              'ring-2 ring-offset-2 ring-primary scale-110'
                          )}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="defaultRole">Default Member Role</Label>
                      <Select
                        value={config.default_member_role || 'member'}
                        onValueChange={(v) =>
                          handleChange('default_member_role', v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxMembers">
                        Max Members per Workspace
                      </Label>
                      <Input
                        id="maxMembers"
                        type="number"
                        value={config.max_members_per_workspace || 50}
                        onChange={(e) =>
                          handleChange(
                            'max_members_per_workspace',
                            parseInt(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Auto-create Project</Label>
                      <p className="text-xs text-muted-foreground">
                        Create a default project when workspace is created
                      </p>
                    </div>
                    <Switch
                      checked={config.auto_create_project ?? true}
                      onCheckedChange={(v) =>
                        handleChange('auto_create_project', v)
                      }
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integration Settings */}
        <TabsContent value="integrations">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Github className="h-5 w-5" />
                  <CardTitle>GitHub Integration</CardTitle>
                </div>
                <CardDescription>
                  Connect to GitHub for document sync and repositories
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <ConfigSkeleton />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable GitHub Integration</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow users to connect their GitHub accounts
                        </p>
                      </div>
                      <Switch
                        checked={config.github_enabled ?? true}
                        onCheckedChange={(v) =>
                          handleChange('github_enabled', v)
                        }
                      />
                    </div>
                    {config.github_enabled && (
                      <div className="space-y-2">
                        <Label htmlFor="githubOrg">Default Organization</Label>
                        <Input
                          id="githubOrg"
                          placeholder="organization-name"
                          value={config.github_org || ''}
                          onChange={(e) =>
                            handleChange('github_org', e.target.value)
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Cloud className="h-5 w-5" />
                  <CardTitle>Cloud Storage</CardTitle>
                </div>
                <CardDescription>
                  Configure file storage provider
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <ConfigSkeleton />
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="storage">Storage Provider</Label>
                    <Select
                      value={config.cloud_storage_provider || 'supabase'}
                      onValueChange={(v) =>
                        handleChange('cloud_storage_provider', v)
                      }
                    >
                      <SelectTrigger>
                        <Database className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supabase">
                          Supabase Storage
                        </SelectItem>
                        <SelectItem value="s3">Amazon S3</SelectItem>
                        <SelectItem value="gcs">
                          Google Cloud Storage
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  <CardTitle>Notifications</CardTitle>
                </div>
                <CardDescription>
                  Configure notification settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <ConfigSkeleton />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable Notifications</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow in-app notifications
                        </p>
                      </div>
                      <Switch
                        checked={config.notifications_enabled ?? true}
                        onCheckedChange={(v) =>
                          handleChange('notifications_enabled', v)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Email Notifications</Label>
                        <p className="text-xs text-muted-foreground">
                          Send email notifications for important events
                        </p>
                      </div>
                      <Switch
                        checked={config.email_notifications ?? true}
                        onCheckedChange={(v) =>
                          handleChange('email_notifications', v)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slack">Slack Webhook URL</Label>
                      <Input
                        id="slack"
                        placeholder="https://hooks.slack.com/services/..."
                        value={config.slack_webhook || ''}
                        onChange={(e) =>
                          handleChange('slack_webhook', e.target.value)
                        }
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure security and authentication options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <ConfigSkeleton />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label
                        htmlFor="sessionTimeout"
                        className="flex items-center gap-2"
                      >
                        <Timer className="h-4 w-4" />
                        Session Timeout (minutes)
                      </Label>
                      <Input
                        id="sessionTimeout"
                        type="number"
                        value={config.session_timeout_minutes || 60}
                        onChange={(e) =>
                          handleChange(
                            'session_timeout_minutes',
                            parseInt(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="passwordLength"
                        className="flex items-center gap-2"
                      >
                        <KeyRound className="h-4 w-4" />
                        Minimum Password Length
                      </Label>
                      <Input
                        id="passwordLength"
                        type="number"
                        value={config.min_password_length || 8}
                        onChange={(e) =>
                          handleChange(
                            'min_password_length',
                            parseInt(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label
                        htmlFor="maxAttempts"
                        className="flex items-center gap-2"
                      >
                        <Lock className="h-4 w-4" />
                        Max Login Attempts
                      </Label>
                      <Input
                        id="maxAttempts"
                        type="number"
                        value={config.max_login_attempts || 5}
                        onChange={(e) =>
                          handleChange(
                            'max_login_attempts',
                            parseInt(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lockout">
                        Lockout Duration (minutes)
                      </Label>
                      <Input
                        id="lockout"
                        type="number"
                        value={config.lockout_duration_minutes || 15}
                        onChange={(e) =>
                          handleChange(
                            'lockout_duration_minutes',
                            parseInt(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Require Multi-Factor Authentication
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Force all users to enable MFA
                      </p>
                    </div>
                    <Switch
                      checked={config.require_mfa ?? false}
                      onCheckedChange={(v) => handleChange('require_mfa', v)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="domains">Allowed Email Domains</Label>
                    <Input
                      id="domains"
                      placeholder="example.com, company.org (leave empty for all)"
                      value={config.allowed_domains || ''}
                      onChange={(e) =>
                        handleChange('allowed_domains', e.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated list of allowed email domains for sign-up
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
