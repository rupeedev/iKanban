import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { circuitBreaker, type CircuitState } from '@/lib/circuitBreaker';

export type ConnectionState = 'online' | 'degraded' | 'offline';
export type { CircuitState };

interface ConnectionContextValue {
  /** Current connection state */
  state: ConnectionState;
  /** Current circuit breaker state */
  circuitState: CircuitState;
  /** Timestamp of last successful API call */
  lastOnline: Date | null;
  /** Call this when an API request succeeds */
  reportSuccess: () => void;
  /** Call this when an API request fails */
  reportFailure: (error: Error) => void;
  /** Whether write operations should be allowed (queued if false) */
  isWriteAllowed: boolean;
  /** Number of consecutive failures */
  failureCount: number;
  /** Whether the service is available (circuit is not open) */
  isServiceAvailable: boolean;
  /** Time remaining until circuit enters half-open state (in ms) */
  timeUntilRetry: number;
  /** Force reset the circuit breaker */
  resetCircuit: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

interface ConnectionProviderProps {
  children: React.ReactNode;
}

// Number of consecutive failures before transitioning to degraded
const FAILURE_THRESHOLD = 2;

export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const [state, setState] = useState<ConnectionState>('online');
  const [circuitState, setCircuitState] = useState<CircuitState>('closed');
  const [lastOnline, setLastOnline] = useState<Date | null>(new Date());
  const [failureCount, setFailureCount] = useState(0);
  const [timeUntilRetry, setTimeUntilRetry] = useState(0);

  // Use ref to track if we're in initial load (don't show errors immediately)
  const isInitialLoad = useRef(true);

  // Subscribe to circuit breaker state changes
  useEffect(() => {
    const unsubscribe = circuitBreaker.onStateChange((newState) => {
      setCircuitState(newState);

      // Sync circuit state with connection state
      if (newState === 'open') {
        setState('offline');
      } else if (newState === 'closed') {
        setState('online');
      }
    });

    // Initialize with current state
    setCircuitState(circuitBreaker.getState());

    return unsubscribe;
  }, []);

  // Update time until retry when circuit is open
  useEffect(() => {
    if (circuitState !== 'open') {
      setTimeUntilRetry(0);
      return;
    }

    // Update immediately
    setTimeUntilRetry(circuitBreaker.getTimeUntilHalfOpen());

    // Update every second
    const interval = setInterval(() => {
      const remaining = circuitBreaker.getTimeUntilHalfOpen();
      setTimeUntilRetry(remaining);

      // Check if circuit should transition to half-open
      if (remaining <= 0) {
        // Force a state check which may trigger transition
        circuitBreaker.getState();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [circuitState]);

  // Listen for browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      // Browser says we're online, but wait for API success to confirm
      // Don't immediately set to online, just reset failure count
      setFailureCount(0);
    };

    const handleOffline = () => {
      setState('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      setState('offline');
    }

    // Mark initial load complete after a short delay
    const timer = setTimeout(() => {
      isInitialLoad.current = false;
    }, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(timer);
    };
  }, []);

  const reportSuccess = useCallback(() => {
    setState('online');
    setLastOnline(new Date());
    setFailureCount(0);
    isInitialLoad.current = false;
  }, []);

  const reportFailure = useCallback((error: Error) => {
    // During initial load, be more lenient
    if (isInitialLoad.current) {
      return;
    }

    setFailureCount((prev) => {
      const newCount = prev + 1;

      // Check if this is a network error vs server error
      const isNetworkError =
        error.message.includes('Failed to fetch') ||
        error.message.includes('Network request failed') ||
        error.message.includes('net::ERR_');

      if (isNetworkError && !navigator.onLine) {
        setState('offline');
      } else if (newCount >= FAILURE_THRESHOLD) {
        setState('degraded');
      }

      return newCount;
    });
  }, []);

  const resetCircuit = useCallback(() => {
    circuitBreaker.reset();
  }, []);

  const isWriteAllowed = state === 'online';
  const isServiceAvailable = circuitState !== 'open';

  const value: ConnectionContextValue = {
    state,
    circuitState,
    lastOnline,
    reportSuccess,
    reportFailure,
    isWriteAllowed,
    failureCount,
    isServiceAvailable,
    timeUntilRetry,
    resetCircuit,
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}

/**
 * Safe version of useConnection that returns default values if not in provider.
 * Useful for components that might render outside the provider during SSR or testing.
 */
export function useConnectionSafe(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    return {
      state: 'online',
      circuitState: 'closed',
      lastOnline: null,
      reportSuccess: () => {},
      reportFailure: () => {},
      isWriteAllowed: true,
      failureCount: 0,
      isServiceAvailable: true,
      timeUntilRetry: 0,
      resetCircuit: () => {},
    };
  }
  return context;
}
