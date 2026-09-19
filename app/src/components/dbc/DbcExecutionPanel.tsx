/**
 * Circuit Protocol — DBC Execution Panel
 *
 * Manual DBC execution UI. Pool selector restricted to DBC_POOL_REGISTRY.
 * All actions gated by evaluateDbcPermission() before the user can sign.
 * Execution trace shown step-by-step (INTENT -> CONFIRM).
 */
import React, { useState, useMemo } from "react";
import { useDbcContext } from "../../context/DbcContext";
import { DBC_POOL_REGISTRY, getPoolBySymbol } from "../../lib/meteora/registry";
import {
  DbcActionType,
  computeDbcSwapQuote,
  isDbcActionAllowed,
} from "../../lib/meteora/dbc";
import { evaluateDbcPermission, ProtocolAction } from "../../lib/permission-engine";
import { DbcQuoteCard } from "./DbcQuoteCard";
import { DbcLifecycleBadge } from "./DbcLifecycleBadge";
import { DbcPoolStatusPill } from "./DbcPoolStatusPill";
import {
  createDbcTrace,
  advanceTrace,
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

interface DbcExecutionPanelProps {
  riskState: "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";
  oraclePriceUsd: number | null;
  symbol?: string;
}

export function DbcExecutionPanel({
  riskState,
  oraclePriceUsd,
  symbol: initialSymbol,
}: DbcExecutionPanelProps) {
  const { availability, getPoolState } = useDbcContext();

  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol ?? DBC_POOL_REGISTRY[0]?.symbol ?? "");
  const [selectedAction, setSelectedAction] = useState<DbcActionType>(DbcActionType.SWAP);
  const [amountUsd, setAmountUsd] = useState<string>("100");
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [trace, setTrace] = useState<DbcExecutionTrace | null>(null);

  const poolEntry = getPoolBySymbol(selectedSymbol);
  const poolState = getPoolState(selectedSymbol);

  // Permission check (live)
  const permissionResult = useMemo(() => {
    const amt = parseFloat(amountUsd) || 0;
    return evaluateDbcPermission({
      actor: "HUMAN",
      action: dbcActionToProtocolAction(selectedAction),
      amountUsd: amt,
      riskState,
      dbcAvailability: availability,
      dbcPoolRegistered: Boolean(poolEntry),
      dbcPoolLifecycle: poolState?.lifecycleState,
      dbcSlippageBps: slippageBps,
    });
  }, [selectedAction, amountUsd, riskState, availability, poolEntry, poolState, slippageBps]);

  // Risk matrix check for action gating
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
    ].map((a) => ({
      action: a,
      ...isDbcActionAllowed(a, riskState),
    }));
  }, [riskState]);

  // Quote
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

  const handleSimulate = () => {
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

  const isUnavailable = availability === "UNAVAILABLE" || availability === "NOT_CONFIGURED";

  return (
    <div className="dbc-execution-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#e4e4e7" }}>
            DBC Execution
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

      {/* Pool selector */}
      {!isUnavailable && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#71717a", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              Pool
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                style={inputStyle}
              >
                {DBC_POOL_REGISTRY.map((p) => (
                  <option key={p.symbol} value={p.symbol}>
                    {p.symbol}/USDC
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 12, color: "#71717a", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              Slippage (bps)
              <select
                value={slippageBps}
                onChange={(e) => setSlippageBps(parseInt(e.target.value))}
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

          {poolState && (
            <DbcLifecycleBadge lifecycle={poolState.lifecycleState} showTimeline />
          )}

          {/* Action grid */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {actionMatrix.map(({ action, allowed, reason }) => (
              <button
                key={action}
                onClick={() => allowed && setSelectedAction(action)}
                disabled={!allowed}
                title={reason}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: selectedAction === action
                    ? "1px solid #818cf8"
                    : "1px solid #3f3f46",
                  background: selectedAction === action
                    ? "rgba(129,140,248,0.15)"
                    : "rgba(255,255,255,0.03)",
                  color: allowed
                    ? selectedAction === action ? "#c7d2fe" : "#a1a1aa"
                    : "#52525b",
                  fontSize: 12,
                  cursor: allowed ? "pointer" : "not-allowed",
                  opacity: allowed ? 1 : 0.5,
                  transition: "all 0.15s",
                }}
              >
                {DBC_ACTION_LABELS[action]}
                {!allowed && " ✗"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <label style={{ fontSize: 12, color: "#71717a", display: "flex", flexDirection: "column", gap: 4 }}>
            Amount (USD)
            <input
              type="number"
              min="1"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            />
          </label>

          {/* Permission result */}
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
            <span style={{ fontWeight: 600, fontFamily: "monospace" }}>
              {permissionResult.allowed ? "ALLOWED" : permissionResult.reasonCode}
            </span>
            {!permissionResult.allowed && (
              <span style={{ color: "#a1a1aa", marginLeft: 8 }}>{permissionResult.message}</span>
            )}
          </div>

          {/* Quote */}
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

          {/* Trace bar */}
          {trace && <DbcTraceBar trace={trace} />}

          {/* Action button */}
          <button
            onClick={handleSimulate}
            disabled={!permissionResult.allowed || !quote}
            style={{
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: permissionResult.allowed && quote
                ? "linear-gradient(135deg, #818cf8, #6366f1)"
                : "#27272a",
              color: permissionResult.allowed && quote ? "#fff" : "#52525b",
              fontSize: 13,
              fontWeight: 600,
              cursor: permissionResult.allowed && quote ? "pointer" : "not-allowed",
              width: "100%",
              transition: "all 0.15s",
            }}
          >
            {!permissionResult.allowed
              ? `Blocked: ${permissionResult.reasonCode}`
              : !quote
              ? "Enter amount to preview"
              : "Preview & Sign"}
          </button>
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
    case DbcActionType.SWAP: return "swap";
    case DbcActionType.ENTER_LIQUIDITY: return "enter_liquidity";
    case DbcActionType.EXIT_LIQUIDITY: return "exit_liquidity";
    case DbcActionType.REBALANCE: return "rebalance";
    case DbcActionType.CREATE_POSITION: return "create_dbc_position";
    case DbcActionType.MANAGE_POSITION: return "manage_dbc_position";
    case DbcActionType.RECOVER_LIQUIDITY: return "recover_liquidity";
    case DbcActionType.REBALANCE_LIQUIDITY: return "rebalance_liquidity";
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
