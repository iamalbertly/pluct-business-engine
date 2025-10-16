export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

export class PluctCircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'closed',
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0
  };
  
  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 60000; // 1 minute
  private readonly halfOpenMaxCalls = 3;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (Date.now() - this.state.lastFailureTime > this.recoveryTimeout) {
        this.state.state = 'half-open';
        this.state.successCount = 0;
        console.log('be:circuit_breaker msg=transitioning to half-open state');
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }

    if (this.state.state === 'half-open' && this.state.successCount >= this.halfOpenMaxCalls) {
      this.state.state = 'closed';
      this.state.failureCount = 0;
      console.log('be:circuit_breaker msg=transitioning to closed state - service recovered');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state.state === 'half-open') {
      this.state.successCount++;
    } else {
      this.state.failureCount = Math.max(0, this.state.failureCount - 1);
    }
  }

  private onFailure() {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.failureCount >= this.failureThreshold) {
      this.state.state = 'open';
      console.log('be:circuit_breaker msg=transitioning to open state - service failing');
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}
