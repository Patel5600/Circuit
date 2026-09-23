import React, { useState } from "react";
import { Link } from "react-router-dom";

import { PageContainer } from "../components/layout/AppShell";
import { Card, Icon, Pill, Segmented } from "../components/ui";
import {
  PortfolioRiskGraph,
  AssetNode,
  getAssetMark,
} from "../components/profile/PortfolioRiskGraph";
import { StressScenarioPanel } from "../components/profile/StressScenarioPanel";
import { useSimulationPortfolio } from "../lib/portfolio/simulation-provider";
import { formatMoney } from "../lib/format";
import { BPS } from "../lib/protocol";

/* -------------------------------------------------------------------------- */
/*  Types & Models                                                            */
/* -------------------------------------------------------------------------- */

type ExplMode = "BASIC" | "TECHNICAL";

interface LearnModule {
  id: number;
  title: string;
  badge: string;
  summary: string;
  basicContent: React.ReactNode;
  technicalContent: React.ReactNode;
}

const SIMULATED_ASSETS: AssetNode[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA",
    weightPct: 58,
    oracleHealthy: true,
    confBps: 18,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("NVDA"),
    priceUsd: 138.25,
    collateralValueUsd: 5800,
    impactBorrowPowerUsd: 375,
    explanation: "Primary portfolio asset. Single-asset concentration penalty active.",
  },
  {
    symbol: "AAPL",
    name: "Apple",
    weightPct: 22,
    oracleHealthy: true,
    confBps: 18,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("AAPL"),
    priceUsd: 228.80,
    collateralValueUsd: 2200,
    impactBorrowPowerUsd: 0,
    explanation: "Nominal risk posture within 40% concentration ceiling.",
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    weightPct: 15,
    oracleHealthy: true,
    confBps: 12,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("MSFT"),
    priceUsd: 432.10,
    collateralValueUsd: 1500,
    impactBorrowPowerUsd: 0,
    explanation: "Low oracle uncertainty and standard base collateral LTV.",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    weightPct: 5,
    oracleHealthy: true,
    confBps: 0,
    maxConfBps: 150,
    marketOpen: true,
    mark: getAssetMark("USDC"),
    priceUsd: 1.00,
    collateralValueUsd: 500,
    impactBorrowPowerUsd: 0,
    explanation: "Cash buffer providing stabilizer margin.",
  },
];

/* -------------------------------------------------------------------------- */
/*  14 Modular Educational Modules                                            */
/* -------------------------------------------------------------------------- */

const MODULES: LearnModule[] = [
  {
    id: 1,
    title: "What is tokenized equity?",
    badge: "FOUNDATIONS",
    summary: "Real-world corporate equity represented as fungible SPL tokens on Solana.",
    basicContent: (
      <p>
        Tokenized equities are digital representations of real-world stocks (like NVIDIA or Apple). Each token is backed by underlying custodial shares or legally compliant structures, allowing global, 24/7 transferability while reflecting the true economic value of public enterprise shares.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Each tokenized equity in Circuit is an SPL Mint configured under an on-chain <code>AssetConfig</code> PDA. The token conforms to the Solana SPL Token standard, held in canonical program-derived vaults (<code>seeds = [b"protocol", mint.key()]</code>). Circuit continuously cross-references these mints against Pyth Network <code>PriceUpdateV2</code> oracle accounts to determine verifiable purchasing and collateral power.
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2)", marginTop: 8 }}>
          PDA: AssetConfig::find_program_address([b"asset", mint.key().as_ref()], &program_id)
        </div>
      </div>
    ),
  },
  {
    id: 2,
    title: "What is collateral?",
    badge: "CREDIT",
    summary: "Deposited assets that secure a loan and govern credit capacity.",
    basicContent: (
      <p>
        Collateral is the property you deposit into the protocol as a security pledge. When you deposit stock tokens, Circuit locks them in a smart contract vault. In exchange, Circuit grants you the right to borrow quote currency (such as USDC or SOL) up to a conservative percentage of that stock's market value.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Deposited tokens are held by the protocol's Collateral Vault ATA owned by the <code>ProtocolConfig</code> PDA. The user's on-chain <code>Position</code> PDA records <code>collateral_amount: u64</code>. Collateral cannot be seized or moved except through explicit user-signed withdrawals or permissionless liquidation instructions invoked when the Health Factor drops below 10,000 BPS (1.00).
        </p>
      </div>
    ),
  },
  {
    id: 3,
    title: "What is LTV (Loan-to-Value)?",
    badge: "RISK METRIC",
    summary: "The maximum ratio of borrowed debt permitted against collateral value.",
    basicContent: (
      <p>
        Loan-to-Value (LTV) determines how much money you can borrow for every dollar of stock you deposit. For instance, an LTV of 70% means depositing $1,000 worth of stock allows you to borrow up to $700. In Circuit, LTV is not fixed—it dynamically adjusts depending on your portfolio diversification and oracle certainty.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Circuit distinguishes between <strong>Base LTV</strong> and <strong>Effective LTV</strong>:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          Effective_LTV = Base_LTV - Concentration_Penalty - Oracle_Spread_Penalty - Liquidity_Haircut
        </div>
        <p style={{ marginTop: 8 }}>
          While <code>AssetConfig.base_ltv_bps</code> is configured statically (e.g. 7,000 BPS = 70%), the on-chain risk engine continuously deducts penalty basis points based on portfolio concentration and volatility before approving borrow transactions.
        </p>
      </div>
    ),
  },
  {
    id: 4,
    title: "What is Health Factor?",
    badge: "SOLVENCY",
    summary: "The mathematical safety margin protecting your position against liquidation.",
    basicContent: (
      <p>
        Your Health Factor is your account's solvency score. As long as it stays above 1.00, your loan is safe. If stock prices drop or interest accrues and your Health Factor falls to 1.00 or below, your position becomes eligible for liquidation to repay your debt.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Calculated deterministically in <code>programs/circuit/src/math/fixed_point.rs</code>:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          HF_bps = (Collateral_Val * Liquidation_Threshold_bps) / (Debt_Val * 10,000) * 10,000
        </div>
        <p style={{ marginTop: 8 }}>
          Liquidation threshold is strictly greater than Base LTV (e.g. 80% vs 70%), providing a 10% safety buffer before collateral liquidation can be triggered.
        </p>
      </div>
    ),
  },
  {
    id: 5,
    title: "Why can oracle confidence matter?",
    badge: "ORACLE INTEGRITY",
    summary: "Pyth confidence intervals quantify price uncertainty during market volatility.",
    basicContent: (
      <p>
        Stock prices aren't always a single exact number—during volatile moments or sudden news, buyers and sellers may disagree. Pyth publishes both an estimated price and a "confidence band" showing how much uncertainty exists. Circuit takes this uncertainty seriously: wider uncertainty reduces borrowing capacity to prevent bad debt.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Pyth Network represents prices as Gaussian distributions with mean μ and standard error σ (confidence). Circuit implements <strong>Conservative Pyth Valuation</strong>:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          P_conservative = max(0, Price - Confidence)
        </div>
        <p style={{ marginTop: 8 }}>
          If <code>conf_bps &gt; max_conf_bps</code> (typically 150 BPS / 1.5%), the oracle check fails and the Risk Ratchet transitions from <code>SAFE</code> to <code>RESTRICTED</code>, rejecting new borrow instructions.
        </p>
      </div>
    ),
  },
  {
    id: 6,
    title: "What does stale price mean?",
    badge: "FRESHNESS",
    summary: "When the time elapsed since the last oracle publication exceeds acceptable limits.",
    basicContent: (
      <p>
        If an oracle feed stops updating because of network delays or exchange downtime, relying on that old price is dangerous. Circuit flags any price older than its configured threshold (e.g. 10 minutes) as "stale" and blocks all new borrows until fresh data is verified on-chain.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          In <code>oracle/validation.rs</code>, the program compares <code>Clock::get()?.unix_timestamp</code> with <code>price_update.publish_time</code>:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          age_seconds = current_time - publish_time
          assert!(age_seconds &lt;= asset_config.max_oracle_age, CircuitError::OracleStale);
        </div>
        <p style={{ marginTop: 8 }}>
          This guarantees the protocol never mints credit against obsolete market valuations.
        </p>
      </div>
    ),
  },
  {
    id: 7,
    title: "What is the Risk Ratchet?",
    badge: "FLAGSHIP MECHANISM",
    summary: "Asymmetric risk state machine: instantaneous tightening, staged monotonic recovery.",
    basicContent: (
      <p>
        The Risk Ratchet is Circuit's defensive governor. When market stress occurs (such as oracle confidence widening or market closures), the Ratchet instantly tightens borrowing rules. But when conditions return to normal, it doesn't immediately unlock all limits—it requires sustained, proven calm across multiple observation periods to recover.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          The Risk Ratchet is a 4-state machine: <code>SAFE → RESTRICTED → DEFENSIVE → EMERGENCY</code>.
        </p>
        <ul style={{ paddingLeft: 18, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
          <li><strong>Instant Tightening:</strong> A single observation breaching severity thresholds triggers immediate transition down.</li>
          <li><strong>Hysteresis Recovery:</strong> Stepping up requires tighter thresholds (e.g. conf &lt; 0.3% to enter Safe from Restricted).</li>
          <li><strong>Monotonic Progression:</strong> Direct <code>EMERGENCY → SAFE</code> is strictly impossible on-chain; requires consecutive healthy epochs at each intermediate stage.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 8,
    title: "What is dynamic portfolio risk?",
    badge: "PORTFOLIO MATH",
    summary: "Evaluating risk holistically across all deposited collateral rather than in isolation.",
    basicContent: (
      <p>
        Most lending platforms treat each token as an isolated island with a fixed LTV. Circuit looks at your entire portfolio: a well-diversified mix of equities receives higher borrowing power, while a single-stock concentration automatically incurs higher haircuts.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Circuit evaluates the portfolio vector w = [w_1, w_2, ..., w_n] where w_i = val_i / sum(val). Maximum weight C_max = max(w_i) governs the concentration haircut. Effective portfolio LTV is computed as:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          LTV_eff = sum(w_i * base_ltv_i) - penalty(C_max) - penalty(max_conf)
        </div>
      </div>
    ),
  },
  {
    id: 9,
    title: "Why does concentration matter?",
    badge: "CORRELATION RISK",
    summary: "Single-asset overweight creates catastrophic liquidation gap risk.",
    basicContent: (
      <p>
        Holding 100% of your collateral in a single stock exposes the protocol to idiosyncratic gap risk—such as an unexpected earnings miss or regulatory halt. Diversifying across multiple stocks protects both you and the protocol, and Circuit rewards this with lower haircuts and greater borrowing power.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Circuit's concentration penalty function activates whenever any single equity exceeds 40% of total collateral valuation:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          if C_max &gt; 40%: penalty_bps = (C_max - 40) * 36 bps
        </div>
        <p style={{ marginTop: 8 }}>
          At 90% concentration, the haircut reaches 1,800 BPS (18%), reducing a 70% Base LTV down to 52% Effective LTV.
        </p>
      </div>
    ),
  },
  {
    id: 10,
    title: "Why 'price unchanged' can still mean 'risk increased'?",
    badge: "CAUSAL INSIGHT",
    summary: "Risk is multidimensional: volatility, oracle spread, and session state shift independently of price.",
    basicContent: (
      <p>
        A stock's headline price might remain at $100, but its underlying risk can double if the oracle's confidence spread widens from ±$0.20 to ±$3.00, or if trading halts on the New York Stock Exchange. In Circuit, credit permissions adapt to these hidden risk factors even when the price is flat.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Circuit evaluates the entire Pyth confidence interval and NYSE market session state. Even when <code>price_update.price</code> is unchanged:
        </p>
        <ul style={{ paddingLeft: 18, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
          <li>A widened <code>conf</code> reduces conservative valuation p - conf.</li>
          <li>An off-market session halts credit expansion to protect against illiquid weekend gap risk.</li>
          <li>Shifting relative weights among collateral assets alters C_max and raises concentration haircuts.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 11,
    title: "What happens during an emergency state?",
    badge: "CIRCUIT BREAKER",
    summary: "Orderly defense protocol protecting solvency while preserving user repayment rights.",
    basicContent: (
      <p>
        If severe market stress or an infrastructure disruption occurs, Circuit enters Emergency mode. New borrowing and collateral withdrawals that would increase risk are immediately halted. However, repaying loans is ALWAYS permitted, allowing borrowers to clear debt and protect their collateral at any time.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          In <code>instructions/borrow.rs</code> and <code>instructions/withdraw.rs</code>, the program enforces:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          require!(market_guard.risk_state != RiskState::Emergency, CircuitError::RiskEmergency);
        </div>
        <p style={{ marginTop: 8 }}>
          Crucially, <code>instructions/repay.rs</code> contains zero risk gates—repayment is unconditionally permissible to guarantee users can deleverage even under extreme stress.
        </p>
      </div>
    ),
  },
  {
    id: 12,
    title: "Why does last-valid-price exist?",
    badge: "BLACKOUT DEFENSE",
    summary: "A frozen reference snapshot preventing predatory liquidations during oracle outages.",
    basicContent: (
      <p>
        If an oracle feed temporarily goes offline or emits corrupt data, what should a lending protocol do? Crashing or using zero would unfairly liquidate healthy borrowers. Circuit records the "last valid verified price" and uses it as an emergency benchmark to prevent predatory liquidations during temporary data blackouts.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          <code>MarketGuard</code> stores <code>last_valid_price: u64</code> and <code>last_valid_timestamp: i64</code>. If current Pyth data is corrupt or stale:
        </p>
        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 6, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)" }}>
          valuation_price = if oracle.is_valid() &#123; guard.record_valid_price(oracle.price) &#125; else &#123; guard.last_valid_price &#125;;
        </div>
      </div>
    ),
  },
  {
    id: 13,
    title: "How does Circuit differ from normal lending?",
    badge: "PARADIGM SHIFT",
    summary: "Turning risk into financial permissions rather than racing liquidator bots.",
    basicContent: (
      <p>
        Traditional DeFi lending interfaces calculate static numbers and wait for prices to drop so liquidation bots can seize collateral. Circuit is a stateful risk operating system: it turns live risk data into granular permissions, preemptively tightening credit lines before bad debt can form.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Traditional money markets (e.g. Aave, Compound) use static parameters per asset. Circuit introduces <strong>Programmable Risk Gating</strong>:
        </p>
        <ul style={{ paddingLeft: 18, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
          <li>Real-time Pyth push oracle confidence intervals embedded directly in valuation math.</li>
          <li>Deterministic NYSE trading session calendar gating off-market risk.</li>
          <li>Asymmetric Risk Ratchet modulating borrowing capacity as a dynamic financial permission.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 14,
    title: "Why is Solana used?",
    badge: "INFRASTRUCTURE",
    summary: "Sub-second block times and high throughput enable continuous on-chain risk verification.",
    basicContent: (
      <p>
        Evaluating complex risk formulas—checking live oracle confidence, trading session hours, and portfolio concentration on every single borrow—requires lightning-fast, cheap transactions. Solana's sub-second block times make institutional-grade risk computation feasible on-chain.
      </p>
    ),
    technicalContent: (
      <div>
        <p>
          Solana provides 400ms slot times and parallel transaction processing via Sealevel. Circuit leverages Solana's transaction model to verify Pyth <code>PriceUpdateV2</code> accounts, evaluate NYSE market guard session status, and calculate dynamic LTV haircuts all within a single atomic transaction compute budget (~80k CU).
        </p>
      </div>
    ),
  },
];

/* -------------------------------------------------------------------------- */
/*  Interactive Miniature 1: Concentration Slider                            */
/* -------------------------------------------------------------------------- */

function ConcentrationMiniature() {
  const [nvdaWeight, setNvdaWeight] = useState(70);

  const penaltyBps = nvdaWeight > 40 ? Math.round((nvdaWeight - 40) * 36) : 0;
  const baseLtvBps = 7000;
  const effectiveLtvBps = Math.max(3000, baseLtvBps - penaltyBps);
  const totalCollateralUsd = 10000;
  const maxBorrowUsd = (totalCollateralUsd * effectiveLtvBps) / BPS;
  const unpenalizedBorrowUsd = (totalCollateralUsd * baseLtvBps) / BPS;
  const haircutLossUsd = unpenalizedBorrowUsd - maxBorrowUsd;

  return (
    <Card
      title="Miniature 1: Single-Asset Concentration Slider"
      action={<Pill tone="accent">LEARNING SIMULATION</Pill>}
    >
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 16px 0" }}>
        Adjust the portfolio allocation of NVDA to watch Circuit's Risk Ratchet dynamically apply concentration haircuts to Effective LTV and borrow capacity.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>
            NVDA Portfolio Weight: <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{nvdaWeight}%</span>
          </span>
          <Pill tone={nvdaWeight > 60 ? "danger" : nvdaWeight > 40 ? "warning" : "success"}>
            {nvdaWeight > 40 ? `Penalty: -${penaltyBps} bps` : "Optimal (No Penalty)"}
          </Pill>
        </div>

        <input
          type="range"
          min={20}
          max={95}
          value={nvdaWeight}
          onChange={(e) => setNvdaWeight(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--accent, #eceae6)" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 4 }}>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Base LTV</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 2 }}>{(baseLtvBps / 100).toFixed(1)}%</div>
          </div>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Effective LTV</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 2, color: nvdaWeight > 40 ? "var(--warning, #cfad74)" : "var(--success, #7fc39a)" }}>
              {(effectiveLtvBps / 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Borrow Power ($10k)</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 2 }}>${formatMoney(maxBorrowUsd)}</div>
          </div>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Haircut Impact</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 2, color: haircutLossUsd > 0 ? "var(--danger, #cf8b8b)" : "var(--text-3)" }}>
              -${formatMoney(haircutLossUsd)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Interactive Miniature 2: Pyth Oracle Confidence Slider                   */
/* -------------------------------------------------------------------------- */

function OracleConfidenceMiniature() {
  const [confBps, setConfBps] = useState(35);
  const nominalPrice = 140.0;
  const confUsd = (nominalPrice * confBps) / 10000;
  const conservativePrice = Math.max(0, nominalPrice - confUsd);

  const status = confBps > 150 ? "BREACHED" : confBps > 50 ? "ELEVATED" : "NOMINAL";
  const permission = confBps > 150 ? "BORROW BLOCKED" : confBps > 50 ? "HAIRCUT APPLIED" : "FULL BORROW PERMITTED";

  return (
    <Card
      title="Miniature 2: Pyth Oracle Confidence Width Slider"
      action={<Pill tone="accent">LEARNING SIMULATION</Pill>}
    >
      <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 16px 0" }}>
        Simulate widening oracle uncertainty during a market volatility spike to observe Conservative Pyth Valuation (p - conf) in action.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>
            Pyth Confidence Spread: <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{confBps} bps</span> (±${confUsd.toFixed(2)})
          </span>
          <Pill tone={status === "BREACHED" ? "danger" : status === "ELEVATED" ? "warning" : "success"}>
            {status}
          </Pill>
        </div>

        <input
          type="range"
          min={5}
          max={200}
          value={confBps}
          onChange={(e) => setConfBps(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--accent, #eceae6)" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 4 }}>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Nominal Price</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 2 }}>${nominalPrice.toFixed(2)}</div>
          </div>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Conservative Price</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 2, color: "var(--accent)" }}>
              ${conservativePrice.toFixed(2)}
            </div>
          </div>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Risk Ratchet Status</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 4, color: status === "BREACHED" ? "var(--danger)" : "var(--success)" }}>
              {status === "BREACHED" ? "RESTRICTED" : "SAFE"}
            </div>
          </div>
          <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Permission Consequence</div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", marginTop: 4, color: permission.includes("BLOCKED") ? "var(--danger)" : "var(--text)" }}>
              {permission}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Risk Ratchet Mechanical Scroll Narrative                                  */
/* -------------------------------------------------------------------------- */

function RiskRatchetNarrative() {
  const steps = [
    {
      state: "SAFE",
      tone: "success",
      title: "1. Nominal Safe State",
      condition: "Confidence ratio < 0.5% · Market Open · Diversified Portfolio",
      behavior: "Full borrowing capacity unlocked. Up to 70% Base LTV. Standard interest rates.",
    },
    {
      state: "RESTRICTED",
      tone: "warning",
      title: "2. Restricted State (Fast Tightening)",
      condition: "Confidence ratio 0.5% - 1.5% OR Concentration > 60%",
      behavior: "Instant tightening on first breach. Effective LTV capped. New borrowing capacity restricted.",
    },
    {
      state: "DEFENSIVE",
      tone: "warning",
      title: "3. Defensive State",
      condition: "Confidence ratio 1.5% - 3.0% OR Market Closed",
      behavior: "All new borrow instructions rejected on-chain. Risk-increasing withdrawals blocked. Repayments open.",
    },
    {
      state: "EMERGENCY",
      tone: "danger",
      title: "4. Emergency Circuit Breaker",
      condition: "Oracle Stale > 10m OR Upstream Custody Impairment",
      behavior: "Protocol-wide borrow lockout. Frozen last-valid-price policy. Repayments remain 100% unrestricted.",
    },
  ];

  return (
    <Card title="The Risk Ratchet: Asymmetric State Transitions">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 10px 0", lineHeight: 1.5 }}>
          Circuit replaces static lending thresholds with an asymmetric risk ratchet: <strong>instant tightening</strong> on adverse risk detection, coupled with <strong>staged monotonic recovery</strong> with hysteresis buffers.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
          <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
            Fast Tightening: 1 observation
          </span>
          <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
            Staged Recovery: 5 healthy epochs
          </span>
          <span style={{ padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
            Direct Emergency → Safe: Forbidden
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((s) => (
          <div
            key={s.state}
            style={{
              padding: "14px 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                {s.title}
              </span>
              <Pill tone={s.tone as any} withDot>
                {s.state}
              </Pill>
            </div>
            <div style={{ fontSize: 11.5, fontFamily: "var(--mono)", color: "var(--text-3)" }}>
              Triggers: {s.condition}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
              {s.behavior}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Learn Page Component                                                 */
/* -------------------------------------------------------------------------- */

export default function Learn() {
  const [mode, setMode] = useState<ExplMode>("BASIC");
  const { params, snapshot, updateParam, resetParams } = useSimulationPortfolio();

  return (
    <PageContainer
      title="How Circuit Works"
      subtitle="A research-grade architectural and interactive guide to programmable collateral on Solana."
    >
      <div className="stack g-20" style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
        {/* ── Mode Switcher & Overview Header ───────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
            padding: "16px 20px",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              Curriculum Explainability Level
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Choose between conceptual plain English or technical mathematical/on-chain formulations.
            </div>
          </div>
          <Segmented<ExplMode>
            label="Explainability Mode"
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: "BASIC", label: "Basic Mode" },
              { value: "TECHNICAL", label: "Technical Mode" },
            ]}
          />
        </div>

        {/* ── Interactive Miniatures ─────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 16 }}>
          <ConcentrationMiniature />
          <OracleConfidenceMiniature />
        </div>

        {/* ── Interactive Risk Ratchet & Portfolio Simulator Section ── */}
        <div className="stack g-16">
          <div style={{ padding: "0 4px" }}>
            <div className="row between wrap g-8" style={{ alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Interactive Risk Ratchet & Portfolio Simulator
                </h2>
                <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "4px 0 0 0" }}>
                  Hypothetical multi-asset sandbox: adjust concentration, widen Pyth confidence spreads, or simulate market gap-downs to observe how Circuit turns risk into financial permissions.
                </p>
              </div>
              <div className="row g-8">
                <Pill tone="warning">LEARNING SIMULATION</Pill>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  style={{ fontSize: 11, height: 26, padding: "0 10px" }}
                  onClick={resetParams}
                >
                  Reset Defaults
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Simulation Levers */}
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              {/* Slider 1: NVDA Concentration */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--text-3)", fontFamily: "var(--mono)" }}>NVDA WEIGHT</span>
                  <span style={{ fontWeight: 700, color: params.nvdaWeightPct > 40 ? "var(--warning)" : "var(--text)" }}>
                    {params.nvdaWeightPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={85}
                  value={params.nvdaWeightPct}
                  onChange={(e) => updateParam("nvdaWeightPct", Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                  {params.nvdaWeightPct > 40 ? `-${Math.round((params.nvdaWeightPct - 40) * 36)} bps penalty` : "Within 40% ceiling"}
                </div>
              </div>

              {/* Slider 2: Pyth Confidence Spread */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--text-3)", fontFamily: "var(--mono)" }}>PYTH CONF SPREAD</span>
                  <span style={{ fontWeight: 700, color: params.nvdaConfBps > 50 ? "var(--warning)" : "var(--text)" }}>
                    ±{params.nvdaConfBps} bps
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={200}
                  value={params.nvdaConfBps}
                  onChange={(e) => updateParam("nvdaConfBps", Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                  {params.nvdaConfBps > 150 ? "Breaches 150 bps ceiling" : params.nvdaConfBps > 50 ? "Haircut applied" : "Nominal"}
                </div>
              </div>

              {/* Slider 3: Market Gap Down */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--text-3)", fontFamily: "var(--mono)" }}>MARKET GAP-DOWN</span>
                  <span style={{ fontWeight: 700, color: params.marketDropPct < 0 ? "var(--danger)" : "var(--text)" }}>
                    {params.marketDropPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  value={params.marketDropPct}
                  onChange={(e) => updateParam("marketDropPct", Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--danger)" }}
                />
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                  Stressed equity valuation shock
                </div>
              </div>

              {/* Toggle: NYSE Market Session */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--text-3)", fontFamily: "var(--mono)" }}>NYSE MARKET SESSION</span>
                  <span style={{ fontWeight: 700, color: params.marketOpen ? "var(--success)" : "var(--danger)" }}>
                    {params.marketOpen ? "OPEN" : "CLOSED"}
                  </span>
                </div>
                <button
                  type="button"
                  className={`btn btn--sm ${params.marketOpen ? "btn--secondary" : "btn--accent"}`}
                  style={{ width: "100%", fontSize: 11, height: 32 }}
                  onClick={() => updateParam("marketOpen", !params.marketOpen)}
                >
                  Toggle Session ({params.marketOpen ? "Close NYSE" : "Open NYSE"})
                </button>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                  Closed session engages Defensive ratchet
                </div>
              </div>
            </div>
          </Card>

          {/* Full Canvas with Virtual Data */}
          <PortfolioRiskGraph
            assets={snapshot.positions}
            riskState={snapshot.riskState}
            baseLtvBps={snapshot.weightedBaseLtvBps}
            effectiveLtvBps={snapshot.effectiveLtvBps}
            borrowPowerUsd={snapshot.borrowCapacityUsd}
            totalCollateralUsd={snapshot.totalCollateralUsd}
            borrowAllowed={snapshot.borrowAllowed}
            hardOverride={snapshot.hardOverride}
            hardOverrideReason={snapshot.hardOverrideReason}
            uneditable={true}
          />

          {/* Stress Scenario Panel (Migrated from Profile) */}
          <StressScenarioPanel
            totalCollateralUsd={snapshot.totalCollateralUsd}
            totalDebtUsd={snapshot.totalDebtUsd}
            baseLtvBps={snapshot.weightedBaseLtvBps}
            liqThresholdBps={8000}
          />
        </div>

        {/* ── Risk Ratchet Mechanical Scroll Narrative ──────────────── */}
        <RiskRatchetNarrative />

        {/* ── 14 Modular Educational Sections ────────────────────────── */}
        <Card title="The 14 Core Protocol Principles">
          <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 20px 0" }}>
            Each module explains a core pillar of Circuit's risk-intelligence architecture. Currently displaying in{" "}
            <strong>{mode === "BASIC" ? "Basic Plain-English Mode" : "Deep Technical Mode"}</strong>.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {MODULES.map((m) => (
              <details
                key={m.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  background: "var(--surface-2)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 650,
                    fontSize: 14,
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "var(--surface-3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                        color: "var(--accent)",
                        flexShrink: 0,
                      }}
                    >
                      {m.id}
                    </span>
                    <span style={{ color: "var(--text)" }}>{m.title}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Pill tone="neutral">{m.badge}</Pill>
                    <Icon name="chevron" size={14} />
                  </div>
                </summary>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 13, lineHeight: 1.6, color: "var(--text-2)" }}>
                  <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", margin: "0 0 8px 0" }}>
                    {m.summary}
                  </p>
                  {mode === "BASIC" ? m.basicContent : m.technicalContent}
                </div>
              </details>
            ))}
          </div>
        </Card>

        {/* ── On-Chain Verification Callout ─────────────────────────── */}
        <Card quiet>
          <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 650, color: "var(--text)" }}>
                Verified On Solana Devnet
              </div>
              <p className="t-sm muted" style={{ margin: "4px 0 0 0", maxWidth: "52ch" }}>
                Every PDA seed formula, Pyth receiver program interface, and deterministic NYSE session calendar rule is verifiable on-chain.
              </p>
            </div>
            <div className="row g-8">
              <Link to="/app/verify" className="btn btn--secondary btn--sm">
                On-Chain Verification →
              </Link>
              <Link to="/app/profile" className="btn btn--accent btn--sm">
                Inspect Your Risk Profile →
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
