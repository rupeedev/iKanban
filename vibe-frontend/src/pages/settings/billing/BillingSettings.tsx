/**
 * Billing Settings Page (IKA-182, IKA-206)
 * Displays subscription status, plan comparison, usage metrics,
 * and upgrade/downgrade flows
 */
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  CreditCard,
  ExternalLink,
  Users,
  FolderKanban,
  Bot,
  Building2,
} from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useBilling } from '@/hooks/useBilling';
import { UsageProgress, StorageProgress } from './UsageProgress';
import { PlanCard } from './PlanCard';
import { PlanChangeDialog } from './PlanChangeDialog';
import type { SubscriptionAction } from '@/lib/api';

export function BillingSettings() {
  const { t } = useTranslation('settings');
  const { currentWorkspaceId } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showCanceledAlert, setShowCanceledAlert] = useState(false);

  // Plan change dialog state (IKA-206)
  const [planChangeDialogOpen, setPlanChangeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SubscriptionAction | null>(
    null
  );

  const {
    plans,
    usage,
    subscription,
    isLoading,
    isLoadingPlans,
    plansError,
    usageError,
    upgradePlan,
    openBillingPortal,
    isUpgrading,
    isOpeningPortal,
    // IKA-206 hooks
    previewProration,
    changePlan,
    prorationPreview,
    resetProrationPreview,
    isPreviewingProration,
    isChangingPlan,
  } = useBilling(currentWorkspaceId);

  // Handle Stripe redirect success/cancel
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessAlert(true);
      setSearchParams({});
      setTimeout(() => setShowSuccessAlert(false), 5000);
    }
    if (searchParams.get('canceled') === 'true') {
      setShowCanceledAlert(true);
      setSearchParams({});
      setTimeout(() => setShowCanceledAlert(false), 5000);
    }
  }, [searchParams, setSearchParams]);

  const currentPlan = usage?.plan ?? 'free';

  // Cache the current plan object to avoid repeated lookups
  const currentPlanObj = useMemo(
    () => plans.find((p) => p.plan_name === currentPlan),
    [plans, currentPlan]
  );

  // Handle plan action (upgrade/downgrade/cancel)
  const handlePlanAction = useCallback(
    (planName: string, action: SubscriptionAction) => {
      if (action === 'nochange') return;

      // For upgrade from free plan, use the Stripe checkout flow
      if (action === 'upgrade' && currentPlan === 'free') {
        upgradePlan(planName);
        return;
      }

      // For existing subscribers, use the plan change dialog
      setSelectedPlan(planName);
      setPendingAction(action);
      setPlanChangeDialogOpen(true);
    },
    [currentPlan, upgradePlan]
  );

  // Handle plan change confirmation
  const handleConfirmPlanChange = useCallback(async () => {
    if (!selectedPlan) return;

    try {
      await changePlan(selectedPlan);
      setPlanChangeDialogOpen(false);
      setSelectedPlan(null);
      setPendingAction(null);
      resetProrationPreview();

      // Show success message
      if (pendingAction === 'cancel') {
        toast.success(t('settings.billing.planChange.cancelSuccess'));
      } else {
        toast.success(t('settings.billing.planChange.success'));
      }
    } catch {
      // Error is handled by the hook
    }
  }, [selectedPlan, changePlan, resetProrationPreview, pendingAction, t]);

  // Handle dialog close
  const handleCloseDialog = useCallback(() => {
    setPlanChangeDialogOpen(false);
    setSelectedPlan(null);
    setPendingAction(null);
    resetProrationPreview();
  }, [resetProrationPreview]);

  // Handle proration preview request
  const handlePreviewPlan = useCallback(
    (planName: string) => {
      previewProration(planName);
    },
    [previewProration]
  );

  if (isLoading && !plans.length) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.billing.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success/Cancel Alerts */}
      {showSuccessAlert && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.billing.upgradeSuccess')}
          </AlertDescription>
        </Alert>
      )}

      {showCanceledAlert && (
        <Alert>
          <AlertDescription>
            {t('settings.billing.upgradeCanceled')}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alerts */}
      {plansError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('settings.billing.plansError')}
          </AlertDescription>
        </Alert>
      )}

      {usageError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('settings.billing.usageError')}
          </AlertDescription>
        </Alert>
      )}

      {/* Current Subscription Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('settings.billing.subscription.title')}
              </CardTitle>
              <CardDescription>
                {t('settings.billing.subscription.description')}
              </CardDescription>
            </div>
            {subscription?.has_active_subscription && (
              <Button
                variant="outline"
                onClick={openBillingPortal}
                disabled={isOpeningPortal}
              >
                {isOpeningPortal ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {t('settings.billing.subscription.manageBilling')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold capitalize">{currentPlan}</p>
              <p className="text-sm text-muted-foreground">
                {subscription?.has_active_subscription
                  ? t('settings.billing.subscription.active')
                  : t('settings.billing.subscription.noSubscription')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.billing.usage.title')}</CardTitle>
          <CardDescription>
            {t('settings.billing.usage.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageProgress
            label={t('settings.billing.usage.teams')}
            icon={<Users className="h-4 w-4" />}
            usage={usage?.usage?.teams ?? null}
            isUnlimited={currentPlanObj?.is_unlimited_teams}
          />
          <UsageProgress
            label={t('settings.billing.usage.projects')}
            icon={<FolderKanban className="h-4 w-4" />}
            usage={usage?.usage?.projects ?? null}
            isUnlimited={currentPlanObj?.is_unlimited_projects}
          />
          <UsageProgress
            label={t('settings.billing.usage.members')}
            icon={<Users className="h-4 w-4" />}
            usage={usage?.usage?.members ?? null}
            isUnlimited={currentPlanObj?.is_unlimited_members}
          />
          <UsageProgress
            label={t('settings.billing.usage.aiRequests')}
            icon={<Bot className="h-4 w-4" />}
            usage={usage?.usage?.ai_requests ?? null}
            isUnlimited={currentPlanObj?.is_unlimited_ai}
          />
          <StorageProgress
            storage={usage?.usage?.storage ?? null}
            isUnlimited={currentPlanObj?.is_unlimited_storage}
          />
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          {t('settings.billing.plans.title')}
        </h2>
        {isLoadingPlans ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-16" />
                </CardHeader>
                <CardContent className="space-y-2">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Skeleton key={j} className="h-4 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.plan_name}
                plan={plan}
                isCurrentPlan={plan.plan_name === currentPlan}
                currentPlanName={currentPlan}
                onPlanAction={handlePlanAction}
                isLoading={isUpgrading || isChangingPlan}
                allPlans={plans}
              />
            ))}
          </div>
        )}
      </div>

      {/* Plan Change Dialog (IKA-206) */}
      <PlanChangeDialog
        isOpen={planChangeDialogOpen}
        onClose={handleCloseDialog}
        targetPlan={selectedPlan}
        currentPlan={currentPlan}
        preview={prorationPreview}
        isLoadingPreview={isPreviewingProration}
        previewError={null}
        onConfirm={handleConfirmPlanChange}
        isConfirming={isChangingPlan}
        onPreviewPlan={handlePreviewPlan}
      />
    </div>
  );
}
