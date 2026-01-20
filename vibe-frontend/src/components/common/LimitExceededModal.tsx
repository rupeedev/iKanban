/**
 * Modal displayed when a usage limit is exceeded (IKA-184)
 * Shows the current usage, limit, and provides an upgrade CTA
 */
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import type { UsageLimitErrorState } from '@/hooks/useUsageLimitError';

interface LimitExceededModalProps extends UsageLimitErrorState {
  onClose: () => void;
}

export function LimitExceededModal({
  isOpen,
  resourceDisplayName,
  current,
  limit,
  percentage,
  upgradeUrl,
  message,
  onClose,
}: LimitExceededModalProps) {
  const handleUpgrade = () => {
    // Navigate to upgrade page
    window.location.href = upgradeUrl || '/settings/subscription';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>{resourceDisplayName} Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            {message ||
              `You've reached the maximum number of ${resourceDisplayName.toLowerCase()} for your current plan.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Usage</span>
              <span className="font-medium">
                {current} / {limit}
              </span>
            </div>
            <Progress value={percentage} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {percentage}% used
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
            <h4 className="font-medium text-sm">Upgrade to unlock more</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>
                  Increased {resourceDisplayName.toLowerCase()} limits
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Priority support</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Advanced features</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} className="gap-2">
            Upgrade Plan
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
