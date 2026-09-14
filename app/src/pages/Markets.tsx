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
import { useMarketDataService } from "../lib/market-data/stream";
import { MarketSnapshot } from "../lib/market-data/types";
import { CANONICAL_ASSET_REGISTRY } from "../lib/market-data/registry";

type FilterTab = "all" | "live" | "gainers" | "losers" | "collateral" | "recent" | "soon";
type SortOption = "default" | "gainers" | "losers" | "price_high" | "price_low" | "ltv";

export default function Markets() {
  const s = useProtocolState();
  const { selectedMarket, selectMarket } = useMarket();
  const { snapshots, loading, isStreamHealthy } = useMarketDataService();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("default");
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
    return CANONICAL_ASSET_REGISTRY.map((asset) => {
      const snap = snapshots[asset.symbol];
      const isCurrent = s.market?.mint === asset.mint;
      const priceUsd = snap?.priceUsd ?? (isCurrent && s.oracle?.priceUsd ? s.oracle.priceUsd : asset.initialPriceUsd);

      return {
        symbol: asset.tokenSymbol,
        name: asset.name,
        logo: asset.logoSvg,
        live: asset.collateralSupported,
        priceUsd,
        previousPriceUsd: snap?.previousPriceUsd,
        priceDirection: snap?.priceDirection,
        change24hPercent: snap?.change24hPercent ?? asset.initial24hPercent,
        changeStatus: "AVAILABLE",
        confBps: snap?.oracleConfBps ?? 18,
        freshness: snap?.oracleStatus ?? "LIVE",
        underlyingSession: snap?.underlyingSession ?? "CLOSED",
        onchainAvailability: snap?.onchainAvailability ?? (asset.collateralSupported ? "TRADEABLE" : "UNAVAILABLE"),
        collateralStatus: snap?.collateralStatus ?? (asset.collateralSupported ? "AVAILABLE" : "COMING_SOON"),
        sparkline: snap?.sparkline,
        ltvBps: asset.baseLtvBps,
        quoteSymbol: asset.quoteSymbol,
        marketSymbol: asset.symbol,
        mint: asset.mint,
        pythFeedId: asset.oracleFeedId,
      };
    });
  }, [snapshots, s.market, s.oracle]);

  // Derived counts for the terminal summary bar
  const summaryCounts = useMemo(() => {
    const total = rows.length;
    const live = rows.filter((r) => r.live).length;
    const recent = rows.filter((r) => r.freshness === "RECENT").length;
    const soon = rows.filter((r) => !r.live).length;
    return { total, live, recent, soon };
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
    const quoteParam = row.quoteSymbol === "WSOL" ? "&quote=WSOL" : "";
    navigate(`/app/borrow?market=${row.marketSymbol || row.symbol}${quoteParam}`);
  };

  return (
    <PageContainer
      title="Markets Terminal"
      subtitle="Institutional real-time credit markets for tokenized equities on Solana Devnet. Continuous 24/7 onchain price observability, verified Pyth oracle feeds, and real historical 24h performance."
      action={
        <div className="row g-8" style={{ alignItems: "center" }}>
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
              const quoteParam = featuredSnapshot.quoteSymbol === "WSOL" ? "&quote=WSOL" : "";
              navigate(`/app/borrow?market=${featuredSnapshot.symbol}${quoteParam}`);
            }}
            onDeposit={() => {
              navigate(`/app/position?market=${featuredSnapshot.symbol}`);
            }}
          />
        )}

        {/* 3. Terminal Summary Stats Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            padding: "12px 16px",
            background: "var(--surface-1, #0c0e14)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
          }}
        >
          <div>
            <div style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Total Equities
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
              {summaryCounts.total} ASSETS
            </div>
          </div>

          <div>
            <div style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Collateral Deployed
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--mint, #7fc39a)" }}>
              {summaryCounts.live} MARKETS
            </div>
          </div>

          <div>
            <div style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Recent Updates
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)" }}>
              {summaryCounts.recent} ACTIVE
            </div>
          </div>

          <div>
            <div style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Discovery Pipeline
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-2)" }}>
              {summaryCounts.soon} EQUITIES
            </div>
          </div>
        </div>

        {/* 4. Controls Toolbar: Search, Filters, Sorting */}
        <div className="row between g-12 wrap" style={{ alignItems: "center" }}>
          {/* Search */}
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <div style={{ position: "relative" }}>
              <input
                id="market-search"
                className="input input--text"
                type="search"
                placeholder="Search ticker, company, quote (e.g. NVDA, AAPL, SOL, USDC)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: "100%", paddingLeft: 32 }}
              />
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-3)",
                  pointerEvents: "none",
                }}
              >
                <Icon name="search" size={14} />
              </span>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="row g-6 wrap" style={{ flex: "2 1 auto" }}>
            {(
              [
                { key: "all", label: `All (${summaryCounts.total})` },
                { key: "live", label: `Live (${summaryCounts.live})` },
                { key: "gainers", label: "24h Gainers" },
                { key: "losers", label: "24h Losers" },
                { key: "collateral", label: "Collateral" },
                { key: "soon", label: "Coming Soon" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                className="btn btn--sm"
                onClick={() => setFilter(t.key)}
                style={{
                  background: filter === t.key ? "var(--surface-3, #1e222d)" : "transparent",
                  borderColor: filter === t.key ? "var(--accent)" : "var(--border)",
                  color: filter === t.key ? "var(--text)" : "var(--text-2)",
                  fontSize: 12,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Sorting Dropdown */}
          <div style={{ flex: "0 0 auto" }}>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              style={{
                background: "var(--surface-2, #12151d)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
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

        {/* 5. Adaptive Market Card Grid */}
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

        {processedRows.length === 0 && (
          <Card>
            <p className="t-sm muted center" style={{ padding: "20px 0" }}>
              No markets match your search filter "{query}".
            </p>
          </Card>
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
