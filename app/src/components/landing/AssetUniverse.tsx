import React, { useMemo } from "react";

import { CLUSTER_LABEL, LIVE_MARKET_COUNT } from "../../env";
import { TICKERS, featuredTickers } from "../../data/tickers";
import { AssetOrbit } from "./AssetOrbit";
import { BrandMark } from "../ui/BrandMark";
import { Reveal } from "../ui/Reveal";

/**
 * Section 02 - the tokenized equity universe.
 *
 * Two views of the same set. The diagram shows scale: every catalogued asset on
 * three counter-rotating rings, logos only. The table below it is the accessible
 * route to the same information - names, tokens and sectors as selectable text -
 * which is why the diagram itself is aria-hidden rather than carrying labels no
 * screen reader could follow around a rotating circle.
 *
 * Every figure quoted at the bottom is derived from the registry or from env,
 * never written by hand. With no market configured the section says so instead of
 * quoting a number that happens to read well.
 */
export function AssetUniverse() {
  const assets = useMemo(() => featuredTickers(), []);
  const catalogued = TICKERS.length;

  return (
    <section className="sec uni" id="markets">
      <div className="sec__inner">
        <div className="uni__head">
          <Reveal>
            <p className="sec__index">
              <span className="sec__index__n">02</span>
              <span className="sec__index__t">Asset universe</span>
            </p>
            <h2 className="sec__title">
              Tokenized markets.
              <br />
              <em>One programmable layer.</em>
            </h2>
            <p className="sec__lede">
              Each supported equity maps to a canonical asset configuration containing its
              token identity, oracle feed, market-session rules and risk parameters.
              circuit consumes that configuration through one protocol interface.
            </p>

            <div className="uni__dims" style={{ display: "flex", flexWrap: "wrap", gap: "8px", margin: "20px 0 0" }}>
              {["ASSET", "TOKEN", "ORACLE", "SESSION", "RISK PARAMETERS"].map((dim) => (
                <span
                  key={dim}
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.1em",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    fontWeight: 600,
                  }}
                >
                  {dim}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal className="uni__orbitwrap" delay={120}>
            <AssetOrbit />
          </Reveal>
        </div>

        <Reveal>
          <ul className="uni__list">
            {assets.map((a) => (
              <li key={a.symbol} className="uni__item">
                <span className="uni__mark">
                  <BrandMark asset={a} size={20} />
                </span>
                <span className="uni__token">{a.token}</span>
                <span className="uni__name">{a.name}</span>
                <span className="uni__sector">{a.sector}</span>
              </li>
            ))}
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
              <dt>Oracle</dt>
              <dd>
                Pyth
                <span className="uni__stats__note">
                  one feed per asset, validated on every action
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
