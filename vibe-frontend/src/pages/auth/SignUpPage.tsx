import { SignUp } from '@clerk/clerk-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, ArrowLeft } from 'lucide-react';
import { VALID_PLANS, type PricingPlan } from '@/types/workspace';

export function SignUpPage() {
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get('plan');

  // Validate plan parameter and build redirect URL with plan preserved
  const selectedPlan =
    planParam && VALID_PLANS.includes(planParam as PricingPlan)
      ? (planParam as PricingPlan)
      : null;

  // Pass plan to workspace setup via URL parameter
  const redirectUrl = selectedPlan
    ? `/workspace/new?plan=${selectedPlan}`
    : '/workspace/new';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
      {/* Branding */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <p className="text-zinc-400">Your AI Task Tracker</p>
      </div>

      {/* Clerk SignUp Component */}
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl={redirectUrl}
      />

      {/* Back link */}
      <Link
        to="/"
        className="mt-8 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  );
}
