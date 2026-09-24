import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice } from "../components/layout/Guards";
import { Card, Icon, Pill } from "../components/ui";
import { MarketCard, MarketRow } from "../components/market/MarketParts";
import { MarketTickerBar } from "../components/market/MarketTickerBar";
import { MarketHeroPanel } from "../components/market/MarketHeroPanel";
import { MarketDetailDrawer } from "../components/drawers/MarketDetailDrawer";
import { useProtocolState } from "../hooks/useProtocolState";
import { useMarket } from "../context/MarketContext";
import { useAction } from "../context/ActionContext";
import { useMarketData } from "../context/MarketDataContext";
import { getDeployedMarket } from "../data/markets";
import { MarketSnapshot, MarketSecurityState } from "../lib/market-data/types";
import { CANONICAL_ASSET_REGISTRY } from "../lib/market-data/registry";
import { getDetailedMarketSession, classifyOracleStatus } from "../lib/market-data/stream";
import { AssetLogo } from "../components/brand/AssetLogo";
import { DbcPoolStatusPill } from "../components/dbc/DbcPoolStatusPill";
import { getRegisteredDbcSymbols } from "../lib/meteora/registry";
import { MarketConditionRow } from "../components/kit4/MarketConditionRow";

type FilterTab = "all" | "live" | "gainers" | "losers" | "collateral" | "recent" | "soon" | "dbc";
type SortOption = "default" | "gainers" | "losers" | "price_high" | "price_low" | "ltv";

export default function Markets() {
  const s = useProtocolState();
  const { selectedMarket, selectMarket } = useMarket();
  const { openAction } = useAction();
  const { snapshots, loading, isStreamHealthy } = useMarketData();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [viewMode, setViewMode] = useState<"conditions" | "grid">("conditions");
  const [query, setQuery] = useState("");
  const [activeDrawerSnapshot, setActiveDrawerSnapshot] = useState<MarketSnapshot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [featuredSymbol, setFeaturedSymbol] = useState<string>("NVDA");

  // Determine active featured snapshot
  const featuredSnapshot = useMemo<MarketSnapshot | null>(() => {
    if (snapshots[featuredSymbol]) return snapshots[featuredSymbol];
    if (snapshots[selectedMarket.symbol]) return snapshots[selectedMarket.symbol];
    const first = Object.values(snapshots)[0];
    return first ?? null;
  }, [snapshots, featuredSymbol, selectedMarket.symbol]);

  // Convert snapshots to rows for rendering and sorting
  const rows = useMemo<MarketRow[]>(() => {
    const currentSession = getDetailedMarketSession(Math.floor(Date.now() / 1000));
    return CANONICAL_ASSET_REGISTRY.map((asset) => {
      const snap = snapshots[asset.symbol];
      const isCurrent = s.market?.mint === asset.mint;
      const priceUsd = snap?.priceUsd ?? (isCurrent && s.oracle?.priceUsd ? s.oracle.priceUsd : asset.initialPriceUsd);

      const securityState: MarketSecurityState =
        snap?.securityState ?? (currentSession.isOpen ? "UNKNOWN" : "RESTRICTED");
      const haltState =
        securityState === "HALTED_INFERRED"
          ? "halted_inferred"
          : securityState === "RESTRICTED"
          ? "closed"
          : "open_normal";

      return {
        symbol: asset.tokenSymbol,
        name: asset.name,
        logo: <AssetLogo symbol={asset.symbol} size={22} />,
        live: asset.collateralSupported,
        priceUsd,
        previousPriceUsd: snap?.previousPriceUsd,
        priceDirection: snap?.priceDirection,
        change24hPercent: snap?.changeStatus === "AVAILABLE" ? (snap.change24hPercent ?? null) : null,
        changeStatus: snap?.changeStatus ?? "UNAVAILABLE",
        confBps: snap?.oracleConfBps ?? (isCurrent && s.oracle?.confBps ? s.oracle.confBps : 0),
        freshness: snap?.oracleStatus ?? (isCurrent && s.oracle ? classifyOracleStatus(s.oracle.ageSeconds, true) : "UNAVAILABLE"),
        underlyingSession: snap?.underlyingSession ?? currentSession.session,
        onchainAvailability: snap?.onchainAvailability ?? (asset.collateralSupported ? "TRADEABLE" : "UNAVAILABLE"),
        collateralStatus: snap?.collateralStatus ?? (asset.collateralSupported ? "AVAILABLE" : "COMING_SOON"),
        securityState,
        haltReason: snap?.haltReason,
        sparkline: snap?.sparkline,
        candles: snap?.candles,
        referencePrice24h: snap?.referencePrice24h,
        ltvBps: asset.baseLtvBps,
        quoteSymbol: asset.quoteSymbol,
        marketSymbol: asset.symbol,
        mint: asset.mint,
        pythFeedId: asset.oracleFeedId,
        haltState,
        referenceMarketState: snap?.referenceMarketState ?? (currentSession.isOpen ? "OPEN" : "CLOSED"),
        onchainMarketState: snap?.onchainMarketState ?? (asset.collateralSupported ? "OPEN" : "CLOSED"),
        oracleState: snap?.oracleState,
        circuitRiskState: snap?.circuitRiskState,
        oracleAgeSeconds: snap?.oracleAgeSeconds,
      };
    });
  }, [snapshots, s.market, s.oracle]);

  // Derived counts for the terminal summary bar
  const summaryCounts = useMemo(() => {
    const total = rows.length;
    const live = rows.filter((r) => r.live).length;
    const recent = rows.filter((r) => r.freshness === "RECENT").length;
    const soon = rows.filter((r) => !r.live).length;
    const dbc = rows.filter((r) => getRegisteredDbcSymbols().includes(r.marketSymbol || r.symbol)).length;
    return { total, live, recent, soon, dbc };
  }, [rows]);

  // Filter and Sort
  const processedRows = useMemo(() => {
    let list = [...rows];
    const q = query.trim().toLowerCase();

    // 1. Search query
    if (q) {
      list = list.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.quoteSymbol && r.quoteSymbol.toLowerCase().includes(q)) ||
          (r.marketSymbol && r.marketSymbol.toLowerCase().includes(q))
      );
    }

    // 2. Tab Filter
    if (filter === "live") list = list.filter((r) => r.live);
    else if (filter === "collateral") list = list.filter((r) => r.live);
    else if (filter === "gainers") list = list.filter((r) => (r.change24hPercent ?? 0) > 0);
    else if (filter === "losers") list = list.filter((r) => (r.change24hPercent ?? 0) < 0);
    else if (filter === "recent") list = list.filter((r) => r.freshness === "RECENT");
    else if (filter === "soon") list = list.filter((r) => !r.live);
    else if (filter === "dbc") list = list.filter((r) => getRegisteredDbcSymbols().includes(r.marketSymbol || r.symbol));

    // 3. Sort
    if (sortOption === "gainers") {
      list.sort((a, b) => (b.change24hPercent ?? 0) - (a.change24hPercent ?? 0));
    } else if (sortOption === "losers") {
      list.sort((a, b) => (a.change24hPercent ?? 0) - (b.change24hPercent ?? 0));
    } else if (sortOption === "price_high") {
      list.sort((a, b) => (b.priceUsd ?? 0) - (a.priceUsd ?? 0));
    } else if (sortOption === "price_low") {
      list.sort((a, b) => (a.priceUsd ?? 0) - (b.priceUsd ?? 0));
    } else if (sortOption === "ltv") {
      list.sort((a, b) => (b.ltvBps ?? 0) - (a.ltvBps ?? 0));
    }

    return list;
  }, [rows, query, filter, sortOption]);

  const handleOpenDetail = (row: MarketRow) => {
    const snap = snapshots[row.marketSymbol || row.symbol] || null;
    setActiveDrawerSnapshot(snap);
    setDrawerOpen(true);
  };

  const handlePickMarket = (row: MarketRow) => {
    selectMarket(row.marketSymbol || row.symbol, row.quoteSymbol);
    const target = getDeployedMarket(row.marketSymbol || row.symbol, row.quoteSymbol);
    if (target) {
      openAction({ type: "borrow", market: target });
    } else {
      const quoteParam = row.quoteSymbol === "WSOL" ? "&quote=WSOL" : "";
      navigate(`/app/borrow?market=${row.marketSymbol || row.symbol}${quoteParam}`);
    }
  };

  return (
    <PageContainer
      title="Markets Terminal"
      subtitle="Real-time credit markets for tokenized equities on Solana Devnet. Continuous 24/7 onchain price observability, verified Pyth oracle feeds, and real historical 24h performance."
      action={
        <div className="row g-8" style={{ alignItems: "center" }}>
          <DbcPoolStatusPill />
          <Pill tone={isStreamHealthy ? "success" : "warning"} withDot>
            {isStreamHealthy ? "STREAM HEALTHY" : "STREAM RECONNECTING"}
          </Pill>
          <Pill tone="neutral">
            DEVNET
          </Pill>
        </div>
      }
    >
      <ConfigNotice />

      <div className="stack g-20">
        {/* 1. Live Market Ticker Bar */}
        <MarketTickerBar
          snapshots={snapshots}
          selectedSymbol={featuredSymbol}
          onSelectSymbol={(sym) => setFeaturedSymbol(sym)}
        />

        {/* 2. Featured Market Hero Panel */}
        {featuredSnapshot && (
          <MarketHeroPanel
            snapshot={featuredSnapshot}
            onOpenDetail={() => {
              setActiveDrawerSnapshot(featuredSnapshot);
              setDrawerOpen(true);
            }}
            onBorrow={() => {
              selectMarket(featuredSnapshot.symbol, featuredSnapshot.quoteSymbol);
              const target = getDeployedMarket(featuredSnapshot.symbol, featuredSnapshot.quoteSymbol);
              if (target) {
                openAction({ type: "borrow", market: target });
              } else {
                const quoteParam = featuredSnapshot.quoteSymbol === "WSOL" ? "&quote=WSOL" : "";
                navigate(`/app/borrow?market=${featuredSnapshot.symbol}${quoteParam}`);
              }
            }}
            onDeposit={() => {
              const target = getDeployedMarket(featuredSnapshot.symbol, featuredSnapshot.quoteSymbol);
              if (target) {
                openAction({ type: "deposit", market: target });
              } else {
                navigate(`/app/position?market=${featuredSnapshot.symbol}`);
              }
            }}
          />
        )}

        {/* 3. Kit 4 Terminal Summary Stats Bar */}
        <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div className="stat">
            <span className="meta">(Assets) <b>Total Equities</b></span>
            <b style={{ display: "block", fontSize: 18, marginTop: 4 }}>{summaryCounts.total} ASSETS</b>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>Canonical registry</span>
          </div>

          <div className="stat">
            <span className="meta">(Collateral) <b>Deployed Markets</b></span>
            <b style={{ display: "block", fontSize: 18, marginTop: 4, color: "var(--ok)" }}>
              {summaryCounts.live} MARKETS
            </b>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>Active loan facility</span>
          </div>

          <div className="stat">
            <span className="meta">(Oracles) <b>Recent Feeds</b></span>
            <b style={{ display: "block", fontSize: 18, marginTop: 4 }}>{summaryCounts.recent} ACTIVE</b>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>Pyth real-time stream</span>
          </div>

          <div className="stat">
            <span className="meta">(Liquidity) <b>Meteora DBC</b></span>
            <b style={{ display: "block", fontSize: 18, marginTop: 4, color: "var(--note)" }}>
              {summaryCounts.dbc} POOLS
            </b>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>Dynamic curves</span>
          </div>
        </div>

        {/* 4. Controls Toolbar: Search, Filters, Sorting, View Toggle */}
        <div className="card" style={{ padding: "16px 20px" }}>
          <div className="row between g-14 wrap" style={{ alignItems: "center" }}>
            {/* Search */}
            <div style={{ flex: "1 1 280px", minWidth: 220 }}>
              <div style={{ position: "relative" }}>
                <input
                  id="market-search"
                  className="input input--text"
                  type="search"
                  placeholder="Search ticker, company, quote (e.g. NVDA, AAPL, SOL, USDC)..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ width: "100%", paddingLeft: 32, fontFamily: "var(--mono)", fontSize: 12.5 }}
                />
                <span
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--dim)",
                    pointerEvents: "none",
                  }}
                >
                  <Icon name="search" size={14} />
                </span>
              </div>
            </div>

            {/* View Mode Toggle and Sorting */}
            <div className="row g-10" style={{ alignItems: "center" }}>
              <div className="seg" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={viewMode === "conditions" ? "active" : ""}
                  onClick={() => setViewMode("conditions")}
                >
                  Conditions
                </button>
                <button
                  type="button"
                  className={viewMode === "grid" ? "active" : ""}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </button>
              </div>

              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                style={{
                  background: "var(--bg)",
                  color: "var(--ink)",
                  border: "1px solid var(--line2)",
                  borderRadius: 4,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                }}
              >
                <option value="default">Sort: Default Order</option>
                <option value="gainers">Sort: Top 24h %</option>
                <option value="losers">Sort: Worst 24h %</option>
                <option value="price_high">Sort: Price (High to Low)</option>
                <option value="price_low">Sort: Price (Low to High)</option>
                <option value="ltv">Sort: Highest LTV</option>
              </select>
            </div>
          </div>

          {/* Filter Tabs Strip */}
          <div className="row g-8 wrap" style={{ marginTop: 14, borderTop: "1px dashed var(--line)", paddingTop: 12 }}>
            {(
              [
                { key: "all", label: `All (${summaryCounts.total})` },
                { key: "live", label: `Live (${summaryCounts.live})` },
                { key: "dbc", label: `Meteora DBC (${summaryCounts.dbc})` },
                { key: "gainers", label: "24h Gainers" },
                { key: "losers", label: "24h Losers" },
                { key: "collateral", label: "Collateral" },
                { key: "soon", label: "Coming Soon" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                className={`pill sm ${filter === t.key ? "active" : ""}`}
                onClick={() => setFilter(t.key)}
                style={{
                  background: filter === t.key ? "var(--ink)" : "transparent",
                  color: filter === t.key ? "var(--bg)" : "var(--mute)",
                  borderColor: filter === t.key ? "var(--ink)" : "var(--line2)",
                  fontSize: 11.5,
                  fontWeight: filter === t.key ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Main Content: Kit 4 Condition Rows or Card Grid */}
        {viewMode === "conditions" ? (
          <div className="card mc" style={{ padding: "20px 22px" }} data-note="Market conditions">
            <div className="mc-h">
              <span className="meta">(Circuit)<b>Market conditions & telemetry</b></span>
              <span className="tag ok">CONTINUOUS OBSERVABILITY</span>
            </div>
            {processedRows.map((row) => (
              <MarketConditionRow
                key={`${row.symbol}-${row.quoteSymbol}`}
                row={row}
                onSelect={() => handleOpenDetail(row)}
                onActionClick={(act, r) => {
                  if (act === "borrow") handlePickMarket(r);
                  else handleOpenDetail(r);
                }}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
              gap: 16,
            }}
          >
            {processedRows.map((row) => (
              <MarketCard
                key={`${row.symbol}-${row.quoteSymbol}`}
                row={row}
                oracle={s.market?.mint === row.mint ? s.oracle : null}
                asset={s.market?.mint === row.mint ? s.asset : null}
                session={s.session}
                loading={loading && !row.priceUsd}
                onSelect={() => handlePickMarket(row)}
                onOpenDetail={() => handleOpenDetail(row)}
              />
            ))}
          </div>
        )}

        {processedRows.length === 0 && (
          <div className="card" style={{ padding: "32px 20px", textAlign: "center" }}>
            <p className="t-sm muted" style={{ margin: 0, fontFamily: "var(--mono)" }}>
              No markets match your search filter "{query}".
            </p>
          </div>
        )}
      </div>

      {/* 6. Contextual Market Detail Slide-Out Drawer */}
      <MarketDetailDrawer
        snapshot={activeDrawerSnapshot}
        market={activeDrawerSnapshot ? undefined : null}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setActiveDrawerSnapshot(null);
        }}
      />
    </PageContainer>
  );
}
