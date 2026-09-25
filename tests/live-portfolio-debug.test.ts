import { expect } from "chai";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchLivePortfolioSnapshot, discoverOnChainPositions } from "../app/src/lib/portfolio/live-provider";
import { evaluateAction } from "../app/src/lib/decision/evaluator";
import { AssetRegistry } from "../app/src/lib/assets/registry";

import { DEPLOYED_MARKETS as M1 } from "../app/src/data/markets";
import { DEPLOYED_MARKETS as M2 } from "../app/src/data/markets-registry";

describe("Live Portfolio & Decision Diagnostic", () => {
  it("diagnoses onchain snapshot and decision evaluation for 7VdxH8GXEq8D771Eh6y9CtQyRjumjDoiid3ycGqLSEoJ", async function () {
    this.timeout(30000);
    console.log("M1 (markets.tsx):", M1 ? M1.length : undefined);
    console.log("M2 (markets-registry.ts):", M2 ? M2.length : undefined);
    const conn = new Connection("https://api.devnet.solana.com", "confirmed");
    const wallet = new PublicKey("7VdxH8GXEq8D771Eh6y9CtQyRjumjDoiid3ycGqLSEoJ");

    console.log("1. Running discoverOnChainPositions...");
    const raw = await discoverOnChainPositions(conn, wallet);
    console.log("Raw discovered count:", raw.length);
    for (const r of raw) {
      console.log(" - Mint:", r.assetMint, "Collat:", r.collateralAmount.toString(), "Debt:", r.debtAmount.toString());
    }

    console.log("\n2. Running fetchLivePortfolioSnapshot...");
    const snap = await fetchLivePortfolioSnapshot(conn, wallet);
    console.log("Snapshot summary:");
    console.log(" - totalCollateralUsd:", snap.totalCollateralUsd);
    console.log(" - totalDebtUsd:", snap.totalDebtUsd);
    console.log(" - effectiveLtvBps:", snap.effectiveLtvBps);
    console.log(" - borrowCapacityUsd:", snap.borrowCapacityUsd);
    console.log(" - riskState:", snap.riskState);
    console.log(" - positions count:", snap.positions.length);
    for (const p of snap.positions) {
      console.log(`   * ${p.symbol}: collatUi=${p.collateralUi}, valUsd=${p.collateralValueUsd}, priceUsd=${p.priceUsd}, baseLtvBps=${p.baseLtvBps}, oracleHealthy=${p.oracleHealthy}, confBps=${p.confBps}`);
    }

    console.log("\n3. Testing evaluateAction with discovered position...");
    const nvdaPos = snap.positions.find((p) => p.symbol === "NVDA");
    const canonicalAsset = AssetRegistry.get("NVDA");

    const decision = evaluateAction(
      { mode: "MANUAL" },
      "borrow",
      1060,
      {
        slot: 328000000,
        blockTime: null,
        protocolPaused: false,
        assetEnabled: true,
        assetMint: canonicalAsset?.tokenMint ?? "",
        assetSymbol: "NVDA",
        oraclePrice: nvdaPos?.priceUsd ?? 117,
        oracleExpo: -8,
        oracleConf: 0.0135,
        oracleConfBps: nvdaPos?.confBps ?? 15,
        oraclePublishTime: Math.floor(Date.now() / 1000) - 20,
        maxOracleAge: 600,
        globalOracleHealthy: true,
        isMarketOpen: true, // test open vs closed
        referenceMarketState: "OPEN",
        onchainMarketState: "OPEN",
        oracleState: "FRESH",
        lastValidPrice: nvdaPos?.priceUsd ?? 117,
        lastValidPublishTime: Math.floor(Date.now() / 1000) - 20,
        ratchetState: "SAFE",
        baseLtvBps: 7000,
        collateralUsd: nvdaPos?.collateralValueUsd ?? 0,
        debtUsd: nvdaPos?.debtUi ?? 0,
        agentAuthority: null,
      }
    );

    console.log("\nDecision with refMarketState=OPEN:");
    console.log(" - verdict.status:", decision.verdict.status);
    console.log(" - verdict.code:", decision.verdict.code);
    console.log(" - verdict.reason:", decision.verdict.reason);
    console.log(" - capitalPolicy.borrowAllowed:", decision.capitalPolicy.borrowAllowed);
    console.log(" - capitalPolicy.maxBorrow:", decision.capitalPolicy.maxBorrow);
    console.log(" - capitalPolicy.maxLtv:", decision.capitalPolicy.maxLtv);

    const decisionClosed = evaluateAction(
      { mode: "MANUAL" },
      "borrow",
      1060,
      {
        slot: 328000000,
        blockTime: null,
        protocolPaused: false,
        assetEnabled: true,
        assetMint: canonicalAsset?.tokenMint ?? "",
        assetSymbol: "NVDA",
        oraclePrice: nvdaPos?.priceUsd ?? 117,
        oracleExpo: -8,
        oracleConf: 0.0135,
        oracleConfBps: nvdaPos?.confBps ?? 15,
        oraclePublishTime: Math.floor(Date.now() / 1000) - 20,
        maxOracleAge: 600,
        globalOracleHealthy: true,
        isMarketOpen: false, // NYSE closed
        referenceMarketState: "CLOSED",
        onchainMarketState: "OPEN",
        oracleState: "FRESH",
        lastValidPrice: nvdaPos?.priceUsd ?? 117,
        lastValidPublishTime: Math.floor(Date.now() / 1000) - 20,
        ratchetState: "SAFE",
        baseLtvBps: 7000,
        collateralUsd: nvdaPos?.collateralValueUsd ?? 0,
        debtUsd: nvdaPos?.debtUi ?? 0,
        agentAuthority: null,
      }
    );

    console.log("\nDecision with refMarketState=CLOSED:");
    console.log(" - verdict.status:", decisionClosed.verdict.status);
    console.log(" - verdict.code:", decisionClosed.verdict.code);
    console.log(" - verdict.reason:", decisionClosed.verdict.reason);
    console.log(" - capitalPolicy.borrowAllowed:", decisionClosed.capitalPolicy.borrowAllowed);
    console.log(" - capitalPolicy.maxBorrow:", decisionClosed.capitalPolicy.maxBorrow);
    console.log(" - capitalPolicy.maxLtv:", decisionClosed.capitalPolicy.maxLtv);
  });
});
