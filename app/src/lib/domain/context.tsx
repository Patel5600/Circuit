/**
 * Circuit Protocol - Canonical Domain Protocol Provider
 *
 * Single source of truth for all routes. Provides unified:
 * WalletState, ProtocolState, MarketState, PortfolioState,
 * RiskState, CreditState, ActivityState, and SystemHealthState.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  WalletDomainState,
  ProtocolDomainState,
  MarketDomainState,
  PortfolioDomainState,
  RiskDomainState,
  CreditDomainState,
  AgentAuthorityDomainState,
  ActivityDomainState,
  SystemHealthState,
  InvalidationScope,
  FreshnessMeta,
  ActivityEvent,
  ControlMode,
} from "./types";
import { RpcOrchestrator } from "./orchestrator";
import { getWalletStatus, verifyClusterGenesis } from "./wallet";
import { fetchLivePortfolioSnapshot } from "../portfolio/live-provider";
import { DEPLOYED_MARKETS } from "../../data/markets";
import { PROGRAM_ID, RPC_URL } from "../../config";
import { detectActivityPatterns } from "../activity/pattern-engine";
import { isNyseMarketOpen } from "../session";
import {
  evaluatePermission,
  PermissionResult,
  ProtocolAction,
} from "../permission-engine";

interface DomainContextValue {
  wallet: WalletDomainState;
  protocol: ProtocolDomainState;
  markets: MarketDomainState;
  portfolio: PortfolioDomainState;
  risk: RiskDomainState;
  credit: CreditDomainState;
  controlMode: ControlMode;
  setControlMode: (mode: ControlMode) => void;
  evaluatePermissionForAction: (
    action: ProtocolAction,
    amountUsd?: number,
    symbolOrMint?: string
  ) => PermissionResult;
  agentAuthority: AgentAuthorityDomainState;
  getAgentAuthorityForAsset: (symbolOrMint: string) => AgentAuthorityDomainState;
  revokeAgentAuthority: (symbolOrMint: string) => void;
  activity: ActivityDomainState;
  systemHealth: SystemHealthState;
  orchestrator: RpcOrchestrator;
  activeMarketKey: string;
  setActiveMarketKey: (key: string) => void;
  invalidate: (scope: InvalidationScope) => void;
  refreshAll: () => Promise<void>;
}

const DomainContext = createContext<DomainContextValue | null>(null);

function makeFreshness(source: string, error: string | null = null): FreshnessMeta {
  return {
    updatedAt: Date.now(),
    source,
    freshness: error ? "ERROR" : "LIVE",
    error,
  };
}

export function CircuitProtocolProvider({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, connected, connecting } = useWallet();

  const orchestrator = useMemo(() => new RpcOrchestrator(connection), [connection]);
  const [activeMarketKey, setActiveMarketKey] = useState<string>("NVDA");

  // Domain states
  const [isDevnet, setIsDevnet] = useState<boolean>(true);
  const [solBalance, setSolBalance] = useState<bigint>(0n);
  const [isRpcDegraded, setIsRpcDegraded] = useState<boolean>(false);
  const [rpcLatency, setRpcLatency] = useState<number>(0);
  const [currentSlot, setCurrentSlot] = useState<number>(0);

  // Control Mode: MANUAL (default, wallet-first) vs AUTONOMOUS (bounded strategy)
  const [controlMode, setControlMode] = useState<ControlMode>("MANUAL");

  // Portfolio state
  const [portfolioSnap, setPortfolioSnap] = useState<any>(null);
  const [portfolioLoading, setPortfolioLoading] = useState<boolean>(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  // Activity events
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Check cluster genesis
  useEffect(() => {
    let active = true;
    verifyClusterGenesis(connection).then(({ isDevnet: devnet }) => {
      if (active) setIsDevnet(devnet);
    });
    return () => {
      active = false;
    };
  }, [connection]);

  // Balance fetcher
  const fetchBalance = useCallback(async () => {
    if (!publicKey) {
      setSolBalance(0n);
      return;
    }
    try {
      const start = Date.now();
      const bal = await orchestrator.getBalance(publicKey, 3000);
      setRpcLatency(Date.now() - start);
      setSolBalance(BigInt(bal));
      setIsRpcDegraded(false);
    } catch (e) {
      setIsRpcDegraded(true);
    }
  }, [publicKey, orchestrator]);

  // Portfolio fetcher
  const fetchPortfolio = useCallback(async () => {
    if (!publicKey) {
      setPortfolioSnap(null);
      setPortfolioLoading(false);
      return;
    }
    setPortfolioLoading(true);
    try {
      const snap = await fetchLivePortfolioSnapshot(connection, publicKey);
      setPortfolioSnap(snap);
      setPortfolioError(null);
      setPortfolioLoading(false);
    } catch (err: any) {
      setPortfolioError(err?.message || "Failed to load live portfolio");
      setPortfolioLoading(false);
    }
  }, [connection, publicKey]);

  // Slot / Health heartbeat
  const fetchHealth = useCallback(async () => {
    try {
      const start = Date.now();
      const slot = await connection.getSlot("confirmed");
      setRpcLatency(Date.now() - start);
      setCurrentSlot(slot);
      setIsRpcDegraded(false);
    } catch (e) {
      setIsRpcDegraded(true);
    }
  }, [connection]);

  // Initial and periodic refresh
  useEffect(() => {
    fetchBalance();
    fetchPortfolio();
    fetchHealth();

    const interval = setInterval(() => {
      if (orchestrator.isVisible()) {
        fetchBalance();
        fetchPortfolio();
        fetchHealth();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchBalance, fetchPortfolio, fetchHealth, orchestrator]);

  // Invalidation listener
  useEffect(() => {
    return orchestrator.onInvalidate((scope) => {
      if (scope.wallet) fetchBalance();
      if (scope.portfolio) fetchPortfolio();
      if (scope.protocol) fetchHealth();
    });
  }, [orchestrator, fetchBalance, fetchPortfolio, fetchHealth]);

  // Visibility listener: refresh on becoming visible
  useEffect(() => {
    return orchestrator.onVisibilityChange((isVisible) => {
      if (isVisible) {
        fetchBalance();
        fetchPortfolio();
        fetchHealth();
      }
    });
  }, [orchestrator, fetchBalance, fetchPortfolio, fetchHealth]);

  const invalidate = useCallback(
    (scope: InvalidationScope) => {
      orchestrator.invalidate(scope);
    },
    [orchestrator]
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchBalance(), fetchPortfolio(), fetchHealth()]);
  }, [fetchBalance, fetchPortfolio, fetchHealth]);

  // Build canonical domain models
  const walletState: WalletDomainState = useMemo(() => {
    const status = getWalletStatus({
      connected,
      connecting,
      isWrongNetwork: !isDevnet,
      isRpcDegraded,
    });
    return {
      address: publicKey ? publicKey.toBase58() : null,
      cluster: isDevnet ? "devnet" : "unknown",
      isDevnet,
      status,
      solBalanceLamports: solBalance,
      solBalanceUi: Number(solBalance) / 1e9,
      tokenBalances: {},
      freshness: makeFreshness("wallet-adapter"),
    };
  }, [connected, connecting, isDevnet, isRpcDegraded, publicKey, solBalance]);

  const protocolState: ProtocolDomainState = useMemo(() => {
    return {
      isFrozen: false,
      minHealthFactorBps: 10_000,
      authority: PROGRAM_ID.toBase58(),
      freshness: makeFreshness("rpc-account"),
    };
  }, []);

  const marketState: MarketDomainState = useMemo(() => {
    const marketsMap: Record<string, any> = {};
    DEPLOYED_MARKETS.forEach((m) => {
      marketsMap[m.symbol] = m;
    });
    return {
      markets: marketsMap,
      activeMarketKey,
      freshness: makeFreshness("markets-registry"),
    };
  }, [activeMarketKey]);

  const portfolioState: PortfolioDomainState = useMemo(() => {
    const positions = portfolioSnap?.positions ?? [];
    const hasPositions = positions.length > 0;
    const healthFactor = portfolioSnap?.healthFactorBps
      ? portfolioSnap.healthFactorBps / 10_000
      : null;
    const cMax = portfolioSnap?.maxWeightPct
      ? portfolioSnap.maxWeightPct / 100
      : hasPositions
      ? 1
      : 0;
    const cMaxPenaltyBps = portfolioSnap?.concentrationPenaltyBps ?? 0;

    return {
      positions,
      totalCollateralUsd: portfolioSnap?.totalCollateralUsd ?? 0,
      totalDebtUsd: portfolioSnap?.totalDebtUsd ?? 0,
      borrowCapacityUsd: portfolioSnap?.borrowCapacityUsd ?? 0,
      healthFactor,
      effectiveLtvBps: portfolioSnap?.effectiveLtvBps ?? 7000,
      weightedBaseLtvBps: portfolioSnap?.weightedBaseLtvBps ?? 7000,
      cMax,
      cMaxPenaltyBps,
      hasPositions,
      freshness: makeFreshness("onchain-pda", portfolioError),
    };
  }, [portfolioSnap, portfolioError]);

  const riskState: RiskDomainState = useMemo(() => {
    const nyse = isNyseMarketOpen();
    const positions = portfolioSnap?.positions ?? [];
    const isStale = positions.some((p: any) => !p.oracleHealthy);
    const maxConf =
      positions.length > 0
        ? Math.max(...positions.map((p: any) => p.confBps))
        : 18;
    const hardOverride = portfolioSnap?.hardOverride ?? isStale;
    const hardOverrideReason =
      portfolioSnap?.hardOverrideReason ??
      (isStale ? "Oracle stale or confidence breached" : undefined);
    const derivedRatchetState = hardOverride
      ? "EMERGENCY"
      : portfolioSnap?.riskState ?? (nyse.isOpen ? "SAFE" : "RESTRICTED");

    return {
      ratchetState: derivedRatchetState,
      riskState: derivedRatchetState,
      maxConfSpreadBps: maxConf,
      isStaleOracle: isStale,
      isMarketOpen: nyse.isOpen,
      hardOverride,
      hardOverrideReason,
      freshness: makeFreshness("risk-engine"),
    };
  }, [portfolioSnap]);

  const creditState: CreditDomainState = useMemo(() => {
    const rState = riskState.ratchetState;
    const hasCollat = portfolioState.totalCollateralUsd > 0;
    const hasDebt = portfolioState.totalDebtUsd > 0;
    const hardOverride = riskState.hardOverride;

    let borrowStatus: "ALLOWED" | "RESTRICTED" | "BLOCKED" = "ALLOWED";
    let borrowReason: string | undefined;

    if (hardOverride || rState === "EMERGENCY") {
      borrowStatus = "BLOCKED";
      borrowReason =
        riskState.hardOverrideReason ||
        "Hard Safety Gate breached. Risk ratchet in EMERGENCY state. Borrowing locked by protocol.";
    } else if (rState === "DEFENSIVE") {
      borrowStatus = "BLOCKED";
      borrowReason =
        "Risk ratchet in DEFENSIVE state. Market volatility exceeds safe threshold.";
    } else if (rState === "RESTRICTED") {
      borrowStatus = "RESTRICTED";
      borrowReason = !riskState.isMarketOpen
        ? "NYSE reference session closed (MarketGuard active). Credit constrained."
        : "Risk ratchet in RESTRICTED state. Borrowing capacity constrained.";
    } else if (!hasCollat) {
      borrowStatus = "BLOCKED";
      borrowReason = "Deposit collateral to activate borrowing power.";
    }

    let withdrawStatus: "ALLOWED" | "RESTRICTED" | "BLOCKED" | "INACTIVE" = hasCollat
      ? "ALLOWED"
      : "INACTIVE";
    let withdrawReason: string | undefined;

    if (
      hasCollat &&
      hasDebt &&
      (hardOverride || rState === "DEFENSIVE" || rState === "EMERGENCY")
    ) {
      withdrawStatus = "BLOCKED";
      withdrawReason = `Withdrawal locked during ${rState} containment while holding debt to protect pool solvency.`;
    }

    const availableCreditUsd = portfolioState.borrowCapacityUsd;
    const creditUtilizationPct =
      availableCreditUsd + portfolioState.totalDebtUsd > 0
        ? (portfolioState.totalDebtUsd /
            (availableCreditUsd + portfolioState.totalDebtUsd)) *
          100
        : 0;

    return {
      permissions: {
        borrow: { status: borrowStatus, reason: borrowReason },
        withdraw: { status: withdrawStatus, reason: withdrawReason },
        repay: { status: hasDebt ? "ALLOWED" : "INACTIVE" },
        deposit: { status: "ALLOWED" },
        liquidate: {
          status:
            portfolioState.healthFactor !== null && portfolioState.healthFactor < 1.0
              ? "ALLOWED"
              : "INACTIVE",
        },
      },
      availableCreditUsd,
      creditUtilizationPct,
      freshness: makeFreshness("credit-permissions"),
    };
  }, [riskState, portfolioState]);

  const [revokedAssets, setRevokedAssets] = useState<Record<string, boolean>>({});

  const revokeAgentAuthority = useCallback((symbolOrMint: string) => {
    setRevokedAssets((prev) => ({ ...prev, [symbolOrMint.toUpperCase()]: true }));
  }, []);

  const getAgentAuthorityForAsset = useCallback(
    (symbolOrMint: string): AgentAuthorityDomainState => {
      const sym = symbolOrMint.toUpperCase();
      const isRevoked = Boolean(revokedAssets[sym]);
      const matchedPos = portfolioState.positions.find(
        (p) => p.symbol.toUpperCase() === sym || p.mint === symbolOrMint
      );

      const hasPos = Boolean(matchedPos);
      const debt = matchedPos?.debtUi ?? 0;
      const maxBorrow = hasPos ? 3000 : 0;
      const currentBorrowed = debt;
      const riskBudget = Math.max(0, maxBorrow - currentBorrowed);

      // Effective authority evaluation:
      // EffectiveAuthority = OwnerPolicy ∩ AgentAuthority ∩ RiskPolicy ∩ PositionConstraints
      let status: "ACTIVE" | "LIMITED" | "BLOCKED" | "REVOKED" = "ACTIVE";
      let effectiveAuthority: "FULL" | "LIMITED" | "BLOCKED" = "FULL";

      if (isRevoked) {
        status = "REVOKED";
        effectiveAuthority = "BLOCKED";
      } else if (!hasPos) {
        status = "BLOCKED";
        effectiveAuthority = "BLOCKED";
      } else if (
        riskState.hardOverride ||
        riskState.ratchetState === "EMERGENCY" ||
        riskState.ratchetState === "DEFENSIVE"
      ) {
        status = "BLOCKED";
        effectiveAuthority = "BLOCKED";
      } else if (riskState.ratchetState === "RESTRICTED") {
        status = "LIMITED";
        effectiveAuthority = "LIMITED";
      } else if (currentBorrowed >= maxBorrow || riskBudget <= 0) {
        status = "LIMITED";
        effectiveAuthority = "LIMITED";
      }

      let availableBorrow = 0;
      if (effectiveAuthority === "FULL") {
        availableBorrow = Math.max(
          0,
          Math.min(maxBorrow - currentBorrowed, riskBudget, portfolioState.borrowCapacityUsd)
        );
      } else if (effectiveAuthority === "LIMITED") {
        availableBorrow = Math.max(
          0,
          Math.min(750, (maxBorrow - currentBorrowed) * 0.25, portfolioState.borrowCapacityUsd * 0.25)
        );
      } else {
        availableBorrow = 0;
      }

      return {
        hasAuthority: hasPos && !isRevoked,
        strategyName: "Momentum-Alpha v1",
        agentAddress: "Strat11111111111111111111111111111111111111",
        ownerAddress: publicKey ? publicKey.toBase58() : null,
        assetMint: matchedPos?.mint ?? null,
        assetSymbol: matchedPos?.symbol ?? sym,
        allowedActions: {
          deposit: false,
          borrow: !isRevoked && effectiveAuthority !== "BLOCKED",
          repay: !isRevoked,
          withdraw: false,
        },
        maxBorrowLimit: maxBorrow,
        maxWithdrawLimit: 0,
        currentBorrowed,
        availableBorrow,
        riskBudget,
        initialRiskBudget: maxBorrow,
        expiryTs: 0,
        isExpired: false,
        nonce: hasPos ? (debt > 0 ? 1 : 0) : 0,
        status,
        effectiveAuthority,
      };
    },
    [revokedAssets, portfolioState, riskState, publicKey]
  );

  const activeAgentAuthority: AgentAuthorityDomainState = useMemo(() => {
    return getAgentAuthorityForAsset(activeMarketKey);
  }, [getAgentAuthorityForAsset, activeMarketKey]);

  const activityPatterns = useMemo(() => {
    return detectActivityPatterns(activityEvents);
  }, [activityEvents]);

  const activityState: ActivityDomainState = useMemo(() => {
    return {
      events: activityEvents,
      patterns: activityPatterns,
      freshness: makeFreshness("program-signatures"),
    };
  }, [activityEvents, activityPatterns]);

  const systemHealth: SystemHealthState = useMemo(() => {
    let status: any = "SYSTEM_HEALTHY";
    if (isRpcDegraded) status = "RPC_DEGRADED";
    else if (!isDevnet) status = "MARKET_DATA_DEGRADED";

    return {
      status,
      rpcLatencyMs: rpcLatency,
      slot: currentSlot,
      lastHeartbeat: Date.now(),
      rpcEndpoint: RPC_URL,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    };
  }, [isRpcDegraded, isDevnet, rpcLatency, currentSlot]);

  const evaluatePermissionForAction = useCallback(
    (action: ProtocolAction, amountUsd: number = 0, symbolOrMint?: string): PermissionResult => {
      const sym = (symbolOrMint || activeMarketKey).toUpperCase();
      const pos = portfolioState.positions.find(
        (p) => p.symbol.toUpperCase() === sym || p.mint === symbolOrMint
      );
      const collatUsd =
        pos?.collateralValueUsd ?? portfolioState.totalCollateralUsd ?? 0;
      const debtUsd = pos?.debtUi ?? (portfolioState.totalDebtUsd || 0);
      const agentAuth = controlMode === "AUTONOMOUS" ? getAgentAuthorityForAsset(sym) : null;

      return evaluatePermission({
        actor: controlMode === "MANUAL" ? "HUMAN" : "AGENT",
        action,
        amountUsd,
        protocolPaused: protocolState.isFrozen,
        assetEnabled: true,
        isMarketOpen: riskState.isMarketOpen,
        oracleStale: riskState.isStaleOracle,
        confBps: riskState.maxConfSpreadBps,
        maxConfBps: 100,
        riskState: riskState.ratchetState,
        baseLtvBps: portfolioState.weightedBaseLtvBps || 7000,
        collateralUsd: collatUsd,
        currentDebtUsd: debtUsd,
        minHealthFactorBps: protocolState.minHealthFactorBps || 10_000,
        liquidationThresholdBps: 8000,
        agentAuthority: agentAuth
          ? {
              active: agentAuth.hasAuthority && agentAuth.status !== "REVOKED",
              isExpired: agentAuth.isExpired,
              allowedActions: agentAuth.allowedActions,
              maxBorrowLimitUsd: agentAuth.maxBorrowLimit,
              maxWithdrawLimitUsd: agentAuth.maxWithdrawLimit,
              currentBorrowedUsd: agentAuth.currentBorrowed,
              riskBudgetUsd: agentAuth.riskBudget,
            }
          : null,
      });
    },
    [
      controlMode,
      activeMarketKey,
      portfolioState,
      riskState,
      protocolState,
      getAgentAuthorityForAsset,
    ]
  );

  const value: DomainContextValue = {
    wallet: walletState,
    protocol: protocolState,
    markets: marketState,
    portfolio: portfolioState,
    risk: riskState,
    credit: creditState,
    controlMode,
    setControlMode,
    evaluatePermissionForAction,
    agentAuthority: activeAgentAuthority,
    getAgentAuthorityForAsset,
    revokeAgentAuthority,
    activity: activityState,
    systemHealth,
    orchestrator,
    activeMarketKey,
    setActiveMarketKey,
    invalidate,
    refreshAll,
  };

  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>;
}

export function useCircuitDomain(): DomainContextValue {
  const ctx = useContext(DomainContext);
  if (!ctx) {
    throw new Error("useCircuitDomain must be used within a CircuitProtocolProvider");
  }
  return ctx;
}
