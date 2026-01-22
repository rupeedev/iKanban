import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';
import { ClickToComponent } from 'click-to-react-component';
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { ClerkProvider } from '@clerk/clerk-react';
import { AuthInitializer } from '@/components/auth/AuthInitializer';
import { createIndexedDBPersister } from '@/lib/indexedDBPersister';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { SyncQueueProvider } from '@/contexts/SyncQueueContext';
// Import modal type definitions
import './types/modals';

// Clerk publishable key from environment
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_PUBLISHABLE_KEY) {
  console.warn(
    'Clerk publishable key not set. Authentication will be disabled. ' +
      'To enable, copy frontend/.env.local.example to frontend/.env.local and add your key.'
  );
}

// Initialize PostHog analytics (only if configured)
if (
  import.meta.env.VITE_POSTHOG_API_KEY &&
  import.meta.env.VITE_POSTHOG_API_ENDPOINT
) {
  posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_API_ENDPOINT,
    capture_pageview: false,
    capture_pageleave: true,
    capture_performance: true,
    autocapture: false,
    opt_out_capturing_by_default: true,
  });
}
// Note: Analytics disabled when PostHog env vars are not set

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')
    );
  }
  return false;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // 30 minutes (increased for better offline support)
      gcTime: 1000 * 60 * 60, // 1 hour (was cacheTime, for persistence)
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // Prevent burst of requests on reconnect
      retry: (failureCount, error) => {
        // Never retry rate limit errors - retrying makes it worse
        if (isRateLimitError(error)) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff, max 30s
    },
  },
});

// Create IndexedDB persister for offline cache survival
const persister = createIndexedDBPersister();

// Persistence configuration
const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v1', // Change this to invalidate all caches
};

// Render app with optional ClerkProvider wrapper
const AppWithProviders = () => (
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <ConnectionProvider>
        <SyncQueueProvider>
          <PostHogProvider client={posthog}>
            <ClickToComponent />
            <VibeKanbanWebCompanion />
            <App />
          </PostHogProvider>
        </SyncQueueProvider>
      </ConnectionProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <AuthInitializer />
      <AppWithProviders />
    </ClerkProvider>
  ) : (
    <AppWithProviders />
  )
);
