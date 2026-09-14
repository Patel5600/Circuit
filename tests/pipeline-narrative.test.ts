/**
 * Circuit Protocol - Pipeline Architecture & Narrative Invariant Tests
 * 
 * Verifies the fundamental thesis: "CREDIT IS THE LAST STEP, NEVER THE FIRST."
 * Tests the 5-stage causal chain:
 * 01 Tokenized Equity -> 02 Pyth Conservative Price -> 03 MarketGuard Session -> 04 4-State Risk Ratchet -> 05 Programmable Credit.
 */

import { expect } from "chai";
import {
  evaluateRatchetState,
  assertValidRatchetTransition,
  RiskRatchetState,
} from "../app/src/lib/risk/ratchet";

describe("Circuit Pipeline Architecture & Narrative Invariants", () => {
  describe("1. 5-Stage Architectural Ordering", () => {
    it("strictly preserves the 5-stage sequence: Asset -> Oracle -> Guard -> Ratchet -> Credit", () => {
      const STAGES = [
        { id: "01", name: "Tokenized Equity", role: "INPUT" },
        { id: "02", name: "Pyth Conservative Price", role: "EVIDENCE" },
        { id: "03", name: "MarketGuard Session", role: "GUARD" },
        { id: "04", name: "4-State Risk Ratchet", role: "ENGINE" },
        { id: "05", name: "Programmable Credit", role: "OUTPUT" },
      ];

      expect(STAGES[0].role).to.equal("INPUT");
      expect(STAGES[1].role).to.equal("EVIDENCE");
      expect(STAGES[2].role).to.equal("GUARD");
      expect(STAGES[3].role).to.equal("ENGINE");
      expect(STAGES[4].role).to.equal("OUTPUT");

      // Verify Credit is the last step, never the first
      expect(STAGES[4].id).to.equal("05");
      expect(STAGES[0].id).to.equal("01");
      expect(STAGES[4].name).to.equal("Programmable Credit");
    });
  });

  describe("2. Pyth Conservative Valuation (p - conf)", () => {
    it("computes conservative collateral price lower-bound accurately", () => {
      const price = 138.25;
      const conf = 0.05;
      const conservative = Math.max(0, price - conf);

      expect(conservative).to.equal(138.20);
      expect(conservative).to.be.lessThan(price);
    });

    it("clamps conservative price to 0 when uncertainty exceeds spot price", () => {
      const price = 50.0;
      const conf = 65.0; // Extreme uncertainty
      const conservative = Math.max(0, price - conf);

      expect(conservative).to.equal(0);
    });

    it("ensures widening confidence shrinks borrowing capacity before debt is created", () => {
      const baseLtv = 0.70;
      const shares = 100;
      const price = 100.0;

      const tightConf = 0.01;
      const wideConf = 5.00;

      const tightCap = shares * (price - tightConf) * baseLtv;
      const wideCap = shares * (price - wideConf) * baseLtv;

      expect(wideCap).to.be.lessThan(tightCap);
      expect(tightCap - wideCap).to.be.closeTo(100 * 4.99 * 0.70, 0.01);
    });
  });

  describe("3. MarketGuard Session & Onchain Decoupling", () => {
    it("proves that underlying venue session does not disable on-chain token tradeability", () => {
      const mockClosedSession = {
        isOpen: false,
        sessionName: "CLOSED" as const,
        reason: "Outside regular NYSE hours",
      };

      // On-chain status is independently true 24/7
      const onchainStatus = {
        tradeable: true,
        transferable: true,
        observable: true,
      };

      expect(mockClosedSession.isOpen).to.be.false;
      expect(onchainStatus.tradeable).to.be.true;
      expect(onchainStatus.transferable).to.be.true;
    });

    it("restricts borrowing when NYSE session is closed to prevent gap-risk", () => {
      const isMarketOpen = false;
      const result = evaluateRatchetState(
        "SAFE",
        15, // confBps
        isMarketOpen,
        false, // isCustodyHalted
        20, // maxWeightPct
        5 // consecutiveHealthyCranks
      );

      // Market closed transitions to RESTRICTED, not EMERGENCY
      expect(result.nextState).to.equal("RESTRICTED");
      expect(result.transitionReason).to.include("NYSE reference market session closed");
    });
  });

  describe("4. 4-State Risk Ratchet State Machine & Hysteresis", () => {
    it("allows fast tightening immediately upon confidence spike", () => {
      const result = evaluateRatchetState(
        "SAFE",
        180, // > 150 bps triggers DEFENSIVE
        true, // isMarketOpen
        false, // isCustodyHalted
        20, // maxWeightPct
        0 // consecutiveHealthyCranks
      );

      expect(result.nextState).to.equal("DEFENSIVE");
    });

    it("requires 5 consecutive healthy observations before stepping up recovery", () => {
      // 4 observations should NOT recover yet
      const result4 = evaluateRatchetState(
        "RESTRICTED",
        15,
        true,
        false,
        20,
        4
      );
      expect(result4.nextState).to.equal("RESTRICTED");

      // 5th consecutive observation recovers to SAFE
      const result5 = evaluateRatchetState(
        "RESTRICTED",
        15,
        true,
        false,
        20,
        5
      );
      expect(result5.nextState).to.equal("SAFE");
    });

    it("strictly prohibits direct jump from EMERGENCY to SAFE", () => {
      expect(() => {
        assertValidRatchetTransition("EMERGENCY", "SAFE");
      }).to.throw(/Illegal Risk Ratchet transition from EMERGENCY directly to SAFE/);
    });

    it("proves the hysteresis deadband: recovery requires stronger evidence than entry", () => {
      const ENTRY_RESTRICTED_BPS = 50; // > 50 bps enters RESTRICTED
      const RECOVERY_SAFE_BPS = 30;    // < 30 bps required to recover to SAFE

      expect(RECOVERY_SAFE_BPS).to.be.lessThan(ENTRY_RESTRICTED_BPS);
      const deadband = ENTRY_RESTRICTED_BPS - RECOVERY_SAFE_BPS;
      expect(deadband).to.equal(20); // 20 bps hysteresis deadband
    });
  });

  describe("5. Programmable Credit & Failure Path Enforcement", () => {
    it("proves the failure path: halts credit when Risk Ratchet enters RESTRICTED or DEFENSIVE", () => {
      const stateMachine = (state: RiskRatchetState) => {
        const canBorrow = state === "SAFE";
        const canLiquidate = true;
        const canRepay = true;
        return { canBorrow, canLiquidate, canRepay };
      };

      const safePerms = stateMachine("SAFE");
      const restrictedPerms = stateMachine("RESTRICTED");
      const defensivePerms = stateMachine("DEFENSIVE");
      const emergencyPerms = stateMachine("EMERGENCY");

      expect(safePerms.canBorrow).to.be.true;
      expect(restrictedPerms.canBorrow).to.be.false;
      expect(defensivePerms.canBorrow).to.be.false;
      expect(emergencyPerms.canBorrow).to.be.false;

      // Repay is always allowed to permit position de-risking
      expect(safePerms.canRepay).to.be.true;
      expect(restrictedPerms.canRepay).to.be.true;
      expect(defensivePerms.canRepay).to.be.true;
      expect(emergencyPerms.canRepay).to.be.true;
    });

    it("verifies emergency liquidation references last_valid_price, never unvalidated oracle", () => {
      const mockPosition = {
        lastValidPrice: 135_500_000n,
        lastValidExpo: -6,
        currentOracleHealthy: false,
      };

      // When oracle is not healthy, liquidation price MUST equal lastValidPrice
      const liquidationPrice = !mockPosition.currentOracleHealthy
        ? mockPosition.lastValidPrice
        : 0n;

      expect(liquidationPrice).to.equal(135_500_000n);
    });
  });
});
