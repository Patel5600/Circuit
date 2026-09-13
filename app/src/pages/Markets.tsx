import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice } from "../components/layout/Guards";
import { Card, DataRow, Icon, Notice, Pill, Segmented } from "../components/ui";
import { MarketCard, MarketRow } from "../components/market/MarketParts";
import { useProtocolState } from "../hooks/useProtocolState";
import { DEPLOYED_MARKETS, MARKETS_DATA, MarketMetadata } from "../data/markets";
import { useMarket } from "../context/MarketContext";
import { formatAge, formatMoney, formatPercent } from "../lib/format";

type Filter = "all" | "live" | "sol" | "soon";

export default function Markets() {
  const s = useProtocolState();
  const { selectedMarket, selectMarket } = useMarket();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Index metadata by symbol for fast icon and branding lookups
  const metaMap = useMemo(() => {
    const map = new Map<string, MarketMetadata>();
    for (const m of MARKETS_DATA) {
      map.set(m.symbol, m);
    }
    return map;
  }, []);

  /**
   * Build the complete rows: all 12 deployed markets are LIVE on Devnet,
   * followed by pipeline discovery equities ("Coming Soon").
   */
  const rows = useMemo<MarketRow[]>(() => {
    const out: MarketRow[] = [];
    const seenSymbols = new Set<string>();

    // 1. All 12 deployed on-chain markets
    for (const m of DEPLOYED_MARKETS) {
      const meta = metaMap.get(m.symbol);
      const isCurrent = s.market?.mint === m.mint;
      seenSymbols.add(m.symbol);

      out.push({
        symbol: m.tokenSymbol,
        name: m.name,
        logo: meta?.logoSvg,
        live: true,
        priceUsd: isCurrent && s.oracle?.priceUsd ? s.oracle.priceUsd : (meta?.price ?? null),
        ltvBps: m.baseLtvBps,
        quoteSymbol: m.quoteSymbol,
        marketSymbol: m.symbol,
        mint: m.mint,
      });
    }

    // 2. Unregistered catalogue items (pipeline only)
    for (const m of MARKETS_DATA) {
      if (seenSymbols.has(m.symbol)) continue;
      out.push({
        symbol: m.tokenSymbol,
        name: m.displayName,
        logo: m.logoSvg,
        live: false,
        priceUsd: null,
        ltvBps: null,
        quoteSymbol: m.quoteSymbol ?? "USDC",
        marketSymbol: m.symbol,
        mint: m.mint,
      });
    }

    return out;
  }, [s.market, s.oracle, metaMap]);

  const liveCount = rows.filter((r) => r.live).length;
  const solCount = rows.filter((r) => r.quoteSymbol === "WSOL").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "live" && !r.live) return false;
      if (filter === "soon" && r.live) return false;
      if (filter === "sol" && r.quoteSymbol !== "WSOL") return false;
      if (!q) return true;
      return (
        r.symbol.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.quoteSymbol && r.quoteSymbol.toLowerCase().includes(q))
      );
    });
  }, [rows, filter, query]);

  const visible = expanded ? filtered : filtered.slice(0, 12);

  const handlePickMarket = (row: MarketRow) => {
    selectMarket(row.marketSymbol || row.symbol, row.quoteSymbol);
    const quoteParam = row.quoteSymbol === "WSOL" ? "&quote=WSOL" : "";
    navigate(`/app/borrow?market=${row.marketSymbol || row.symbol}${quoteParam}`);
  };

  return (
    <PageContainer
      title="Supported markets"
      subtitle="Tokenized equities accepted as programmable collateral on Solana Devnet. All 12 live markets feature real on-chain AssetConfig PDAs, verified Pyth price feeds, and funded liquidity vaults."
    >
      <ConfigNotice />

      <div className="stack g-16">
        <div className="row between g-12 wrap">
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <label className="sr-only" htmlFor="market-search">
              Search markets
            </label>
            <input
              id="market-search"
              className="input input--text"
              type="search"
              placeholder="Search ticker, company, or quote (e.g. NVDA, AAPL, SOL, USDC)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div style={{ flex: "0 1 360px", minWidth: 260 }}>
            <Segmented<Filter>
              label="Filter markets"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All ${rows.length}` },
                { value: "live", label: `Live ${liveCount}` },
                { value: "sol", label: `SOL ${solCount}` },
                { value: "soon", label: "Soon" },
              ]}
            />
          </div>
        </div>

        {/* Live market detail for active selected market */}
        {s.asset && (
          <Card
            title={
              <div className="row g-10" style={{ alignItems: "center" }}>
                <span>Active Market: {selectedMarket.tokenSymbol} / {selectedMarket.quoteSymbol}</span>
                <Pill tone={selectedMarket.quoteSymbol === "WSOL" ? "accent" : "success"} withDot>
                  {selectedMarket.quoteSymbol === "WSOL" ? "BORROW SOL" : "ACTIVE"}
                </Pill>
              </div>
            }
          >
            <div className="grid grid--2">
              <div>
                <DataRow
                  label="Verified price"
                  value={
                    s.oracle ? `$${formatMoney(s.oracle.priceUsd)}` : "Deriving on-chain feed..."
                  }
                />
                <DataRow
                  label="Price age"
                  value={s.oracle ? formatAge(s.oracle.ageSeconds) : "--"}
                />
                <DataRow
                  label="Price certainty"
                  value={
                    s.oracle
                      ? `${(s.oracle.confBps / 100).toFixed(2)}% of price`
                      : "--"
                  }
                />
                <DataRow
                  label="Quote asset"
                  value={selectedMarket.quoteSymbol}
                />
              </div>
              <div>
                <DataRow
                  label="Borrowing limit"
                  value={formatPercent(s.asset.baseLtvBps)}
                />
                <DataRow
                  label="Liquidation threshold"
                  value={formatPercent(s.asset.liquidationThresholdBps)}
                />
                <DataRow
                  label="Dynamic liq bonus floor"
                  value={`${(s.asset.liquidationBonusBps / 100).toFixed(2)}%`}
                />
                <DataRow
                  label="Accepting deposits"
                  value={s.asset.enabled ? "Yes" : "No"}
                  tone={s.asset.enabled ? "success" : "warning"}
                />
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid--cards">
          {visible.map((row) => (
            <MarketCard
              key={`${row.symbol}-${row.quoteSymbol}`}
              row={row}
              oracle={s.market?.mint === row.mint ? s.oracle : null}
              asset={s.market?.mint === row.mint ? s.asset : null}
              session={s.session}
              loading={s.loading && row.live && s.market?.mint === row.mint}
              onSelect={() => handlePickMarket(row)}
            />
          ))}
        </div>

        {filtered.length > visible.length && (
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => setExpanded(true)}
          >
            Show all {filtered.length} markets
            <Icon name="chevronDown" size={15} />
          </button>
        )}

        {filtered.length === 0 && (
          <Card>
            <p className="t-sm muted center">No markets match that search.</p>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
