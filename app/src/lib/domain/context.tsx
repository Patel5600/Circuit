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
import { PROGRAM_ID, RPC_URL, PYTH_PRICE_ACCOUNT } from "../../config";
import { useMarketData } from "../../context/MarketDataContext";
import { useMarket } from "../../context/MarketContext";
import { oracleCache, fetchOracle } from "../pyth";
import { detectActivityPatterns } from "../activity/pattern-engine";
import { isNyseMarketOpen } from "../session";
import {
  evaluatePermission,
  PermissionResult,
  ProtocolAction,
  CANONICAL_POLICY_VERSION,
  RiskRatchetState,
} from "../permission-engine";
import {
  OnChainAgentAuthority,
  fetchOwnerAgentAuthorities,
  buildRevokeAgentAuthorityInstruction,
  CIRCUIT_DEVNET_AGENT_KEY,
} from "../agentAuthority";
import { circuitTransport } from "../transport/circuit-transport";
import { Transaction } from "@solana/web3.js";
import { protocolEventBus, createEvent } from "../realtime/event-bus";
import { DecisionSnapshot } from "../decision/types";
import { evaluateAction } from "../decision/evaluator";
import { AssetRegistry, normalizeAssetId } from "../assets/registry";
import { OracleService, AssetOracleState } from "../assets/oracle-service";

export interface DomainContextValue {
  decision: DecisionSnapshot;
  evaluateDecision: (
    action?: ProtocolAction,
    amountUsd?: number,
    symbolOrMint?: string,
    modeOverride?: ControlMode
  ) => DecisionSnapshot;
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
  getRiskForAsset: (symbolOrMint: string) => RiskDomainState;
  getPermissionsForAsset: (symbolOrMint: string) => CreditDomainState;
  getOracleForAsset: (symbolOrMint: string) => AssetOracleState;
  getPositionForAsset: (symbolOrMint: string) => any;
  riskByAssetId: Record<string, RiskDomainState>;
  permissionsByAssetId: Record<string, CreditDomainState>;
  oracleByAssetId: Record<string, AssetOracleState>;
  positionsByAssetId: Record<string, any>;
  onChainAuthorities: OnChainAgentAuthority[];
  hasActiveAuthority: boolean;
  authoritiesLoading: boolean;
  isAuthoritySetupOpen: boolean;
  openAuthoritySetup: () => void;
  closeAuthoritySetup: () => void;
  refreshAuthorities: () => Promise<void>;
  revokeAuthorityOnChain: (agent: PublicKey, assetMint: PublicKey) => Promise<string>;
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
  const { publicKey, connected, connecting, sendTransaction } = useWallet();

  const orchestrator = useMemo(() => new RpcOrchestrator(connection), [connection]);
  const { selectedMarket } = useMarket();
  const { snapshots: marketSnapshots } = useMarketData();
  const [activeMarketKey, setActiveMarketKey] = useState<string>(() => selectedMarket?.symbol || "NVDA");

  useEffect(() => {
    if (selectedMarket?.symbol && selectedMarket.symbol !== activeMarketKey) {
      setActiveMarketKey(selectedMarket.symbol);
    }
  }, [selectedMarket?.symbol, activeMarketKey]);

  // Proactively fetch Pyth oracle for the active market if not yet cached
  useEffect(() => {
    if (!connection) return;
    const targetMarket =
      DEPLOYED_MARKETS.find((m) => m.symbol.toUpperCase() === activeMarketKey.toUpperCase()) ||
      DEPLOYED_MARKETS[0];
    if (!targetMarket?.feedId) return;

    const cacheKey =
      targetMarket.symbol === "NVDA" && PYTH_PRICE_ACCOUNT
        ? PYTH_PRICE_ACCOUNT.toBase58()
        : targetMarket.feedId;

    if (!oracleCache.has(cacheKey)) {
      fetchOracle(connection, Math.floor(Date.now() / 1000), targetMarket.feedId).catch(() => null);
    }
  }, [connection, activeMarketKey]);

  // Domain states
  const [isDevnet, setIsDevnet] = useState<boolean>(true);
  const [solBalance, setSolBalance] = useState<bigint>(0n);
  const [isRpcDegraded, setIsRpcDegraded] = useState<boolean>(false);
  const [rpcLatency, setRpcLatency] = useState<number>(0);
  const [currentSlot, setCurrentSlot] = useState<number>(0);

  // Control Mode: MANUAL (default, wallet-first) vs AUTONOMOUS (bounded strategy)
  const [controlMode, setControlModeState] = useState<ControlMode>("MANUAL");

  // Real On-Chain Agent Authorities
  const [onChainAuthorities, setOnChainAuthorities] = useState<OnChainAgentAuthority[]>([]);
  const [authoritiesLoading, setAuthoritiesLoading] = useState<boolean>(false);
  // Authority setup drawer is removed — these are kept as no-ops for interface compat.
  const isAuthoritySetupOpen = false;

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
      const slot = circuitTransport.slotStream.getCurrentSlot();
      if (slot !== null) {
        setCurrentSlot(slot);
        setIsRpcDegraded(false);
      } else {
        const start = Date.now();
        const liveSlot = await connection.getSlot("confirmed");
        setRpcLatency(Date.now() - start);
        setCurrentSlot(liveSlot);
        setIsRpcDegraded(false);
      }
    } catch (e) {
      setIsRpcDegraded(true);
    }
  }, [connection]);

  // Real on-chain authority fetching
  const fetchAuthorities = useCallback(async () => {
    if (!publicKey) {
      setOnChainAuthorities([]);
      return;
    }
    setAuthoritiesLoading(true);
    try {
      const list = await fetchOwnerAgentAuthorities(connection, publicKey);
      setOnChainAuthorities(list);
    } catch (err) {
      console.warn("fetchOwnerAgentAuthorities error:", err);
    } finally {
      setAuthoritiesLoading(false);
    }
  }, [connection, publicKey]);

  // Reactive Transport Connection & Slot Stream
  useEffect(() => {
    if (!connection) return;
    circuitTransport.init(connection);

    const unsubSlot = circuitTransport.slotStream.subscribe((slot) => {
      setCurrentSlot(slot);
    });

    const unsubHealth = circuitTransport.subscribeHealth((health) => {
      if (health.rpcLatencyMs > 0) setRpcLatency(health.rpcLatencyMs);
      setIsRpcDegraded(health.solanaRpc === "DEGRADED");
    });

    return () => {
      unsubSlot();
      unsubHealth();
    };
  }, [connection]);

  // Initial fetch on mount or identity change (no aggressive 10s polling interval)
  useEffect(() => {
    fetchBalance();
    fetchPortfolio();
    fetchAuthorities();
  }, [fetchBalance, fetchPortfolio, fetchAuthorities]);

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
    await Promise.all([fetchBalance(), fetchPortfolio(), fetchHealth(), fetchAuthorities()]);
  }, [fetchBalance, fetchPortfolio, fetchHealth, fetchAuthorities]);

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
      const snap = marketSnapshots[m.symbol];
      const cached =
        oracleCache.get(m.feedId) ||
        (m.symbol === "NVDA" && PYTH_PRICE_ACCOUNT
          ? oracleCache.get(PYTH_PRICE_ACCOUNT.toBase58())
          : null);

      const price = snap && snap.priceUsd > 0 ? snap.priceUsd : cached?.snapshot.priceUsd;
      const conf = snap ? snap.oracleConfidenceUsd : cached?.snapshot.confUsd;
      const confBps = snap ? snap.oracleConfBps : cached?.snapshot.confBps;
      const publishTime =
        snap && snap.oracleTimestamp > 0
          ? snap.oracleTimestamp
          : cached
          ? Number(cached.snapshot.update.publishTime)
          : 0;
      const status = snap ? snap.oracleStatus : cached?.snapshot.status;

      marketsMap[m.symbol] = {
        ...m,
        priceData:
          price && price > 0 && publishTime && publishTime > 0
            ? {
                price,
                conf: conf ?? 0,
                confBps: confBps ?? 0,
                publishTime,
                referencePrice: snap?.referencePrice24h ?? null,
                change24hPct: snap?.change24hPercent ?? null,
                change24hStatus: snap?.changeStatus ?? "UNAVAILABLE",
                freshness: (status as any) ?? "RECENT",
              }
            : undefined,
      };
    });
    return {
      markets: marketsMap,
      activeMarketKey,
      freshness: makeFreshness("markets-registry"),
    };
  }, [activeMarketKey, marketSnapshots]);

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
      effectiveLtvBps: portfolioSnap?.effectiveLtvBps ?? 0,
      weightedBaseLtvBps: portfolioSnap?.weightedBaseLtvBps ?? 0,
      cMax,
      cMaxPenaltyBps,
      hasPositions,
      freshness: makeFreshness("onchain-pda", portfolioError),
    };
  }, [portfolioSnap, portfolioError]);

  const riskState: RiskDomainState = useMemo(() => {
    const nyse = isNyseMarketOpen();
    const positions = portfolioSnap?.positions ?? [];
    const activePositions = positions.filter((p: any) => (p.collateralUi ?? 0) > 0 || (p.debtUi ?? 0) > 0);
    const isStale = activePositions.length > 0 && activePositions.some((p: any) => !p.oracleHealthy);
    const maxConf =
      activePositions.length > 0
        ? Math.max(...activePositions.map((p: any) => p.confBps ?? 0))
        : 0;
    const hardOverride = Boolean(portfolioSnap?.hardOverride && activePositions.length > 0) || isStale;
    const hardOverrideReason =
      portfolioSnap?.hardOverrideReason && activePositions.length > 0
        ? portfolioSnap.hardOverrideReason
        : isStale
        ? "Price feed updating for deposited collateral"
        : undefined;
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

  // ── Asset-Scoped Risk Dictionary & Accessor ──
  const riskByAssetId = useMemo<Record<string, RiskDomainState>>(() => {
    const nyse = isNyseMarketOpen();
    const result: Record<string, RiskDomainState> = {};
    const positions = portfolioSnap?.positions ?? [];

    for (const asset of AssetRegistry.list()) {
      const sym = asset.symbol;
      const pos = positions.find((p: any) => p.symbol === sym || p.mint === asset.tokenMint);
      const oracleState = OracleService.getState(sym);

      const hasHolding = (pos?.collateralUi ?? 0) > 0 || (pos?.debtUi ?? 0) > 0;
      const isStale = hasHolding && (!pos?.oracleHealthy || !oracleState.healthy);
      const confBps = pos?.confBps ?? oracleState.confBps ?? 0;

      const overrideEntry = portfolioSnap?.overridesByAssetId?.[sym];
      const assetHardOverride = Boolean(overrideEntry?.hardOverride);
      const assetHardOverrideReason =
        overrideEntry?.hardOverrideReason ??
        (hasHolding && !oracleState.healthy && oracleState.priceUsd <= 0
          ? `${sym} oracle price unavailable`
          : isStale
          ? `Price feed updating for ${sym} collateral`
          : undefined);

      let derivedRatchet: RiskRatchetState = "SAFE";
      if (assetHardOverride) {
        derivedRatchet = "EMERGENCY";
      } else if (portfolioSnap?.riskStateByAssetId?.[sym]) {
        derivedRatchet = portfolioSnap.riskStateByAssetId[sym];
      } else if (confBps > 150) {
        derivedRatchet = "DEFENSIVE";
      } else if (!nyse.isOpen) {
        derivedRatchet = "RESTRICTED";
      } else if (confBps > 50) {
        derivedRatchet = "RESTRICTED";
      } else {
        derivedRatchet = "SAFE";
      }

      result[sym] = {
        ratchetState: derivedRatchet,
        riskState: derivedRatchet,
        maxConfSpreadBps: confBps,
        isStaleOracle: isStale,
        isMarketOpen: nyse.isOpen,
        hardOverride: assetHardOverride,
        hardOverrideReason: assetHardOverrideReason,
        freshness: makeFreshness(`risk-engine-${sym}`),
      };
    }
    return result;
  }, [portfolioSnap]);

  const getRiskForAsset = useCallback(
    (symbolOrMint: string): RiskDomainState => {
      const config = AssetRegistry.get(symbolOrMint);
      const sym = config?.symbol || normalizeAssetId(symbolOrMint);
      return riskByAssetId[sym] ?? riskState;
    },
    [riskByAssetId, riskState]
  );

  // ── Asset-Scoped Credit Permissions Dictionary & Accessor ──
  const permissionsByAssetId = useMemo<Record<string, CreditDomainState>>(() => {
    const result: Record<string, CreditDomainState> = {};
    const positions = portfolioSnap?.positions ?? [];

    for (const asset of AssetRegistry.list()) {
      const sym = asset.symbol;
      const assetRisk = riskByAssetId[sym] ?? riskState;
      const pos = positions.find((p: any) => p.symbol === sym || p.mint === asset.tokenMint);
      const rState = assetRisk.ratchetState;

      const collatUsd = pos?.collateralValueUsd ?? 0;
      const debtUsd = pos?.debtUi ?? 0;
      const hasCollat = collatUsd > 0;
      const hasDebt = debtUsd > 0;
      const hardOverride = assetRisk.hardOverride;

      let borrowStatus: "ALLOWED" | "RESTRICTED" | "BLOCKED" = "ALLOWED";
      let borrowReason: string | undefined;

      if (hardOverride || rState === "EMERGENCY") {
        borrowStatus = "BLOCKED";
        borrowReason =
          assetRisk.hardOverrideReason ||
          `Hard Safety Gate breached for ${sym}. Borrowing locked by protocol policy.`;
      } else if (rState === "DEFENSIVE") {
        borrowStatus = "BLOCKED";
        borrowReason = `Risk ratchet in DEFENSIVE state for ${sym}. Market volatility exceeds safe threshold.`;
      } else if (rState === "RESTRICTED") {
        borrowStatus = "RESTRICTED";
        borrowReason = !assetRisk.isMarketOpen
          ? "NYSE reference session closed (MarketGuard active). Credit constrained."
          : `Risk ratchet in RESTRICTED state for ${sym}. Borrowing capacity constrained.`;
      } else if (!hasCollat) {
        borrowStatus = "BLOCKED";
        borrowReason = `Deposit ${sym} collateral to activate borrowing power.`;
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

      const effectiveLtvBps =
        rState === "RESTRICTED"
          ? Math.max(0, asset.riskConfig.baseLtvBps - 1000)
          : rState === "DEFENSIVE"
          ? Math.max(0, asset.riskConfig.baseLtvBps - 2000)
          : rState === "EMERGENCY"
          ? 0
          : asset.riskConfig.baseLtvBps;

      const maxBorrowCapacityUsd = collatUsd * (effectiveLtvBps / 10000);
      const availableCreditUsd = Math.max(0, maxBorrowCapacityUsd - debtUsd);
      const creditUtilizationPct =
        availableCreditUsd + debtUsd > 0
          ? (debtUsd / (availableCreditUsd + debtUsd)) * 100
          : 0;

      const healthFactor =
        debtUsd > 0 ? (collatUsd * (asset.riskConfig.liqThresholdBps / 10000)) / debtUsd : null;

      result[sym] = {
        permissions: {
          borrow: { status: borrowStatus, reason: borrowReason },
          withdraw: { status: withdrawStatus, reason: withdrawReason },
          repay: { status: hasDebt ? "ALLOWED" : "INACTIVE" },
          deposit: { status: "ALLOWED" },
          liquidate: {
            status: healthFactor !== null && healthFactor < 1.0 ? "ALLOWED" : "INACTIVE",
          },
        },
        availableCreditUsd,
        creditUtilizationPct,
        freshness: makeFreshness(`credit-permissions-${sym}`),
      };
    }

    return result;
  }, [riskByAssetId, riskState, portfolioSnap]);

  const getPermissionsForAsset = useCallback(
    (symbolOrMint: string): CreditDomainState => {
      const config = AssetRegistry.get(symbolOrMint);
      const sym = config?.symbol || normalizeAssetId(symbolOrMint);
      return permissionsByAssetId[sym] ?? creditState;
    },
    [permissionsByAssetId, creditState]
  );

  // ── Asset-Scoped Oracle Dictionary & Accessor ──
  const oracleByAssetId = useMemo<Record<string, AssetOracleState>>(() => {
    return OracleService.getAllStates();
  }, [marketSnapshots, portfolioSnap]);

  const getOracleForAsset = useCallback(
    (symbolOrMint: string): AssetOracleState => {
      return OracleService.getState(symbolOrMint);
    },
    []
  );

  // ── Asset-Scoped Positions Dictionary & Accessor ──
  const positionsByAssetId = useMemo<Record<string, any>>(() => {
    const result: Record<string, any> = {};
    const positions = portfolioSnap?.positions ?? [];
    for (const p of positions) {
      result[p.symbol] = p;
    }
    return result;
  }, [portfolioSnap]);

  const getPositionForAsset = useCallback(
    (symbolOrMint: string) => {
      const config = AssetRegistry.get(symbolOrMint);
      const sym = config?.symbol || normalizeAssetId(symbolOrMint);
      return positionsByAssetId[sym] ?? null;
    },
    [positionsByAssetId]
  );

  // ── Event Bus: emit real state transition events ──
  const prevRiskStateRef = useRef<string>(riskState.ratchetState);
  useEffect(() => {
    const prev = prevRiskStateRef.current;
    if (prev !== riskState.ratchetState) {
      protocolEventBus.emit(
        createEvent("RISK_TRANSITION", "domain-context", `Risk state ${prev} → ${riskState.ratchetState}`, {
          data: { from: prev, to: riskState.ratchetState, reason: riskState.hardOverrideReason ?? "Market conditions changed" },
        })
      );
      prevRiskStateRef.current = riskState.ratchetState;
    }
  }, [riskState.ratchetState, riskState.hardOverrideReason]);

  useEffect(() => {
    if (walletState.address) {
      protocolEventBus.emit(
        createEvent("SYSTEM_EVENT", "wallet-adapter", `Wallet connected: ${walletState.address.slice(0, 8)}…`, {
          data: { address: walletState.address, cluster: walletState.cluster },
        })
      );
    }
  }, [walletState.address, walletState.cluster]);

  const hasActiveAuthority = useMemo(() => {
    return onChainAuthorities.some((a) => a.isActive);
  }, [onChainAuthorities]);

  // Governed mode switch
  const setControlMode = useCallback((mode: ControlMode) => {
    setControlModeState(mode);
  }, []);

  // No-ops — the global setup drawer is removed. Navigation to /app/autonomous?tab=permissions is used instead.
  const openAuthoritySetup = useCallback(() => {}, []);
  const closeAuthoritySetup = useCallback(() => {}, []);

  // Real On-Chain Revocation
  const revokeAuthorityOnChain = useCallback(async (agent: PublicKey, assetMint: PublicKey) => {
    if (!publicKey) throw new Error("Wallet not connected");
    const { instruction } = await buildRevokeAgentAuthorityInstruction(connection, publicKey, agent, assetMint);
    const tx = new Transaction().add(instruction);
    tx.feePayer = publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    const sig = await sendTransaction(tx, connection);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    await fetchAuthorities();
    return sig;
  }, [connection, publicKey, sendTransaction, fetchAuthorities]);

  const [revokedAssets, setRevokedAssets] = useState<Record<string, boolean>>({});

  const revokeAgentAuthority = useCallback((symbolOrMint: string) => {
    setRevokedAssets((prev) => ({ ...prev, [symbolOrMint.toUpperCase()]: true }));
  }, []);

  const getAgentAuthorityForAsset = useCallback(
    (symbolOrMint: string): AgentAuthorityDomainState => {
      const sym = symbolOrMint.toUpperCase();
      const isLocalRevoked = Boolean(revokedAssets[sym]);
      const market = DEPLOYED_MARKETS.find(
        (m) => m.symbol.toUpperCase() === sym || m.mint === symbolOrMint
      );
      const mintStr = market?.mint;

      const auth = onChainAuthorities.find(
        (a) =>
          (mintStr && a.assetMint.toBase58() === mintStr) ||
          a.assetMint.toBase58() === symbolOrMint
      );

      // If no on-chain authority exists for this asset, strictly report NOT_CONFIGURED (or NOT_APPLICABLE if MANUAL)
      if (!auth) {
        const isManual = controlMode === "MANUAL";
        return {
          hasAuthority: false,
          strategyName: isManual ? "Not Applicable" : "Not Configured",
          agentAddress: null,
          ownerAddress: publicKey ? publicKey.toBase58() : null,
          assetMint: mintStr ?? null,
          assetSymbol: sym,
          allowedActions: { deposit: false, borrow: false, repay: false, withdraw: false },
          maxBorrowLimit: 0,
          maxWithdrawLimit: 0,
          currentBorrowed: 0,
          availableBorrow: 0,
          riskBudget: 0,
          initialRiskBudget: 0,
          expiryTs: 0,
          isExpired: false,
          nonce: 0,
          status: isManual ? "NOT_APPLICABLE" : "NOT_CONFIGURED",
          effectiveAuthority: isManual ? "NOT_APPLICABLE" : "BLOCKED",
        };
      }

      const isRevoked = auth.isRevoked || isLocalRevoked;
      const isExpired = auth.isExpired;
      const maxBorrow = auth.maxBorrowLimitUi;
      const currentBorrowed = auth.currentBorrowedUi;
      const riskBudget = auth.riskBudgetUi;

      // Effective authority evaluation:
      // EffectiveAuthority = OwnerPolicy ∩ AgentAuthority ∩ RiskPolicy ∩ PositionConstraints
      let effectiveAuthority: "FULL" | "LIMITED" | "BLOCKED" = "FULL";

      if (isRevoked || isExpired) {
        effectiveAuthority = "BLOCKED";
      } else if (
        riskState.hardOverride ||
        riskState.ratchetState === "EMERGENCY" ||
        riskState.ratchetState === "DEFENSIVE"
      ) {
        effectiveAuthority = "BLOCKED";
      } else if (riskState.ratchetState === "RESTRICTED") {
        effectiveAuthority = "LIMITED";
      } else if (currentBorrowed >= maxBorrow || riskBudget <= 0) {
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

      const strategyName =
        auth.agent.toBase58() === CIRCUIT_DEVNET_AGENT_KEY.toBase58()
          ? "Circuit Sovereign Sentinel"
          : "External Delegated Strategy";

      return {
        hasAuthority: auth.isActive && !isLocalRevoked,
        strategyName,
        agentAddress: auth.agent.toBase58(),
        ownerAddress: auth.owner.toBase58(),
        assetMint: auth.assetMint.toBase58(),
        assetSymbol: sym,
        allowedActions: auth.allowedActions,
        maxBorrowLimit: maxBorrow,
        maxWithdrawLimit: auth.maxWithdrawLimitUi,
        currentBorrowed,
        availableBorrow,
        riskBudget,
        initialRiskBudget: auth.initialRiskBudgetUi,
        expiryTs: auth.expiryTs,
        isExpired,
        nonce: auth.nonce,
        status: isRevoked ? "REVOKED" : isExpired ? "EXPIRED" : auth.status,
        effectiveAuthority,
      };
    },
    [onChainAuthorities, revokedAssets, portfolioState, riskState, publicKey]
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

  const evaluateDecision = useCallback(
    (
      action: ProtocolAction = "borrow",
      amountUsd: number = 0,
      symbolOrMint?: string,
      modeOverride?: ControlMode
    ): DecisionSnapshot => {
      const sym = normalizeAssetId(symbolOrMint || activeMarketKey);
      const canonicalAsset = AssetRegistry.get(sym);
      const mkt = DEPLOYED_MARKETS.find(
        (m) => m.symbol.toUpperCase() === sym || m.mint === canonicalAsset?.tokenMint
      );
      const pos =
        portfolioState.positions.find(
          (p) => p.symbol.toUpperCase() === sym || p.mint === canonicalAsset?.tokenMint
        ) ||
        portfolioSnap?.positions.find(
          (p) => p.symbol.toUpperCase() === sym || p.mint === canonicalAsset?.tokenMint
        );
      const collatUsd = pos?.collateralValueUsd ?? 0;
      const debtUsd = pos?.debtUi ?? 0;

      const effectiveMode = modeOverride ?? controlMode;
      const isAgent = effectiveMode === "AUTONOMOUS";
      const agentAuth = isAgent ? getAgentAuthorityForAsset(sym) : null;

      const assetOracle = OracleService.getState(sym);
      const assetRisk = getRiskForAsset(sym);

      const oraclePrice =
        assetOracle.priceUsd > 0
          ? assetOracle.priceUsd
          : (pos?.priceUsd ?? 0);
      const oracleExpo = assetOracle.exponent ?? -8;
      const oracleConf = assetOracle.confUsd ?? 0;
      const oracleConfBps = assetOracle.confBps ?? (pos ? pos.confBps : 0);
      const oraclePublishTime = assetOracle.publishTime ?? (pos?.publishTime ?? 0);

      const lastValidPrice =
        assetOracle.lastValidPrice ??
        (pos?.priceUsd && pos.priceUsd > 0 ? pos.priceUsd : (oraclePrice > 0 ? oraclePrice : null));
      const lastValidPublishTime =
        assetOracle.lastValidPublishTime ??
        (pos?.publishTime && pos.publishTime > 0 ? pos.publishTime : (oraclePublishTime > 0 ? oraclePublishTime : null));

      const referenceMarketState =
        (mkt as any)?.referenceMarketState ?? (assetRisk.isMarketOpen ? "OPEN" : "CLOSED");
      const onchainMarketState = (mkt as any)?.onchainMarketState ?? "OPEN";
      const oracleState = assetOracle.oracleState;

      const oracleHealthy = assetOracle.healthy && assetOracle.freshness !== "UNAVAILABLE";

      return evaluateAction(
        isAgent
          ? {
              mode: "AGENT",
              agentPubkey:
                agentAuth?.agentAddress || CIRCUIT_DEVNET_AGENT_KEY.toBase58(),
            }
          : { mode: "MANUAL" },
        action,
        amountUsd,
        {
          slot: currentSlot,
          blockTime: null,
          protocolPaused: protocolState.isFrozen,
          assetEnabled: true,
          assetMint: canonicalAsset?.tokenMint ?? mkt?.mint ?? pos?.mint ?? "",
          assetSymbol: sym,
          oraclePrice,
          oracleExpo,
          oracleConf,
          oracleConfBps,
          oraclePublishTime,
          maxOracleAge: canonicalAsset?.riskConfig.maxOracleAge ?? 600,
          globalOracleHealthy: oracleHealthy,
          isMarketOpen: assetRisk.isMarketOpen,
          referenceMarketState,
          onchainMarketState,
          oracleState,
          lastValidPrice,
          lastValidPublishTime,
          ratchetState: assetRisk.ratchetState,
          baseLtvBps: canonicalAsset?.riskConfig.baseLtvBps ?? (portfolioState.weightedBaseLtvBps || 7000),
          collateralUsd: collatUsd,
          debtUsd: debtUsd,
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
        }
      );
    },
    [
      controlMode,
      activeMarketKey,
      portfolioState,
      protocolState,
      marketState,
      currentSlot,
      getAgentAuthorityForAsset,
      getRiskForAsset,
    ]
  );

  const decision = useMemo(
    () => evaluateDecision("borrow", 0, activeMarketKey),
    [evaluateDecision, activeMarketKey]
  );

  const evaluatePermissionForAction = useCallback(
    (action: ProtocolAction, amountUsd: number = 0, symbolOrMint?: string): PermissionResult => {
      const snap = evaluateDecision(action, amountUsd, symbolOrMint);
      return {
        allowed: snap.permission.allowed,
        reasonCode: snap.permission.reasonCode,
        message: snap.permission.message,
        effectiveLtvBps: Math.round(snap.capitalPolicy.maxLtv * 10_000),
        borrowCapacityUsd: snap.capitalPolicy.maxBorrow,
        healthFactorBps: snap.position.health !== null ? Math.round(snap.position.health * 10_000) : null,
        riskState: snap.risk.state,
        actionCostUsd: 0,
        remainingRiskBudgetUsd: snap.authority.limits?.riskBudget ?? 0,
        policyVersion: CANONICAL_POLICY_VERSION,
        evaluatedAt: snap.freshness.evaluatedAt,
        venue: "CIRCUIT_LENDING",
      };
    },
    [evaluateDecision]
  );

  const value: DomainContextValue = {
    decision,
    evaluateDecision,
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
    getRiskForAsset,
    getPermissionsForAsset,
    getOracleForAsset,
    getPositionForAsset,
    riskByAssetId,
    permissionsByAssetId,
    oracleByAssetId,
    positionsByAssetId,
    onChainAuthorities,
    hasActiveAuthority,
    authoritiesLoading,
    isAuthoritySetupOpen,
    openAuthoritySetup,
    closeAuthoritySetup,
    refreshAuthorities: fetchAuthorities,
    revokeAuthorityOnChain,
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
