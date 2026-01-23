/**
 * PricingCard component for public pricing page (IKA-208)
 * Displays a single plan with features and CTA button
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  ArrowRight,
  TrendingUp,
  Building2,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PricingFeature {
  text: string;
  included: boolean;
}

export interface PricingPlan {
  name: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  features: PricingFeature[];
  limits: {
    teams: string;
    projects: string;
    members: string;
    support: string;
  };
  isPopular?: boolean;
  ctaText: string;
  ctaLink: string;
  icon: 'hobby' | 'starter' | 'professional' | 'enterprise';
}

interface PricingCardProps {
  plan: PricingPlan;
  isYearly: boolean;
}

const icons = {
  hobby: Sparkles,
  starter: Rocket,
  professional: TrendingUp,
  enterprise: Building2,
};

export function PricingCard({ plan, isYearly }: PricingCardProps) {
  const Icon = icons[plan.icon];
  const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
  const isContactSales = price === null;
  const isFree = price === 0;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-md',
        plan.isPopular && 'border-primary shadow-lg scale-[1.02]'
      )}
    >
      {plan.isPopular && (
        <Badge
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 text-xs"
          variant="default"
        >
          Most Popular
        </Badge>
      )}

      {/* Header */}
      <div className="text-center mb-3">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {plan.description}
        </p>
      </div>

      {/* Price */}
      <div className="text-center mb-3">
        {isContactSales ? (
          <div className="text-2xl font-bold">Contact Sales</div>
        ) : isFree ? (
          <>
            <span className="text-3xl font-bold">Free</span>
            <p className="text-xs text-muted-foreground">
              No credit card required
            </p>
          </>
        ) : (
          <>
            <span className="text-3xl font-bold">${price}</span>
            <span className="text-sm text-muted-foreground">/month</span>
            {isYearly && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Billed annually (save 17%)
              </p>
            )}
          </>
        )}
      </div>

      {/* Limits Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3 p-3 bg-muted/50 rounded-lg text-xs">
        <div>
          <p className="text-muted-foreground">Teams</p>
          <p className="font-medium">{plan.limits.teams}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Projects</p>
          <p className="font-medium">{plan.limits.projects}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Members</p>
          <p className="font-medium">{plan.limits.members}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Support</p>
          <p className="font-medium">{plan.limits.support}</p>
        </div>
      </div>

      {/* Features List */}
      <ul className="mb-4 flex-1 space-y-1.5">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            <Check
              className={cn(
                'h-4 w-4 shrink-0 mt-0.5',
                feature.included ? 'text-primary' : 'text-muted-foreground/40'
              )}
            />
            <span
              className={cn(
                'text-xs',
                !feature.included && 'text-muted-foreground line-through'
              )}
            >
              {feature.text}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <Link to={plan.ctaLink} className="w-full">
        <Button
          className="w-full group"
          variant={plan.isPopular ? 'default' : 'outline'}
          size="sm"
        >
          {plan.ctaText}
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </Link>
    </div>
  );
}
