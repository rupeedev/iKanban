/**
 * Billing hooks for subscription management (IKA-182, IKA-206)
 * TanStack Query hooks for plan limits, usage, and subscription management
 * With upgrade/downgrade flow support
 */
import { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  billingApi,
  type PlanInfo,
  type PlansResponse,
  type UsageResponse,
  type SubscriptionStatusResponse,
  type CreateCheckoutSessionRequest,
  type CreateCheckoutSessionResponse,
  type CreatePortalSessionRequest,
  type CreatePortalSessionResponse,
  type ProrationPreview,
  type SubscriptionChangeResult,
} from '@/lib/api';

// Query key factory for billing
export const billingKeys = {
  all: ['billing'] as const,
  plans: () => [...billingKeys.all, 'plans'] as const,
  usage: (workspaceId: string) =>
    [...billingKeys.all, 'usage', workspaceId] as const,
  subscription: (workspaceId: string) =>
    [...billingKeys.all, 'subscription', workspaceId] as const,
};

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')
    );
  }
  return false;
}

// ============================================================================
// Plans Hook - Fetch all available plans
// ============================================================================

export interface UsePlansResult {
  plans: PlanInfo[];
  isLoading: boolean;
  error: Error | null;
}

export function usePlans(): UsePlansResult {
  const { data, isLoading, error } = useQuery<PlansResponse, Error>({
    queryKey: billingKeys.plans(),
    queryFn: () => billingApi.getPlans(),
    staleTime: 30 * 60 * 1000, // 30 minutes - plans rarely change
    gcTime: 60 * 60 * 1000, // 1 hour cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, err) => {
      if (isRateLimitError(err)) return false;
      return failureCount < 2;
    },
  });

  return {
    plans: data?.plans ?? [],
    isLoading,
    error,
  };
}

// ============================================================================
// Usage Hook - Fetch workspace usage summary
// ============================================================================

export interface UseWorkspaceUsageResult {
  usage: UsageResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWorkspaceUsage(
  workspaceId: string | null
): UseWorkspaceUsageResult {
  const {
    data,
    isLoading,
    error,
    refetch: refetchQuery,
  } = useQuery<UsageResponse, Error>({
    queryKey: billingKeys.usage(workspaceId ?? ''),
    queryFn: () => billingApi.getUsage(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000, // 2 minutes - usage can change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes cache retention
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      if (isRateLimitError(err)) return false;
      return failureCount < 1;
    },
    retryDelay: 30000, // 30 seconds
  });

  const refetch = useCallback(() => {
    refetchQuery();
  }, [refetchQuery]);

  return {
    usage: data ?? null,
    isLoading,
    error,
    refetch,
  };
}

// ============================================================================
// Subscription Hook - Fetch current subscription status
// ============================================================================

export interface UseSubscriptionResult {
  subscription: SubscriptionStatusResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useSubscription(
  workspaceId: string | null
): UseSubscriptionResult {
  const {
    data,
    isLoading,
    error,
    refetch: refetchQuery,
  } = useQuery<SubscriptionStatusResponse, Error>({
    queryKey: billingKeys.subscription(workspaceId ?? ''),
    queryFn: () => billingApi.getSubscription(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      if (isRateLimitError(err)) return false;
      return failureCount < 1;
    },
    retryDelay: 30000,
  });

  const refetch = useCallback(() => {
    refetchQuery();
  }, [refetchQuery]);

  return {
    subscription: data ?? null,
    isLoading,
    error,
    refetch,
  };
}

// ============================================================================
// Upgrade Plan Mutation - Create Stripe checkout session
// ============================================================================

export interface UseUpgradePlanResult {
  upgradePlan: (planName: string) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export function useUpgradePlan(
  workspaceId: string | null
): UseUpgradePlanResult {
  const mutation = useMutation<
    CreateCheckoutSessionResponse,
    Error,
    CreateCheckoutSessionRequest
  >({
    mutationFn: (data) => billingApi.createCheckoutSession(data),
    onSuccess: (response) => {
      // Redirect to Stripe checkout
      if (response.checkout_url) {
        window.location.href = response.checkout_url;
      }
    },
  });

  const upgradePlan = useCallback(
    async (planName: string) => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }
      await mutation.mutateAsync({
        workspace_id: workspaceId,
        plan_name: planName,
        success_url: `${window.location.origin}/settings/billing?success=true`,
        cancel_url: `${window.location.origin}/settings/billing?canceled=true`,
      });
    },
    [workspaceId, mutation]
  );

  return {
    upgradePlan,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// Manage Billing Mutation - Create Stripe portal session
// ============================================================================

export interface UseManageBillingResult {
  openBillingPortal: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export function useManageBilling(
  workspaceId: string | null
): UseManageBillingResult {
  const mutation = useMutation<
    CreatePortalSessionResponse,
    Error,
    CreatePortalSessionRequest
  >({
    mutationFn: (data) => billingApi.createPortalSession(data),
    onSuccess: (response) => {
      // Redirect to Stripe billing portal
      if (response.portal_url) {
        window.location.href = response.portal_url;
      }
    },
  });

  const openBillingPortal = useCallback(async () => {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }
    await mutation.mutateAsync({
      workspace_id: workspaceId,
      return_url: `${window.location.origin}/settings/billing`,
    });
  }, [workspaceId, mutation]);

  return {
    openBillingPortal,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// Preview Proration Hook (IKA-206)
// ============================================================================

export interface UsePreviewProrationResult {
  previewProration: (targetPlan: string) => Promise<ProrationPreview>;
  preview: ProrationPreview | null;
  reset: () => void;
  isLoading: boolean;
  error: Error | null;
}

export function usePreviewProration(
  workspaceId: string | null
): UsePreviewProrationResult {
  const [preview, setPreview] = useState<ProrationPreview | null>(null);

  const mutation = useMutation<
    ProrationPreview,
    Error,
    { workspace_id: string; target_plan: string }
  >({
    mutationFn: (data) => billingApi.previewProration(data),
    onSuccess: (data) => {
      setPreview(data);
    },
  });

  const previewProration = useCallback(
    async (targetPlan: string): Promise<ProrationPreview> => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }
      const result = await mutation.mutateAsync({
        workspace_id: workspaceId,
        target_plan: targetPlan,
      });
      return result;
    },
    [workspaceId, mutation]
  );

  const reset = useCallback(() => {
    setPreview(null);
    mutation.reset();
  }, [mutation]);

  return {
    previewProration,
    preview,
    reset,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// Change Plan Hook (IKA-206)
// ============================================================================

export interface UseChangePlanResult {
  changePlan: (targetPlan: string) => Promise<SubscriptionChangeResult>;
  isLoading: boolean;
  error: Error | null;
}

export function useChangePlan(
  workspaceId: string | null,
  onSuccess?: () => void
): UseChangePlanResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    SubscriptionChangeResult,
    Error,
    { workspace_id: string; target_plan: string }
  >({
    mutationFn: (data) => billingApi.changePlan(data),
    onSuccess: () => {
      // Invalidate subscription and usage queries to refresh data
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: billingKeys.subscription(workspaceId),
        });
        queryClient.invalidateQueries({
          queryKey: billingKeys.usage(workspaceId),
        });
      }
      onSuccess?.();
    },
  });

  const changePlan = useCallback(
    async (targetPlan: string): Promise<SubscriptionChangeResult> => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }
      return mutation.mutateAsync({
        workspace_id: workspaceId,
        target_plan: targetPlan,
      });
    },
    [workspaceId, mutation]
  );

  return {
    changePlan,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// Cancel Subscription Hook (IKA-206)
// ============================================================================

export interface UseCancelSubscriptionResult {
  cancelSubscription: () => Promise<SubscriptionChangeResult>;
  isLoading: boolean;
  error: Error | null;
}

export function useCancelSubscription(
  workspaceId: string | null,
  onSuccess?: () => void
): UseCancelSubscriptionResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    SubscriptionChangeResult,
    Error,
    { workspace_id: string }
  >({
    mutationFn: (data) => billingApi.cancelSubscription(data),
    onSuccess: () => {
      // Invalidate subscription and usage queries to refresh data
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: billingKeys.subscription(workspaceId),
        });
        queryClient.invalidateQueries({
          queryKey: billingKeys.usage(workspaceId),
        });
      }
      onSuccess?.();
    },
  });

  const cancelSubscription =
    useCallback(async (): Promise<SubscriptionChangeResult> => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }
      return mutation.mutateAsync({
        workspace_id: workspaceId,
      });
    }, [workspaceId, mutation]);

  return {
    cancelSubscription,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// Combined Hook - All billing data for a workspace
// ============================================================================

export interface UseBillingResult {
  // Data
  plans: PlanInfo[];
  usage: UsageResponse | null;
  subscription: SubscriptionStatusResponse | null;
  // Loading states
  isLoadingPlans: boolean;
  isLoadingUsage: boolean;
  isLoadingSubscription: boolean;
  isLoading: boolean;
  // Errors
  plansError: Error | null;
  usageError: Error | null;
  subscriptionError: Error | null;
  // Actions
  upgradePlan: (planName: string) => Promise<void>;
  openBillingPortal: () => Promise<void>;
  refetchUsage: () => void;
  refetchSubscription: () => void;
  // Action loading states
  isUpgrading: boolean;
  isOpeningPortal: boolean;
  // Plan change hooks (IKA-206)
  previewProration: (targetPlan: string) => Promise<ProrationPreview>;
  changePlan: (targetPlan: string) => Promise<SubscriptionChangeResult>;
  prorationPreview: ProrationPreview | null;
  resetProrationPreview: () => void;
  isPreviewingProration: boolean;
  isChangingPlan: boolean;
}

export function useBilling(workspaceId: string | null): UseBillingResult {
  const { plans, isLoading: isLoadingPlans, error: plansError } = usePlans();

  const {
    usage,
    isLoading: isLoadingUsage,
    error: usageError,
    refetch: refetchUsage,
  } = useWorkspaceUsage(workspaceId);

  const {
    subscription,
    isLoading: isLoadingSubscription,
    error: subscriptionError,
    refetch: refetchSubscription,
  } = useSubscription(workspaceId);

  const { upgradePlan, isLoading: isUpgrading } = useUpgradePlan(workspaceId);

  const { openBillingPortal, isLoading: isOpeningPortal } =
    useManageBilling(workspaceId);

  // Plan change hooks (IKA-206)
  const {
    previewProration,
    preview: prorationPreview,
    reset: resetProrationPreview,
    isLoading: isPreviewingProration,
  } = usePreviewProration(workspaceId);

  const { changePlan, isLoading: isChangingPlan } = useChangePlan(
    workspaceId,
    () => {
      refetchSubscription();
      refetchUsage();
    }
  );

  return {
    // Data
    plans,
    usage,
    subscription,
    // Loading states
    isLoadingPlans,
    isLoadingUsage,
    isLoadingSubscription,
    isLoading: isLoadingPlans || isLoadingUsage || isLoadingSubscription,
    // Errors
    plansError,
    usageError,
    subscriptionError,
    // Actions
    upgradePlan,
    openBillingPortal,
    refetchUsage,
    refetchSubscription,
    // Action loading states
    isUpgrading,
    isOpeningPortal,
    // Plan change hooks (IKA-206)
    previewProration,
    changePlan,
    prorationPreview,
    resetProrationPreview,
    isPreviewingProration,
    isChangingPlan,
  };
}
