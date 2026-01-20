/**
 * Plan Card component for billing settings (IKA-182)
 */
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, Zap } from 'lucide-react';
import type { PlanInfo } from '@/lib/api';

interface PlanCardProps {
  plan: PlanInfo;
  isCurrentPlan: boolean;
  onUpgrade: () => void;
  isUpgrading: boolean;
}

export function PlanCard({
  plan,
  isCurrentPlan,
  onUpgrade,
  isUpgrading,
}: PlanCardProps) {
  const { t } = useTranslation('settings');

  const formatPrice = (price: number | null) => {
    if (price === null) return t('settings.billing.plans.contactSales');
    if (price === 0) return t('settings.billing.plans.free');
    return `$${(price / 100).toFixed(0)}/mo`;
  };

  const formatLimit = (value: number, isUnlimited: boolean) => {
    if (isUnlimited) return t('settings.billing.plans.unlimited');
    return value.toString();
  };

  return (
    <Card className={isCurrentPlan ? 'border-primary' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="capitalize">{plan.plan_name}</CardTitle>
          {isCurrentPlan && (
            <Badge variant="default">
              {t('settings.billing.plans.current')}
            </Badge>
          )}
        </div>
        <CardDescription className="text-2xl font-bold">
          {formatPrice(plan.price_monthly)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span>
              {formatLimit(plan.max_teams, plan.is_unlimited_teams)}{' '}
              {t('settings.billing.plans.teams')}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span>
              {formatLimit(plan.max_projects, plan.is_unlimited_projects)}{' '}
              {t('settings.billing.plans.projects')}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span>
              {formatLimit(plan.max_members, plan.is_unlimited_members)}{' '}
              {t('settings.billing.plans.members')}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span>
              {formatLimit(plan.max_storage_gb, plan.is_unlimited_storage)} GB{' '}
              {t('settings.billing.plans.storage')}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span>
              {formatLimit(
                plan.max_ai_requests_per_month,
                plan.is_unlimited_ai
              )}{' '}
              {t('settings.billing.plans.aiRequests')}
            </span>
          </li>
        </ul>

        {!isCurrentPlan && (
          <Button
            className="w-full"
            onClick={onUpgrade}
            disabled={isUpgrading || plan.price_monthly === null}
          >
            {isUpgrading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            {plan.price_monthly === null
              ? t('settings.billing.plans.contactSales')
              : t('settings.billing.plans.upgrade')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
