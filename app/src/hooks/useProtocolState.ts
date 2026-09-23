import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import {
  EQUITY_MINT,
  POLL_INTERVAL_MS,
  PYTH_FEED_ID,
  QUOTE_MINT,
} from "../config";
import { DeployedMarket } from "../data/markets";
import { useMarket } from "../context/MarketContext";
import {
  DEFAULT_FEED_ID,
  OracleSnapshot,
  PYTH_PRICE_ACCOUNT,
  decodeOracleInfo,
  derivePriceAccount,
  fetchOracle,
} from "../lib/pyth";
import {
  AssetConfigView,
  MarketGuardView,
  PositionView,
  ProtocolConfigView,
  assetConfigPda,
  collateralValue,
  decodeAssetConfigView,
  decodeMarketGuardView,
  decodePositionView,
  decodeProtocolConfigView,
  decodeTokenAmount,
  healthFactorBps,
  marketGuardPda,
  maxBorrow,
  positionPda,
  protocolConfigPda,
  readOnlyProgram,
  vaultFor,
} from "../lib/protocol";

/**
 * Derived risk view, computed with the same rounding as the on-chain math so
 * the UI cannot promise something the program will reject.
 */
export interface RiskView {
  /** Collateral value in quote native units, at the live oracle price. */
  collateralValueNative: bigint;
  capacityNative: bigint;
  availableToBorrowNative: bigint;
  /** null means no debt (infinite health). */
  healthFactorBps: number | null;
  /** True when every on-chain gate the program checks is currently satisfied. */
  borrowAllowed: boolean;
  blockers: string[];
}

export interface ProtocolState {
  loading: boolean;
  error: string | null;
  slot: number | null;
  chainUnixTime: number | null;

  protocol: ProtocolConfigView | null;
  asset: AssetConfigView | null;
  guard: MarketGuardView | null;
  position: PositionView | null;
  oracle: OracleSnapshot | null;
  market: DeployedMarket | null;

  walletEquity: bigint;
  walletQuote: bigint;
  vaultLiquidity: bigint;
  vaultCollateral: bigint;

  risk: RiskView | null;
  /** Reference-market session derived from the cluster clock. Display only. */
  session: SessionHint | null;
  /** True when the connected wallet is the protocol authority. */
  isAuthority: boolean;
  refresh: () => void;
}

const EMPTY_RISK: RiskView = {
  collateralValueNative: 0n,
  capacityNative: 0n,
  availableToBorrowNative: 0n,
  healthFactorBps: null,
  borrowAllowed: false,
  blockers: [],
};

export interface SessionHint {
  open: boolean;
  label: string;
}

/**
 * Client-side mirror of `is_market_open` for display only.
 *
 * The authoritative check lives on-chain in market/session.rs. This exists so
 * the UI can explain *why* an action will be refused before the user pays for a
 * transaction; it is never treated as permission.
 */
export function nyseSessionHint(unixSeconds: number): SessionHint {
  const d = new Date(unixSeconds * 1000);
  // Convert to US Eastern using the runtime's tz database.
  const et = new Date(
    d.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const dow = et.getDay(); // 0 = Sunday
  const minutes = et.getHours() * 60 + et.getMinutes();
  const open = 9 * 60 + 30;
  const close = 16 * 60;

  if (dow === 0 || dow === 6) return { open: false, label: "Weekend" };
  if (minutes < open) return { open: false, label: "Pre-market" };
  if (minutes >= close) return { open: false, label: "After close" };
  return { open: true, label: "Regular session" };
}

type FetchedProtocolState = Omit<ProtocolState, "refresh" | "risk" | "session" | "isAuthority">;
const marketStateCache = new Map<string, FetchedProtocolState>();

export function useProtocolState(overrideMarket?: DeployedMarket): ProtocolState {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const marketCtx = useMarket();
  const activeMarket = overrideMarket ?? marketCtx?.selectedMarket ?? null;

  // `risk`, `session` and `isAuthority` are derived below rather than stored,
  // so they are excluded from the fetched-state shape.
  const [state, setState] = useState<
    Omit<ProtocolState, "refresh" | "risk" | "session" | "isAuthority">
  >({
    loading: true,
    error: null,
    slot: null,
    chainUnixTime: null,
    protocol: null,
    asset: null,
    guard: null,
    position: null,
    oracle: null,
    market: activeMarket,
    walletEquity: 0n,
    walletQuote: 0n,
    vaultLiquidity: 0n,
    vaultCollateral: 0n,
  });

  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const inFlight = useRef(false);
  const marketKey = activeMarket ? `${activeMarket.symbol}-${activeMarket.quoteSymbol}` : "default";

  useEffect(() => {
    let cancelled = false;

    // Fast-path: If we already have fresh state cached for this market, serve it immediately with 0ms delay.
    const cached = marketStateCache.get(marketKey);
    if (cached) {
      setState(cached);
    } else {
      setState((s) => ({ ...s, loading: true, market: activeMarket }));
    }

    async function load(conn: Connection) {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        const program = readOnlyProgram(conn);

        // Fetch cluster clock in parallel with account queries; resilient to rate limits
        const slotPromise = conn
          .getSlot()
          .then(async (slot) => {
            const blockTime = await conn.getBlockTime(slot).catch(() => null);
            return {
              slot,
              chainUnixTime: blockTime ?? Math.floor(Date.now() / 1000),
            };
          })
          .catch(() => ({
            slot: null,
            chainUnixTime: Math.floor(Date.now() / 1000),
          }));

        const equityMint = activeMarket
          ? new PublicKey(activeMarket.mint)
          : EQUITY_MINT;
        const quoteMint = activeMarket
          ? new PublicKey(activeMarket.quoteMint)
          : QUOTE_MINT;
        const feedId = activeMarket?.feedId ?? PYTH_FEED_ID;
        const collateralVault = activeMarket
          ? new PublicKey(activeMarket.collateralVault)
          : (equityMint ? vaultFor(equityMint) : null);
        const liquidityVault = activeMarket
          ? new PublicKey(activeMarket.liquidityVault)
          : (quoteMint ? vaultFor(quoteMint) : null);

        const oraclePubkey =
          PYTH_PRICE_ACCOUNT && feedId === PYTH_FEED_ID
            ? PYTH_PRICE_ACCOUNT
            : derivePriceAccount(feedId, 0);

        const protocolKey = protocolConfigPda();
        const assetKey = equityMint ? assetConfigPda(equityMint) : null;
        const guardKey = equityMint ? marketGuardPda(feedId) : null;
        const positionKey =
          publicKey && equityMint ? positionPda(publicKey, equityMint) : null;
        const userCollateralKey =
          publicKey && equityMint
            ? getAssociatedTokenAddressSync(equityMint, publicKey)
            : null;
        const userQuoteKey =
          publicKey && quoteMint
            ? getAssociatedTokenAddressSync(quoteMint, publicKey)
            : null;

        // Assembly of all on-chain keys into a single batched array
        const keyList: (PublicKey | null)[] = [
          protocolKey,       // 0
          oraclePubkey,      // 1
          assetKey,          // 2
          guardKey,          // 3
          collateralVault,   // 4
          liquidityVault,    // 5
          positionKey,       // 6
          userCollateralKey, // 7
          userQuoteKey,      // 8
        ];

        const queryKeys: PublicKey[] = [];
        const indexMap: number[] = [];
        keyList.forEach((k, idx) => {
          if (k) {
            queryKeys.push(k);
            indexMap.push(idx);
          }
        });

        // Execute clock check and account batch query in parallel (only 2 RPC calls total)
        const [clock, accountInfos] = await Promise.all([
          slotPromise,
          conn.getMultipleAccountsInfo(queryKeys).catch((err) => {
            console.warn("[useProtocolState] getMultipleAccountsInfo batch fetch error:", err);
            return null;
          }),
        ]);

        const { slot, chainUnixTime } = clock;

        if (!accountInfos) {
          // If RPC batch was rate-limited or failed, retain cached state seamlessly
          const cachedState = marketStateCache.get(marketKey);
          if (cachedState) {
            if (cancelled) return;
            setState((s) => ({
              ...cachedState,
              loading: false,
              error: null,
            }));
            return;
          }
          throw new Error("Unable to reach Solana cluster or rate limit exceeded.");
        }

        const rawResults: (any | null)[] = new Array(keyList.length).fill(null);
        indexMap.forEach((origIdx, i) => {
          rawResults[origIdx] = accountInfos[i] ?? null;
        });

        const protocol = decodeProtocolConfigView(program, rawResults[0]);
        let oracle = decodeOracleInfo(oraclePubkey, rawResults[1], chainUnixTime);
        if (!oracle) {
          // Graceful fallback to shard scan / in-memory cache
          oracle = await fetchOracle(conn, chainUnixTime, feedId).catch(() => null);
        }
        const asset = decodeAssetConfigView(program, rawResults[2]);
        const guard = decodeMarketGuardView(program, rawResults[3]);
        const vaultCollateral = decodeTokenAmount(rawResults[4]);
        const vaultLiquidity = decodeTokenAmount(rawResults[5]);
        const position = decodePositionView(program, rawResults[6]);
        const walletEquity = decodeTokenAmount(rawResults[7]);
        const walletQuote = decodeTokenAmount(rawResults[8]);

        if (cancelled) return;
        const nextState = {
          loading: false,
          error: null,
          slot,
          chainUnixTime,
          protocol,
          asset,
          guard,
          position,
          oracle,
          market: activeMarket,
          walletEquity,
          walletQuote,
          vaultLiquidity,
          vaultCollateral,
        };

        // Cache for instant return when switching back
        marketStateCache.set(marketKey, nextState);
        setState(nextState);
      } catch (e: any) {
        if (cancelled) return;
        const errMsg = e?.message ?? String(e);
        const isRateLimit =
          errMsg.includes("429") ||
          errMsg.includes("Connection rate limits exceeded") ||
          errMsg.includes("rate limit");

        const cached = marketStateCache.get(marketKey);
        if (cached) {
          console.warn(
            `[useProtocolState] RPC rate-limited or transient failure, retaining cached state for ${marketKey}`
          );
          setState((s) => ({
            ...cached,
            loading: false,
            error: null,
          }));
          return;
        }

        setState((s) => ({
          ...s,
          loading: false,
          error: isRateLimit
            ? "Solana RPC rate limit reached. Reconnecting automatically..."
            : errMsg,
        }));
      } finally {
        inFlight.current = false;
      }
    }

    load(connection);
    const timer = setInterval(() => load(connection), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    connection,
    publicKey,
    nonce,
    activeMarket?.mint,
    activeMarket?.quoteMint,
    activeMarket?.feedId,
  ]);

  const risk = useMemo<RiskView | null>(() => {
    const { asset, protocol, position, oracle, chainUnixTime, vaultLiquidity } =
      state;
    if (!asset || !protocol || !oracle || chainUnixTime === null) return null;

    const collateral = position?.collateralAmount ?? 0n;
    const debt = position?.debtAmount ?? 0n;

    const value = collateralValue(
      collateral,
      oracle.update.price,
      oracle.update.exponent,
      6,
      6
    );
    const capacity = maxBorrow(value, asset.baseLtvBps);
    const available = capacity > debt ? capacity - debt : 0n;
    const hf = healthFactorBps(value, asset.liquidationThresholdBps, debt);

    // Reproduce every gate borrow() enforces, in the same order, so the UI can
    // explain refusals before the user spends a transaction fee.
    const blockers: string[] = [];
    if (protocol.paused) blockers.push("Protocol is paused");
    if (!asset.enabled) blockers.push("Asset is disabled");
    if (!oracle.update.isFull) blockers.push("Oracle update is only partially verified");
    if (oracle.ageSeconds > asset.maxOracleAge) {
      blockers.push(
        `Oracle is stale (${oracle.ageSeconds}s > ${asset.maxOracleAge}s)`
      );
    }
    if (oracle.confBps > asset.maxConfBps) {
      blockers.push(
        `Oracle confidence too wide (${oracle.confBps} > ${asset.maxConfBps} bps)`
      );
    }
    const session = nyseSessionHint(chainUnixTime);
    if (!session.open) blockers.push(`Reference market closed (${session.label})`);
    if (asset.custodyState === "impaired") blockers.push("Custody impaired");
    if (asset.liquidityState === "thin" || asset.liquidityState === "critical") {
      blockers.push(`Liquidity ${asset.liquidityState}`);
    }
    if (available === 0n) blockers.push("No remaining borrow capacity");
    if (vaultLiquidity === 0n) blockers.push("Protocol vault has no liquidity");

    return {
      collateralValueNative: value,
      capacityNative: capacity,
      availableToBorrowNative: available,
      healthFactorBps: hf,
      borrowAllowed: blockers.length === 0,
      blockers,
    };
  }, [state]);

  const session = useMemo<SessionHint | null>(
    () => (state.chainUnixTime === null ? null : nyseSessionHint(state.chainUnixTime)),
    [state.chainUnixTime]
  );

  const isAuthority = Boolean(
    publicKey && state.protocol && state.protocol.authority.equals(publicKey)
  );

  return {
    ...state,
    risk: risk ?? (state.asset ? EMPTY_RISK : null),
    session,
    isAuthority,
    refresh,
  };
}
