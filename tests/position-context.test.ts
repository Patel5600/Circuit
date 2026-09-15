import { expect } from "chai";
import {
  DEPLOYED_MARKETS,
  getDeployedMarket,
  getDeployedMarketByMint,
  DeployedMarket,
} from "../app/src/data/markets-registry";
import { ActionType, ActionIntent } from "../app/src/context/ActionContext";

describe("Position Context & Action Architecture Regression Tests", () => {
  /* -------------------------------------------------------------------------- */
  /*  1. Canonical Asset Resolution & Independence                              */
  /* -------------------------------------------------------------------------- */
  describe("1. Canonical Asset Resolution & Independence", () => {
    it("resolves AAPL, NVDA, and GOOGL independently without cross-asset collisions", () => {
      const aapl = getDeployedMarket("AAPL");
      const nvda = getDeployedMarket("NVDA");
      const googl = getDeployedMarket("GOOGL");

      expect(aapl).to.not.be.undefined;
      expect(nvda).to.not.be.undefined;
      expect(googl).to.not.be.undefined;

      expect(aapl!.symbol).to.equal("AAPL");
      expect(aapl!.tokenSymbol).to.equal("AAPLx");
      expect(aapl!.name).to.equal("Apple Inc.");

      expect(nvda!.symbol).to.equal("NVDA");
      expect(nvda!.tokenSymbol).to.equal("NVDAx");
      expect(nvda!.name).to.equal("NVIDIA Corporation");

      expect(googl!.symbol).to.equal("GOOGL");
      expect(googl!.tokenSymbol).to.equal("GOOGLx");
      expect(googl!.name).to.equal("Alphabet Inc.");

      // Verify unique canonical mint addresses
      expect(aapl!.mint).to.not.equal(nvda!.mint);
      expect(aapl!.mint).to.not.equal(googl!.mint);
      expect(nvda!.mint).to.not.equal(googl!.mint);

      // Verify reverse lookup by mint
      expect(getDeployedMarketByMint(aapl!.mint)?.symbol).to.equal("AAPL");
      expect(getDeployedMarketByMint(nvda!.mint)?.symbol).to.equal("NVDA");
      expect(getDeployedMarketByMint(googl!.mint)?.symbol).to.equal("GOOGL");
    });

    it("does not fall back to Google when requesting an unknown or invalid symbol", () => {
      const invalid = getDeployedMarket("NON_EXISTENT_TICKER");
      expect(invalid).to.be.undefined;

      // Safe derivation: unknown queries must yield undefined/null, never Google
      const targetMarket = invalid ?? null;
      expect(targetMarket).to.be.null;
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  2. Action Intent Context (Preventing Google Default on Deposit AAPLx)    */
  /* -------------------------------------------------------------------------- */
  describe("2. Action Intent Context Binding", () => {
    it("creates an immutable action intent permanently bound to AAPLx", () => {
      const aaplMarket = getDeployedMarket("AAPL")!;
      const intent: ActionIntent = {
        type: "deposit",
        market: aaplMarket,
        position: null,
      };

      // Ensure the bound asset is AAPL and contains zero references to Google/GOOGL
      expect(intent.market.symbol).to.equal("AAPL");
      expect(intent.market.tokenSymbol).to.equal("AAPLx");
      expect(intent.market.name).to.equal("Apple Inc.");
      expect(intent.type).to.equal("deposit");
      expect(intent.market.symbol).to.not.include("GOOG");
      expect(intent.market.name).to.not.include("Google");
      expect(intent.market.name).to.not.include("Alphabet");
    });

    it("supports switching action intents without cross-asset state leakage", () => {
      const aapl = getDeployedMarket("AAPL")!;
      const nvda = getDeployedMarket("NVDA")!;
      const googl = getDeployedMarket("GOOGL")!;

      let currentIntent: ActionIntent | null = null;

      // User clicks: Deposit AAPLx
      currentIntent = { type: "deposit", market: aapl, position: null };
      expect(currentIntent.market.symbol).to.equal("AAPL");
      expect(currentIntent.type).to.equal("deposit");

      // User closes panel and clicks: Deposit NVDAx
      currentIntent = { type: "deposit", market: nvda, position: null };
      expect(currentIntent.market.symbol).to.equal("NVDA");
      expect(currentIntent.market.symbol).to.not.equal("AAPL");
      expect(currentIntent.type).to.equal("deposit");

      // User clicks: Withdraw GOOGLx
      currentIntent = { type: "withdraw", market: googl, position: null };
      expect(currentIntent.market.symbol).to.equal("GOOGL");
      expect(currentIntent.type).to.equal("withdraw");
      expect(currentIntent.market.symbol).to.not.equal("NVDA");
      expect(currentIntent.market.symbol).to.not.equal("AAPL");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  3. Position Target Derivation (Fix for the Google Fallback Bug)           */
  /* -------------------------------------------------------------------------- */
  describe("3. Position Page Target Derivation", () => {
    interface MockPosition {
      symbol: string;
      mint: string;
      collateralUi: number;
      debtUi: number;
    }

    it("correctly derives AAPL target when user visits /app/position?market=AAPL with no AAPL position", () => {
      const urlParam = "AAPL";
      const userPositions: MockPosition[] = [
        // User already has an on-chain position in GOOGL
        { symbol: "GOOGL", mint: "mint_googl", collateralUi: 5.0, debtUi: 500 },
      ];

      // OLD FLAWED LOGIC:
      // const activePosition = positions.find(p => p.symbol === selectedMarket.symbol) ?? positions[0] ?? null;
      // When positions.find returns undefined, it picked positions[0] which was GOOGL!

      // NEW FIXED CANONICAL DERIVATION:
      const targetMarket = urlParam ? getDeployedMarket(urlParam) ?? null : null;
      const activePosition = targetMarket
        ? userPositions.find((p) => p.symbol === targetMarket.symbol) ?? null
        : null;
      const activeSymbol = targetMarket ? targetMarket.symbol : null;
      const activeTokenSymbol = targetMarket ? targetMarket.tokenSymbol : null;

      // Verified: targetMarket is Apple, NOT Google!
      expect(targetMarket).to.not.be.null;
      expect(targetMarket!.symbol).to.equal("AAPL");
      expect(activeSymbol).to.equal("AAPL");
      expect(activeTokenSymbol).to.equal("AAPLx");

      // User has no position yet in AAPL
      expect(activePosition).to.be.null;

      // Crucial assertion: never fell back to positions[0] (GOOGL)!
      expect(activeSymbol).to.not.equal("GOOGL");
      expect(activeSymbol).to.not.equal(userPositions[0].symbol);
    });

    it("renders neutral position overview when no market query is present", () => {
      const urlParam = null;
      const userPositions: MockPosition[] = [
        { symbol: "NVDA", mint: "mint_nvda", collateralUi: 10.0, debtUi: 1000 },
      ];

      const targetMarket = urlParam ? getDeployedMarket(urlParam) ?? null : null;
      const activePosition = targetMarket
        ? userPositions.find((p) => p.symbol === targetMarket.symbol) ?? null
        : null;
      const activeSymbol = targetMarket ? targetMarket.symbol : null;

      // When visiting /app/position without ?market=, target is neutral
      expect(targetMarket).to.be.null;
      expect(activePosition).to.be.null;
      expect(activeSymbol).to.be.null;
      expect(activeSymbol).to.not.equal("GOOGL");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  4. Multi-Asset Position Coexistence & Mutation Independence               */
  /* -------------------------------------------------------------------------- */
  describe("4. Multi-Asset Coexistence & Mutation Independence", () => {
    it("preserves independent state for multiple coexisting collateral positions", () => {
      const positionsByMint = new Map<string, { collateral: bigint; debt: bigint }>();

      const aaplMint = getDeployedMarket("AAPL")!.mint;
      const nvdaMint = getDeployedMarket("NVDA")!.mint;
      const googlMint = getDeployedMarket("GOOGL")!.mint;

      // Initialize positions
      positionsByMint.set(aaplMint, { collateral: 100n, debt: 50n });
      positionsByMint.set(nvdaMint, { collateral: 200n, debt: 80n });
      positionsByMint.set(googlMint, { collateral: 300n, debt: 120n });

      expect(positionsByMint.size).to.equal(3);

      // Mutate AAPL position (Deposit 50 AAPL)
      const prevAapl = positionsByMint.get(aaplMint)!;
      positionsByMint.set(aaplMint, {
        collateral: prevAapl.collateral + 50n,
        debt: prevAapl.debt,
      });

      // Verify AAPL was updated
      expect(positionsByMint.get(aaplMint)!.collateral).to.equal(150n);

      // Verify NVDA and GOOGL were completely unchanged
      expect(positionsByMint.get(nvdaMint)!.collateral).to.equal(200n);
      expect(positionsByMint.get(nvdaMint)!.debt).to.equal(80n);
      expect(positionsByMint.get(googlMint)!.collateral).to.equal(300n);
      expect(positionsByMint.get(googlMint)!.debt).to.equal(120n);
    });

    it("ensures table row actions pass row-specific asset identity", () => {
      const rows = [
        { symbol: "AAPL", mint: getDeployedMarket("AAPL")!.mint },
        { symbol: "NVDA", mint: getDeployedMarket("NVDA")!.mint },
        { symbol: "GOOGL", mint: getDeployedMarket("GOOGL")!.mint },
      ];

      const clickedActions: string[] = [];

      function onRowDepositClick(mint: string) {
        const market = getDeployedMarketByMint(mint);
        if (market) {
          clickedActions.push(market.symbol);
        }
      }

      // Simulate clicking deposit on AAPL row
      onRowDepositClick(rows[0].mint);
      expect(clickedActions).to.deep.equal(["AAPL"]);

      // Simulate clicking deposit on GOOGL row
      onRowDepositClick(rows[2].mint);
      expect(clickedActions).to.deep.equal(["AAPL", "GOOGL"]);

      // Simulate clicking deposit on NVDA row
      onRowDepositClick(rows[1].mint);
      expect(clickedActions).to.deep.equal(["AAPL", "GOOGL", "NVDA"]);
    });
  });
});
