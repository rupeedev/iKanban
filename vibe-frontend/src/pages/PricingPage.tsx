/**
 * Public Pricing Page (IKA-208)
 * Displays pricing plans with Monthly/Annual toggle
 * Design inspired by modern SaaS pricing pages
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Layers } from 'lucide-react';
import { PricingCard, type PricingPlan } from '@/components/pricing';

// Plan data - in production, this could come from an API
const plans: PricingPlan[] = [
  {
    name: 'Hobby',
    description: 'Perfect for personal projects and learning iKanban',
    monthlyPrice: 0,
    yearlyPrice: 0,
    icon: 'hobby',
    isPopular: false,
    ctaText: 'Get Started Free',
    ctaLink: '/sign-up?plan=hobby',
    limits: {
      teams: '7 teams',
      projects: '3 projects',
      members: '5 users',
      support: 'Email',
    },
    features: [
      { text: 'Basic kanban boards', included: true },
      { text: 'Task management', included: true },
      { text: 'Document storage (500MB)', included: true },
      { text: 'AI task updates (50/month)', included: true },
      { text: 'Email support', included: true },
      { text: '6 month data retention', included: true },
      { text: 'GitHub integration', included: false },
      { text: 'MCP server access', included: false },
    ],
  },
  {
    name: 'Starter',
    description: 'For small teams and startups getting serious',
    monthlyPrice: 19,
    yearlyPrice: 16,
    icon: 'starter',
    isPopular: true,
    ctaText: 'Start Free Trial',
    ctaLink: '/sign-up?plan=starter',
    limits: {
      teams: '5 teams',
      projects: '10 projects',
      members: '10 users',
      support: 'Email',
    },
    features: [
      { text: 'Everything in Hobby', included: true },
      { text: 'GitHub integration', included: true },
      { text: 'Document management (5GB)', included: true },
      { text: 'MCP server access', included: true },
      { text: 'AI task updates (100/month)', included: true },
      { text: '1 year data retention', included: true },
      { text: 'Advanced analytics', included: false },
      { text: 'Team permissions', included: false },
    ],
  },
  {
    name: 'Professional',
    description: 'Advanced features for growing development teams',
    monthlyPrice: 39,
    yearlyPrice: 32,
    icon: 'professional',
    isPopular: false,
    ctaText: 'Start Free Trial',
    ctaLink: '/sign-up?plan=pro',
    limits: {
      teams: '10 teams',
      projects: '25 projects',
      members: '25 users',
      support: 'Priority',
    },
    features: [
      { text: 'Everything in Starter', included: true },
      { text: 'Advanced analytics dashboard', included: true },
      { text: 'Multiple AI agent support', included: true },
      { text: 'Custom project templates', included: true },
      { text: 'AI task updates (1000/month)', included: true },
      { text: 'Priority email + chat support', included: true },
      { text: 'Team roles & permissions', included: true },
      { text: '2 year data retention', included: true },
    ],
  },
];

export function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);

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
      <section className="py-16 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Choose the perfect plan to supercharge your AI-assisted development
          workflow. All plans include a 14-day free trial.
        </p>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
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
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto items-start">
            {plans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} isYearly={isYearly} />
            ))}
          </div>
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
