/**
 * Usage Progress component for billing settings (IKA-182)
 */
import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, HardDrive } from 'lucide-react';
import type { UsageDetail, StorageDetail } from '@/lib/api';

interface UsageProgressProps {
  label: string;
  icon: React.ReactNode;
  usage: UsageDetail | null;
  isUnlimited?: boolean;
}

export function UsageProgress({
  label,
  icon,
  usage,
  isUnlimited,
}: UsageProgressProps) {
  if (!usage) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            {icon}
            {label}
          </span>
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  if (isUnlimited) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            {icon}
            {label}
          </span>
          <span className="text-muted-foreground">
            {usage.current} / Unlimited
          </span>
        </div>
        <Progress value={0} className="h-2" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <span
          className={
            usage.exceeded
              ? 'text-destructive font-medium'
              : usage.warning
                ? 'text-warning font-medium'
                : 'text-muted-foreground'
          }
        >
          {usage.current} / {usage.limit}
          {usage.exceeded && (
            <AlertTriangle className="inline-block ml-1 h-3 w-3" />
          )}
        </span>
      </div>
      <Progress
        value={Math.min(usage.percentage, 100)}
        className={`h-2 ${usage.exceeded ? '[&>div]:bg-destructive' : usage.warning ? '[&>div]:bg-warning' : ''}`}
      />
    </div>
  );
}

interface StorageProgressProps {
  storage: StorageDetail | null;
  isUnlimited?: boolean;
}

export function StorageProgress({
  storage,
  isUnlimited,
}: StorageProgressProps) {
  const { t } = useTranslation('settings');

  if (!storage) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            {t('settings.billing.usage.storage')}
          </span>
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  if (isUnlimited) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            {t('settings.billing.usage.storage')}
          </span>
          <span className="text-muted-foreground">
            {storage.used_gb.toFixed(2)} GB / Unlimited
          </span>
        </div>
        <Progress value={0} className="h-2" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <HardDrive className="h-4 w-4" />
          {t('settings.billing.usage.storage')}
        </span>
        <span
          className={
            storage.exceeded
              ? 'text-destructive font-medium'
              : storage.warning
                ? 'text-warning font-medium'
                : 'text-muted-foreground'
          }
        >
          {storage.used_gb.toFixed(2)} GB / {storage.limit_gb} GB
          {storage.exceeded && (
            <AlertTriangle className="inline-block ml-1 h-3 w-3" />
          )}
        </span>
      </div>
      <Progress
        value={Math.min(storage.percentage, 100)}
        className={`h-2 ${storage.exceeded ? '[&>div]:bg-destructive' : storage.warning ? '[&>div]:bg-warning' : ''}`}
      />
    </div>
  );
}
