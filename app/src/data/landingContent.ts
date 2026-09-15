/**
 * Canonical content source of truth for the Circuit landing page.
 *
 * All marketing and mechanism statements derive from this module to ensure
 * consistency across all sections.
 *
 * Strict Principles:
 * - Deterministic, technical, verifiable tone
 * - No fake metrics (TVL, users, revenue)
 * - Clear distinction between Live Data, Static Config, and Illustrative Arithmetic
 * - Devnet status explicit throughout
 */

import { CLUSTER_LABEL } from "../env";

export const CIRCUIT_TREASURY_STRING = "7AALMsZ5MuioSW7BMwBCwTmy9Y1fMJ6MKXAELYyrtb4";

export const LANDING_CONTENT = {
  hero: {
    eyebrow: `Solana ${CLUSTER_LABEL} · Programmable Credit Infrastructure`,
    title: {
      line1: "Tokenized stocks are assets.",
      line2: "circuit makes them",
      emphasis: "programmable collateral.",
    },
    lede: "circuit turns verified market conditions into capital permissions, credit limits and deterministic recovery actions enforced on-chain.",
    sublede: "Market state changes what capital is allowed to do.",
    mechanismCue: [
      { label: "MARKET", sub: "Pyth + Session" },
      { label: "RISK", sub: "4-State Ratchet" },
      { label: "PERMISSION", sub: "Capital Policy" },
      { label: "CREDIT", sub: "Enforced On-Chain" },
    ],
    statusList: [
      `Deployed on Solana ${CLUSTER_LABEL}`,
      "4-State Risk Ratchet",
      "Capital Policy Engine",
      "Dutch Auction Recovery",
    ],
  },

  assetUniverse: {
    index: "02",
    tag: "Asset Universe",
    title: {
      line1: "Tokenized markets.",
      emphasis: "One programmable layer.",
    },
    lede: "Each supported equity maps to a canonical asset configuration containing its token identity, oracle feed, market-session rules and risk parameters. circuit consumes that configuration through one protocol interface.",
    architectureDimensions: [
      { key: "asset", label: "ASSET", detail: "Registered equity identity" },
      { key: "token", label: "TOKEN", detail: "SPL mint & vault PDA" },
      { key: "oracle", label: "ORACLE", detail: "Pyth PriceUpdateV2 feed" },
      { key: "session", label: "SESSION", detail: "Deterministic NYSE calendar" },
      { key: "risk", label: "RISK", detail: "LTV & liquidation thresholds" },
    ],
  },

  circuit: {
    index: "03",
    tag: "The Circuit",
    title: {
      line1: "Credit is the last step,",
      emphasis: "never the first.",
    },
    lede: "Seven deterministic stages connect raw market observations to on-chain capital execution.",
    stages: [
      {
        key: "equity",
        number: "01",
        label: "Tokenized Equity",
        beat: "Collateral",
        summary: "Tokenized equity enters circuit as programmable collateral.",
        detail:
          "The position is represented on Solana and governed by protocol rules rather than a frontend balance.",
        invariant: "Non-custodial: Repay & Deposit remain unconditionally open.",
      },
      {
        key: "oracle",
        number: "02",
        label: "Pyth Price + Confidence",
        beat: "Observation",
        summary: "Pyth supplies the market observation.",
        detail:
          "circuit validates price freshness and oracle uncertainty before allowing risk-sensitive actions.",
        invariant: "Evaluated at conservative bound p_conservative = max(0, p - conf).",
      },
      {
        key: "market",
        number: "03",
        label: "MarketGuard Session",
        beat: "Session",
        summary: "MarketGuard checks observation usability under market-session policy.",
        detail:
          "Valid observation requires fresh price, confidence within bounds, and venue session policy satisfied. Distinguishes underlying venue session state from on-chain token availability.",
        invariant: "Deterministic calendar prevents gap-down risk across market closes.",
      },
      {
        key: "ratchet",
        number: "04",
        label: "4-State Risk Ratchet",
        beat: "State",
        summary: "The ratchet converts changing market conditions into protocol states.",
        detail:
          "Safe → Restricted → Defensive → Emergency. Tightening is instantaneous upon stress; recovery is staged with monotonic hysteresis to prevent abrupt re-enabling of capital.",
        invariant: "Direct Emergency → Safe transitions are prohibited on-chain.",
      },
      {
        key: "policy",
        number: "05",
        label: "Capital Policy Engine",
        beat: "Policy",
        summary: "Market state becomes an on-chain capital policy.",
        detail:
          "The protocol derives what a position is allowed to do from the current risk state. The caller cannot supply its own permissions. Unsafe capital actions fail on-chain.",
        invariant: "State machine: Borrow/Withdraw blocked in Defensive & Emergency.",
      },
      {
        key: "credit",
        number: "06",
        label: "Programmable Credit",
        beat: "Credit",
        summary: "Credit is the last step, never the first.",
        detail:
          "Borrow capacity is derived from collateral value and effective LTV: Borrow Capacity = (Collateral Value × Effective LTV) − Debt. The frontend may estimate borrowing power; the program verifies the final transaction itself.",
        invariant: "LTV = Debt / Collateral Value. Enforced at instruction boundary.",
      },
      {
        key: "recovery",
        number: "07",
        label: "Dutch Auction Recovery",
        beat: "Recovery",
        summary: "Unsafe positions recover through bounded collateral auctions.",
        detail:
          "When recovery is required, circuit auctions the minimum collateral necessary to restore the position according to protocol policy: P(t) = P_start − [(t − t₀)/T] × (P_start − P_floor). The auction price can only move within protocol-defined bounds.",
        invariant: "Continuous Dutch decay eliminates MEV bot gas/priority arms races.",
      },
    ],
  },

  refusal: {
    index: "04",
    tag: "Refusal",
    title: {
      line1: "When the inputs stop agreeing,",
      emphasis: "the transaction stops.",
    },
    lede: "This is not a warning banner. The program refuses the state-changing instruction.",
    faults: [
      {
        key: "stale",
        label: "Oracle stale",
        detail: "The newest price update is older than the max oracle age bound.",
        code: "StaleOracle",
      },
      {
        key: "confidence",
        label: "Confidence too wide",
        detail: "Oracle uncertainty interval exceeds the asset threshold (e.g. > 50 bps).",
        code: "ConfidenceTooWide",
      },
      {
        key: "closed",
        label: "Market session closed",
        detail: "Underlying equity venue is closed; borrowing gated to protect pool.",
        code: "MarketClosed",
      },
      {
        key: "policy",
        label: "Capital policy violation",
        detail: "Operation rejected: active risk ratchet state blocks new leverage.",
        code: "CapitalPolicyBlocked",
      },
    ],
    verdict: {
      kicker: "Risk-increasing action",
      word: "Blocked on-chain.",
      note: "Borrowing and withdrawing are refused while any input is unusable or capital policy restricts risk. Repaying and depositing stay open, because both reduce risk. The protocol never guesses a price in order to stay available.",
    },
  },

  safeState: {
    index: "05",
    tag: "Safe State",
    title: {
      line1: "Every input agrees.",
      emphasis: "The circuit closes.",
    },
    formula: "Verified Market Inputs + Current Risk State + Capital Policy = Available Credit",
    checks: [
      {
        key: "oracle",
        label: "Pyth Oracle",
        value: "Fresh, validated within staleness bound",
      },
      {
        key: "confidence",
        label: "Confidence Interval",
        value: "Uncertainty within tolerance bound",
      },
      {
        key: "market",
        label: "MarketGuard Session",
        value: "Venue in regular session",
      },
      {
        key: "policy",
        label: "Capital Policy",
        value: "Safe state: full credit permissions active",
      },
    ],
    workedExampleLabel: "Illustrative arithmetic · not live user data",
    figures: [
      {
        key: "collateral",
        label: "Collateral Value",
        value: "$10,000",
        note: "Deposited tokenized equity, valued at verified oracle price",
      },
      {
        key: "ltv",
        label: "Effective LTV",
        value: "70.0%",
        note: "Active capital policy ceiling for this asset configuration",
      },
      {
        key: "capacity",
        label: "Borrow Capacity",
        value: "$7,000",
        note: "Collateral Value × Effective LTV − Existing Debt ($0)",
      },
      {
        key: "health",
        label: "Health Factor",
        value: "1.42",
        note: "80% liquidation threshold against full 70% utilisation",
      },
    ],
    caption:
      "Illustrative arithmetic. Values demonstrate protocol equations under standard risk parameters, not a live position or quote. Real account balances and permissions are evaluated on-chain inside the app against your connected wallet.",
  },

  credit: {
    index: "06",
    tag: "Credit Lifecycle",
    title: {
      line1: "How credit works",
      emphasis: "on circuit.",
    },
    moves: [
      {
        n: "01",
        verb: "Deposit",
        body: "Tokenized equity enters a program-controlled position account. Tokens stay in the protocol vault PDA, never on a company balance sheet.",
      },
      {
        n: "02",
        verb: "Verify",
        body: "Price, confidence, and market-session conditions are validated before risk-sensitive actions. Stale or wide feeds halt new exposure.",
      },
      {
        n: "03",
        verb: "Policy",
        body: "The 4-State Risk Ratchet derives effective LTV and capital permissions on-chain. What capital is permitted to do changes dynamically with risk.",
      },
      {
        n: "04",
        verb: "Borrow",
        body: "Credit is available strictly within the active capital policy. Unsafe borrows that exceed capacity or violate policy fail on-chain.",
      },
      {
        n: "05",
        verb: "Recover",
        body: "Unsafe positions enter deterministic Dutch auction recovery. The protocol auctions the exact minimum collateral needed to restore health.",
      },
    ],
    footer:
      "Repayment remains risk-reducing and is unconditionally permitted. Withdrawals remain subject to the active capital policy. Unhealthy positions enter bounded recovery auctions to protect senior liquidity without MEV bot liquidation races.",
  },

  technology: {
    index: "07",
    tag: "Technology",
    title: {
      line1: "Built to be verified,",
      emphasis: "not to be trusted.",
    },
    authorityBoundary: {
      client: {
        title: "CLIENT (Frontend)",
        role: "Display & Transaction Construction",
        points: ["Displays protocol state", "Prepares transaction instructions", "Estimates display values"],
        verdict: "Frontend ≠ Authority",
      },
      program: {
        title: "PROGRAM (Solana SBF)",
        role: "Deterministic State Machine",
        points: [
          "Validates accounts & signer PDAs",
          "Validates oracle prices & confidence",
          "Evaluates Capital Policy permissions",
          "Enforces Effective LTV boundaries",
          "Executes & settles Dutch auctions",
          "Collects origination fees directly to Treasury",
        ],
        verdict: "Rust Program = Authority",
      },
    },
  },

  economics: {
    index: "08",
    tag: "The Economic Engine",
    title: {
      line1: "Safe credit creates",
      emphasis: "protocol revenue.",
    },
    lede: "circuit monetizes the infrastructure between tokenized assets and programmable capital. The protocol monetizes safe execution, not user liquidations.",
    flow: [
      { step: "MARKET", desc: "Pyth + Session" },
      { step: "RISK", desc: "Ratchet state" },
      { step: "PERMISSION", desc: "Capital policy" },
      { step: "CREDIT", desc: "Authorized draw" },
      { step: "FEE", desc: "Treasury settlement" },
    ],
    thesis:
      "Successful credit execution generates a protocol origination fee settled atomically to Circuit Treasury. Blocked unsafe actions generate zero fee.",
    treasuryAddress: CIRCUIT_TREASURY_STRING,
    feeConfig: "Configurable on-chain (default 25 bps origination fee)",
    disclaimer: `Solana ${CLUSTER_LABEL} · Test software · No real economic value`,
  },

  cta: {
    index: "09",
    tag: "Start",
    statement: {
      line1: "Your equities.",
      line2: "Your collateral.",
      emphasis: "Programmable capital.",
    },
    sub: "Deposit tokenized equity. Let circuit verify the market state, derive the active capital policy, and enforce credit and recovery rules on Solana.",
    meta: `Deployed on Solana · ${CLUSTER_LABEL} · Unaudited MVP`,
  },
};
