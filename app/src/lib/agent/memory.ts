/**
 * Circuit Protocol — Persistent Structured Conversational Memory
 *
 * Maintains bounded session context and user preference history per wallet.
 * Resolves conversational follow-ups and context references without prompt bloat.
 *
 * Cardinal Invariant:
 * Memory CANNOT grant authority.
 * Memory CANNOT override Risk Ratchet, Permission Engine, Expiry, or Borrow Limits.
 * Authority always derives strictly from verified on-chain PDA state.
 */

export interface StructuredPositionContext {
  symbol: string;
  collateralUsd: number;
  debtUsd: number;
  healthFactor: number | null;
}

export interface StructuredDecisionSummary {
  action: string;
  symbol: string;
  allowed: boolean;
  reason: string;
  timestamp: number;
}

export interface AgentMemoryContext {
  walletAddress: string;
  network: string;
  activeAssetSymbol: string;
  positions: StructuredPositionContext[];
  activeStrategyObjective: string | null;
  delegatedAuthority: {
    address: string;
    maxBorrowUsd: number;
    expiryTs: number;
  } | null;
  activeTaskIds: string[];
  recentDecisions: StructuredDecisionSummary[];
  recentTxSignatures: string[];
  conversationSummary: string | null;
  updatedAt: number;
}

class PersistentAgentMemory {
  private cache = new Map<string, AgentMemoryContext>();

  private storageKey(wallet: string): string {
    return `circuit_agent_memory_${wallet}`;
  }

  public getMemory(wallet: string): AgentMemoryContext {
    if (!wallet) return this.createEmptyMemory("anonymous");

    if (this.cache.has(wallet)) {
      return { ...this.cache.get(wallet)! };
    }

    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(this.storageKey(wallet));
        if (stored) {
          const parsed = JSON.parse(stored) as AgentMemoryContext;
          this.cache.set(wallet, parsed);
          return parsed;
        }
      } catch {
        // Fallback to fresh memory on parse error
      }
    }

    const fresh = this.createEmptyMemory(wallet);
    this.cache.set(wallet, fresh);
    return fresh;
  }

  public updateMemory(wallet: string, patch: Partial<AgentMemoryContext>): AgentMemoryContext {
    const current = this.getMemory(wallet);
    const updated: AgentMemoryContext = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };

    // Keep bounded history
    if (updated.recentDecisions.length > 10) {
      updated.recentDecisions = updated.recentDecisions.slice(-10);
    }
    if (updated.recentTxSignatures.length > 5) {
      updated.recentTxSignatures = updated.recentTxSignatures.slice(-5);
    }

    this.cache.set(wallet, updated);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(this.storageKey(wallet), JSON.stringify(updated));
      } catch {
        // Ignore quota errors
      }
    }

    return updated;
  }

  /**
   * Records a validated action or proposal decision to memory.
   */
  public recordDecision(
    wallet: string,
    decision: { action: string; symbol?: string; allowed: boolean; reason: string; txSignature?: string }
  ): void {
    const mem = this.getMemory(wallet);
    const summary: StructuredDecisionSummary = {
      action: decision.action,
      symbol: decision.symbol || mem.activeAssetSymbol,
      allowed: decision.allowed,
      reason: decision.reason,
      timestamp: Date.now(),
    };
    const recentDecisions = [summary, ...mem.recentDecisions].slice(0, 10);
    const recentTxSignatures = decision.txSignature
      ? [decision.txSignature, ...mem.recentTxSignatures].slice(0, 5)
      : mem.recentTxSignatures;
    this.updateMemory(wallet, {
      activeAssetSymbol: decision.symbol || mem.activeAssetSymbol,
      recentDecisions,
      recentTxSignatures,
    });
  }

  /**
   * Resolves natural conversational references (e.g. "it", "that", "the limit", "stop that").
   */
  public resolveContextualReference(wallet: string, userText: string): { resolvedAsset?: string; resolvedAction?: string } {
    const mem = this.getMemory(wallet);
    const lower = userText.toLowerCase();

    let resolvedAsset: string | undefined = undefined;
    let resolvedAction: string | undefined = undefined;

    // Check if user refers to previous asset implicitly
    if (lower.includes("it") || lower.includes("that") || lower.includes("this position")) {
      resolvedAsset = mem.activeAssetSymbol;
    }

    if (lower.includes("stop that") || lower.includes("cancel it") || lower.includes("pause that")) {
      resolvedAction = "CANCEL_TASK";
    }

    return { resolvedAsset, resolvedAction };
  }

  public clearMemory(wallet: string): void {
    this.cache.delete(wallet);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(this.storageKey(wallet));
      } catch {
        // Ignore
      }
    }
  }

  private createEmptyMemory(wallet: string): AgentMemoryContext {
    return {
      walletAddress: wallet,
      network: "devnet",
      activeAssetSymbol: "NVDA",
      positions: [],
      activeStrategyObjective: null,
      delegatedAuthority: null,
      activeTaskIds: [],
      recentDecisions: [],
      recentTxSignatures: [],
      conversationSummary: null,
      updatedAt: Date.now(),
    };
  }
}

export const persistentAgentMemory = new PersistentAgentMemory();
