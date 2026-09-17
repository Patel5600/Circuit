/**
 * Circuit Protocol - Agent Harness Rate Limiter & Loop Detector
 *
 * Implements multi-tier rate limiting:
 * 1. Conversational rate limits (prevent rapid spam)
 * 2. Financial execution rate limits (prevent double-spending & rapid-fire transactions)
 * 3. Loop detection (detect repeated identical tool/action failures)
 */

export interface RateLimiterConfig {
  maxChatPerMinute: number;
  maxExecutionsPerMinute: number;
  executionCooldownMs: number;
  maxConsecutiveIdenticalActions: number;
}

export const DEFAULT_RATE_CONFIG: RateLimiterConfig = {
  maxChatPerMinute: 30,
  maxExecutionsPerMinute: 10,
  executionCooldownMs: 3000,
  maxConsecutiveIdenticalActions: 3,
};

export class AgentHarnessRateLimiter {
  private chatTimestamps: number[] = [];
  private executionTimestamps: number[] = [];
  private lastExecutionTime: number = 0;
  private actionHistory: { action: string; asset: string; amount?: number; success: boolean }[] = [];

  constructor(private config: RateLimiterConfig = DEFAULT_RATE_CONFIG) {}

  /**
   * Check if a chat message is allowed
   */
  public checkChatLimit(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const oneMinAgo = now - 60_000;
    this.chatTimestamps = this.chatTimestamps.filter(t => t > oneMinAgo);

    if (this.chatTimestamps.length >= this.config.maxChatPerMinute) {
      return {
        allowed: false,
        reason: "You're sending requests too quickly. Please wait a moment before trying again.",
      };
    }

    this.chatTimestamps.push(now);
    return { allowed: true };
  }

  /**
   * Check if a financial execution (signing/submitting) is allowed
   */
  public checkExecutionLimit(action: string, asset: string, amount?: number): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // 1. Minimum cooldown between executions
    if (now - this.lastExecutionTime < this.config.executionCooldownMs) {
      const waitSec = Math.ceil((this.config.executionCooldownMs - (now - this.lastExecutionTime)) / 1000);
      return {
        allowed: false,
        reason: `Please wait ${waitSec}s before initiating another transaction.`,
      };
    }

    // 2. Max executions per minute
    const oneMinAgo = now - 60_000;
    this.executionTimestamps = this.executionTimestamps.filter(t => t > oneMinAgo);
    if (this.executionTimestamps.length >= this.config.maxExecutionsPerMinute) {
      return {
        allowed: false,
        reason: "This action is temporarily limited by your execution policy. Please try again in 1 minute.",
      };
    }

    // 3. Loop detection: repeated identical failing actions
    const recent = this.actionHistory.slice(-this.config.maxConsecutiveIdenticalActions);
    if (
      recent.length >= this.config.maxConsecutiveIdenticalActions &&
      recent.every(r => r.action === action && r.asset === asset && !r.success)
    ) {
      return {
        allowed: false,
        reason: `Repeated execution attempts for ${action.toUpperCase()} ${asset} did not produce a valid state change. Action paused.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record completion of an execution
   */
  public recordExecution(action: string, asset: string, amount?: number, success: boolean = true): void {
    const now = Date.now();
    this.lastExecutionTime = now;
    this.executionTimestamps.push(now);
    this.actionHistory.push({ action, asset, amount, success });
    if (this.actionHistory.length > 20) {
      this.actionHistory.shift();
    }
  }

  /**
   * Reset limits
   */
  public reset(): void {
    this.chatTimestamps = [];
    this.executionTimestamps = [];
    this.lastExecutionTime = 0;
    this.actionHistory = [];
  }
}
