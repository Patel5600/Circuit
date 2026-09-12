import React, { useMemo, useState } from "react";

import { PageContainer } from "../components/layout/AppShell";
import { ConfigNotice } from "../components/layout/Guards";
import { Card, DataRow, Icon, Notice, Segmented } from "../components/ui";
import { MarketCard, MarketRow } from "../components/market/MarketParts";
import { useProtocolState } from "../hooks/useProtocolState";
import { MARKETS_DATA } from "../data/markets";
import { activeAssetDisplay } from "../lib/asset";
import { formatAge, formatMoney, formatPercent } from "../lib/format";

type Filter = "all" | "live" | "soon";

export default function Markets() {
  const s = useProtocolState();
  const display = useMemo(activeAssetDisplay, []);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  /**
   * Exactly one asset is registered on-chain, and it is the only row that shows
   * live figures. The rest of the catalogue is presented as unsupported rather
   * than decorated with placeholder prices.
   */
  const rows = useMemo<MarketRow[]>(() => {
    const liveSymbol = display.symbol;
    const out: MarketRow[] = [];

    if (s.asset) {
      out.push({
        symbol: liveSymbol,
        name: display.name,
        logo: display.logo,
        live: true,
        priceUsd: s.oracle?.priceUsd ?? null,
        ltvBps: s.asset.baseLtvBps,
      });
    }

    for (const m of MARKETS_DATA) {
      if (s.asset && m.tokenSymbol === liveSymbol) continue;
      out.push({
        symbol: m.tokenSymbol,
        name: m.displayName,
        logo: m.logoSvg,
        live: false,
        priceUsd: null,
        ltvBps: null,
      });
    }
    return out;
  }, [s.asset, s.oracle, display]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "live" && !r.live) return false;
      if (filter === "soon" && r.live) return false;
      if (!q) return true;
      return (
        r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  const liveCount = rows.filter((r) => r.live).length;
  const visible = expanded ? filtered : filtered.slice(0, 9);

  return (
    <PageContainer
      title="Supported markets"
      subtitle="Assets circuit accepts as collateral. Only assets registered on-chain with a verified price feed can be used."
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
              placeholder="Search ticker or company"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div style={{ flex: "0 1 300px", minWidth: 220 }}>
            <Segmented<Filter>
              label="Filter markets"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All ${rows.length}` },
                { value: "live", label: `Live ${liveCount}` },
                { value: "soon", label: "Soon" },
              ]}
            />
          </div>
        </div>

        {liveCount === 0 && !s.loading && (
          <Notice tone="warning" title="No market registered">
            No asset has been registered on-chain for this deployment yet.
          </Notice>
        )}

        {/* Live market detail, shown once and prominently. */}
        {s.asset && filter !== "soon" && !query && (
          <Card title="Live market detail">
            <div className="grid grid--2">
              <div>
                <DataRow
                  label="Verified price"
                  value={
                    s.oracle ? `$${formatMoney(s.oracle.priceUsd)}` : "Unavailable"
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
              key={row.symbol}
              row={row}
              oracle={s.oracle}
              asset={s.asset}
              session={s.session}
              loading={s.loading && row.live}
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
