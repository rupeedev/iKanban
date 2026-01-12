/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents the frontend from wasting resources when the backend is down.
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service unavailable, requests fail fast without network calls
 * - HALF_OPEN: Testing if service is back, allows limited requests
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before trying half-open state (default: 30000) */
  resetTimeout: number;
  /** Number of test requests allowed in half-open state (default: 1) */
  halfOpenMaxRequests: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenMaxRequests: 1,
};

export class CircuitOpenError extends Error {
  constructor(message = 'Circuit is open - service unavailable') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

type StateChangeCallback = (state: CircuitState, previousState: CircuitState) => void;

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private halfOpenRequestCount = 0;
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if circuit allows the request to proceed.
   * Handles automatic transition from OPEN to HALF-OPEN after timeout.
   */
  canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if reset timeout has passed
        if (this.shouldTransitionToHalfOpen()) {
          this.transitionTo('half-open');
          return true;
        }
        return false;

      case 'half-open':
        // Allow limited requests in half-open state
        if (this.halfOpenRequestCount < this.config.halfOpenMaxRequests) {
          this.halfOpenRequestCount++;
          return true;
        }
        return false;
    }
  }

  /**
   * Record a successful request.
   * Closes the circuit if in half-open state.
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;

    if (this.state === 'half-open') {
      this.transitionTo('closed');
    }
  }

  /**
   * Record a failed request.
   * May open the circuit if failure threshold is reached.
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Failure in half-open immediately reopens
      this.transitionTo('open');
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  /**
   * Get the current circuit state.
   */
  getState(): CircuitState {
    // Check for automatic transition to half-open
    if (this.state === 'open' && this.shouldTransitionToHalfOpen()) {
      this.transitionTo('half-open');
    }
    return this.state;
  }

  /**
   * Get the current failure count.
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get time remaining until half-open transition (in ms).
   * Returns 0 if not in open state.
   */
  getTimeUntilHalfOpen(): number {
    if (this.state !== 'open' || !this.lastFailureTime) {
      return 0;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeout - elapsed);
  }

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Manually reset the circuit to closed state.
   * Use with caution - typically the circuit should manage itself.
   */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenRequestCount = 0;
    if (this.state !== 'closed') {
      this.transitionTo('closed');
    }
  }

  /**
   * Force the circuit to open state.
   * Useful for testing or manual intervention.
   */
  forceOpen(): void {
    this.transitionTo('open');
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const previousState = this.state;
    this.state = newState;

    // Reset half-open request count on state change
    if (newState === 'half-open') {
      this.halfOpenRequestCount = 0;
    }

    // Notify listeners
    this.stateChangeCallbacks.forEach((callback) => {
      try {
        callback(newState, previousState);
      } catch (e) {
        console.error('Circuit breaker state change callback error:', e);
      }
    });
  }
}

// Singleton instance for the main API circuit breaker
export const circuitBreaker = new CircuitBreaker();

/**
 * Wrapper function to execute a request with circuit breaker protection.
 * @throws CircuitOpenError if circuit is open
 */
export async function withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  if (!circuitBreaker.canExecute()) {
    throw new CircuitOpenError();
  }

  try {
    const result = await fn();
    circuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    circuitBreaker.recordFailure();
    throw error;
  }
}
