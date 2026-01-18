import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Crown,
  Shield,
  Users,
  Eye,
  Check,
  X,
  Info,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  useAdminPermissions,
  useAdminFeatures,
  useAdminPermissionMutations,
} from '@/hooks/useAdmin';
import { AdminPermission, AdminFeatureToggle } from '@/lib/api';
import { toast } from 'sonner';

const roles = [
  {
    id: 'owner',
    label: 'Owner',
    icon: Crown,
    color: 'text-yellow-600',
    description: 'Full access to all features',
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Shield,
    color: 'text-purple-600',
    description: 'Administrative access',
  },
  {
    id: 'member',
    label: 'Member',
    icon: Users,
    color: 'text-blue-600',
    description: 'Standard team member',
  },
  {
    id: 'viewer',
    label: 'Viewer',
    icon: Eye,
    color: 'text-gray-600',
    description: 'Read-only access',
  },
];

function PermissionsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function FeaturesSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-10" />
        </div>
      ))}
    </div>
  );
}

export function AdminPermissions() {
  const { currentWorkspaceId } = useWorkspace();
  const {
    data: permissionsData,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useAdminPermissions(currentWorkspaceId ?? undefined);
  const {
    data: featuresData,
    isLoading: featuresLoading,
    error: featuresError,
  } = useAdminFeatures(currentWorkspaceId ?? undefined);
  const {
    updatePermission,
    updateFeature,
    isUpdatingPermission,
    isUpdatingFeature,
  } = useAdminPermissionMutations(currentWorkspaceId ?? undefined);

  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [features, setFeatures] = useState<AdminFeatureToggle[]>([]);

  // Sync with server data
  useEffect(() => {
    if (permissionsData) {
      setPermissions(permissionsData);
    }
  }, [permissionsData]);

  useEffect(() => {
    if (featuresData) {
      setFeatures(featuresData);
    }
  }, [featuresData]);

  const togglePermission = async (
    permissionId: string,
    role: 'owner' | 'admin' | 'member' | 'viewer'
  ) => {
    if (role === 'owner') return; // Owner permissions cannot be changed

    const permission = permissions.find((p) => p.id === permissionId);
    if (!permission) return;

    const newValue = !permission[role];

    // Optimistic update
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.id === permissionId) {
          return { ...p, [role]: newValue };
        }
        return p;
      })
    );

    try {
      await updatePermission(permissionId, role, newValue);
      toast.success('Permission updated');
    } catch (err) {
      // Revert on error
      setPermissions((prev) =>
        prev.map((p) => {
          if (p.id === permissionId) {
            return { ...p, [role]: !newValue };
          }
          return p;
        })
      );
      toast.error('Failed to update permission');
    }
  };

  const toggleFeature = async (featureId: string) => {
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;

    const newValue = !feature.enabled;

    // Optimistic update
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.id === featureId) {
          return { ...f, enabled: newValue };
        }
        return f;
      })
    );

    try {
      await updateFeature(featureId, newValue);
      toast.success('Feature updated');
    } catch (err) {
      // Revert on error
      setFeatures((prev) =>
        prev.map((f) => {
          if (f.id === featureId) {
            return { ...f, enabled: !newValue };
          }
          return f;
        })
      );
      toast.error('Failed to update feature');
    }
  };

  const groupedFeatures = features.reduce(
    (acc, feature) => {
      if (!acc[feature.category]) {
        acc[feature.category] = [];
      }
      acc[feature.category].push(feature);
      return acc;
    },
    {} as Record<string, AdminFeatureToggle[]>
  );

  const error = permissionsError || featuresError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Permissions</h2>
          <p className="text-sm text-muted-foreground">
            Configure roles and access control
          </p>
        </div>
        {(isUpdatingPermission || isUpdatingFeature) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
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
                Failed to load permissions
              </p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <Card key={role.id} className="relative overflow-hidden">
              <div
                className={cn(
                  'absolute top-0 left-0 w-1 h-full',
                  role.color.replace('text-', 'bg-')
                )}
              />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-5 w-5', role.color)} />
                  <CardTitle className="text-base">{role.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {role.description}
                </p>
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
          {permissionsLoading ? (
            <PermissionsSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">
                      Permission
                    </th>
                    {roles.map((role) => {
                      const Icon = role.icon;
                      return (
                        <th key={role.id} className="text-center py-3 px-4">
                          <div className="flex flex-col items-center gap-1">
                            <Icon className={cn('h-4 w-4', role.color)} />
                            <span className="text-xs font-medium">
                              {role.label}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => (
                    <tr
                      key={permission.id}
                      className="border-b hover:bg-muted/50"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-medium text-sm">
                            {permission.label}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {permission.description}
                          </p>
                        </div>
                      </td>
                      {roles.map((role) => {
                        const isEnabled = permission[
                          role.id as keyof AdminPermission
                        ] as boolean;
                        const isOwner = role.id === 'owner';
                        return (
                          <td key={role.id} className="text-center py-3 px-4">
                            <button
                              onClick={() =>
                                togglePermission(
                                  permission.id,
                                  role.id as
                                    | 'owner'
                                    | 'admin'
                                    | 'member'
                                    | 'viewer'
                                )
                              }
                              disabled={isOwner || isUpdatingPermission}
                              className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                                isEnabled
                                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
                                !isOwner &&
                                  'hover:ring-2 hover:ring-offset-2 hover:ring-primary cursor-pointer',
                                isOwner && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              {isEnabled ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>
              Owner permissions cannot be modified. Changes are saved
              automatically.
            </span>
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
          {featuresLoading ? (
            <FeaturesSkeleton />
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedFeatures).map(
                ([category, categoryFeatures]) => (
                  <div key={category}>
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">
                      {category}
                    </h4>
                    <div className="space-y-4">
                      {categoryFeatures.map((feature) => (
                        <div
                          key={feature.id}
                          className="flex items-center justify-between"
                        >
                          <div className="space-y-0.5">
                            <Label
                              htmlFor={feature.id}
                              className="text-sm font-medium cursor-pointer"
                            >
                              {feature.label}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {feature.description}
                            </p>
                          </div>
                          <Switch
                            id={feature.id}
                            checked={feature.enabled}
                            onCheckedChange={() => toggleFeature(feature.id)}
                            disabled={isUpdatingFeature}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
