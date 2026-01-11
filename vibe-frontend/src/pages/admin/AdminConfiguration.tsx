import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeneralConfig {
  appName: string;
  appLogo: string;
  defaultLanguage: string;
  timezone: string;
  supportEmail: string;
}

interface WorkspaceConfig {
  defaultIcon: string;
  defaultColor: string;
  autoCreateProject: boolean;
  defaultMemberRole: string;
  maxMembersPerWorkspace: number;
}

interface IntegrationConfig {
  githubEnabled: boolean;
  githubOrg: string;
  cloudStorageProvider: string;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  slackWebhook: string;
}

interface SecurityConfig {
  sessionTimeoutMinutes: number;
  minPasswordLength: number;
  requireMFA: boolean;
  allowedDomains: string;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
}

const initialGeneralConfig: GeneralConfig = {
  appName: 'iKanban',
  appLogo: '',
  defaultLanguage: 'en',
  timezone: 'UTC',
  supportEmail: 'support@ikanban.com',
};

const initialWorkspaceConfig: WorkspaceConfig = {
  defaultIcon: 'folder',
  defaultColor: 'blue',
  autoCreateProject: true,
  defaultMemberRole: 'member',
  maxMembersPerWorkspace: 50,
};

const initialIntegrationConfig: IntegrationConfig = {
  githubEnabled: true,
  githubOrg: '',
  cloudStorageProvider: 'supabase',
  notificationsEnabled: true,
  emailNotifications: true,
  slackWebhook: '',
};

const initialSecurityConfig: SecurityConfig = {
  sessionTimeoutMinutes: 60,
  minPasswordLength: 8,
  requireMFA: false,
  allowedDomains: '',
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
};

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

export function AdminConfiguration() {
  const [generalConfig, setGeneralConfig] = useState(initialGeneralConfig);
  const [workspaceConfig, setWorkspaceConfig] = useState(initialWorkspaceConfig);
  const [integrationConfig, setIntegrationConfig] = useState(initialIntegrationConfig);
  const [securityConfig, setSecurityConfig] = useState(initialSecurityConfig);
  const [hasChanges, setHasChanges] = useState(false);

  const handleGeneralChange = (key: keyof GeneralConfig, value: string) => {
    setGeneralConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleWorkspaceChange = <K extends keyof WorkspaceConfig>(key: K, value: WorkspaceConfig[K]) => {
    setWorkspaceConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleIntegrationChange = <K extends keyof IntegrationConfig>(key: K, value: IntegrationConfig[K]) => {
    setIntegrationConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSecurityChange = <K extends keyof SecurityConfig>(key: K, value: SecurityConfig[K]) => {
    setSecurityConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const resetChanges = () => {
    setGeneralConfig(initialGeneralConfig);
    setWorkspaceConfig(initialWorkspaceConfig);
    setIntegrationConfig(initialIntegrationConfig);
    setSecurityConfig(initialSecurityConfig);
    setHasChanges(false);
  };

  const saveChanges = () => {
    // In real implementation, this would save to backend
    setHasChanges(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Configuration</h2>
          <p className="text-sm text-muted-foreground">System settings and preferences</p>
        </div>
        {hasChanges && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetChanges}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button onClick={saveChanges}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        )}
      </div>

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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="appName">Application Name</Label>
                  <Input
                    id="appName"
                    value={generalConfig.appName}
                    onChange={(e) => handleGeneralChange('appName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={generalConfig.supportEmail}
                    onChange={(e) => handleGeneralChange('supportEmail', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="language">Default Language</Label>
                  <Select value={generalConfig.defaultLanguage} onValueChange={(v) => handleGeneralChange('defaultLanguage', v)}>
                    <SelectTrigger>
                      <Globe className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Default Timezone</Label>
                  <Select value={generalConfig.timezone} onValueChange={(v) => handleGeneralChange('timezone', v)}>
                    <SelectTrigger>
                      <Clock className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Application Logo</Label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted">
                    {generalConfig.appLogo ? (
                      <img src={generalConfig.appLogo} alt="Logo" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Logo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workspace Settings */}
        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Defaults</CardTitle>
              <CardDescription>Default settings for new workspaces</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Default Color</Label>
                <div className="flex gap-2">
                  {workspaceColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => handleWorkspaceChange('defaultColor', color.value)}
                      className={cn(
                        'w-8 h-8 rounded-full transition-transform',
                        color.class,
                        workspaceConfig.defaultColor === color.value && 'ring-2 ring-offset-2 ring-primary scale-110'
                      )}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="defaultRole">Default Member Role</Label>
                  <Select value={workspaceConfig.defaultMemberRole} onValueChange={(v) => handleWorkspaceChange('defaultMemberRole', v)}>
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
                  <Label htmlFor="maxMembers">Max Members per Workspace</Label>
                  <Input
                    id="maxMembers"
                    type="number"
                    value={workspaceConfig.maxMembersPerWorkspace}
                    onChange={(e) => handleWorkspaceChange('maxMembersPerWorkspace', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-create Project</Label>
                  <p className="text-xs text-muted-foreground">Create a default project when workspace is created</p>
                </div>
                <Switch
                  checked={workspaceConfig.autoCreateProject}
                  onCheckedChange={(v) => handleWorkspaceChange('autoCreateProject', v)}
                />
              </div>
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
                <CardDescription>Connect to GitHub for document sync and repositories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable GitHub Integration</Label>
                    <p className="text-xs text-muted-foreground">Allow users to connect their GitHub accounts</p>
                  </div>
                  <Switch
                    checked={integrationConfig.githubEnabled}
                    onCheckedChange={(v) => handleIntegrationChange('githubEnabled', v)}
                  />
                </div>
                {integrationConfig.githubEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="githubOrg">Default Organization</Label>
                    <Input
                      id="githubOrg"
                      placeholder="organization-name"
                      value={integrationConfig.githubOrg}
                      onChange={(e) => handleIntegrationChange('githubOrg', e.target.value)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Cloud className="h-5 w-5" />
                  <CardTitle>Cloud Storage</CardTitle>
                </div>
                <CardDescription>Configure file storage provider</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="storage">Storage Provider</Label>
                  <Select value={integrationConfig.cloudStorageProvider} onValueChange={(v) => handleIntegrationChange('cloudStorageProvider', v)}>
                    <SelectTrigger>
                      <Database className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supabase">Supabase Storage</SelectItem>
                      <SelectItem value="s3">Amazon S3</SelectItem>
                      <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  <CardTitle>Notifications</CardTitle>
                </div>
                <CardDescription>Configure notification settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Notifications</Label>
                    <p className="text-xs text-muted-foreground">Allow in-app notifications</p>
                  </div>
                  <Switch
                    checked={integrationConfig.notificationsEnabled}
                    onCheckedChange={(v) => handleIntegrationChange('notificationsEnabled', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">Send email notifications for important events</p>
                  </div>
                  <Switch
                    checked={integrationConfig.emailNotifications}
                    onCheckedChange={(v) => handleIntegrationChange('emailNotifications', v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slack">Slack Webhook URL</Label>
                  <Input
                    id="slack"
                    placeholder="https://hooks.slack.com/services/..."
                    value={integrationConfig.slackWebhook}
                    onChange={(e) => handleIntegrationChange('slackWebhook', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Configure security and authentication options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout" className="flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Session Timeout (minutes)
                  </Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={securityConfig.sessionTimeoutMinutes}
                    onChange={(e) => handleSecurityChange('sessionTimeoutMinutes', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passwordLength" className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Minimum Password Length
                  </Label>
                  <Input
                    id="passwordLength"
                    type="number"
                    value={securityConfig.minPasswordLength}
                    onChange={(e) => handleSecurityChange('minPasswordLength', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maxAttempts" className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Max Login Attempts
                  </Label>
                  <Input
                    id="maxAttempts"
                    type="number"
                    value={securityConfig.maxLoginAttempts}
                    onChange={(e) => handleSecurityChange('maxLoginAttempts', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lockout">Lockout Duration (minutes)</Label>
                  <Input
                    id="lockout"
                    type="number"
                    value={securityConfig.lockoutDurationMinutes}
                    onChange={(e) => handleSecurityChange('lockoutDurationMinutes', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Require Multi-Factor Authentication
                  </Label>
                  <p className="text-xs text-muted-foreground">Force all users to enable MFA</p>
                </div>
                <Switch
                  checked={securityConfig.requireMFA}
                  onCheckedChange={(v) => handleSecurityChange('requireMFA', v)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domains">Allowed Email Domains</Label>
                <Input
                  id="domains"
                  placeholder="example.com, company.org (leave empty for all)"
                  value={securityConfig.allowedDomains}
                  onChange={(e) => handleSecurityChange('allowedDomains', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of allowed email domains for sign-up</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
