/**
 * Centralized error classification for Circuit.
 *
 * Maps Solana/Anchor/network errors to human-readable messages.
 * Never displays raw stack traces to users.
 */

export interface ClassifiedError {
  title: string;
  message: string;
  retryable: boolean;
  /** Human-readable suggestion for what to do next */
  suggestion?: string;
}

/**
 * Classify any thrown error into a user-facing message.
 * The source can be an Error, a string, an Anchor error object, or unknown.
 */
export function classifyError(err: unknown): ClassifiedError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Wallet rejected
  if (
    lower.includes("user rejected") ||
    lower.includes("rejected") ||
    lower.includes("denied by user") ||
    lower.includes("user cancelled")
  ) {
    return {
      title: "Transaction rejected",
      message: "Your wallet rejected the transaction.",
      retryable: true,
      suggestion: "Review the transaction details and try again.",
    };
  }

  // Stale oracle / oracle freshness
  if (
    lower.includes("stale") ||
    lower.includes("oracle") ||
    lower.includes("price feed") ||
    lower.includes("6018") // Anchor error code for stale oracle
  ) {
    return {
      title: "Oracle stale",
      message:
        "Market data is too old for this action. Risk-increasing actions remain blocked until a valid observation is available.",
      retryable: true,
      suggestion: "Wait a moment for a fresh price observation, then retry.",
    };
  }

  // Permission / risk engine blocked
  if (
    lower.includes("blocked") ||
    lower.includes("permission") ||
    lower.includes("policy") ||
    lower.includes("6000") || // capital policy violation
    lower.includes("6001")
  ) {
    return {
      title: "Action blocked",
      message: "This action is blocked by the current Circuit policy.",
      retryable: false,
      suggestion: "Check your risk state and policy limits.",
    };
  }

  // Network / RPC errors
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("connection") ||
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return {
      title: "Network error",
      message:
        "Could not reach Solana RPC. Your previous state is preserved.",
      retryable: true,
      suggestion: "Check your connection and try again.",
    };
  }

  // Insufficient funds / balance
  if (
    lower.includes("insufficient") ||
    lower.includes("insufficient funds") ||
    lower.includes("0x1") // lamports
  ) {
    return {
      title: "Insufficient balance",
      message: "Your wallet does not have enough SOL to pay transaction fees.",
      retryable: false,
      suggestion: "Add SOL to your wallet from the Devnet Faucet.",
    };
  }

  // Health factor too low
  if (lower.includes("health factor") || lower.includes("6010")) {
    return {
      title: "Health factor too low",
      message: "This action would bring your health factor below the minimum. Repay debt first.",
      retryable: false,
      suggestion: "Repay some debt or deposit more collateral.",
    };
  }

  // Agent not authorized
  if (
    lower.includes("agent") ||
    lower.includes("unauthorized") ||
    lower.includes("authority")
  ) {
    return {
      title: "Agent not authorized",
      message:
        "The agent does not have permission to perform this action. Set up a valid authority.",
      retryable: false,
      suggestion: "Configure agent authority in the Permissions tab.",
    };
  }

  // Transaction simulation failed
  if (lower.includes("simulation") || lower.includes("simulate")) {
    return {
      title: "Transaction simulation failed",
      message: "The transaction was rejected during simulation. No funds were moved.",
      retryable: true,
      suggestion: "Check your position state and retry.",
    };
  }

  // Meteora DBC unavailable
  if (
    lower.includes("dbc_unavailable") ||
    lower.includes("meteora unavailable") ||
    lower.includes("meteora unreachable") ||
    lower.includes("dbc unavailable")
  ) {
    return {
      title: "DBC execution unavailable",
      message:
        "Meteora DBC execution is currently unavailable. Circuit lending, borrowing, and positions are unaffected.",
      retryable: true,
      suggestion: "Circuit core functionality continues. Retry DBC action when Meteora RPC recovers.",
    };
  }

  // DBC pool not registered
  if (lower.includes("dbc_pool_not_registered") || lower.includes("pool not registered")) {
    return {
      title: "Pool not registered",
      message: "This pool is not in Circuit's canonical DBC pool registry.",
      retryable: false,
      suggestion: "Only registered Meteora DBC pools can be used for DBC actions.",
    };
  }

  // DBC wrong pool / identity mismatch
  if (
    lower.includes("invaliddbc") ||
    lower.includes("invalid_dbc_pool") ||
    lower.includes("pool identity mismatch") ||
    lower.includes("dbc pool mismatch")
  ) {
    return {
      title: "Pool identity mismatch",
      message:
        "The provided DBC pool does not match the canonical pool in Circuit's registry.",
      retryable: false,
      suggestion: "Only use pools provided by Circuit's pool registry.",
    };
  }

  // DBC slippage exceeded
  if (
    lower.includes("dbc_slippage") ||
    lower.includes("slippage exceeded") ||
    lower.includes("slippage violation") ||
    lower.includes("dbcslippage")
  ) {
    return {
      title: "Slippage limit exceeded",
      message:
        "The actual received amount is below the minimum enforced by Circuit (slippage exceeded).",
      retryable: true,
      suggestion: "Reduce trade size or increase slippage tolerance (max 200 bps).",
    };
  }

  // DBC action blocked by risk state
  if (
    lower.includes("dbc_action_blocked") ||
    lower.includes("dbc action blocked") ||
    lower.includes("dbc risk state")
  ) {
    return {
      title: "DBC action blocked",
      message:
        "This DBC action is blocked by the current Risk Ratchet state. Only recovery-safe actions are permitted.",
      retryable: false,
      suggestion: "Exit liquidity or recover position to reduce risk exposure.",
    };
  }

  // DBC pool stale
  if (lower.includes("dbc stale") || lower.includes("dbc_stale")) {
    return {
      title: "Pool state stale",
      message: "DBC pool state has not been refreshed recently. Data may be outdated.",
      retryable: true,
      suggestion: "Refresh the DBC pool state and try again.",
    };
  }

  // Generic fallback
  return {
    title: "Something went wrong",
    message: "An unexpected error occurred while completing this action.",
    retryable: true,
    suggestion: "Try again. If the problem persists, check the Solana explorer.",
  };
}

/**
 * Extract a transaction signature from an Anchor/Solana error if present.
 */
export function extractTxSignature(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  if (typeof e.signature === "string") return e.signature;
  if (typeof e.txSignature === "string") return e.txSignature;
  // Some wallets wrap in logs
  const msg = err instanceof Error ? err.message : "";
  const match = msg.match(/([A-Za-z0-9]{87,88})/);
  return match ? match[1] : null;
}
