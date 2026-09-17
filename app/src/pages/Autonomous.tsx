/**
 * Circuit Protocol — Autonomous Agent Workspace
 *
 * Full-page workspace (NOT a drawer). Layout:
 *   [Header: AUTONOMOUS • state badge • authority status]
 *   [Chat 55%] | [Strategy + Live State + Authority 45%]
 *              | [Execution Timeline 180px]
 *
 * Lazy-loaded — zero impact on Dashboard startup.
 * Zero fake data. If nothing executes: IDLE.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCircuitDomain } from "../lib/domain/context";
import { DEPLOYED_MARKETS } from "../data/markets-registry";

type AgentState =
  | "IDLE" | "PLANNING" | "AWAITING_APPROVAL" | "CHECKING_PERMISSION"
  | "EXECUTING" | "CONFIRMING" | "COMPLETED" | "BLOCKED" | "FAILED" | "PAUSED" | "EXPIRED";

interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: number;
  streaming?: boolean;
}

interface StrategyAction {
  action: "deposit" | "borrow" | "repay" | "withdraw";
  asset: string;
  amountUsd: number;
  reason: string;
}

interface StrategyPlan {
  objective: string;
  constraints: string[];
  actions: StrategyAction[];
  riskAssessment: string;
}

interface ExecEvent {
  id: string;
  timestamp: number;
  type: "info" | "permission" | "tx" | "confirmed" | "blocked" | "error";
  message: string;
  txSignature?: string;
}

function uid(): string { return Math.random().toString(36).slice(2); }
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function stateColor(s: AgentState): string {
  if (s === "IDLE" || s === "EXPIRED") return "var(--text-3)";
  if (s === "EXECUTING" || s === "CONFIRMING" || s === "COMPLETED") return "var(--mint, #79c2a4)";
  if (s === "BLOCKED" || s === "FAILED") return "var(--danger, #cf8b8b)";
  if (s === "AWAITING_APPROVAL" || s === "PAUSED") return "var(--warning, #cfad74)";
  return "var(--accent)";
}

function StateBadge({ state }: { state: AgentState }) {
  const color = stateColor(state);
  const pulse = state === "EXECUTING" || state === "PLANNING" || state === "CONFIRMING";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block",
        boxShadow: pulse ? `0 0 8px ${color}` : "none",
        animation: pulse ? "agPulse 1.5s ease-in-out infinite" : "none", flexShrink: 0,
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", letterSpacing: "0.06em", color }}>{state}</span>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const isSys = msg.role === "system";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 3, marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
        {isUser ? "YOU" : isSys ? "SYSTEM" : "CIRCUIT AGENT"} {"\u00b7"} {fmtTime(msg.timestamp)}
      </div>
      <div style={{
        maxWidth: "88%", padding: "10px 13px",
        borderRadius: isUser ? "12px 12px 3px 12px" : "3px 12px 12px 12px",
        background: isUser ? "rgba(236,234,230,0.1)" : isSys ? "rgba(207,173,116,0.08)" : "var(--surface-2)",
        border: isSys ? "1px solid rgba(207,173,116,0.25)" : "1px solid var(--border)",
        fontSize: 13, lineHeight: 1.55,
        color: isSys ? "var(--warning, #cfad74)" : "var(--text)",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {msg.content}
        {msg.streaming && <span style={{ display: "inline-block", width: 2, height: 13, background: "var(--accent)", marginLeft: 3, verticalAlign: "middle", animation: "agBlink 1s step-end infinite" }} />}
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: StrategyPlan }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16, fontSize: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 10, fontFamily: "var(--mono)" }}>STRATEGY PLAN</div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}>OBJECTIVE</div>
        <div style={{ fontWeight: 600 }}>{plan.objective}</div>
      </div>
      {plan.actions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>ACTIONS</div>
          {plan.actions.map((a, i) => {
            const isBorrow = a.action === "borrow";
            const isDeposit = a.action === "deposit" || a.action === "repay";
            const bg = isBorrow ? "rgba(207,173,116,0.15)" : isDeposit ? "rgba(121,194,164,0.15)" : "rgba(207,139,139,0.15)";
            const fg = isBorrow ? "var(--warning,#cfad74)" : isDeposit ? "var(--mint,#79c2a4)" : "var(--danger,#cf8b8b)";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", background: "var(--surface-3)", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "var(--mono)", padding: "2px 6px", borderRadius: 4, background: bg, color: fg }}>{a.action.toUpperCase()}</span>
                <span style={{ fontWeight: 600 }}>{a.asset}</span>
                <span style={{ color: "var(--text-2)" }}>${a.amountUsd.toFixed(2)}</span>
                <span style={{ color: "var(--text-3)", fontSize: 11, flex: 1 }}>{a.reason}</span>
              </div>
            );
          })}
        </div>
      )}
      {plan.constraints.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>CONSTRAINTS</div>
          <ul style={{ margin: 0, padding: "0 0 0 14px", color: "var(--text-2)" }}>
            {plan.constraints.map((c, i) => <li key={i} style={{ marginBottom: 2 }}>{c}</li>)}
          </ul>
        </div>
      )}
      {plan.riskAssessment && (
        <div style={{ padding: "7px 10px", background: "rgba(207,173,116,0.07)", border: "1px solid rgba(207,173,116,0.2)", borderRadius: 6, fontSize: 11, color: "var(--warning,#cfad74)" }}>
          {"\u26a1"} {plan.riskAssessment}
        </div>
      )}
    </div>
  );
}

function Timeline({ events }: { events: ExecEvent[] }) {
  if (events.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)", fontSize: 11, fontFamily: "var(--mono)" }}>
        IDLE {"\u2014"} No active execution
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {events.map(evt => {
        const color = evt.type === "confirmed" ? "var(--mint,#79c2a4)" : evt.type === "blocked" || evt.type === "error" ? "var(--danger,#cf8b8b)" : evt.type === "permission" ? "var(--warning,#cfad74)" : "var(--text-3)";
        return (
          <div key={evt.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", marginTop: 1, minWidth: 65 }}>{fmtTime(evt.timestamp)}</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1, color: "var(--text-2)", lineHeight: 1.4 }}>
              {evt.message}
              {evt.txSignature && (
                <a href={`https://explorer.solana.com/tx/${evt.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent)", marginTop: 2, opacity: 0.8 }}>
                  {evt.txSignature.slice(0, 12)}...{evt.txSignature.slice(-6)} {"\u2197"}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuthPanel({ auths }: { auths: Array<{ agentAddress: string; assetSymbol: string; isExpired: boolean; isRevoked: boolean; maxBorrowLimit: number; expiryTs: number }> }) {
  if (auths.length === 0) {
    return (
      <div style={{ padding: "12px 14px", background: "rgba(207,139,139,0.06)", border: "1px solid rgba(207,139,139,0.2)", borderRadius: 8, fontSize: 12, color: "var(--text-2)" }}>
        <div style={{ fontWeight: 700, color: "var(--danger,#cf8b8b)", marginBottom: 4 }}>No Agent Authority</div>
        <div style={{ lineHeight: 1.5 }}>Create an Agent Authority PDA to enable autonomous execution. The agent cannot borrow or withdraw without a valid on-chain authority.</div>
      </div>
    );
  }
  const active = auths.filter(a => !a.isExpired && !a.isRevoked);
  const inactive = auths.filter(a => a.isExpired || a.isRevoked);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {active.map(a => (
        <div key={a.agentAddress} style={{ padding: "9px 12px", background: "rgba(121,194,164,0.06)", border: "1px solid rgba(121,194,164,0.25)", borderRadius: 7, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "var(--mint,#79c2a4)" }}>{a.assetSymbol} Authority</span>
            <span style={{ fontSize: 9, fontFamily: "var(--mono)", background: "rgba(121,194,164,0.15)", color: "var(--mint,#79c2a4)", padding: "1px 5px", borderRadius: 3 }}>ACTIVE</span>
          </div>
          <div style={{ color: "var(--text-3)", marginTop: 4, fontFamily: "var(--mono)", fontSize: 10 }}>
            Max Borrow: ${a.maxBorrowLimit.toFixed(2)} {"\u00b7"} Expires: {new Date(a.expiryTs * 1000).toLocaleDateString()}
          </div>
          <div style={{ color: "var(--text-3)", marginTop: 2, fontFamily: "var(--mono)", fontSize: 10 }}>
            Agent: {a.agentAddress.slice(0, 8)}...{a.agentAddress.slice(-6)}
          </div>
        </div>
      ))}
      {inactive.map(a => (
        <div key={a.agentAddress} style={{ padding: "7px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--text-3)" }}>
          <span style={{ fontWeight: 600 }}>{a.assetSymbol}</span> {"\u2014"} {a.isRevoked ? "REVOKED" : "EXPIRED"}
        </div>
      ))}
    </div>
  );
}

function parseStrategyFromText(text: string): StrategyPlan | null {
  if (!/deposit|borrow|repay|withdraw/i.test(text)) return null;
  if (!/\$[\d,]+|\d+\s*USD/i.test(text)) return null;
  const actions: StrategyAction[] = [];
  for (const line of text.split("\n")) {
    const aM = line.match(/\b(deposit|borrow|repay|withdraw)\b/i);
    const uM = line.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:USD)?/i);
    const sM = line.match(/\b(NVDA|TSLA|AAPL|BTC|ETH|SOL|USDC)\b/i);
    if (aM && uM && sM) {
      actions.push({
        action: aM[1].toLowerCase() as StrategyAction["action"],
        asset: sM[1].toUpperCase(),
        amountUsd: parseFloat(uM[1].replace(",", "")),
        reason: line.trim(),
      });
    }
  }
  if (actions.length === 0) return null;
  return {
    objective: text.split("\n").find(l => l.trim().length > 10)?.slice(0, 120) ?? "Strategy",
    constraints: ["Circuit permission engine governs all actions", "Bounded by on-chain authority limits"],
    actions,
    riskAssessment: "Verify collateral ratio and LTV before execution",
  };
}

export default function Autonomous() {
  const navigate = useNavigate();
  const {
    controlMode, setControlMode, hasActiveAuthority, onChainAuthorities,
    portfolio, risk, credit, markets, wallet, openAuthoritySetup,
  } = useCircuitDomain();

  const [msgs, setMsgs] = useState<ChatMessage[]>([{
    id: uid(), role: "system",
    content: "Circuit Autonomous Agent initialized.\n\nI have access to your real-time Devnet state: positions, market prices, risk ratchet state, and on-chain authorities.\n\nTell me what you want to achieve.",
    timestamp: Date.now(),
  }]);
  const [input, setInput] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("IDLE");
  const [events, setEvents] = useState<ExecEvent[]>([]);
  const [plan, setPlan] = useState<StrategyPlan | null>(null);
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    if (controlMode !== "AUTONOMOUS" && hasActiveAuthority) setControlMode("AUTONOMOUS");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = useMemo(() => ({
    walletAddress: wallet.address,
    controlMode,
    hasActiveAuthority,
    riskRatchetState: risk.ratchetState,
    isMarketOpen: risk.isMarketOpen,
    totalCollateralUsd: portfolio.totalCollateralUsd,
    totalDebtUsd: portfolio.totalDebtUsd,
    availableCreditUsd: credit.availableCreditUsd,
    healthFactor: portfolio.healthFactor,
    positions: portfolio.positions.map((p: any) => ({ symbol: p.symbol, collateralValueUsd: p.collateralValueUsd ?? 0, debtUi: p.debtUi ?? 0, mint: p.mint ?? "" })),
    markets: Object.values(markets.markets).map((m: any) => ({ symbol: m.symbol, price: m.priceData?.price ?? 0, change24hPct: m.priceData?.change24hPct ?? null })),
    onChainAuthorities: onChainAuthorities.map(a => {
      const sym = DEPLOYED_MARKETS.find(m => m.mint === a.assetMint.toBase58())?.symbol ?? a.assetMint.toBase58().slice(0, 6);
      return { agentAddress: a.agent.toBase58(), assetSymbol: sym, isExpired: a.isExpired, isRevoked: a.isRevoked, maxBorrowLimit: a.maxBorrowLimitUi, expiryTs: a.expiryTs };
    }),
  }), [wallet, controlMode, hasActiveAuthority, risk, portfolio, credit, markets, onChainAuthorities]);

  const addEvent = useCallback((type: ExecEvent["type"], message: string, tx?: string) => {
    setEvents(prev => [...prev, { id: uid(), timestamp: Date.now(), type, message, txSignature: tx }]);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, timestamp: Date.now() };
    setMsgs(prev => [...prev, userMsg]);
    setAgentState("PLANNING");
    addEvent("info", `User: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);
    const agentId = uid();
    setMsgs(prev => [...prev, { id: agentId, role: "agent", content: "", timestamp: Date.now(), streaming: true }]);
    setStreaming(true);
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      setAgentState("CHECKING_PERMISSION");
      addEvent("permission", "Evaluating Circuit permission gates...");
      const apiMsgs = msgs
        .filter(m => m.role !== "system")
        .concat(userMsg)
        .map(m => ({ role: m.role === "agent" ? "assistant" as const : "user" as const, content: m.content }));
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({ messages: apiMsgs, snapshot: snap }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgentState("EXECUTING");
      addEvent("info", "Agent reasoning in progress...");
      const ct = res.headers.get("content-type") ?? "";
      let full = "";
      if (ct.includes("text/event-stream")) {
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value, { stream: true }).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const d = line.slice(6).trim();
            if (d === "[DONE]") break outer;
            try {
              const delta = JSON.parse(d).choices?.[0]?.delta?.content;
              if (delta) { full += delta; setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: full, streaming: true } : m)); }
            } catch { /* skip malformed */ }
          }
        }
      } else {
        full = await res.text();
      }
      setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: full || "(no response)", streaming: false } : m));
      const p = parseStrategyFromText(full);
      if (p) { setPlan(p); addEvent("info", `Strategy: ${p.actions.length} action(s) identified`); }
      setAgentState("IDLE");
      addEvent("info", "Analysis complete.");
    } catch (err: any) {
      if (err.name === "AbortError") { setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: "[Stopped]", streaming: false } : m)); setAgentState("IDLE"); return; }
      const em = `Error: ${err.message}`;
      setMsgs(prev => prev.map(m => m.id === agentId ? { ...m, content: em, streaming: false } : m));
      addEvent("error", em);
      setAgentState("FAILED");
    } finally { setStreaming(false); }
  }, [input, streaming, msgs, snap, addEvent]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }, [send]);

  const stop = useCallback(() => { abortRef.current?.abort(); setAgentState("IDLE"); setStreaming(false); }, []);
  const clear = useCallback(() => {
    setMsgs([{ id: uid(), role: "system", content: "Workspace cleared. Ready for new strategy.", timestamp: Date.now() }]);
    setPlan(null); setEvents([]); setAgentState("IDLE");
  }, []);

  const connected = !!wallet.address;

  return (
    <div style={{ height: "calc(100vh - 57px)", display: "flex", flexDirection: "column", background: "var(--surface-0, #0c0c0d)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "var(--text)", fontFamily: "var(--mono)" }}>AUTONOMOUS</span>
          <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
          <StateBadge state={agentState} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: hasActiveAuthority ? "var(--mint,#79c2a4)" : "var(--text-3)", display: "inline-block" }} />
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: hasActiveAuthority ? "var(--mint,#79c2a4)" : "var(--text-3)" }}>
            {hasActiveAuthority ? "AUTHORITY ACTIVE" : "NO AUTHORITY"}
          </span>
          {!hasActiveAuthority && (
            <button type="button" onClick={openAuthoritySetup} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)", background: "rgba(207,173,116,0.12)", border: "1px solid rgba(207,173,116,0.35)", borderRadius: 5, color: "var(--warning,#cfad74)", cursor: "pointer" }}>
              CREATE AUTHORITY
            </button>
          )}
          <button type="button" onClick={clear} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-3)", cursor: "pointer" }}>CLEAR</button>
          <button type="button" onClick={() => navigate("/app")} style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--mono)", background: "transparent", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-3)", cursor: "pointer" }}>{"\u2190"} DASHBOARD</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Chat panel */}
        <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 12px", scrollbarWidth: "thin" }}>
            {msgs.map(m => <Bubble key={m.id} msg={m} />)}
            <div ref={endRef} />
          </div>
          <div style={{ flexShrink: 0, padding: "12px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={!connected ? "Connect wallet to start..." : "Describe your strategy intent... (Enter to send, Shift+Enter for newline)"}
              disabled={!connected || streaming}
              rows={2}
              style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--text)", fontFamily: "var(--sans)", resize: "none", outline: "none", lineHeight: 1.5 }}
            />
            {streaming
              ? <button type="button" onClick={stop} style={{ padding: "10px 14px", background: "rgba(207,139,139,0.15)", border: "1px solid rgba(207,139,139,0.4)", borderRadius: 8, color: "var(--danger,#cf8b8b)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>STOP</button>
              : <button type="button" onClick={send} disabled={!input.trim() || !connected} style={{ padding: "10px 16px", background: !input.trim() || !connected ? "var(--surface-2)" : "rgba(236,234,230,0.1)", border: "1px solid var(--border)", borderRadius: 8, color: !input.trim() || !connected ? "var(--text-3)" : "var(--text)", fontSize: 12, fontWeight: 700, cursor: !input.trim() || !connected ? "not-allowed" : "pointer", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>SEND {"\u2191"}</button>
            }
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, borderBottom: "1px solid var(--border)", scrollbarWidth: "thin" }}>
            <SectionLabel>STRATEGY</SectionLabel>
            {plan
              ? <PlanCard plan={plan} />
              : (
                <div style={{ padding: 16, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
                  No strategy yet. Describe your intent in the chat.
                  <br /><br />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>Examples:</span>
                  <ul style={{ margin: "6px 0 0 14px", color: "var(--text-2)" }}>
                    <li style={{ marginBottom: 3 }}>"Borrow $500 against my NVDA position"</li>
                    <li style={{ marginBottom: 3 }}>"What is my current borrowing capacity?"</li>
                    <li style={{ marginBottom: 3 }}>"Is it safe to borrow more right now?"</li>
                  </ul>
                </div>
              )
            }

            <div style={{ marginTop: 14 }}>
              <SectionLabel>LIVE STATE</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { label: "Risk State", value: risk.ratchetState, mono: true },
                  { label: "Market", value: risk.isMarketOpen ? "OPEN" : "CLOSED", mono: true },
                  { label: "Collateral", value: `$${portfolio.totalCollateralUsd.toFixed(2)}` },
                  { label: "Debt", value: `$${portfolio.totalDebtUsd.toFixed(2)}` },
                  { label: "Credit", value: `$${credit.availableCreditUsd.toFixed(2)}` },
                  { label: "Health", value: portfolio.healthFactor !== null ? portfolio.healthFactor.toFixed(3) : "N/A" },
                ].map(item => (
                  <div key={item.label} style={{ padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: item.mono ? "var(--mono)" : undefined }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <SectionLabel>AUTHORITY</SectionLabel>
              <AuthPanel auths={onChainAuthorities.map(a => {
                const sym = DEPLOYED_MARKETS.find(m => m.mint === a.assetMint.toBase58())?.symbol ?? a.assetMint.toBase58().slice(0, 6);
                return { agentAddress: a.agent.toBase58(), assetSymbol: sym, isExpired: a.isExpired, isRevoked: a.isRevoked, maxBorrowLimit: a.maxBorrowLimitUi, expiryTs: a.expiryTs };
              })} />
            </div>
          </div>

          {/* Execution timeline */}
          <div style={{ flexShrink: 0, height: 182, padding: "12px 16px", background: "var(--surface-1)", borderTop: "1px solid var(--border)" }}>
            <SectionLabel>EXECUTION TIMELINE</SectionLabel>
            <div style={{ height: 132, overflowY: "auto", scrollbarWidth: "thin" }}><Timeline events={events} /></div>
          </div>
        </div>
      </div>
      <style>{`@keyframes agPulse{0%,100%{opacity:1}50%{opacity:0.4}}@keyframes agBlink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-3)", fontFamily: "var(--mono)", marginBottom: 10 }}>{children}</div>;
}
