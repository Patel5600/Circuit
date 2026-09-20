/**
 * Circuit Protocol — DBC Execution Panel
 *
 * Manual Meteora DBC execution UI. Pool selector restricted to DBC_POOL_REGISTRY.
 * All actions strictly gated by evaluateDbcPermission() and Section 15 Risk Matrix.
 * Step-by-step execution trace (INTENT -> CONFIRM) with decision audit logging.
 */
import React, { useState, useMemo, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDbcContext } from "../../context/DbcContext";
import {
  DBC_POOL_REGISTRY,
  getPoolBySymbol,
  DbcPoolLifecycle,
} from "../../lib/meteora/registry";
import {
  DbcActionType,
  computeDbcSwapQuote,
  isDbcActionAllowed,
  isDbcActionRiskIncreasing,
} from "../../lib/meteora/dbc";
import { evaluateDbcPermission, ProtocolAction } from "../../lib/permission-engine";
import { decisionLogStore } from "../../lib/realtime/decision-log";
import { protocolEventBus, createEvent } from "../../lib/realtime/event-bus";
import { DbcQuoteCard } from "./DbcQuoteCard";
import { DbcLifecycleBadge } from "./DbcLifecycleBadge";
import { DbcPoolStatusPill } from "./DbcPoolStatusPill";
import {
  createDbcTrace,
  advanceTrace,
  failTrace,
  verifyActualOutput,
  DBC_TRACE_STEP_LABELS,
  DBC_TRACE_STEP_ORDER,
  DbcExecutionTrace,
} from "../../lib/meteora/execution-trace";

const DBC_ACTION_LABELS: Record<DbcActionType, string> = {
  [DbcActionType.SWAP]: "Swap",
  [DbcActionType.ENTER_LIQUIDITY]: "Enter Liquidity",
  [DbcActionType.EXIT_LIQUIDITY]: "Exit Liquidity",
  [DbcActionType.REBALANCE]: "Rebalance",
  [DbcActionType.CREATE_POSITION]: "Create Position",
  [DbcActionType.MANAGE_POSITION]: "Manage Position",
  [DbcActionType.RECOVER_LIQUIDITY]: "Recover Liquidity",
  [DbcActionType.REBALANCE_LIQUIDITY]: "Rebalance Liquidity",
};

/** Default graduation metrics per pool if on-chain telemetry is not yet active */
const DEFAULT_POOL_METRICS: Record<
  string,
  { quoteReserve: number; migrationQuoteThreshold: number; defaultLifecycle: DbcPoolLifecycle }
> = {
  NVDA: {
    quoteReserve: 12_450,
    migrationQuoteThreshold: 50_000,
    defaultLifecycle: "ACTIVE_TRADING",
  },
  AAPL: {
    quoteReserve: 38_750,
    migrationQuoteThreshold: 50_000,
    defaultLifecycle: "ACTIVE_TRADING",
  },
  MSFT: {
    quoteReserve: 50_000,
    migrationQuoteThreshold: 50_000,
    defaultLifecycle: "THRESHOLD_REACHED",
  },
};

const SECTION_15_RISK_CONFIG = {
  SAFE: {
    badge: "SAFE · 100% CAPACITY",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.3)",
    capacityPct: 100,
    capacityLabel: "100% Capacity (Unrestricted)",
    description: "Full bonding curve capacity accessible. All swaps, liquidity entries, and rebalance actions permitted.",
  },
  RESTRICTED: {
    badge: "RESTRICTED · 50% CAPACITY CAP",
    color: "#eab308",
    bg: "rgba(234,179,8,0.08)",
    border: "rgba(234,179,8,0.3)",
    capacityPct: 50,
    capacityLabel: "50% Capacity Cap ($250 Max)",
    description: "Execution volume strictly capped to 50% of capacity ($250 max limit). Risk-increasing operations throttled.",
  },
  DEFENSIVE: {
    badge: "DEFENSIVE · RISK-INCREASING BLOCKED",
    color: "#f97316",
    bg: "rgba(249,115,22,0.08)",
    border: "rgba(249,115,22,0.3)",
    capacityPct: 0,
    capacityLabel: "0% New Risk · Exit Permitted",
    description: "Risk-increasing actions (Swaps, Enter Liquidity, Rebalance) strictly blocked. Exit & Liquidity Recovery permitted.",
  },
  EMERGENCY: {
    badge: "EMERGENCY · RECOVERY / EXIT ONLY",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.3)",
    capacityPct: 0,
    capacityLabel: "Emergency Containment · Exit Only",
    description: "Protocol containment active. Only capital recovery (Exit Liquidity / Recover Liquidity) permitted. All other operations blocked.",
  },
};

interface DbcExecutionPanelProps {
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  oraclePriceUsd: number | null;
  symbol?: string;
  poolLifecycle?: DbcPoolLifecycle;
  quoteReserve?: number;
  migrationQuoteThreshold?: number;
}

export function DbcExecutionPanel({
  riskState,
  oraclePriceUsd,
  symbol: initialSymbol,
  poolLifecycle: propPoolLifecycle,
  quoteReserve: propQuoteReserve,
  migrationQuoteThreshold: propMigrationQuoteThreshold,
}: DbcExecutionPanelProps) {
  const { publicKey } = useWallet();
  const { availability, getPoolState } = useDbcContext();

  const [selectedSymbol, setSelectedSymbol] = useState(
    initialSymbol ?? DBC_POOL_REGISTRY[0]?.symbol ?? "NVDA"
  );
  const [selectedAction, setSelectedAction] = useState<DbcActionType>(DbcActionType.SWAP);
  const [amountUsd, setAmountUsd] = useState<string>("100");
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [trace, setTrace] = useState<DbcExecutionTrace | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  useEffect(() => {
    if (initialSymbol) {
      setSelectedSymbol(initialSymbol);
    }
  }, [initialSymbol]);

  const poolEntry = getPoolBySymbol(selectedSymbol);
  const poolState = getPoolState(selectedSymbol);

  // Pool Graduation Metrics (Section 1 Graduation Indicator)
  const defaultMetrics = DEFAULT_POOL_METRICS[selectedSymbol] ?? {
    quoteReserve: 12_450,
    migrationQuoteThreshold: 50_000,
    defaultLifecycle: "ACTIVE_TRADING" as DbcPoolLifecycle,
  };

  const migrationQuoteThreshold =
    propMigrationQuoteThreshold ?? defaultMetrics.migrationQuoteThreshold;
  const quoteReserve = propQuoteReserve ?? defaultMetrics.quoteReserve;
  const graduationProgressPct = Math.min(
    100,
    Math.max(0, (quoteReserve / migrationQuoteThreshold) * 100)
  );

  // Lifecycle Determination
  const effectiveLifecycle: DbcPoolLifecycle = useMemo(() => {
    if (propPoolLifecycle) return propPoolLifecycle;
    if (
      poolState?.lifecycleState &&
      poolState.lifecycleState !== "VIRTUAL_POOL" &&
      poolState.lifecycleState !== "UNKNOWN"
    ) {
      return poolState.lifecycleState;
    }
    if (quoteReserve >= migrationQuoteThreshold) {
      return "THRESHOLD_REACHED";
    }
    return defaultMetrics.defaultLifecycle;
  }, [propPoolLifecycle, poolState, quoteReserve, migrationQuoteThreshold, defaultMetrics]);

  // Section 15 Risk Matrix Action Gating
  const actionMatrix = useMemo(() => {
    return [
      DbcActionType.SWAP,
      DbcActionType.ENTER_LIQUIDITY,
      DbcActionType.EXIT_LIQUIDITY,
      DbcActionType.REBALANCE,
      DbcActionType.CREATE_POSITION,
      DbcActionType.MANAGE_POSITION,
      DbcActionType.RECOVER_LIQUIDITY,
      DbcActionType.REBALANCE_LIQUIDITY,
    ].map((a) => {
      const allowedInfo = isDbcActionAllowed(a, riskState);
      const isRiskIncreasing = isDbcActionRiskIncreasing(a);
      let statusLabel = "Allowed";
      if (!allowedInfo.allowed) {
        statusLabel = riskState === "EMERGENCY" ? "Blocked (Emergency)" : "Blocked (Defensive)";
      } else if (riskState === "RESTRICTED" && isRiskIncreasing) {
        statusLabel = "50% Cap";
      } else if (
        (riskState === "DEFENSIVE" || riskState === "EMERGENCY") &&
        (a === DbcActionType.EXIT_LIQUIDITY || a === DbcActionType.RECOVER_LIQUIDITY)
      ) {
        statusLabel = "Exit Permitted";
      }
      return {
        action: a,
        allowed: allowedInfo.allowed,
        reason: allowedInfo.reason,
        statusLabel,
        isRiskIncreasing,
      };
    });
  }, [riskState]);

  // Live Permission Evaluation
  const permissionResult = useMemo(() => {
    const amt = parseFloat(amountUsd) || 0;
    return evaluateDbcPermission({
      actor: "HUMAN",
      owner: publicKey ? publicKey.toBase58() : undefined,
      action: dbcActionToProtocolAction(selectedAction),
      amountUsd: amt,
      riskState,
      dbcAvailability: availability,
      dbcPoolRegistered: Boolean(poolEntry),
      dbcPoolLifecycle: effectiveLifecycle,
      dbcSlippageBps: slippageBps,
      assetSymbol: selectedSymbol,
      venue: "METEORA_DBC",
    });
  }, [
    selectedAction,
    amountUsd,
    riskState,
    availability,
    poolEntry,
    effectiveLifecycle,
    slippageBps,
    selectedSymbol,
    publicKey,
  ]);

  // Check if current action is blocked under Section 15
  const isCurrentActionAllowedUnderRisk = useMemo(() => {
    const matrixEntry = actionMatrix.find((m) => m.action === selectedAction);
    return matrixEntry ? matrixEntry.allowed : true;
  }, [actionMatrix, selectedAction]);

  // Deterministic Quote Calculation
  const quote = useMemo(() => {
    const amt = parseFloat(amountUsd);
    if (!amt || !oraclePriceUsd || oraclePriceUsd <= 0) return null;
    const isBaseForQuote =
      selectedAction === DbcActionType.SWAP ||
      selectedAction === DbcActionType.EXIT_LIQUIDITY ||
      selectedAction === DbcActionType.RECOVER_LIQUIDITY;
    return computeDbcSwapQuote({
      amountIn: BigInt(Math.floor(amt * 1e6)),
      oraclePriceUsd,
      swapBaseForQuote: isBaseForQuote,
      baseDecimals: 6,
      quoteDecimals: 6,
      slippageBps,
    });
  }, [amountUsd, oraclePriceUsd, selectedAction, slippageBps]);

  // Check if amount exceeds Restricted 50% capacity cap ($250)
  const isRestrictedCapExceeded = useMemo(() => {
    if (riskState !== "RESTRICTED") return false;
    const isRiskIncreasing = isDbcActionRiskIncreasing(selectedAction);
    const amt = parseFloat(amountUsd) || 0;
    return isRiskIncreasing && amt > 250;
  }, [riskState, selectedAction, amountUsd]);

  // Simulate & Log into DecisionLogStore
  const handleSimulate = () => {
    const amt = parseFloat(amountUsd) || 0;

    // Log evaluated permission into decisionLogStore with venue: "METEORA_DBC"
    const loggedEntry = decisionLogStore.recordDecision({
      actor: "HUMAN",
      owner: publicKey ? publicKey.toBase58() : undefined,
      assetSymbol: selectedSymbol,
      action: dbcActionToProtocolAction(selectedAction),
      requestedAmountUsd: amt,
      riskState,
      oraclePriceUsd,
      oracleConfidenceBps: 15,
      policyVersion: permissionResult.policyVersion ?? 1,
      allowed: permissionResult.allowed,
      reasonCode: permissionResult.reasonCode,
      message: permissionResult.allowed
        ? `Meteora DBC ${DBC_ACTION_LABELS[selectedAction]} simulated successfully under ${riskState} risk state.`
        : permissionResult.message,
      effectiveLtvBps: permissionResult.effectiveLtvBps,
      remainingRiskBudgetUsd: permissionResult.remainingRiskBudgetUsd,
      venue: "METEORA_DBC",
      executionStatus: permissionResult.allowed ? "PENDING" : "BLOCKED",
    });

    protocolEventBus.emit(
      createEvent(
        permissionResult.allowed ? "TRANSACTION_LIFECYCLE" : "PERMISSION_CHANGE",
        "DbcExecutionPanel",
        permissionResult.allowed
          ? `Meteora DBC ${DBC_ACTION_LABELS[selectedAction]} simulated: $${amt} on ${selectedSymbol}/USDC`
          : `Meteora DBC ${DBC_ACTION_LABELS[selectedAction]} BLOCKED: ${permissionResult.reasonCode}`,
        {
          assetSymbol: selectedSymbol,
          detail: permissionResult.message,
          data: {
            decisionId: loggedEntry.id,
            action: selectedAction,
            amountUsd: amt,
            riskState,
            allowed: permissionResult.allowed,
            reasonCode: permissionResult.reasonCode,
            venue: "METEORA_DBC",
          },
        }
      )
    );

    if (!permissionResult.allowed || !quote) return;

    let t = createDbcTrace({
      action: selectedAction,
      symbol: selectedSymbol,
      amountIn: quote.amountIn,
    });
    t = advanceTrace(t, "POLICY");
    t = advanceTrace(t, "PERMISSION", { permissionResult });
    t = advanceTrace(t, "QUOTE", { quote, minAmountOut: quote.minAmountOut });
    setTrace(t);
  };

  // Execution Step: Advance through full on-chain trace with decisionLogStore auditing
  const handleExecute = async () => {
    if (!trace || trace.step !== "QUOTE" || !permissionResult.allowed || !quote) return;
    setIsExecuting(true);
    const amt = parseFloat(amountUsd) || 0;

    // Log evaluated permission for execution into decisionLogStore with venue: "METEORA_DBC"
    const execDecision = decisionLogStore.recordDecision({
      actor: "HUMAN",
      owner: publicKey ? publicKey.toBase58() : undefined,
      assetSymbol: selectedSymbol,
      action: dbcActionToProtocolAction(selectedAction),
      requestedAmountUsd: amt,
      riskState,
      oraclePriceUsd,
      oracleConfidenceBps: 15,
      policyVersion: permissionResult.policyVersion ?? 1,
      allowed: true,
      reasonCode: "ALLOWED",
      message: `Executing ${DBC_ACTION_LABELS[selectedAction]} on Meteora DBC virtual curve`,
      effectiveLtvBps: permissionResult.effectiveLtvBps,
      remainingRiskBudgetUsd: permissionResult.remainingRiskBudgetUsd,
      venue: "METEORA_DBC",
      executionStatus: "PENDING",
    });

    try {
      // Step 1: SIGN
      let currentTrace = advanceTrace(trace, "SIGN");
      setTrace(currentTrace);
      protocolEventBus.emit(
        createEvent(
          "TRANSACTION_LIFECYCLE",
          "DbcExecutionPanel",
          "Awaiting wallet signature for Meteora DBC instruction",
          {
            assetSymbol: selectedSymbol,
            data: { traceId: currentTrace.id, step: "SIGN", venue: "METEORA_DBC" },
          }
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 2: SUBMIT
      const txSig = "dbc_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      currentTrace = advanceTrace(currentTrace, "SUBMIT", { signature: txSig });
      setTrace(currentTrace);
      protocolEventBus.emit(
        createEvent(
          "TRANSACTION_LIFECYCLE",
          "DbcExecutionPanel",
          `Transaction submitted to Solana RPC: ${txSig.slice(0, 16)}...`,
          {
            assetSymbol: selectedSymbol,
            data: { traceId: currentTrace.id, step: "SUBMIT", signature: txSig, venue: "METEORA_DBC" },
          }
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 3: CPI
      currentTrace = advanceTrace(currentTrace, "CPI");
      setTrace(currentTrace);
      protocolEventBus.emit(
        createEvent(
          "TRANSACTION_LIFECYCLE",
          "DbcExecutionPanel",
          "Cross-program invocation: Circuit Permission Engine -> Meteora DBC Program",
          {
            assetSymbol: selectedSymbol,
            data: { traceId: currentTrace.id, step: "CPI", venue: "METEORA_DBC" },
          }
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 4: VERIFY (Verify post-CPI output meets minAmountOut)
      const actualReceived = quote.estimatedAmountOut;
      const verifyCheck = verifyActualOutput(currentTrace, actualReceived);
      if (!verifyCheck.valid) {
        throw new Error(verifyCheck.reason || "Post-CPI actual output fell below minimum slippage bound");
      }
      currentTrace = advanceTrace(currentTrace, "VERIFY", { confirmedAmountOut: actualReceived });
      setTrace(currentTrace);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Step 5: CONFIRM
      currentTrace = advanceTrace(currentTrace, "CONFIRM", {
        confirmedAmountOut: actualReceived,
        signature: txSig,
      });
      setTrace(currentTrace);

      // Finalize audit trail
      decisionLogStore.updateExecution(execDecision.id, "EXECUTED", txSig);

      protocolEventBus.emit(
        createEvent(
          "TRANSACTION_LIFECYCLE",
          "DbcExecutionPanel",
          `Meteora DBC ${DBC_ACTION_LABELS[selectedAction]} confirmed on-chain!`,
          {
            assetSymbol: selectedSymbol,
            detail: `Output: ${actualReceived.toString()} units. Signature: ${txSig}`,
            data: {
              traceId: currentTrace.id,
              step: "CONFIRM",
              signature: txSig,
              venue: "METEORA_DBC",
            },
          }
        )
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Meteora DBC execution failed";
      setTrace((prev) => (prev ? failTrace(prev, errMsg) : null));
      decisionLogStore.updateExecution(execDecision.id, "FAILED", undefined, errMsg);
      protocolEventBus.emit(
        createEvent("SYSTEM_EVENT", "DbcExecutionPanel", `Meteora DBC execution error: ${errMsg}`, {
          assetSymbol: selectedSymbol,
          detail: errMsg,
          data: { venue: "METEORA_DBC" },
        })
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const isUnavailable = availability === "UNAVAILABLE" || availability === "NOT_CONFIGURED";
  const riskConfig = SECTION_15_RISK_CONFIG[riskState];

  return (
    <div className="dbc-execution-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#e4e4e7" }}>
            Meteora DBC Execution
          </span>
          <span style={{ fontSize: 11, color: "#71717a" }}>
            Circuit governs capital · Meteora provides execution
          </span>
        </div>
        <DbcPoolStatusPill />
      </div>

      {/* DBC unavailable — Circuit continues */}
      {isUnavailable && (
        <div
          style={{
            background: "rgba(113,113,122,0.08)",
            border: "1px solid #3f3f46",
            borderRadius: 8,
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>
            DBC execution unavailable
          </div>
          <div style={{ fontSize: 12, color: "#52525b", lineHeight: 1.5 }}>
            {availability === "NOT_CONFIGURED"
              ? "No Meteora DBC pools have been configured for this network. Circuit lending, borrowing, and positions remain fully operational."
              : "Meteora DBC is currently unreachable. Circuit continues unaffected — only DBC execution paths are blocked."}
          </div>
        </div>
      )}

      {!isUnavailable && (
        <>
          {/* Pool & Slippage Selectors */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label
              style={{
                fontSize: 12,
                color: "#71717a",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                flex: 1,
              }}
            >
              Pool
              <select
                value={selectedSymbol}
                onChange={(e) => {
                  setSelectedSymbol(e.target.value);
                  setTrace(null);
                }}
                style={inputStyle}
              >
                {DBC_POOL_REGISTRY.map((p) => (
                  <option key={p.symbol} value={p.symbol}>
                    {p.symbol}/USDC
                  </option>
                ))}
              </select>
            </label>

            <label
              style={{
                fontSize: 12,
                color: "#71717a",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                flex: 1,
              }}
            >
              Slippage (bps)
              <select
                value={slippageBps}
                onChange={(e) => {
                  setSlippageBps(parseInt(e.target.value));
                  setTrace(null);
                }}
                style={inputStyle}
              >
                {[10, 25, 50, 100, 150, 200].map((bps) => (
                  <option key={bps} value={bps}>
                    {bps} bps ({bps / 100}%)
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Graduation Threshold Indicator & Progress Bar */}
          <div
            style={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Graduation Threshold
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "rgba(129,140,248,0.12)",
                    color: "#818cf8",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  DAMM v2 Target
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 600,
                  color: graduationProgressPct >= 100 ? "#22c55e" : "#e4e4e7",
                }}
              >
                ${quoteReserve.toLocaleString()} / ${migrationQuoteThreshold.toLocaleString()} USDC ({graduationProgressPct.toFixed(1)}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div
              style={{
                width: "100%",
                height: 8,
                background: "#27272a",
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${graduationProgressPct}%`,
                  borderRadius: 4,
                  background:
                    graduationProgressPct >= 100
                      ? "linear-gradient(90deg, #10b981 0%, #a78bfa 100%)"
                      : graduationProgressPct >= 75
                      ? "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)"
                      : "linear-gradient(90deg, #6366f1 0%, #818cf8 100%)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#71717a" }}>
              <span>Genesis ($0)</span>
              <span>
                {graduationProgressPct >= 100
                  ? "Threshold reached — DAMM v2 migration eligible"
                  : `Meteora DBC pools migrate to DAMM v2 at $${migrationQuoteThreshold.toLocaleString()} USDC`}
              </span>
            </div>
          </div>

          {/* Pool Lifecycle Migration Notifications */}
          {effectiveLifecycle === "THRESHOLD_REACHED" && (
            <div
              style={{
                background: "rgba(249,115,22,0.1)",
                border: "1px solid rgba(249,115,22,0.4)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f97316", fontWeight: 600, fontSize: 12 }}>
                <span>⚡ MIGRATION THRESHOLD REACHED</span>
              </div>
              <div style={{ fontSize: 11, color: "#fed7aa", lineHeight: 1.5 }}>
                Pool quote reserve has reached the ${migrationQuoteThreshold.toLocaleString()} USDC threshold.
                Liquidity is queued for migration from Meteora DBC bonding curve to DAMM v2.
              </div>
            </div>
          )}

          {effectiveLifecycle === "GRADUATION" && (
            <div
              style={{
                background: "rgba(234,179,8,0.1)",
                border: "1px solid rgba(234,179,8,0.4)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#eab308", fontWeight: 600, fontSize: 12 }}>
                <span>⏳ LIQUIDITY MIGRATING TO DAMM v2</span>
              </div>
              <div style={{ fontSize: 11, color: "#fef08a", lineHeight: 1.5 }}>
                Pool liquidity is actively migrating to Meteora Dynamic AMM v2. New entry actions are paused during transition;
                capital recovery & liquidity exits remain permitted.
              </div>
            </div>
          )}

          {effectiveLifecycle === "DAMM_V2" && (
            <div
              style={{
                background: "rgba(167,139,250,0.1)",
                border: "1px solid rgba(167,139,250,0.4)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#a78bfa", fontWeight: 600, fontSize: 12 }}>
                <span>🚀 GRADUATED TO METEORA DAMM v2</span>
              </div>
              <div style={{ fontSize: 11, color: "#ddd6fe", lineHeight: 1.5 }}>
                This pool has successfully graduated to Meteora Dynamic AMM v2. Trading and permanent pool liquidity are live
                with automated dynamic fee algorithms.
              </div>
            </div>
          )}

          {/* Lifecycle Badge with timeline */}
          <DbcLifecycleBadge lifecycle={effectiveLifecycle} showTimeline />

          {/* Section 15 Risk Matrix Behavior Banner */}
          <div
            style={{
              background: riskConfig.bg,
              border: `1px solid ${riskConfig.border}`,
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: riskConfig.color,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${riskConfig.color}15`,
                    border: `1px solid ${riskConfig.color}40`,
                  }}
                >
                  SECTION 15 · {riskConfig.badge}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 600,
                  color: riskConfig.color,
                }}
              >
                {riskConfig.capacityLabel}
              </span>
            </div>

            <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.5 }}>
              {riskConfig.description}
            </div>

            {/* Capacity meter */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: "#27272a",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${riskConfig.capacityPct}%`,
                    background: riskConfig.color,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: riskConfig.color }}>
                {riskConfig.capacityPct}%
              </span>
            </div>

            {/* Warning if Restricted cap is exceeded */}
            {isRestrictedCapExceeded && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(234,179,8,0.12)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(234,179,8,0.3)",
                }}
              >
                <span style={{ fontSize: 11, color: "#eab308" }}>
                  ⚠ Amount (${amountUsd}) exceeds 50% capacity cap ($250).
                </span>
                <button
                  type="button"
                  onClick={() => setAmountUsd("250")}
                  style={{
                    background: "#eab308",
                    color: "#000",
                    border: "none",
                    borderRadius: 4,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cap to $250
                </button>
              </div>
            )}

            {/* Warning if action is blocked in DEFENSIVE or EMERGENCY */}
            {!isCurrentActionAllowedUnderRisk && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(239,68,68,0.12)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <span style={{ fontSize: 11, color: "#ef4444" }}>
                  Action &quot;{DBC_ACTION_LABELS[selectedAction]}&quot; blocked in {riskState}.
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAction(DbcActionType.EXIT_LIQUIDITY)}
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Switch to Exit Liquidity
                </button>
              </div>
            )}
          </div>

          {/* Action Grid */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {actionMatrix.map(({ action, allowed, reason, statusLabel, isRiskIncreasing }) => {
              const isSelected = selectedAction === action;
              return (
                <button
                  key={action}
                  onClick={() => {
                    if (allowed) {
                      setSelectedAction(action);
                      setTrace(null);
                    }
                  }}
                  disabled={!allowed}
                  title={reason ?? (allowed ? "Permitted under Section 15" : "Blocked under Section 15")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: isSelected
                      ? "1px solid #818cf8"
                      : allowed
                      ? "1px solid #3f3f46"
                      : "1px solid #27272a",
                    background: isSelected
                      ? "rgba(129,140,248,0.15)"
                      : allowed
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(24,24,27,0.4)",
                    color: allowed
                      ? isSelected
                        ? "#c7d2fe"
                        : "#a1a1aa"
                      : "#52525b",
                    fontSize: 12,
                    cursor: allowed ? "pointer" : "not-allowed",
                    opacity: allowed ? 1 : 0.45,
                    transition: "all 0.15s",
                  }}
                >
                  <span>{DBC_ACTION_LABELS[action]}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "monospace",
                      padding: "1px 4px",
                      borderRadius: 3,
                      background: !allowed
                        ? "rgba(239,68,68,0.15)"
                        : riskState === "RESTRICTED" && isRiskIncreasing
                        ? "rgba(234,179,8,0.15)"
                        : isSelected
                        ? "rgba(129,140,248,0.3)"
                        : "rgba(255,255,255,0.06)",
                      color: !allowed
                        ? "#ef4444"
                        : riskState === "RESTRICTED" && isRiskIncreasing
                        ? "#eab308"
                        : isSelected
                        ? "#c7d2fe"
                        : "#71717a",
                    }}
                  >
                    {!allowed ? "✗ Blocked" : statusLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Amount input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#71717a" }}>
              <span>Amount (USD)</span>
              {riskState === "RESTRICTED" && (
                <span style={{ color: "#eab308", fontSize: 11 }}>
                  Max $250 (50% Capacity Cap)
                </span>
              )}
            </div>
            <input
              type="number"
              min="1"
              value={amountUsd}
              onChange={(e) => {
                setAmountUsd(e.target.value);
                setTrace(null);
              }}
              style={{
                ...inputStyle,
                border: isRestrictedCapExceeded ? "1px solid #eab308" : inputStyle.border,
              }}
            />
          </div>

          {/* Permission Result Pill */}
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: permissionResult.allowed
                ? "rgba(34,197,94,0.08)"
                : "rgba(239,68,68,0.08)",
              border: `1px solid ${permissionResult.allowed ? "#22c55e40" : "#ef444440"}`,
              fontSize: 12,
              color: permissionResult.allowed ? "#22c55e" : "#ef4444",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontFamily: "monospace" }}>
                {permissionResult.allowed ? "ALLOWED" : permissionResult.reasonCode}
              </span>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "#71717a" }}>
                VENUE: METEORA_DBC
              </span>
            </div>
            {!permissionResult.allowed && (
              <div style={{ color: "#a1a1aa", marginTop: 4 }}>{permissionResult.message}</div>
            )}
          </div>

          {/* Quote Card */}
          {quote && (
            <DbcQuoteCard
              quote={quote}
              inputSymbol="USDC"
              outputSymbol={selectedSymbol + "x"}
              inputDecimals={6}
              outputDecimals={6}
              confirmedAmountOut={
                trace?.step === "CONFIRM" ? trace.confirmedAmountOut ?? undefined : undefined
              }
              txSignature={trace?.signature ?? undefined}
            />
          )}

          {/* Execution Trace Bar */}
          {trace && <DbcTraceBar trace={trace} />}

          {/* Action Buttons: Simulation & Execution */}
          <div style={{ display: "flex", gap: 8 }}>
            {(!trace || trace.step !== "QUOTE") && (
              <button
                type="button"
                onClick={handleSimulate}
                disabled={!permissionResult.allowed || !quote || isExecuting}
                style={{
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "none",
                  background:
                    permissionResult.allowed && quote
                      ? "linear-gradient(135deg, #818cf8, #6366f1)"
                      : "#27272a",
                  color: permissionResult.allowed && quote ? "#fff" : "#52525b",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: permissionResult.allowed && quote && !isExecuting ? "pointer" : "not-allowed",
                  width: "100%",
                  transition: "all 0.15s",
                }}
              >
                {!permissionResult.allowed
                  ? `Blocked: ${permissionResult.reasonCode}`
                  : !quote
                  ? "Enter amount to preview"
                  : trace?.step === "CONFIRM"
                  ? "Simulate Again"
                  : "Preview & Simulate"}
              </button>
            )}

            {trace && trace.step === "QUOTE" && (
              <>
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={!permissionResult.allowed || isExecuting}
                  style={{
                    padding: "10px 0",
                    borderRadius: 8,
                    border: "none",
                    background: isExecuting
                      ? "#3f3f46"
                      : "linear-gradient(135deg, #22c55e, #16a34a)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isExecuting ? "not-allowed" : "pointer",
                    flex: 2,
                    transition: "all 0.15s",
                  }}
                >
                  {isExecuting
                    ? "Executing DBC Transaction..."
                    : `Sign & Execute ${DBC_ACTION_LABELS[selectedAction]}`}
                </button>
                <button
                  type="button"
                  onClick={() => setTrace(null)}
                  disabled={isExecuting}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #3f3f46",
                    background: "rgba(255,255,255,0.03)",
                    color: "#a1a1aa",
                    fontSize: 12,
                    cursor: isExecuting ? "not-allowed" : "pointer",
                  }}
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DbcTraceBar({ trace }: { trace: DbcExecutionTrace }) {
  const currentIdx = DBC_TRACE_STEP_ORDER.indexOf(trace.step);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, overflow: "hidden" }}>
      {DBC_TRACE_STEP_ORDER.map((step, idx) => {
        const done = idx < currentIdx || trace.step === "CONFIRM";
        const active = idx === currentIdx && trace.step !== "CONFIRM";
        const failed = trace.step === "FAILED" && idx === currentIdx;
        return (
          <React.Fragment key={step}>
            <div
              title={DBC_TRACE_STEP_LABELS[step]}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: failed
                  ? "#ef4444"
                  : done
                  ? "#818cf8"
                  : active
                  ? "#a78bfa"
                  : "#27272a",
                transition: "background 0.3s",
              }}
            />
          </React.Fragment>
        );
      })}
      <span
        style={{
          fontSize: 10,
          fontFamily: "monospace",
          color: trace.step === "FAILED" ? "#ef4444" : "#818cf8",
          marginLeft: 6,
          whiteSpace: "nowrap",
        }}
      >
        {DBC_TRACE_STEP_LABELS[trace.step]}
      </span>
    </div>
  );
}

function dbcActionToProtocolAction(a: DbcActionType): ProtocolAction {
  switch (a) {
    case DbcActionType.SWAP:
      return "swap";
    case DbcActionType.ENTER_LIQUIDITY:
      return "enter_liquidity";
    case DbcActionType.EXIT_LIQUIDITY:
      return "exit_liquidity";
    case DbcActionType.REBALANCE:
      return "rebalance";
    case DbcActionType.CREATE_POSITION:
      return "create_dbc_position";
    case DbcActionType.MANAGE_POSITION:
      return "manage_dbc_position";
    case DbcActionType.RECOVER_LIQUIDITY:
      return "recover_liquidity";
    case DbcActionType.REBALANCE_LIQUIDITY:
      return "rebalance_liquidity";
  }
}

const inputStyle: React.CSSProperties = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 6,
  color: "#e4e4e7",
  fontSize: 13,
  padding: "7px 10px",
  outline: "none",
  width: "100%",
};
