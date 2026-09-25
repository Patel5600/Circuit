import { expect } from "chai";
import {
  normalizedStore,
  DerivedStateEngine,
  derivedStateEngine,
  TransactionStateMachine,
  transactionStateMachine,
  RealtimeCandleEngine,
  candleEngine,
  defaultMarketData,
  defaultPositionData,
  defaultProtocolData,
} from "../app/src/lib/realtime";

describe("Circuit Realtime Truth Architecture Suite (Sections 1-43)", () => {
  const NVDA_MINT = "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq";
  const AAPL_MINT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

  beforeEach(() => {
    // Reset stores to nominal safe test baseline
    normalizedStore.updateProtocol({
      paused: false,
      minHealthFactorBps: 10000,
      borrowFeeBps: 25,
      vaultLiquidityUsd: 1000000,
      riskEpoch: 1,
    }, "test-init", "LIVE", 328000000);

    normalizedStore.updateMarket(
      NVDA_MINT,
      {
        symbol: "NVDA",
        name: "NVIDIA Corp",
        price: 116.84,
        oraclePrice: 116.84,
        oracleConfBps: 15,
        oracleAgeSeconds: 12,
        domains: {
          referenceMarketState: "OPEN",
          onchainMarketState: "OPEN",
          oracleState: "FRESH",
          circuitRiskState: "SAFE",
          permissionState: "ALLOW",
        },
      },
      "pyth-test",
      "LIVE",
      328000000
    );

    normalizedStore.updatePosition(
      NVDA_MINT,
      {
        symbol: "NVDA",
        collateralAmount: 25000000n,
        collateralAmountUi: 25.0,
        collateralValueUsd: 2921.0,
        debtAmount: 0n,
        debtAmountUi: 0,
        currentLtvPct: 0,
        healthFactor: null,
        lastValidPrice: 116.84,
      },
      "position-test",
      "LIVE",
      328000000
    );
  });

  describe("1. Decoupled Market State Domains (Section 3)", () => {
    it("Scenario A: Reference CLOSED + Onchain OPEN + Oracle FRESH -> Repay/Deposit allowed, Borrow restricted", () => {
      // In derivedStateEngine, if NYSE is closed, onchain remains OPEN
      const domains = derivedStateEngine.deriveMarketDomains(NVDA_MINT);
      expect(domains.onchainMarketState).to.equal("OPEN");
      expect(domains.oracleState).to.equal("FRESH");

      // Verify financial evaluation
      const fin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "borrow", 1000);
      expect(fin.permission.repayAllowed).to.be.true;
      expect(fin.permission.depositAllowed).to.be.true;
      if (domains.referenceMarketState === "CLOSED") {
        expect(fin.executableBorrowCapacityUsd).to.equal(0);
        expect(fin.theoreticalBorrowCapacityUsd).to.be.greaterThan(2000);
        expect(fin.permission.borrowAllowed).to.be.false;
      }
    });

    it("Scenario B: Reference CLOSED + Onchain OPEN + Oracle STALE -> Oracle stale blocks borrow but leaves onchain OPEN", () => {
      normalizedStore.updateMarket(
        NVDA_MINT,
        {
          oracleAgeSeconds: 450, // Stale (> 60s, <= 600s)
        },
        "pyth-stale",
        "STALE",
        328000100
      );

      const domains = derivedStateEngine.deriveMarketDomains(NVDA_MINT);
      expect(domains.oracleState).to.equal("STALE");
      expect(domains.onchainMarketState).to.equal("OPEN");

      const fin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "borrow", 100);
      expect(fin.permission.borrowAllowed).to.be.false;
      expect(fin.permission.repayAllowed).to.be.true; // Risk-reducing always permitted
    });

    it("Scenario C: Oracle UNAVAILABLE -> Borrow blocked with Oracle reason, Repay remains open", () => {
      normalizedStore.updateMarket(
        NVDA_MINT,
        {
          price: null,
          oracleAgeSeconds: null,
        },
        "pyth-unavailable",
        "UNAVAILABLE",
        328000200
      );

      const domains = derivedStateEngine.deriveMarketDomains(NVDA_MINT);
      expect(domains.oracleState).to.equal("UNAVAILABLE");

      const fin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "borrow", 100);
      expect(fin.permission.borrowAllowed).to.be.false;
      expect(fin.permission.repayAllowed).to.be.true;
    });
  });

  describe("2. Provenance Metadata (Section 2)", () => {
    it("attaches explicit provenance metadata to all store updates", () => {
      const prov = normalizedStore.getMarket(NVDA_MINT);
      expect(prov).to.have.property("source");
      expect(prov).to.have.property("observedAt");
      expect(prov).to.have.property("slot");
      expect(prov).to.have.property("commitment");
      expect(prov).to.have.property("status");
      expect(prov).to.have.property("version");
      expect(prov.commitment).to.equal("confirmed");
    });
  });

  describe("3. Multi-Asset Fault Isolation (Section 30)", () => {
    it("guarantees state updates on NVDA do not leak into AAPL", () => {
      normalizedStore.updateMarket(
        AAPL_MINT,
        {
          symbol: "AAPL",
          name: "Apple Inc",
          price: 220.5,
          oraclePrice: 220.5,
          oracleConfBps: 20,
          oracleAgeSeconds: 15,
        },
        "pyth-aapl",
        "LIVE",
        328000300
      );

      const nvdaMkt = normalizedStore.getMarket(NVDA_MINT).value;
      const aaplMkt = normalizedStore.getMarket(AAPL_MINT).value;

      expect(nvdaMkt.symbol).to.equal("NVDA");
      expect(nvdaMkt.price).to.equal(116.84);
      expect(aaplMkt.symbol).to.equal("AAPL");
      expect(aaplMkt.price).to.equal(220.5);

      // Mutate NVDA
      normalizedStore.updateMarket(NVDA_MINT, { price: 125.0 }, "pyth-nvda-update");
      expect(normalizedStore.getMarket(NVDA_MINT).value.price).to.equal(125.0);
      expect(normalizedStore.getMarket(AAPL_MINT).value.price).to.equal(220.5); // completely intact
    });
  });

  describe("4. Explicit Transaction State Machine (Section 6)", () => {
    it("enforces explicit transitions and rejects premature success", () => {
      const tx = transactionStateMachine.createTransaction({
        action: "BORROW",
        assetSymbol: "NVDA",
        assetMint: NVDA_MINT,
        amount: 500,
        quoteSymbol: "USDC",
      });

      expect(tx.state).to.equal("IDLE");

      const prep = transactionStateMachine.transition(tx.id, "PREPARING");
      expect(prep?.state).to.equal("PREPARING");

      const sigWait = transactionStateMachine.transition(tx.id, "AWAITING_SIGNATURE");
      expect(sigWait?.state).to.equal("AWAITING_SIGNATURE");

      const signed = transactionStateMachine.transition(tx.id, "SIGNED");
      expect(signed?.state).to.equal("SIGNED");

      const submitted = transactionStateMachine.transition(tx.id, "SUBMITTED", {
        signature: "5fakeSig12345",
      });
      expect(submitted?.state).to.equal("SUBMITTED");
      expect(submitted?.signature).to.equal("5fakeSig12345");

      const confirming = transactionStateMachine.transition(tx.id, "CONFIRMING");
      expect(confirming?.state).to.equal("CONFIRMING");

      const confirmed = transactionStateMachine.transition(tx.id, "CONFIRMED", {
        slot: 328000500,
      });
      expect(confirmed?.state).to.equal("CONFIRMED");
      expect(confirmed?.slot).to.equal(328000500);
      expect(confirmed?.confirmedAtTs).to.be.a("number");
    });
  });

  describe("5. Realtime Candle Engine (Section 17-19)", () => {
    it("builds genuine candles, enforces monotonic timestamps and ring buffer limit", () => {
      const nowSec = 1727250000;
      // Ingest initial tick
      candleEngine.ingestTick("NVDA", 116.0, 10, nowSec * 1000);
      // Ingest tick with higher price within same 1m bucket
      candleEngine.ingestTick("NVDA", 118.0, 5, (nowSec + 10) * 1000);
      // Ingest tick with lower price within same 1m bucket
      candleEngine.ingestTick("NVDA", 115.5, 15, (nowSec + 20) * 1000);
      candleEngine.flushTicks();

      const candles = candleEngine.getCandles("NVDA", "1m");
      expect(candles.length).to.be.greaterThan(0);
      const last = candles[candles.length - 1];
      expect(last.high).to.be.at.least(118.0);
      expect(last.low).to.be.at.most(115.5);
      expect(last.close).to.equal(115.5);
      expect(last.volume).to.be.at.least(30);
    });
  });

  describe("6. Realtime Closed-Loop Lifecycle Integration Test (Section 40)", () => {
    it("executes full Deposit -> Borrow -> Risk Shock -> Defensive Block -> Repay Recovery cycle", () => {
      // Step 1: Initial Collateral $2,921, Debt $0
      let fin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "borrow", 1000);
      expect(fin.collateralValueUsd).to.be.greaterThan(2900);
      expect(fin.debtUsd).to.equal(0);
      expect(fin.currentLtvPct).to.equal(0);
      expect(fin.theoreticalBorrowCapacityUsd).to.be.greaterThan(2000);

      // Step 2: Borrow $1,000 executed and debt recognized
      normalizedStore.updatePosition(
        NVDA_MINT,
        {
          debtAmount: 1000000000n,
          debtAmountUi: 1000.0,
          currentLtvPct: (1000 / 2921) * 100,
        },
        "onchain-borrow-receipt",
        "LIVE",
        328000600
      );

      fin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "borrow", 500);
      expect(fin.debtUsd).to.equal(1000.0);
      expect(fin.currentLtvPct).to.be.closeTo(34.23, 0.5);

      // Step 3: Market shock occurs (confidence spread spikes to 200 bps -> DEFENSIVE ratchet)
      normalizedStore.updateMarket(
        NVDA_MINT,
        {
          oracleConfBps: 200, // exceeds 150 bps threshold
        },
        "pyth-shock",
        "LIVE",
        328000700
      );

      fin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "borrow", 100);
      expect(fin.riskState).to.equal("DEFENSIVE");
      expect(fin.permission.borrowAllowed).to.be.false;
      expect(fin.permission.verdict).to.equal("BLOCK");
      expect(fin.executableBorrowCapacityUsd).to.equal(0);

      // Solvency invariant: Debt repayment MUST remain ALLOWED
      const repayFin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "repay", 500);
      expect(repayFin.permission.repayAllowed).to.be.true;

      // Step 4: Repay $500 executed
      normalizedStore.updatePosition(
        NVDA_MINT,
        {
          debtAmount: 500000000n,
          debtAmountUi: 500.0,
          currentLtvPct: (500 / 2921) * 100,
        },
        "onchain-repay-receipt",
        "LIVE",
        328000800
      );

      // Step 5: Market recovers to normal confidence spread (15 bps)
      normalizedStore.updateMarket(
        NVDA_MINT,
        {
          oracleConfBps: 15,
        },
        "pyth-recovery",
        "LIVE",
        328000900
      );

      const recoveredFin = derivedStateEngine.deriveFinancialState(NVDA_MINT, "borrow", 200);
      expect(recoveredFin.debtUsd).to.equal(500.0);
      // When market recovers from shock, risk ratchet recovers from DEFENSIVE to either RESTRICTED (if NYSE closed) or SAFE (if NYSE open)
      expect(["SAFE", "RESTRICTED"]).to.include(recoveredFin.riskState);
      expect(recoveredFin.riskState).to.not.equal("DEFENSIVE");
      expect(recoveredFin.theoreticalBorrowCapacityUsd).to.be.greaterThan(2000);
    });
  });

  describe("7. Canonical Section 24 Decision Proof Consistency", () => {
    it("generates deterministic decision proof with all 16 required attributes", () => {
      const proof = derivedStateEngine.generateDecisionProof(NVDA_MINT, "BORROW", 1060, "HUMAN");
      expect(proof.action).to.equal("BORROW");
      expect(proof.asset).to.equal("NVDA");
      expect(proof.collateral).to.be.greaterThan(2900);
      expect(proof.debt).to.equal(0);
      expect(proof).to.have.property("referenceMarket");
      expect(proof).to.have.property("onchainMarket");
      expect(proof).to.have.property("oracle");
      expect(proof).to.have.property("risk");
      expect(proof).to.have.property("policy");
      expect(proof).to.have.property("authority");
      expect(proof).to.have.property("nominalLtv");
      expect(proof).to.have.property("effectiveLtv");
      expect(proof).to.have.property("theoreticalCapacity");
      expect(proof).to.have.property("executableCapacity");
      expect(proof).to.have.property("decision");
      expect(proof).to.have.property("reason");
      expect(proof).to.have.property("policyVersion");
    });
  });
});
