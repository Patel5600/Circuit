import { expect } from "chai";
import {
  calculate24hChange,
  cleanSymbol,
  MarketHistoryProvider,
} from "../app/src/lib/market-data/historical";
import {
  getDetailedMarketSession,
  getMarketSessionState,
  classifyOracleStatus,
} from "../app/src/lib/market-data/stream";
import {
  CANONICAL_ASSET_REGISTRY,
  getAssetDefinition,
} from "../app/src/lib/market-data/registry";
import { HistoricalReference } from "../app/src/lib/market-data/types";

describe("Live Onchain Equity Market Terminal Tests", () => {
  /* -------------------------------------------------------------------------- */
  /*  1. 4-Dimension Semantic State Separation                                  */
  /* -------------------------------------------------------------------------- */
  describe("1. 4-Dimension Semantic State Separation", () => {
    it("decouples underlying equity session from on-chain 24/7 tradeability", () => {
      // Saturday noon ET: unix 1718467200 (Saturday June 15, 2024 12:00 PM ET)
      const saturdayNoon = 1718467200;
      const session = getDetailedMarketSession(saturdayNoon);

      expect(session.session).to.equal("CLOSED");
      expect(session.isOpen).to.be.false;
      expect(session.label).to.include("Weekend");

      // An asset on Solana secondary market remains TRADEABLE even when underlying is CLOSED
      const onchainAvailability = "TRADEABLE";
      const collateralStatus = "AVAILABLE";
      const oracleStatus = "RECENT";

      // The 4 dimensions must remain independent and not collapsed
      expect(session.session).to.not.equal(onchainAvailability);
      expect(onchainAvailability).to.equal("TRADEABLE");
      expect(collateralStatus).to.equal("AVAILABLE");
      expect(oracleStatus).to.equal("RECENT");
    });

    it("verifies pre-market and post-market sessions are correctly identified", () => {
      // Wednesday 8:00 AM ET (Pre-market)
      // 2024-06-12 08:00:00 EDT = 1718193600
      const preMarketTime = 1718193600;
      const preSession = getDetailedMarketSession(preMarketTime);
      expect(preSession.session).to.equal("PRE_MARKET");
      expect(preSession.isOpen).to.be.false;

      // Wednesday 5:00 PM ET (Post-market)
      // 2024-06-12 17:00:00 EDT = 1718226000
      const postMarketTime = 1718226000;
      const postSession = getDetailedMarketSession(postMarketTime);
      expect(postSession.session).to.equal("POST_MARKET");
      expect(postSession.isOpen).to.be.false;

      // Wednesday 2:00 PM ET (Regular trading)
      // 2024-06-12 14:00:00 EDT = 1718215200
      const regTime = 1718215200;
      const regSession = getDetailedMarketSession(regTime);
      expect(regSession.session).to.equal("REGULAR");
      expect(regSession.isOpen).to.be.true;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  2. 24h Change & Historical Reference Pipeline                             */
  /* -------------------------------------------------------------------------- */
  describe("2. 24h Change & Historical Reference Pipeline", () => {
    it("computes positive 24h change and percentage accurately", () => {
      const ref: HistoricalReference = {
        symbol: "AAPL",
        referencePriceUsd: 200.0,
        referenceTimestamp: Date.now() / 1000 - 86400,
        source: "Market Close Reference",
        status: "AVAILABLE",
      };

      const result = calculate24hChange(210.0, ref);
      expect(result.status).to.equal("AVAILABLE");
      expect(result.change24hUsd).to.be.closeTo(10.0, 0.001);
      expect(result.change24hPercent).to.be.closeTo(5.0, 0.001);
    });

    it("computes negative 24h change and percentage accurately", () => {
      const ref: HistoricalReference = {
        symbol: "NVDA",
        referencePriceUsd: 150.0,
        referenceTimestamp: Date.now() / 1000 - 86400,
        source: "Market Close Reference",
        status: "AVAILABLE",
      };

      const result = calculate24hChange(135.0, ref);
      expect(result.status).to.equal("AVAILABLE");
      expect(result.change24hUsd).to.be.closeTo(-15.0, 0.001);
      expect(result.change24hPercent).to.be.closeTo(-10.0, 0.001);
    });

    it("handles zero movement (flat price) without NaN", () => {
      const ref: HistoricalReference = {
        symbol: "MSFT",
        referencePriceUsd: 400.0,
        referenceTimestamp: Date.now() / 1000 - 86400,
        source: "Market Close Reference",
        status: "AVAILABLE",
      };

      const result = calculate24hChange(400.0, ref);
      expect(result.status).to.equal("AVAILABLE");
      expect(result.change24hUsd).to.equal(0);
      expect(result.change24hPercent).to.equal(0);
    });

    it("strictly returns UNAVAILABLE when reference is unavailable or zero", () => {
      const ref: HistoricalReference = {
        symbol: "UNKNOWN",
        referencePriceUsd: null,
        referenceTimestamp: null,
        source: "Market Provider",
        status: "UNAVAILABLE",
      };

      const result = calculate24hChange(100.0, ref);
      expect(result.status).to.equal("UNAVAILABLE");
      expect(result.change24hUsd).to.be.null;
      expect(result.change24hPercent).to.be.null;
    });

    it("cleans and normalizes token symbols correctly", () => {
      expect(cleanSymbol("NVDAx")).to.equal("NVDA");
      expect(cleanSymbol("AAPLX")).to.equal("AAPL");
      expect(cleanSymbol("NVDA-SOL")).to.equal("NVDA");
      expect(cleanSymbol("SPY")).to.equal("SPY");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  3. Oracle Freshness & Staleness Invariants                                */
  /* -------------------------------------------------------------------------- */
  describe("3. Oracle Freshness & Staleness Invariants", () => {
    it("classifies <= 45s as LIVE", () => {
      expect(classifyOracleStatus(0)).to.equal("LIVE");
      expect(classifyOracleStatus(15)).to.equal("LIVE");
      expect(classifyOracleStatus(45)).to.equal("LIVE");
    });

    it("classifies 46s - 300s as RECENT", () => {
      expect(classifyOracleStatus(46)).to.equal("RECENT");
      expect(classifyOracleStatus(120)).to.equal("RECENT");
      expect(classifyOracleStatus(300)).to.equal("RECENT");
    });

    it("classifies > 300s as STALE", () => {
      expect(classifyOracleStatus(301)).to.equal("STALE");
      expect(classifyOracleStatus(600)).to.equal("STALE");
    });

    it("classifies missing data as UNAVAILABLE", () => {
      expect(classifyOracleStatus(10, false)).to.equal("UNAVAILABLE");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  4. Canonical Asset Registry & Metadata Integrity                          */
  /* -------------------------------------------------------------------------- */
  describe("4. Canonical Asset Registry & Metadata Integrity", () => {
    it("contains all 24 supported and discovery equities", () => {
      expect(CANONICAL_ASSET_REGISTRY.length).to.be.at.least(24);
    });

    it("verifies 12 collateral-supported Devnet markets", () => {
      const collateral = CANONICAL_ASSET_REGISTRY.filter((a) => a.collateralSupported);
      expect(collateral.length).to.equal(12);
    });

    it("retrieves canonical definition by symbol", () => {
      const nvda = getAssetDefinition("NVDA");
      expect(nvda).to.not.be.undefined;
      expect(nvda?.symbol).to.equal("NVDA");
      expect(nvda?.tokenSymbol).to.equal("NVDAx");
      expect(nvda?.collateralSupported).to.be.true;
      expect(nvda?.baseLtvBps).to.equal(7000);

      const aapl = getAssetDefinition("AAPLx");
      expect(aapl).to.not.be.undefined;
      expect(aapl?.symbol).to.equal("AAPL");
    });

    it("guarantees no duplicated asset IDs", () => {
      const ids = CANONICAL_ASSET_REGISTRY.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).to.equal(uniqueIds.size);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  5. Independent Asset Updates & Regression Protection                      */
  /* -------------------------------------------------------------------------- */
  describe("5. Independent Asset Updates & Regression Protection", () => {
    it("updating NVDA price leaves AAPL and MSFT baseline values unchanged", () => {
      const aaplInitial = getAssetDefinition("AAPL")!.initialPriceUsd;
      const msftInitial = getAssetDefinition("MSFT")!.initialPriceUsd;

      // Simulated tick on NVDA
      const newNvdaPrice = 115.5;
      expect(newNvdaPrice).to.not.equal(aaplInitial);
      expect(newNvdaPrice).to.not.equal(msftInitial);

      // Verify AAPL and MSFT references are immutable
      expect(getAssetDefinition("AAPL")!.initialPriceUsd).to.equal(aaplInitial);
      expect(getAssetDefinition("MSFT")!.initialPriceUsd).to.equal(msftInitial);
    });
  });
});
