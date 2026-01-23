import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useUser } from '@clerk/clerk-react';
import {
  Layers,
  GitBranch,
  FileText,
  Zap,
  Shield,
  CreditCard,
  Terminal,
  Loader2,
  Bot,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { OnboardingWizard } from '@/components/dialogs/OnboardingWizard';
import { PendingApprovalDialog } from '@/components/dialogs/PendingApprovalDialog';
import { useUserRegistration } from '@/hooks/useUserRegistration';

// Check if Clerk is configured
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function About() {
  return CLERK_ENABLED ? (
    <AboutWithClerk />
  ) : (
    <AboutContent isSignedIn={false} />
  );
}

function AboutWithClerk() {
  const { isSignedIn, user } = useUser();
  const {
    registration,
    isLoading: isLoadingRegistration,
    isFetched: isRegistrationFetched,
    hasRegistration,
    isApproved,
    isPending,
    isRejected,
    refresh,
  } = useUserRegistration();

  // Track if we've already shown the onboarding wizard to prevent duplicate shows
  const onboardingShownRef = useRef(false);

  // Show onboarding wizard for first-time sign-ups
  // Only show after registration query has completed (isFetched) to prevent race condition
  useEffect(() => {
    if (
      isSignedIn &&
      user &&
      isRegistrationFetched &&
      !hasRegistration &&
      !onboardingShownRef.current
    ) {
      onboardingShownRef.current = true;
      OnboardingWizard.show({
        clerkUserId: user.id,
        email: user.primaryEmailAddress?.emailAddress || '',
        firstName: user.firstName,
        lastName: user.lastName,
      });
    }
  }, [isSignedIn, user, isRegistrationFetched, hasRegistration]);

  // Show pending/rejected dialog
  useEffect(() => {
    if (isSignedIn && registration && (isPending || isRejected)) {
      PendingApprovalDialog.show({
        registration,
        onRefresh: refresh,
      });
    }
  }, [isSignedIn, registration, isPending, isRejected, refresh]);

  const welcomeMessage =
    isSignedIn && user?.firstName ? `Welcome back, ${user.firstName}!` : null;

  if (isSignedIn && isLoadingRegistration) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AboutContent
      isSignedIn={!!isSignedIn}
      isApproved={isApproved}
      welcomeMessage={welcomeMessage}
    />
  );
}

interface AboutContentProps {
  isSignedIn: boolean;
  isApproved?: boolean;
  welcomeMessage?: string | null;
}

function AboutContent({
  isSignedIn,
  isApproved = false,
  welcomeMessage,
}: AboutContentProps) {
  const canAccessDashboard = isSignedIn && isApproved;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">iKanban</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              to="/pricing"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            {welcomeMessage && (
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {welcomeMessage}
              </span>
            )}
            {canAccessDashboard ? (
              <Link to="/projects">
                <Button>Go to Dashboard</Button>
              </Link>
            ) : isSignedIn ? (
              <Button disabled variant="outline">
                Awaiting Approval
              </Button>
            ) : (
              <>
                <Link to="/sign-in">
                  <Button variant="ghost">Sign In</Button>
                </Link>
                <Link to="/sign-up">
                  <Button>Get Started</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-muted/50 to-background">
        <div className="container mx-auto text-center">
          {welcomeMessage && (
            <p className="text-lg text-primary mb-4">{welcomeMessage}</p>
          )}
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            AI-Powered Task Management
            <span className="text-primary"> for Modern Teams</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Orchestrate AI coding agents, manage team workspaces, and streamline
            your development workflow with intelligent kanban boards.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            {canAccessDashboard ? (
              <Link to="/projects">
                <Button size="lg">Open Dashboard</Button>
              </Link>
            ) : isSignedIn ? (
              <Button size="lg" disabled variant="outline">
                Registration Pending
              </Button>
            ) : (
              <>
                <Link to="/sign-up">
                  <Button size="lg">Start Free Trial</Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline">
                    View Pricing
                  </Button>
                </Link>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            14-day free trial · No credit card required
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Everything You Need to Ship Faster
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            A complete platform for AI-assisted development with powerful
            features for teams of all sizes.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Bot className="h-8 w-8" />}
              title="AI Agent Integration"
              description="Connect Claude Code, Gemini CLI, Cursor, and other AI assistants via MCP protocol."
            />
            <FeatureCard
              icon={<Layers className="h-8 w-8" />}
              title="Visual Kanban Boards"
              description="Drag-and-drop task management with customizable workflows and priority tracking."
            />
            <FeatureCard
              icon={<Building2 className="h-8 w-8" />}
              title="Team Workspaces"
              description="Multi-tenant workspaces with role-based permissions and team collaboration."
            />
            <FeatureCard
              icon={<GitBranch className="h-8 w-8" />}
              title="GitHub Integration"
              description="Sync repositories, link pull requests, and track commits directly from tasks."
            />
            <FeatureCard
              icon={<FileText className="h-8 w-8" />}
              title="Document Management"
              description="Create planning docs, specs, and notes with rich markdown support."
            />
            <FeatureCard
              icon={<CreditCard className="h-8 w-8" />}
              title="Flexible Billing"
              description="Subscription plans that scale with your team. Upgrade or downgrade anytime."
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8" />}
              title="Enterprise Security"
              description="SOC 2 ready with SSO support, audit logs, and encrypted data at rest."
            />
            <FeatureCard
              icon={<Zap className="h-8 w-8" />}
              title="Real-time Sync"
              description="Instant updates across all devices with distributed database technology."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Get Started in Minutes
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Simple setup process to get your team up and running quickly.
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <StepCard
              number="1"
              title="Create Your Workspace"
              description="Sign up and set up your team workspace with projects and invite members."
            />
            <StepCard
              number="2"
              title="Organize Your Tasks"
              description="Create issues, set priorities, assign team members, and track progress on kanban boards."
            />
            <StepCard
              number="3"
              title="Connect AI Agents"
              description="Use MCP tools to let AI assistants pick up tasks and update progress automatically."
            />
          </div>
        </div>
      </section>

      {/* MCP Integration Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 justify-center mb-4">
              <Terminal className="h-8 w-8 text-primary" />
              <h2 className="text-3xl font-bold">MCP Server Integration</h2>
            </div>
            <p className="text-muted-foreground text-center mb-8 max-w-2xl mx-auto">
              Connect your favorite AI coding assistants to iKanban using the
              Model Context Protocol. Let AI agents read tasks, update progress,
              and collaborate with your team.
            </p>
            <div className="bg-card border rounded-lg p-6 max-w-2xl mx-auto">
              <p className="text-sm text-muted-foreground mb-3">
                Add to your MCP configuration:
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>{`{
  "mcpServers": {
    "ikanban": {
      "type": "http",
      "url": "https://mcp.scho1ar.com/sse",
      "authorizationToken": "your_api_key"
    }
  }
}`}</code>
              </pre>
              <p className="text-xs text-muted-foreground mt-3">
                Generate your API key in Settings → API Keys after signing up.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Start free and scale as you grow. All plans include a 14-day trial.
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8">
            <PricingPreviewCard
              name="Starter"
              price="$19"
              features={['2 teams', '5 projects', '5 users', 'Email support']}
            />
            <PricingPreviewCard
              name="Professional"
              price="$39"
              features={[
                '10 teams',
                '25 projects',
                '25 users',
                'Email + Chat support',
              ]}
              highlighted
            />
            <PricingPreviewCard
              name="Enterprise"
              price="$99"
              features={[
                'Unlimited teams',
                'Unlimited projects',
                'Unlimited users',
                '24/7 phone support',
              ]}
            />
          </div>
          <Link to="/pricing">
            <Button variant="outline" size="lg">
              View Full Pricing Details
            </Button>
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join teams using iKanban to orchestrate AI agents and ship faster
            than ever before.
          </p>
          {canAccessDashboard ? (
            <Link to="/projects">
              <Button size="lg">Go to Dashboard</Button>
            </Link>
          ) : isSignedIn ? (
            <Button size="lg" disabled variant="outline">
              Awaiting Approval
            </Button>
          ) : (
            <div className="flex gap-4 justify-center">
              <Link to="/sign-up">
                <Button size="lg">Start Your Free Trial</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              iKanban - AI-Powered Task Management
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link
              to="/pricing"
              className="hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              to="/docs"
              className="hover:text-foreground transition-colors"
            >
              Documentation
            </Link>
            <a
              href="mailto:support@scho1ar.com"
              className="hover:text-foreground transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
        {number}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function PricingPreviewCard({
  name,
  price,
  features,
  highlighted = false,
}: {
  name: string;
  price: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`bg-card border rounded-lg p-6 ${highlighted ? 'border-primary shadow-lg' : ''}`}
    >
      <h3 className="font-semibold text-lg mb-1">{name}</h3>
      <p className="text-2xl font-bold mb-4">
        {price}
        <span className="text-sm font-normal text-muted-foreground">
          /month
        </span>
      </p>
      <ul className="space-y-2 text-sm text-left">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
