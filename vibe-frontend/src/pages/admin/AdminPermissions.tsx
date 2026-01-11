import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Crown,
  Shield,
  Users,
  Eye,
  Save,
  RotateCcw,
  Check,
  X,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RolePermission {
  id: string;
  label: string;
  description: string;
  owner: boolean;
  admin: boolean;
  member: boolean;
  viewer: boolean;
}

interface FeatureToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  category: string;
}

// Mock permission data
const initialPermissions: RolePermission[] = [
  { id: 'view_dashboard', label: 'View Dashboard', description: 'Access to main dashboard', owner: true, admin: true, member: true, viewer: true },
  { id: 'manage_projects', label: 'Manage Projects', description: 'Create, edit, delete projects', owner: true, admin: true, member: true, viewer: false },
  { id: 'manage_issues', label: 'Manage Issues', description: 'Create, edit, assign issues', owner: true, admin: true, member: true, viewer: false },
  { id: 'view_documents', label: 'View Documents', description: 'Read team documents', owner: true, admin: true, member: true, viewer: true },
  { id: 'edit_documents', label: 'Edit Documents', description: 'Modify team documents', owner: true, admin: true, member: true, viewer: false },
  { id: 'manage_members', label: 'Manage Members', description: 'Invite, remove team members', owner: true, admin: true, member: false, viewer: false },
  { id: 'change_roles', label: 'Change Roles', description: 'Modify member roles', owner: true, admin: true, member: false, viewer: false },
  { id: 'access_settings', label: 'Access Settings', description: 'View and modify settings', owner: true, admin: true, member: false, viewer: false },
  { id: 'access_admin', label: 'Access Admin Panel', description: 'View admin dashboard', owner: true, admin: false, member: false, viewer: false },
  { id: 'delete_workspace', label: 'Delete Workspace', description: 'Permanently delete workspace', owner: true, admin: false, member: false, viewer: false },
];

// Mock feature toggles
const initialFeatures: FeatureToggle[] = [
  { id: 'public_signups', label: 'Public Sign-ups', description: 'Allow anyone to create an account', enabled: false, category: 'Access' },
  { id: 'email_verification', label: 'Email Verification', description: 'Require email verification for new accounts', enabled: true, category: 'Access' },
  { id: 'workspace_creation', label: 'Workspace Creation', description: 'Allow members to create workspaces', enabled: true, category: 'Features' },
  { id: 'document_sync', label: 'Document Sync', description: 'Enable GitHub document synchronization', enabled: true, category: 'Features' },
  { id: 'ai_features', label: 'AI Features', description: 'Enable AI-powered features', enabled: true, category: 'Features' },
  { id: 'api_access', label: 'API Access', description: 'Allow API key generation', enabled: true, category: 'Integration' },
  { id: 'webhooks', label: 'Webhooks', description: 'Enable webhook integrations', enabled: false, category: 'Integration' },
  { id: 'mfa_required', label: 'Require MFA', description: 'Require multi-factor authentication', enabled: false, category: 'Security' },
  { id: 'session_timeout', label: 'Session Timeout', description: 'Auto-logout after inactivity', enabled: true, category: 'Security' },
];

const roles = [
  { id: 'owner', label: 'Owner', icon: Crown, color: 'text-yellow-600', description: 'Full access to all features' },
  { id: 'admin', label: 'Admin', icon: Shield, color: 'text-purple-600', description: 'Administrative access' },
  { id: 'member', label: 'Member', icon: Users, color: 'text-blue-600', description: 'Standard team member' },
  { id: 'viewer', label: 'Viewer', icon: Eye, color: 'text-gray-600', description: 'Read-only access' },
];

export function AdminPermissions() {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [features, setFeatures] = useState(initialFeatures);
  const [hasChanges, setHasChanges] = useState(false);

  const togglePermission = (permissionId: string, role: 'owner' | 'admin' | 'member' | 'viewer') => {
    if (role === 'owner') return; // Owner permissions cannot be changed

    setPermissions(prev => prev.map(p => {
      if (p.id === permissionId) {
        return { ...p, [role]: !p[role] };
      }
      return p;
    }));
    setHasChanges(true);
  };

  const toggleFeature = (featureId: string) => {
    setFeatures(prev => prev.map(f => {
      if (f.id === featureId) {
        return { ...f, enabled: !f.enabled };
      }
      return f;
    }));
    setHasChanges(true);
  };

  const resetChanges = () => {
    setPermissions(initialPermissions);
    setFeatures(initialFeatures);
    setHasChanges(false);
  };

  const saveChanges = () => {
    // In real implementation, this would save to backend
    setHasChanges(false);
  };

  const groupedFeatures = features.reduce((acc, feature) => {
    if (!acc[feature.category]) {
      acc[feature.category] = [];
    }
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, FeatureToggle[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Permissions</h2>
          <p className="text-sm text-muted-foreground">Configure roles and access control</p>
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

      {/* Role Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <Card key={role.id} className="relative overflow-hidden">
              <div className={cn('absolute top-0 left-0 w-1 h-full', role.color.replace('text-', 'bg-'))} />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-5 w-5', role.color)} />
                  <CardTitle className="text-base">{role.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Permission Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Permission Matrix</CardTitle>
          <CardDescription>Configure what each role can access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Permission</th>
                  {roles.map((role) => {
                    const Icon = role.icon;
                    return (
                      <th key={role.id} className="text-center py-3 px-4">
                        <div className="flex flex-col items-center gap-1">
                          <Icon className={cn('h-4 w-4', role.color)} />
                          <span className="text-xs font-medium">{role.label}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {permissions.map((permission) => (
                  <tr key={permission.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-medium text-sm">{permission.label}</span>
                        <p className="text-xs text-muted-foreground">{permission.description}</p>
                      </div>
                    </td>
                    {roles.map((role) => {
                      const isEnabled = permission[role.id as keyof RolePermission] as boolean;
                      const isOwner = role.id === 'owner';
                      return (
                        <td key={role.id} className="text-center py-3 px-4">
                          <button
                            onClick={() => togglePermission(permission.id, role.id as 'owner' | 'admin' | 'member' | 'viewer')}
                            disabled={isOwner}
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                              isEnabled
                                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
                              !isOwner && 'hover:ring-2 hover:ring-offset-2 hover:ring-primary cursor-pointer',
                              isOwner && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            {isEnabled ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>Owner permissions cannot be modified</span>
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Toggles</CardTitle>
          <CardDescription>Enable or disable system features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
              <div key={category}>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">{category}</h4>
                <div className="space-y-4">
                  {categoryFeatures.map((feature) => (
                    <div key={feature.id} className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor={feature.id} className="text-sm font-medium cursor-pointer">
                          {feature.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{feature.description}</p>
                      </div>
                      <Switch
                        id={feature.id}
                        checked={feature.enabled}
                        onCheckedChange={() => toggleFeature(feature.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
