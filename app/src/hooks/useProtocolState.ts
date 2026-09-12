import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import {
  EQUITY_MINT,
  POLL_INTERVAL_MS,
  PYTH_FEED_ID,
  QUOTE_MINT,
} from "../config";
import { OracleSnapshot, fetchOracle } from "../lib/pyth";
import {
  AssetConfigView,
  MarketGuardView,
  PositionView,
  ProtocolConfigView,
  collateralValue,
  fetchAssetConfig,
  fetchMarketGuard,
  fetchPosition,
  fetchProtocolConfig,
  fetchTokenAmount,
  healthFactorBps,
  maxBorrow,
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

export function useProtocolState(): ProtocolState {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

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
    walletEquity: 0n,
    walletQuote: 0n,
    vaultLiquidity: 0n,
    vaultCollateral: 0n,
  });

  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load(conn: Connection) {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const program = readOnlyProgram(conn);

        // Use the cluster's own clock so oracle age matches what the program
        // would compute, rather than the browser's possibly-skewed clock.
        const slot = await conn.getSlot();
        const blockTime = await conn.getBlockTime(slot).catch(() => null);
        const chainUnixTime = blockTime ?? Math.floor(Date.now() / 1000);

        const [protocol, oracle] = await Promise.all([
          fetchProtocolConfig(program, conn),
          fetchOracle(conn, chainUnixTime, PYTH_FEED_ID),
        ]);

        let asset: AssetConfigView | null = null;
        let guard: MarketGuardView | null = null;
        let position: PositionView | null = null;
        let walletEquity = 0n;
        let walletQuote = 0n;
        let vaultLiquidity = 0n;
        let vaultCollateral = 0n;

        if (EQUITY_MINT) {
          asset = await fetchAssetConfig(program, conn, EQUITY_MINT);
          guard = await fetchMarketGuard(program, conn, PYTH_FEED_ID);
          vaultCollateral = await fetchTokenAmount(conn, vaultFor(EQUITY_MINT));
        }
        if (QUOTE_MINT) {
          vaultLiquidity = await fetchTokenAmount(conn, vaultFor(QUOTE_MINT));
        }
        if (publicKey && EQUITY_MINT) {
          position = await fetchPosition(program, conn, publicKey, EQUITY_MINT);
          walletEquity = await fetchTokenAmount(
            conn,
            getAssociatedTokenAddressSync(EQUITY_MINT, publicKey)
          );
        }
        if (publicKey && QUOTE_MINT) {
          walletQuote = await fetchTokenAmount(
            conn,
            getAssociatedTokenAddressSync(QUOTE_MINT, publicKey)
          );
        }

        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          slot,
          chainUnixTime,
          protocol,
          asset,
          guard,
          position,
          oracle,
          walletEquity,
          walletQuote,
          vaultLiquidity,
          vaultCollateral,
        });
      } catch (e: any) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e?.message ?? String(e),
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
  }, [connection, publicKey, nonce]);

  const risk = useMemo<RiskView | null>(() => {
    const { asset, protocol, position, oracle, chainUnixTime, vaultLiquidity } =
      state;
    if (!asset || !protocol || !oracle || chainUnixTime === null) return null;

    const collateral = position?.collateralAmount ?? 0n;
    const debt = position?.debtAmount ?? 0n;

    const value = collateralValue(
      collateral,
      oracle.update.price,
      oracle.update.exponent
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
