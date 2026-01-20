/**
 * Plan Change Dialog component (IKA-206)
 * Shows proration preview and confirmation for plan upgrades/downgrades
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ArrowUp, ArrowDown, XCircle } from 'lucide-react';
import type { ProrationPreview, SubscriptionAction } from '@/lib/api';

interface PlanChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlan: string | null;
  currentPlan: string;
  preview: ProrationPreview | null;
  isLoadingPreview: boolean;
  previewError: Error | null;
  onConfirm: () => void;
  isConfirming: boolean;
  onPreviewPlan: (plan: string) => void;
}

export function PlanChangeDialog({
  isOpen,
  onClose,
  targetPlan,
  currentPlan,
  preview,
  isLoadingPreview,
  previewError,
  onConfirm,
  isConfirming,
  onPreviewPlan,
}: PlanChangeDialogProps) {
  const { t } = useTranslation('settings');

  // Fetch proration preview when dialog opens with a target plan
  useEffect(() => {
    if (isOpen && targetPlan && targetPlan !== currentPlan) {
      onPreviewPlan(targetPlan);
    }
  }, [isOpen, targetPlan, currentPlan, onPreviewPlan]);

  const getActionIcon = (action: SubscriptionAction) => {
    switch (action) {
      case 'upgrade':
        return <ArrowUp className="h-5 w-5 text-green-600" />;
      case 'downgrade':
        return <ArrowDown className="h-5 w-5 text-orange-500" />;
      case 'cancel':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getTitle = () => {
    if (!preview) return t('settings.billing.planChange.title');
    switch (preview.action) {
      case 'upgrade':
        return t('settings.billing.planChange.upgradeTitle', {
          plan: targetPlan,
        });
      case 'downgrade':
        return t('settings.billing.planChange.downgradeTitle', {
          plan: targetPlan,
        });
      case 'cancel':
        return t('settings.billing.planChange.cancelTitle');
      default:
        return t('settings.billing.planChange.title');
    }
  };

  const getDescription = () => {
    if (!preview) return '';
    switch (preview.action) {
      case 'upgrade':
        return t('settings.billing.planChange.upgradeDescription');
      case 'downgrade':
        return t('settings.billing.planChange.downgradeDescription');
      case 'cancel':
        return t('settings.billing.planChange.cancelDescription');
      default:
        return preview.description;
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {preview && getActionIcon(preview.action)}
            {getTitle()}
          </DialogTitle>
          {!isLoadingPreview && !previewError && (
            <DialogDescription>{getDescription()}</DialogDescription>
          )}
        </DialogHeader>

        <div className="py-4">
          {isLoadingPreview ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : previewError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t('settings.billing.planChange.error')}
              </AlertDescription>
            </Alert>
          ) : preview ? (
            <div className="space-y-4">
              {/* Proration details */}
              <div className="rounded-lg border p-4 space-y-3">
                {preview.action === 'upgrade' &&
                  preview.immediate_amount_cents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('settings.billing.planChange.immediateCharge')}
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(preview.immediate_amount_cents)}
                      </span>
                    </div>
                  )}

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('settings.billing.planChange.newMonthlyRate')}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(preview.new_recurring_cents)}/mo
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('settings.billing.planChange.effectiveDate')}
                  </span>
                  <span className="font-semibold">
                    {formatDate(preview.effective_date)}
                  </span>
                </div>
              </div>

              {/* Additional info from backend */}
              {preview.description && (
                <p className="text-sm text-muted-foreground">
                  {preview.description}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isConfirming}>
            {t('settings.billing.planChange.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoadingPreview || !!previewError || isConfirming}
          >
            {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('settings.billing.planChange.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
