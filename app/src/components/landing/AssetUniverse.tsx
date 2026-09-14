import React, { useMemo, useState } from "react";

import { CLUSTER_LABEL, LIVE_MARKET_COUNT } from "../../env";
import { TICKERS, featuredTickers } from "../../data/tickers";
import { DEPLOYED_MARKETS } from "../../data/markets";
import { AssetOrbit } from "./AssetOrbit";
import { BrandMark } from "../ui/BrandMark";
import { Reveal } from "../ui/Reveal";

/**
 * Section 02 - The Input: Tokenized Equity
 * 
 * Demonstrates the actual asset entering Circuit.
 * Features an interactive constellation of tokenized-stock assets, clearly distinguishing
 * collateral AVAILABLE (12 live Devnet markets) vs COMING SOON.
 * Clicking an asset reveals its underlying entity, token symbol, and collateral eligibility,
 * showing how it flows into Stage 02 (Pyth Conservative Price).
 */
export function AssetUniverse() {
  const assets = useMemo(() => featuredTickers(), []);
  const catalogued = TICKERS.length;

  const deployedMints = useMemo(
    () => new Set(DEPLOYED_MARKETS.map((m) => m.symbol)),
    []
  );

  const [selectedSymbol, setSelectedSymbol] = useState<string>("NVDA");
  const activeAsset = useMemo(
    () => assets.find((a) => a.symbol === selectedSymbol) ?? assets[0],
    [assets, selectedSymbol]
  );

  const isAvailable = deployedMints.has(activeAsset.symbol);

  return (
    <section className="sec uni" id="equity">
      <div className="sec__inner">
        <div className="uni__head">
          <Reveal>
            <p className="sec__index">
              <span className="sec__index__n">02</span>
              <span className="sec__index__t">The Input · Tokenized Equity</span>
            </p>
            <h2 className="sec__title">
              Tokenized stocks are assets.
              <br />
              <em>Circuit makes them collateral.</em>
            </h2>
            <p className="sec__lede">
              This stage represents the actual asset entering Circuit. Every tokenized equity carries
              regulated 1:1 custody backing rather than synthetic debt. Click any asset below to inspect
              its on-chain metadata before it enters the Pyth valuation pipeline.
            </p>
          </Reveal>

          <Reveal className="uni__orbitwrap" delay={120}>
            <AssetOrbit />
          </Reveal>
        </div>

        {/* Selected Asset Inspection Card */}
        <Reveal>
          <div
            style={{
              margin: "28px 0 20px",
              padding: "20px 24px",
              background: "rgba(18, 20, 26, 0.75)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-lg)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--border)",
                }}
              >
                <BrandMark asset={activeAsset} size={28} />
              </div>
              <div>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontFamily: "var(--mono)",
                    color: "var(--text-3)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Stage 01 Input Verified
                </span>
                <h3 style={{ margin: "2px 0 0", fontSize: "18px", fontWeight: 700, color: "var(--text)" }}>
                  {activeAsset.name} ({activeAsset.token})
                </h3>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "24px" }}>
              <div>
                <dt style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Underlying</dt>
                <dd style={{ margin: "2px 0 0", fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>
                  {activeAsset.name} Inc.
                </dd>
              </div>

              <div>
                <dt style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Token</dt>
                <dd style={{ margin: "2px 0 0", fontSize: "13.5px", fontFamily: "var(--mono)", color: "var(--text)" }}>
                  {activeAsset.token}
                </dd>
              </div>

              <div>
                <dt style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase" }}>Collateral</dt>
                <dd style={{ margin: "4px 0 0" }}>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "var(--mono)",
                      fontWeight: 700,
                      background: isAvailable ? "rgba(127, 195, 154, 0.15)" : "rgba(207, 173, 116, 0.12)",
                      color: isAvailable ? "#7fc39a" : "#cfad74",
                      border: `1px solid ${isAvailable ? "rgba(127, 195, 154, 0.4)" : "rgba(207, 173, 116, 0.3)"}`,
                    }}
                  >
                    {isAvailable ? "AVAILABLE" : "COMING SOON"}
                  </span>
                </dd>
              </div>

              <a
                href="#oracle"
                className="btn btn--secondary btn--sm"
                style={{ marginLeft: "auto" }}
              >
                Flow to Stage 02 ↓
              </a>
            </div>
          </div>
        </Reveal>

        {/* Interactive Asset Constellation Grid */}
        <Reveal>
          <ul className="uni__list">
            {assets.map((a) => {
              const active = a.symbol === selectedSymbol;
              const hasMarket = deployedMints.has(a.symbol);
              return (
                <li
                  key={a.symbol}
                  className={`uni__item${active ? " is-active" : ""}`}
                  onClick={() => setSelectedSymbol(a.symbol)}
                  style={{
                    cursor: "pointer",
                    border: active ? "1px solid var(--accent)" : undefined,
                    background: active ? "rgba(255, 255, 255, 0.05)" : undefined,
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={active}
                >
                  <span className="uni__mark">
                    <BrandMark asset={a} size={20} />
                  </span>
                  <span className="uni__token">{a.token}</span>
                  <span className="uni__name">{a.name}</span>
                  <span
                    className="uni__sector"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {hasMarket ? (
                      <span
                        style={{
                          fontSize: "9.5px",
                          fontFamily: "var(--mono)",
                          color: "#7fc39a",
                          background: "rgba(127, 195, 154, 0.1)",
                          padding: "1px 5px",
                          borderRadius: "3px",
                        }}
                      >
                        COLLATERAL
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-3)", fontSize: "10px" }}>DISCOVERY</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal>
          <dl className="uni__stats">
            <div>
              <dt>Assets catalogued</dt>
              <dd>{catalogued}</dd>
            </div>
            <div>
              <dt>Registered on {CLUSTER_LABEL}</dt>
              <dd>
                {LIVE_MARKET_COUNT}
                {LIVE_MARKET_COUNT === 0 && (
                  <span className="uni__stats__note">
                    no market configured in this build
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Oracle Gateway</dt>
              <dd>
                Pyth
                <span className="uni__stats__note">
                  PriceUpdateV2 evaluated at confidence lower bound (p - conf)
                </span>
              </dd>
            </div>
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

export default AssetUniverse;
