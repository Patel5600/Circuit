/**
 * Circuit Protocol — Agent Chain Limits & Cost Circuit Breaker
 *
 * Implements multi-tier rate limiting, runaway loop detection, and emergency
 * cost circuit breakers to prevent budget exhaustion or runaway recursive tool calls.
 * Follows OWASP recommendations for autonomous agent safety.
 */

export interface ChainLimits {
  maxStepsPerRun: number;
  maxToolCallsPerRun: number;
  maxRecursionDepth: number;
  maxRetries: number;
  maxParallelCalls: number;
  maxWorkflowDurationMs: number;
}

export const CANONICAL_CHAIN_LIMITS: ChainLimits = {
  maxStepsPerRun: 10,
  maxToolCallsPerRun: 15,
  maxRecursionDepth: 3,
  maxRetries: 2,
  maxParallelCalls: 5,
  maxWorkflowDurationMs: 60_000,
};

export interface CircuitBreakerState {
  isTripped: boolean;
  reason: string | null;
  trippedAt: number | null;
  recentCreditsBurned: number;
  consecutiveFailures: number;
  consecutiveToolCount: number;
}

class AgentCircuitBreaker {
  private walletStates = new Map<string, CircuitBreakerState>();
  private walletRequests = new Map<string, number[]>(); // Timestamps
  private walletProCalls = new Map<string, number[]>();

  // Thresholds
  private MAX_REQUESTS_PER_MIN = 30;
  private MAX_PRO_CALLS_PER_HOUR = 20;
  private MAX_BURN_RATE_5MIN = 35; // Credits
  private MAX_CONSECUTIVE_FAILURES = 3;

  private getState(wallet: string): CircuitBreakerState {
    let s = this.walletStates.get(wallet);
    if (!s) {
      s = {
        isTripped: false,
        reason: null,
        trippedAt: null,
        recentCreditsBurned: 0,
        consecutiveFailures: 0,
        consecutiveToolCount: 0,
      };
      this.walletStates.set(wallet, s);
    }
    return s;
  }

  /**
   * Check if wallet is permitted to make a request.
   */
  public checkRateLimit(wallet: string, isPro = false): { allowed: boolean; error?: string } {
    const s = this.getState(wallet);
    if (s.isTripped) {
      return {
        allowed: false,
        error: `Agent Cost Circuit Breaker is active: ${s.reason}. Reset required before new executions.`,
      };
    }

    const now = Date.now();
    const oneMinAgo = now - 60_000;
    const oneHourAgo = now - 3600_000;

    // Check request rate
    let reqs = this.walletRequests.get(wallet) || [];
    reqs = reqs.filter(t => t > oneMinAgo);
    if (reqs.length >= this.MAX_REQUESTS_PER_MIN) {
      return {
        allowed: false,
        error: `Rate limit exceeded: Maximum ${this.MAX_REQUESTS_PER_MIN} agent requests per minute.`,
      };
    }
    reqs.push(now);
    this.walletRequests.set(wallet, reqs);

    // Check Pro invocations limit
    if (isPro) {
      let pros = this.walletProCalls.get(wallet) || [];
      pros = pros.filter(t => t > oneHourAgo);
      if (pros.length >= this.MAX_PRO_CALLS_PER_HOUR) {
        return {
          allowed: false,
          error: `Pro rate limit exceeded: Maximum ${this.MAX_PRO_CALLS_PER_HOUR} Circuit Pro runs per hour. Use Circuit Lite.`,
        };
      }
      pros.push(now);
      this.walletProCalls.set(wallet, pros);
    }

    return { allowed: true };
  }

  /**
   * Record credit consumption to monitor burn velocity.
   */
  public recordCreditConsumption(wallet: string, amount: number): void {
    const s = this.getState(wallet);
    s.recentCreditsBurned += amount;

    if (s.recentCreditsBurned >= this.MAX_BURN_RATE_5MIN) {
      this.tripBreaker(wallet, `Abnormal credit burn rate (${s.recentCreditsBurned} credits consumed rapidly)`);
    }

    // Reset sliding burn counter after 5 minutes
    setTimeout(() => {
      s.recentCreditsBurned = Math.max(0, s.recentCreditsBurned - amount);
    }, 5 * 60 * 1000);
  }

  public recordSuccess(wallet: string): void {
    const s = this.getState(wallet);
    s.consecutiveFailures = 0;
    s.consecutiveToolCount = 0;
  }

  public recordFailure(wallet: string, reason: string): void {
    const s = this.getState(wallet);
    s.consecutiveFailures += 1;

    if (s.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      this.tripBreaker(wallet, `Loop detector triggered: ${this.MAX_CONSECUTIVE_FAILURES} consecutive identical failures (${reason})`);
    }
  }

  public tripBreaker(wallet: string, reason: string): void {
    const s = this.getState(wallet);
    s.isTripped = true;
    s.reason = reason;
    s.trippedAt = Date.now();
  }

  public resetBreaker(wallet: string): void {
    const s = this.getState(wallet);
    s.isTripped = false;
    s.reason = null;
    s.trippedAt = null;
    s.consecutiveFailures = 0;
    s.recentCreditsBurned = 0;
  }

  public isTripped(wallet: string): boolean {
    return this.getState(wallet).isTripped;
  }

  public getTripReason(wallet: string): string | null {
    return this.getState(wallet).reason;
  }

  public resetAll(): void {
    this.walletStates.clear();
    this.walletRequests.clear();
    this.walletProCalls.clear();
  }
}

export const agentCircuitBreaker = new AgentCircuitBreaker();
