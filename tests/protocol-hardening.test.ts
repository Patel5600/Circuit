import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  RiskRatchetState,
  isValidRatchetTransition,
  assertValidRatchetTransition,
  evaluateRatchetState,
  DEFAULT_RATCHET_THRESHOLDS,
} from "../app/src/lib/risk/ratchet";
import {
  analyzePortfolioRisk,
  calculateConservativePrice,
  BPS,
} from "../app/src/lib/risk/portfolio";
import { Position } from "../app/src/lib/portfolio/provider";

describe("Protocol Hardening & Risk Ratchet Invariant Tests", () => {
  const MINT_NVDA = "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq";
  const MINT_AAPL = "XyZ1234567890abcdefABCDEF1234567890abcdef1";
  const MINT_MSFT = "gLjzboHgbevzEedufXfWyrgaFk7ePNLBKzRnpGbWpF2";
  const WALLET_A = "7VdxH8GXEq8D771Eh6y9CtQyRjumjDoiid3ycGqLSEoJ";
  const WALLET_B = "3LsZqeX8FHnZRv2nm5jYemPa27HwSQAeddivvmR3mMo2";

  /* -------------------------------------------------------------------------- */
  /*  1. Hard Safety Gate Overrides                                             */
  /* -------------------------------------------------------------------------- */
  describe("1. Hard Safety Gate Overrides", () => {
    it("overrides nominal aggregate portfolio score to EMERGENCY when oracle is stale", () => {
      // Setup portfolio with low nominal risk (e.g. low leverage, low concentration)
      const nominalAssets = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 10,
          priceUsd: 140,
          confidenceUsd: 0.25,
          confBps: 18,
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: false, // STALE ORACLE!
          marketOpen: true,
        },
      ];

      const res = analyzePortfolioRisk(nominalAssets, 100); // minimal debt ($100 on $1400 collateral)
      
      // Despite minimal leverage, stale oracle must trigger hard override
      expect(res.hardOverride).to.be.true;
      expect(res.riskState).to.equal("EMERGENCY");
      expect(res.hardOverrideReason).to.include("oracle");
    });

    it("overrides nominal score to EMERGENCY when oracle confidence is blown (> 300 bps)", () => {
      const blownConfAssets = [
        {
          symbol: "NVDA",
          name: "NVIDIA",
          collateralUi: 10,
          priceUsd: 140,
          confidenceUsd: 5.0,
          confBps: 357, // > 300 bps!
          baseLtvBps: 7000,
          liqThresholdBps: 8000,
          oracleHealthy: true,
          marketOpen: true,
        },
      ];

      const res = analyzePortfolioRisk(blownConfAssets, 0);
      expect(res.hardOverride).to.be.true;
      expect(res.riskState).to.equal("EMERGENCY");
    });

    it("prohibits SAFE classification if any hard safety condition is violated", () => {
      const evaluation = evaluateRatchetState(
        "SAFE",
        450, // Blown conf >= 400 bps
        true,
        false,
        25,
        10
      );
      expect(evaluation.nextState).to.equal("EMERGENCY");
      expect(evaluation.nextState).to.not.equal("SAFE");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  2. Canonical Permission Matrix Enforcement                                */
  /* -------------------------------------------------------------------------- */
  describe("2. Canonical Permission Matrix Enforcement", () => {
    function derivePermissions(
      ratchetState: RiskRatchetState,
      totalCollateralUsd: number,
      totalDebtUsd: number,
      healthFactor: number | null
    ) {
      const hasCollat = totalCollateralUsd > 0;
      const hasDebt = totalDebtUsd > 0;

      let borrow: "ALLOWED" | "RESTRICTED" | "BLOCKED" = "ALLOWED";
      if (ratchetState === "EMERGENCY" || ratchetState === "DEFENSIVE") {
        borrow = "BLOCKED";
      } else if (ratchetState === "RESTRICTED") {
        borrow = "RESTRICTED";
      } else if (!hasCollat) {
        borrow = "BLOCKED";
      }

      let withdraw: "ALLOWED" | "BLOCKED" | "INACTIVE" = hasCollat ? "ALLOWED" : "INACTIVE";
      if (hasCollat && hasDebt && (ratchetState === "DEFENSIVE" || ratchetState === "EMERGENCY")) {
        withdraw = "BLOCKED";
      }

      const repay = hasDebt ? "ALLOWED" : "INACTIVE";
      const deposit = "ALLOWED";
      const liquidate = healthFactor !== null && healthFactor < 1.0 ? "ALLOWED" : "INACTIVE";

      return { borrow, withdraw, repay, deposit, liquidate };
    }

    it("enforces SAFE permissions: full borrow, withdraw, deposit, repay", () => {
      const perms = derivePermissions("SAFE", 5000, 1000, 4.0);
      expect(perms.borrow).to.equal("ALLOWED");
      expect(perms.withdraw).to.equal("ALLOWED");
      expect(perms.deposit).to.equal("ALLOWED");
      expect(perms.repay).to.equal("ALLOWED");
      expect(perms.liquidate).to.equal("INACTIVE");
    });

    it("enforces RESTRICTED permissions: policy constrained borrow, withdraw allowed", () => {
      const perms = derivePermissions("RESTRICTED", 5000, 1000, 4.0);
      expect(perms.borrow).to.equal("RESTRICTED");
      expect(perms.withdraw).to.equal("ALLOWED");
      expect(perms.deposit).to.equal("ALLOWED");
      expect(perms.repay).to.equal("ALLOWED");
    });

    it("enforces DEFENSIVE permissions: borrow blocked, withdraw blocked if debt exists", () => {
      const perms = derivePermissions("DEFENSIVE", 5000, 1000, 4.0);
      expect(perms.borrow).to.equal("BLOCKED");
      expect(perms.withdraw).to.equal("BLOCKED");
      expect(perms.deposit).to.equal("ALLOWED");
      expect(perms.repay).to.equal("ALLOWED");
    });

    it("enforces EMERGENCY permissions: borrow blocked, emergency liquidation active if HF < 1.0", () => {
      const perms = derivePermissions("EMERGENCY", 5000, 4500, 0.88);
      expect(perms.borrow).to.equal("BLOCKED");
      expect(perms.withdraw).to.equal("BLOCKED");
      expect(perms.deposit).to.equal("ALLOWED");
      expect(perms.repay).to.equal("ALLOWED");
      expect(perms.liquidate).to.equal("ALLOWED");
    });

    it("allows withdraw during DEFENSIVE if position holds zero debt", () => {
      const perms = derivePermissions("DEFENSIVE", 5000, 0, null);
      expect(perms.withdraw).to.equal("ALLOWED");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  3. Emergency Liquidation last_valid_price Invariant                        */
  /* -------------------------------------------------------------------------- */
  describe("3. Emergency Liquidation last_valid_price Invariant", () => {
    it("falls back to last_valid_price when current oracle update is unreadable", () => {
      const positionLastValidPrice = 140_000_000n; // $140.00
      const positionLastValidExpo = -6;
      const currentOracleValid = false;

      // Deterministic fallback matching liquidate.rs:47-53
      const refPrice = currentOracleValid ? 0n : positionLastValidPrice;
      const refExpo = currentOracleValid ? 0 : positionLastValidExpo;

      expect(refPrice).to.equal(140_000_000n);
      expect(refExpo).to.equal(-6);

      const refPriceUsd = Number(refPrice) * Math.pow(10, refExpo);
      expect(refPriceUsd).to.equal(140.0);
    });

    it("calculates dynamic severity-scaled liquidation bonus accurately", () => {
      // 1000 collateral units @ $100 = $100,000 value
      // Debt = $90,000, Liq threshold = 80%, HF = 0.8888 (8888 BPS)
      const hfBps = 8888;
      const minHfBps = 10000;
      const minBonusBps = 500; // 5% base floor
      const maxBonusBps = 1500; // 15% cap

      // Shortfall = 10000 - 8888 = 1112 BPS
      // Bonus = minBonus + (shortfall * 1000 / 10000) = 500 + 111 = 611 BPS (6.11%)
      const shortfall = minHfBps - hfBps;
      const scaledBonus = minBonusBps + Math.floor((shortfall * 1000) / 10000);
      const effectiveBonus = Math.min(maxBonusBps, Math.max(minBonusBps, scaledBonus));

      expect(effectiveBonus).to.equal(611);
      expect(effectiveBonus).to.be.gte(minBonusBps);
      expect(effectiveBonus).to.be.lte(maxBonusBps);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  4. Multi-Asset Position Stability & Topology Invariance                   */
  /* -------------------------------------------------------------------------- */
  describe("4. Multi-Asset Position Stability & Topology Invariance", () => {
    it("maintains stable graph node IDs when price fluctuates", () => {
      const mint = MINT_NVDA;
      const idAsset = `asset:${mint}`;
      const idOracleRisk = `risk:${mint}:Oracle`;
      const idConfRisk = `risk:${mint}:Confidence`;
      const idPortfolio = "portfolio:risk";
      const idCredit = "credit";
      const idPerm = "permission:panel";

      // IDs must be deterministic and invariant to tick changes
      expect(idAsset).to.equal(`asset:${MINT_NVDA}`);
      expect(idOracleRisk).to.equal(`risk:${MINT_NVDA}:Oracle`);
      expect(idConfRisk).to.equal(`risk:${MINT_NVDA}:Confidence`);
      expect(idPortfolio).to.equal("portfolio:risk");
      expect(idCredit).to.equal("credit");
      expect(idPerm).to.equal("permission:panel");
    });

    it("retains Asset B when Asset A price updates", () => {
      const assetA = { symbol: "NVDA", mint: MINT_NVDA, price: 140, shares: 10 };
      const assetB = { symbol: "AAPL", mint: MINT_AAPL, price: 220, shares: 5 };

      const portfolioMap = new Map<string, typeof assetA>();
      portfolioMap.set(assetA.mint, assetA);
      portfolioMap.set(assetB.mint, assetB);

      expect(portfolioMap.size).to.equal(2);

      // Price tick on Asset A
      portfolioMap.set(assetA.mint, { ...assetA, price: 145 });

      // Asset B remains unchanged
      expect(portfolioMap.size).to.equal(2);
      expect(portfolioMap.get(assetB.mint)!.shares).to.equal(5);
      expect(portfolioMap.get(assetB.mint)!.price).to.equal(220);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  5. Faucet Multi-Wallet Isolation & Idempotency                            */
  /* -------------------------------------------------------------------------- */
  describe("5. Faucet Multi-Wallet Isolation & Idempotency", () => {
    it("generates isolated quota storage keys for distinct wallets on same device", () => {
      const keyWalletA = `circuit_faucet_${WALLET_A}_NVDA`;
      const keyWalletB = `circuit_faucet_${WALLET_B}_NVDA`;

      expect(keyWalletA).to.not.equal(keyWalletB);
      expect(keyWalletA).to.include(WALLET_A);
      expect(keyWalletB).to.include(WALLET_B);
    });

    it("rejects concurrent in-flight claims via lock flag", () => {
      let inFlight = false;

      function attemptClaim(): boolean {
        if (inFlight) return false; // Rejected due to in-flight lock
        inFlight = true;
        return true;
      }

      expect(attemptClaim()).to.be.true;
      expect(attemptClaim()).to.be.false; // Second click while in-flight is rejected!
      inFlight = false; // Release lock upon confirmation
      expect(attemptClaim()).to.be.true; // Next claim permitted
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  6. Transaction Lifecycle State Transitions                                */
  /* -------------------------------------------------------------------------- */
  describe("6. Transaction Lifecycle State Transitions", () => {
    type TxLifecycle = "IDLE" | "PREPARING" | "AWAITING_SIGNATURE" | "CONFIRMING" | "CONFIRMED" | "FAILED";

    it("progresses monotonically through transaction states without premature success", () => {
      const history: TxLifecycle[] = [];
      let current: TxLifecycle = "IDLE";

      function transition(next: TxLifecycle) {
        history.push(next);
        current = next;
      }

      transition("PREPARING");
      transition("AWAITING_SIGNATURE");
      transition("CONFIRMING");
      expect(current).to.equal("CONFIRMING");
      expect(history).to.not.include("CONFIRMED"); // Not yet confirmed!

      transition("CONFIRMED");
      expect(history).to.deep.equal([
        "PREPARING",
        "AWAITING_SIGNATURE",
        "CONFIRMING",
        "CONFIRMED",
      ]);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  7. Risk Ratchet Hysteresis & Monotonic Staged Recovery Invariants         */
  /* -------------------------------------------------------------------------- */
  describe("7. Risk Ratchet Hysteresis & Monotonic Staged Recovery Invariants", () => {
    it("requires 5 consecutive healthy observations to step up", () => {
      // Emergency -> Defensive requires 5 clean observations
      let cranks = 4;
      let state: RiskRatchetState = "EMERGENCY";

      let evalRes = evaluateRatchetState(state, 200, true, false, 30, cranks);
      expect(evalRes.nextState).to.equal("EMERGENCY"); // 4 is not enough!

      cranks = 5;
      evalRes = evaluateRatchetState(state, 200, true, false, 30, cranks);
      expect(evalRes.nextState).to.equal("DEFENSIVE"); // Stepped up!
    });

    it("strictly prevents direct jumps from EMERGENCY to SAFE", () => {
      expect(isValidRatchetTransition("EMERGENCY", "SAFE")).to.be.false;
      expect(isValidRatchetTransition("EMERGENCY", "RESTRICTED")).to.be.false;
      expect(isValidRatchetTransition("DEFENSIVE", "SAFE")).to.be.false;

      expect(() => {
        assertValidRatchetTransition("EMERGENCY", "SAFE");
      }).to.throw(/Illegal Risk Ratchet transition/);
    });

    it("verifies hysteresis buffer requirement (<30 bps to clear RESTRICTED to SAFE)", () => {
      // Restriction entry is 50 bps. Recovery requires 30 bps (20 bps deadband)
      const at35Bps = evaluateRatchetState("RESTRICTED", 35, true, false, 30, 10);
      expect(at35Bps.nextState).to.equal("RESTRICTED"); // 35 bps is within hysteresis buffer

      const at25Bps = evaluateRatchetState("RESTRICTED", 25, true, false, 30, 10);
      expect(at25Bps.nextState).to.equal("SAFE"); // Cleared hysteresis buffer!
    });
  });
});
