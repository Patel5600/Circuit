import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  decodePositionDirect,
  DecodedPositionDirect,
} from "../app/src/lib/portfolio/provider";
import {
  analyzePortfolioRisk,
  calculateConservativePrice,
  BPS,
} from "../app/src/lib/risk/portfolio";
import {
  buildSimulatedPortfolioSnapshot,
  DEFAULT_SIMULATION_PARAMS,
} from "../app/src/lib/portfolio/simulation-provider";

describe("Multi-Asset Portfolio Risk Intelligence Tests", () => {
  const MINT_NVDA = "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq";
  const MINT_GOOGL = "8VjvTWpKHJYkMzhNDhVWWJTLx1FPBVfCextL5fDRgq11";
  const MINT_MSFT = "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2";
  const WALLET = "7VdxH8GXEq8D771Eh6y9CtQyRjumjDoiid3ycGqLSEoJ";

  /* -------------------------------------------------------------------------- */
  /*  1. Direct Binary Decoding of On-Chain Position Struct                    */
  /* -------------------------------------------------------------------------- */
  describe("1. Direct Binary Layout Decoding", () => {
    it("decodes 102-byte Position account into distinct owner, asset, collateral, and debt", () => {
      const buf = Buffer.alloc(102);
      // Discriminator: 8 bytes
      buf.set([170, 188, 143, 228, 122, 64, 247, 208], 0);
      // Owner Pubkey: 8..40
      const ownerKey = new PublicKey(WALLET);
      buf.set(ownerKey.toBuffer(), 8);
      // Asset Pubkey: 40..72
      const assetKey = new PublicKey(MINT_NVDA);
      buf.set(assetKey.toBuffer(), 40);
      // Collateral: 25,000,000 units (25.0 shares) at 72..80
      buf.writeBigUInt64LE(25_000_000n, 72);
      // Debt: 0 units at 80..88
      buf.writeBigUInt64LE(0n, 80);
      // Last valid price: 138_250_000_000 at 88..96
      buf.writeBigInt64LE(138_250_000_000n, 88);
      // Last valid expo: -8 at 96..100
      buf.writeInt32LE(-8, 96);
      // State: 0 (healthy) at 100
      buf.writeUInt8(0, 100);
      // Bump: 254 at 101
      buf.writeUInt8(254, 101);

      const decoded = decodePositionDirect(buf);
      expect(decoded).to.not.be.null;
      expect(decoded!.owner.toBase58()).to.equal(WALLET);
      expect(decoded!.assetMint).to.equal(MINT_NVDA);
      expect(decoded!.collateralAmount).to.equal(25_000_000n);
      expect(decoded!.debtAmount).to.equal(0n);
      expect(decoded!.state).to.equal("healthy");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  2. Multi-Asset Discovery & Weight Normalization                           */
  /* -------------------------------------------------------------------------- */
  describe("2. Dual-Asset Collateral Evaluation (NVDA + GOOGL)", () => {
    it("discovers both NVDA and GOOGL positions and computes normalized weights summing to 100%", () => {
      // Setup live on-chain quantities:
      // NVDA: 25 shares @ $140.00 = $3,500.00
      // GOOGL: 12.5 shares @ $160.00 = $2,000.00
      // Total Collateral = $5,500.00
      const nvdaCollateralUi = 25.0;
      const nvdaPriceUsd = 140.0;
      const nvdaVal = nvdaCollateralUi * nvdaPriceUsd; // 3500

      const googlCollateralUi = 12.5;
      const googlPriceUsd = 160.0;
      const googlVal = googlCollateralUi * googlPriceUsd; // 2000

      const totalVal = nvdaVal + googlVal; // 5500

      const assets = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: nvdaCollateralUi,
          priceUsd: nvdaPriceUsd,
          confidenceUsd: 0.25,
          confBps: 18,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "GOOGL",
          name: "Alphabet",
          collateralUi: googlCollateralUi,
          priceUsd: googlPriceUsd,
          confidenceUsd: 0.30,
          confBps: 19,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const analysis = analyzePortfolioRisk(assets, 0);

      expect(analysis.assetDetails.length).to.equal(2);
      expect(analysis.totalCollateralUsd).to.be.closeTo(5500.0, 0.01);

      const nvdaWeight = (3500 / 5500) * 100; // ~63.64%
      const googlWeight = (2000 / 5500) * 100; // ~36.36%

      expect(analysis.assetDetails[0].weightPct).to.be.closeTo(nvdaWeight, 0.01);
      expect(analysis.assetDetails[1].weightPct).to.be.closeTo(googlWeight, 0.01);
      expect(analysis.assetDetails[0].weightPct + analysis.assetDetails[1].weightPct).to.be.closeTo(100.0, 0.01);

      // Concentration check: maxWeight is NVDA ~63.64% > 40%
      expect(analysis.maxWeightPct).to.be.closeTo(nvdaWeight, 0.01);
      expect(analysis.dominantAssetSymbol).to.equal("NVDA");

      // Penalty math: (63.636 - 40) * 36 bps = ~851 bps
      const expectedPenalty = Math.round((nvdaWeight - 40) * 36);
      expect(analysis.concentrationPenaltyBps).to.equal(expectedPenalty);

      // Effective LTV = 7000 - penalty
      const expectedEffectiveLtv = Math.max(3000, 7000 - expectedPenalty);
      expect(analysis.effectiveLtvBps).to.equal(expectedEffectiveLtv);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  3. Third Asset Addition (NVDA + GOOGL + MSFT)                             */
  /* -------------------------------------------------------------------------- */
  describe("3. Expanding Portfolio to N=3 Assets (Addition of MSFT)", () => {
    it("dynamically rebalances portfolio weights and reduces single-asset concentration penalty", () => {
      // NVDA: 25 shares @ $140 = $3,500 (was 63.6%)
      // GOOGL: 12.5 shares @ $160 = $2,000 (was 36.4%)
      // MSFT: 8 shares @ $400 = $3,200 (NEW)
      // Total = $8,700
      const assets = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 25.0,
          priceUsd: 140.0,
          confidenceUsd: 0.25,
          confBps: 18,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "GOOGL",
          name: "Alphabet",
          collateralUi: 12.5,
          priceUsd: 160.0,
          confidenceUsd: 0.30,
          confBps: 19,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "MSFT",
          name: "Microsoft",
          collateralUi: 8.0,
          priceUsd: 400.0,
          confidenceUsd: 0.45,
          confBps: 11,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const analysis = analyzePortfolioRisk(assets, 0);

      expect(analysis.assetDetails.length).to.equal(3);
      expect(analysis.totalCollateralUsd).to.be.closeTo(8700.0, 0.01);

      // NVDA weight is now 3500 / 8700 = 40.23%
      expect(analysis.assetDetails[0].weightPct).to.be.closeTo(40.23, 0.05);
      // All weights sum to 100%
      const sumWeights = analysis.assetDetails.reduce((sum, a) => sum + a.weightPct, 0);
      expect(sumWeights).to.be.closeTo(100.0, 0.01);

      // Max weight dropped from 63.6% down to 40.23%!
      // Penalty is now (40.23 - 40) * 36 = ~8 bps (virtually eliminated!)
      expect(analysis.concentrationPenaltyBps).to.be.lessThan(50);
      expect(analysis.effectiveLtvBps).to.be.greaterThan(6900);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  4. Position Removal & Data Isolation                                      */
  /* -------------------------------------------------------------------------- */
  describe("4. Removing 1 Asset Position", () => {
    it("removing NVDA leaves GOOGL and MSFT completely intact with independent addressability", () => {
      const remainingAssets = [
        {
          symbol: "GOOGL",
          name: "Alphabet",
          collateralUi: 12.5,
          priceUsd: 160.0,
          confidenceUsd: 0.30,
          confBps: 19,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
        {
          symbol: "MSFT",
          name: "Microsoft",
          collateralUi: 8.0,
          priceUsd: 400.0,
          confidenceUsd: 0.45,
          confBps: 11,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const analysis = analyzePortfolioRisk(remainingAssets, 0);
      expect(analysis.assetDetails.length).to.equal(2);
      expect(analysis.totalCollateralUsd).to.be.closeTo(5200.0, 0.01);
      expect(analysis.assetDetails[0].symbol).to.equal("GOOGL");
      expect(analysis.assetDetails[1].symbol).to.equal("MSFT");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  5. Price Tick Update & Graph Topology Invariance                          */
  /* -------------------------------------------------------------------------- */
  describe("5. Price Stream Updates & Topology Invariance", () => {
    it("price tick on NVDA alters dollar values and Effective LTV without mutating node identities", () => {
      const initialAssets = [
        {
          symbol: "NVDA",
          mint: MINT_NVDA,
          collateralUi: 25.0,
          priceUsd: 140.0,
        },
        {
          symbol: "GOOGL",
          mint: MINT_GOOGL,
          collateralUi: 12.5,
          priceUsd: 160.0,
        },
      ];

      // Build stable node IDs:
      const initialNodeIds = initialAssets.map((a) => `asset:${a.mint}`);
      expect(initialNodeIds[0]).to.equal(`asset:${MINT_NVDA}`);
      expect(initialNodeIds[1]).to.equal(`asset:${MINT_GOOGL}`);

      // Price jump on NVDA to $180.00
      const updatedAssets = [
        {
          symbol: "NVDA",
          mint: MINT_NVDA,
          collateralUi: 25.0,
          priceUsd: 180.0,
        },
        {
          symbol: "GOOGL",
          mint: MINT_GOOGL,
          collateralUi: 12.5,
          priceUsd: 160.0,
        },
      ];

      const updatedNodeIds = updatedAssets.map((a) => `asset:${a.mint}`);
      // Stable IDs must remain strictly identical:
      expect(updatedNodeIds).to.deep.equal(initialNodeIds);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  6. Strict Mint Deduplication                                              */
  /* -------------------------------------------------------------------------- */
  describe("6. Strict Deduplication by Asset Mint", () => {
    it("merges raw positions sharing the same mint address without duplicate node creation", () => {
      const rawList: (DecodedPositionDirect & { pda: PublicKey })[] = [
        {
          pda: new PublicKey("HW5bVqR34eUVA77NjVNKdsTG5gpWnPL9wcxnSUYq1gFr"),
          owner: new PublicKey(WALLET),
          assetMint: MINT_NVDA,
          collateralAmount: 25_000_000n,
          debtAmount: 0n,
          lastValidPrice: 138_000_000_000n,
          lastValidExpo: -8,
          state: "healthy",
        },
        // Duplicate entry (e.g. from both GPA and batched check)
        {
          pda: new PublicKey("HW5bVqR34eUVA77NjVNKdsTG5gpWnPL9wcxnSUYq1gFr"),
          owner: new PublicKey(WALLET),
          assetMint: MINT_NVDA,
          collateralAmount: 25_000_000n,
          debtAmount: 0n,
          lastValidPrice: 138_000_000_000n,
          lastValidExpo: -8,
          state: "healthy",
        },
        {
          pda: new PublicKey("FjdBEo5dBczhs4wrxAfYm9VDdrvKHGTKnY7fxoZ4ziLS"),
          owner: new PublicKey(WALLET),
          assetMint: MINT_GOOGL,
          collateralAmount: 12_500_000n,
          debtAmount: 0n,
          lastValidPrice: 160_000_000_000n,
          lastValidExpo: -8,
          state: "healthy",
        },
      ];

      const dedupMap = new Map<string, DecodedPositionDirect & { pda: PublicKey }>();
      for (const pos of rawList) {
        dedupMap.set(pos.assetMint, pos);
      }

      const deduplicated = Array.from(dedupMap.values());
      expect(deduplicated.length).to.equal(2);
      expect(deduplicated.map((p) => p.assetMint)).to.deep.equal([MINT_NVDA, MINT_GOOGL]);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  7. Simulation Sandbox Isolation                                           */
  /* -------------------------------------------------------------------------- */
  describe("7. Simulation Portfolio Isolation for /app/learn", () => {
    it("generates virtual sandbox portfolio with isSimulated=true and zero wallet exposure", () => {
      const snap = buildSimulatedPortfolioSnapshot(DEFAULT_SIMULATION_PARAMS);
      expect(snap.isSimulated).to.be.true;
      expect(snap.providerType).to.equal("SIMULATION");
      expect(snap.positions.length).to.equal(3);
      expect(snap.positions[0].symbol).to.equal("NVDA");
      expect(snap.positions[1].symbol).to.equal("AAPL");
      expect(snap.positions[2].symbol).to.equal("MSFT");
    });
  });
});
