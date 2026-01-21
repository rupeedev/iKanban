import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import {
  Layers,
  ArrowLeft,
  Building2,
  Users,
  FolderKanban,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useUserRegistration } from '@/hooks/useUserRegistration';
import type { CreateUserRegistration } from 'shared/types';

export function RegisterPage() {
  const navigate = useNavigate();
  const { user, isLoaded: isUserLoaded } = useUser();
  const {
    isLoading: isRegistrationLoading,
    isApproved,
    isPending,
    isRejected,
    hasRegistration,
    createRegistration,
    isCreating,
  } = useUserRegistration();

  // Form state
  const [workspaceName, setWorkspaceName] = useState('');
  const [plannedTeams, setPlannedTeams] = useState<number>(1);
  const [plannedProjects, setPlannedProjects] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  // Redirect based on registration status
  useEffect(() => {
    if (isRegistrationLoading || !isUserLoaded) return;

    if (hasRegistration) {
      if (isApproved) {
        navigate('/workspace/new', { replace: true });
      } else if (isPending) {
        navigate('/pending-approval', { replace: true });
      } else if (isRejected) {
        navigate('/rejected', { replace: true });
      }
    }
  }, [
    isRegistrationLoading,
    isUserLoaded,
    hasRegistration,
    isApproved,
    isPending,
    isRejected,
    navigate,
  ]);

  // Pre-fill workspace name from user's name or organization
  useEffect(() => {
    if (user && !workspaceName) {
      const defaultName =
        user.firstName && user.lastName
          ? `${user.firstName}'s Workspace`
          : user.primaryEmailAddress?.emailAddress?.split('@')[0] +
              "'s Workspace" || 'My Workspace';
      setWorkspaceName(defaultName);
    }
  }, [user, workspaceName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      setError('You must be signed in to register.');
      return;
    }

    if (!workspaceName.trim()) {
      setError('Please enter a workspace name.');
      return;
    }

    try {
      const registrationData: CreateUserRegistration = {
        clerk_user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress || '',
        first_name: user.firstName,
        last_name: user.lastName,
        workspace_name: workspaceName.trim(),
        planned_teams: plannedTeams,
        planned_projects: plannedProjects,
      };

      await createRegistration(registrationData);
      navigate('/pending-approval', { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    }
  };

  // Loading state
  if (!isUserLoaded || isRegistrationLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Not signed in state
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Layers className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold text-white">iKanban</h1>
          </div>
        </div>
        <div className="w-full max-w-md bg-zinc-800/50 border border-zinc-700 rounded-lg p-8 text-center">
          <p className="text-zinc-400 mb-4">
            Please sign in to register for a workspace.
          </p>
          <Button asChild>
            <Link to="/sign-in">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
      {/* Branding */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <p className="text-zinc-400">Register Your Workspace</p>
      </div>

      {/* Registration Form */}
      <div className="w-full max-w-md bg-zinc-800/50 border border-zinc-700 rounded-lg p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* User Info Display */}
          <div className="bg-zinc-900/50 rounded-lg p-4 mb-6">
            <p className="text-sm text-zinc-400 mb-1">Registering as:</p>
            <p className="text-white font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-sm text-zinc-400">
              {user.primaryEmailAddress?.emailAddress}
            </p>
          </div>

          {/* Workspace Name */}
          <div className="space-y-2">
            <Label htmlFor="workspace-name" className="text-zinc-200">
              <Building2 className="inline-block h-4 w-4 mr-2" />
              Workspace Name
            </Label>
            <Input
              id="workspace-name"
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="My Workspace"
              className="bg-zinc-900 border-zinc-600 text-white"
              required
            />
            <p className="text-xs text-zinc-500">
              This will be the name of your organization in iKanban.
            </p>
          </div>

          {/* Planned Teams */}
          <div className="space-y-2">
            <Label htmlFor="planned-teams" className="text-zinc-200">
              <Users className="inline-block h-4 w-4 mr-2" />
              Planned Number of Teams
            </Label>
            <Input
              id="planned-teams"
              type="number"
              min={1}
              max={50}
              value={plannedTeams}
              onChange={(e) => setPlannedTeams(parseInt(e.target.value) || 1)}
              className="bg-zinc-900 border-zinc-600 text-white"
            />
            <p className="text-xs text-zinc-500">
              How many teams do you plan to have? (1-50)
            </p>
          </div>

          {/* Planned Projects */}
          <div className="space-y-2">
            <Label htmlFor="planned-projects" className="text-zinc-200">
              <FolderKanban className="inline-block h-4 w-4 mr-2" />
              Planned Number of Projects
            </Label>
            <Input
              id="planned-projects"
              type="number"
              min={1}
              max={100}
              value={plannedProjects}
              onChange={(e) =>
                setPlannedProjects(parseInt(e.target.value) || 1)
              }
              className="bg-zinc-900 border-zinc-600 text-white"
            />
            <p className="text-xs text-zinc-500">
              How many projects do you plan to create? (1-100)
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Registration Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isCreating || !workspaceName.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Registration'
            )}
          </Button>

          {/* Info Box */}
          <div className="bg-zinc-900/50 rounded-lg p-4 text-sm text-zinc-300">
            <p className="font-medium text-white mb-2">What happens next?</p>
            <ul className="list-disc list-inside space-y-1 text-zinc-400">
              <li>Your registration will be reviewed by an administrator</li>
              <li>You&apos;ll receive a notification when approved</li>
              <li>Once approved, you can set up your workspace</li>
            </ul>
          </div>
        </form>
      </div>

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
