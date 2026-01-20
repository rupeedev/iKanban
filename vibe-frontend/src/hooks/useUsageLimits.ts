/**
 * Hook for proactive usage limit tracking and warnings (IKA-185)
 * Provides limit status checking at 80%, 90%, and 100% thresholds
 */
import { useMemo } from 'react';
import { useWorkspaceUsage, usePlans } from './useBilling';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import type { UsageDetail, StorageDetail, PlanInfo } from '@/lib/api';

export type LimitSeverity = 'none' | 'warning' | 'critical' | 'exceeded';
export type LimitResource =
  | 'teams'
  | 'projects'
  | 'members'
  | 'tasks'
  | 'ai_requests'
  | 'storage';

const THRESHOLDS = {
  warning: 80, // Yellow - approaching limit
  critical: 90, // Orange - near limit
  exceeded: 100, // Red - at or over limit
} as const;

export interface ResourceLimitStatus {
  resource: LimitResource;
  severity: LimitSeverity;
  current: number;
  limit: number;
  percentage: number;
  displayName: string;
  isUnlimited: boolean;
}

export interface UsageLimitsResult {
  /** Get the severity level for a specific resource */
  getLimitStatus: (resource: LimitResource) => ResourceLimitStatus;
  /** Get all resources at or above warning threshold */
  getResourcesAtLimit: () => ResourceLimitStatus[];
  /** Get the highest severity across all resources */
  getHighestSeverity: () => LimitSeverity;
  /** Check if adding one more would exceed limit */
  wouldExceedLimit: (resource: LimitResource) => boolean;
  /** Current plan info for upgrade prompts */
  currentPlan: PlanInfo | null;
  /** List of available plans for upgrade */
  availablePlans: PlanInfo[];
  /** Next recommended plan based on current usage */
  recommendedPlan: PlanInfo | null;
  /** Loading state */
  isLoading: boolean;
}

const RESOURCE_DISPLAY_NAMES: Record<LimitResource, string> = {
  teams: 'Teams',
  projects: 'Projects',
  members: 'Team Members',
  tasks: 'Tasks',
  ai_requests: 'AI Requests',
  storage: 'Storage',
};

// Plan order for upgrade recommendations
const PLAN_ORDER = ['free', 'starter', 'pro', 'enterprise'];

function getSeverity(percentage: number): LimitSeverity {
  if (percentage >= THRESHOLDS.exceeded) return 'exceeded';
  if (percentage >= THRESHOLDS.critical) return 'critical';
  if (percentage >= THRESHOLDS.warning) return 'warning';
  return 'none';
}

function isResourceUnlimited(
  planInfo: PlanInfo | null,
  resource: LimitResource
): boolean {
  if (!planInfo) return false;
  switch (resource) {
    case 'teams':
      return planInfo.is_unlimited_teams;
    case 'projects':
      return planInfo.is_unlimited_projects;
    case 'members':
      return planInfo.is_unlimited_members;
    case 'storage':
      return planInfo.is_unlimited_storage;
    case 'ai_requests':
      return planInfo.is_unlimited_ai;
    case 'tasks':
      return false; // Tasks don't have unlimited flag
    default:
      return false;
  }
}

export function useUsageLimits(): UsageLimitsResult {
  const { currentWorkspace } = useWorkspace();
  const { usage, isLoading: isLoadingUsage } = useWorkspaceUsage(
    currentWorkspace?.id ?? null
  );
  const { plans, isLoading: isLoadingPlans } = usePlans();

  const currentPlan = useMemo(() => {
    if (!usage || !plans.length) return null;
    return plans.find((p) => p.plan_name === usage.plan) ?? null;
  }, [usage, plans]);

  const recommendedPlan = useMemo(() => {
    if (!currentPlan || !plans.length) return null;
    const currentIndex = PLAN_ORDER.indexOf(currentPlan.plan_name);
    if (currentIndex === -1 || currentIndex >= PLAN_ORDER.length - 1) {
      return null; // Already on highest plan or unknown plan
    }
    const nextPlanName = PLAN_ORDER[currentIndex + 1];
    return plans.find((p) => p.plan_name === nextPlanName) ?? null;
  }, [currentPlan, plans]);

  const getLimitStatus = useMemo(() => {
    return (resource: LimitResource): ResourceLimitStatus => {
      const isUnlimited = isResourceUnlimited(currentPlan, resource);

      if (!usage || isUnlimited) {
        return {
          resource,
          severity: 'none',
          current: 0,
          limit: 0,
          percentage: 0,
          displayName: RESOURCE_DISPLAY_NAMES[resource],
          isUnlimited,
        };
      }

      const usageData = usage.usage[resource] as UsageDetail | StorageDetail;
      const isStorage = resource === 'storage';

      let current: number;
      let limit: number;

      if (isStorage) {
        const storageData = usageData as StorageDetail;
        current = storageData.used_gb;
        limit = storageData.limit_gb;
      } else {
        const detailData = usageData as UsageDetail;
        current = detailData.current;
        limit = detailData.limit;
      }

      const percentage =
        limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;

      return {
        resource,
        severity: getSeverity(percentage),
        current,
        limit,
        percentage,
        displayName: RESOURCE_DISPLAY_NAMES[resource],
        isUnlimited: false,
      };
    };
  }, [usage, currentPlan]);

  const getResourcesAtLimit = useMemo(() => {
    return (): ResourceLimitStatus[] => {
      const resources: LimitResource[] = [
        'teams',
        'projects',
        'members',
        'tasks',
        'ai_requests',
        'storage',
      ];
      return resources
        .map(getLimitStatus)
        .filter((status) => status.severity !== 'none')
        .sort((a, b) => {
          const severityOrder = {
            exceeded: 0,
            critical: 1,
            warning: 2,
            none: 3,
          };
          return severityOrder[a.severity] - severityOrder[b.severity];
        });
    };
  }, [getLimitStatus]);

  const getHighestSeverity = useMemo(() => {
    return (): LimitSeverity => {
      const atLimit = getResourcesAtLimit();
      if (atLimit.length === 0) return 'none';
      return atLimit[0].severity;
    };
  }, [getResourcesAtLimit]);

  const wouldExceedLimit = useMemo(() => {
    return (resource: LimitResource): boolean => {
      const status = getLimitStatus(resource);
      if (status.isUnlimited) return false;
      return status.current >= status.limit;
    };
  }, [getLimitStatus]);

  return {
    getLimitStatus,
    getResourcesAtLimit,
    getHighestSeverity,
    wouldExceedLimit,
    currentPlan,
    availablePlans: plans,
    recommendedPlan,
    isLoading: isLoadingUsage || isLoadingPlans,
  };
}
