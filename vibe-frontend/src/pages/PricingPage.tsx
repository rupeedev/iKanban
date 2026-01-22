/**
 * Public Pricing Page (IKA-208, IKA-238)
 * Displays pricing plans with Monthly/Annual toggle
 * Fetches plan data from the public /v1/plan-limits API
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, AlertCircle } from 'lucide-react';
import { PricingCard, type PricingPlan } from '@/components/pricing';
import { planLimitsApi, type PublicPlanInfo } from '@/lib/api';

// Transform API data to component format
function transformPlanData(apiPlan: PublicPlanInfo): PricingPlan {
  return {
    name: apiPlan.name,
    description: apiPlan.description,
    monthlyPrice: apiPlan.monthly_price,
    yearlyPrice: apiPlan.yearly_price,
    icon: apiPlan.icon as PricingPlan['icon'],
    isPopular: apiPlan.is_popular,
    ctaText: apiPlan.cta_text,
    ctaLink: apiPlan.cta_link,
    limits: apiPlan.limits,
    features: apiPlan.features,
  };
}

export function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPlans() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await planLimitsApi.getPlans();
        if (!cancelled) {
          setPlans(response.plans.map(transformPlanData));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load pricing plans'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">iKanban</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/sign-in">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/sign-up">
              <Button>Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-8 px-4 text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Simple, Transparent Pricing
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-4">
          Choose the perfect plan to supercharge your AI-assisted development
          workflow. All plans include a 14-day free trial.
        </p>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <Label
            htmlFor="billing-toggle"
            className={!isYearly ? 'font-semibold' : 'text-muted-foreground'}
          >
            Monthly
          </Label>
          <Switch
            id="billing-toggle"
            checked={isYearly}
            onCheckedChange={setIsYearly}
          />
          <Label
            htmlFor="billing-toggle"
            className={isYearly ? 'font-semibold' : 'text-muted-foreground'}
          >
            Annual
            <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-medium">
              Save 17%
            </span>
          </Label>
        </div>

        {/* Pricing Cards */}
        <div className="container mx-auto">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto items-start">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border bg-card p-6">
                  <div className="text-center mb-6">
                    <Skeleton className="mx-auto mb-4 h-12 w-12 rounded-full" />
                    <Skeleton className="h-6 w-24 mx-auto mb-2" />
                    <Skeleton className="h-4 w-48 mx-auto" />
                  </div>
                  <Skeleton className="h-12 w-32 mx-auto mb-6" />
                  <div className="grid grid-cols-2 gap-3 mb-6 p-4">
                    {[1, 2, 3, 4].map((j) => (
                      <Skeleton key={j} className="h-8 w-full" />
                    ))}
                  </div>
                  {[1, 2, 3, 4, 5].map((k) => (
                    <Skeleton key={k} className="h-5 w-full mb-3" />
                  ))}
                  <Skeleton className="h-10 w-full mt-6" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Failed to load pricing plans
              </h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No pricing plans available at this time.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto items-start">
              {plans.map((plan) => (
                <PricingCard key={plan.name} plan={plan} isYearly={isYearly} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <FaqItem
              question="Can I change plans later?"
              answer="Yes! You can upgrade or downgrade your plan at any time. When upgrading, you'll be charged a prorated amount. When downgrading, you'll receive credit towards your next billing cycle."
            />
            <FaqItem
              question="What payment methods do you accept?"
              answer="We accept all major credit cards (Visa, Mastercard, American Express) and support payments through Stripe for maximum security."
            />
            <FaqItem
              question="Is there a free trial?"
              answer="Yes, all plans include a 14-day free trial. No credit card required to start. You can explore all features before committing."
            />
            <FaqItem
              question="What happens if I exceed my limits?"
              answer="We'll notify you when you're approaching your plan limits. You can upgrade anytime, or we'll work with you to find the right solution."
            />
            <FaqItem
              question="Can I cancel anytime?"
              answer="Absolutely. You can cancel your subscription at any time. You'll continue to have access until the end of your current billing period."
            />
            <FaqItem
              question="Do you offer discounts for startups or non-profits?"
              answer="Yes! We offer special pricing for eligible startups, educational institutions, and non-profit organizations. Contact us to learn more."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join thousands of developers using iKanban to orchestrate AI coding
            agents and ship faster than ever.
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/sign-up">
              <Button size="lg">Start Your Free Trial</Button>
            </Link>
            <Link to="/">
              <Button size="lg" variant="outline">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              iKanban - Task Management for AI Agents
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link
              to="/docs"
              className="hover:text-foreground transition-colors"
            >
              Documentation
            </Link>
            <a
              href="https://github.com/rupeedev/iKanban"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="bg-card border rounded-lg p-6">
      <h3 className="font-semibold mb-2">{question}</h3>
      <p className="text-sm text-muted-foreground">{answer}</p>
    </div>
  );
}
