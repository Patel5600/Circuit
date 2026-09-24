import { expect } from "chai";
import {
  VENUE_REGISTRY,
  getVenueAdapter,
  listAllVenues,
  CircuitNativeAdapter,
  MeteoraDbcAdapter,
  KaminoAdapter,
  JupiterAdapter,
} from "../app/src/lib/venues";

describe("Circuit Capital Venues Adapter Suite (Phase 5)", () => {
  it("registers all four canonical capital execution and liquidity venues", () => {
    const venues = listAllVenues();
    expect(venues.length).to.equal(4);

    const ids = venues.map((v) => v.id);
    expect(ids).to.include("circuit-native");
    expect(ids).to.include("meteora-dbc");
    expect(ids).to.include("kamino");
    expect(ids).to.include("jupiter");
  });

  describe("Circuit Native Credit Adapter", () => {
    const adapter = getVenueAdapter("circuit-native") as CircuitNativeAdapter;

    it("verifies live Devnet lending capabilities", () => {
      const caps = adapter.getCapabilities();
      expect(caps.deploymentStatus).to.equal("LIVE_DEVNET");
      expect(caps.supportsBorrow).to.be.true;
      expect(caps.supportsRepay).to.be.true;
      expect(caps.supportsDeposit).to.be.true;
      expect(caps.supportsWithdraw).to.be.true;
      expect(caps.supportsSwap).to.be.false;
    });

    it("reports real liquidity in Devnet vault", async () => {
      const liq = await adapter.getLiquidity("23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc");
      expect(liq > 1_000_000_000_000n).to.be.true; // > 1,000,000 USDC
    });

    it("generates honest fee-adjusted borrow quote", async () => {
      const quote = await adapter.quoteAction({
        action: "borrow",
        assetMint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
        quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
        amountNative: 100_000_000n, // 100 USDC
      });
      expect(quote.isAvailable).to.be.true;
      expect(quote.feeNative).to.equal(250_000n); // 0.25 USDC (25 bps)
      expect(quote.expectedOutAmount).to.equal(99_750_000n);
    });
  });

  describe("Meteora DBC Adapter", () => {
    const adapter = getVenueAdapter("meteora-dbc") as MeteoraDbcAdapter;

    it("verifies live Devnet bonding curve capabilities", () => {
      const caps = adapter.getCapabilities();
      expect(caps.deploymentStatus).to.equal("LIVE_DEVNET");
      expect(caps.supportsBorrow).to.be.false;
      expect(caps.supportsRepay).to.be.false;
      expect(caps.supportsSwap).to.be.true;
      expect(caps.supportsLiquidityProvision).to.be.true;
    });

    it("quotes swap action with dynamic curve fee and slippage", async () => {
      const quote = await adapter.quoteAction({
        action: "swap",
        assetMint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
        quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
        amountNative: 1_000_000n,
        slippageBps: 50,
      });
      expect(quote.isAvailable).to.be.true;
      expect(quote.feeNative).to.equal(10_000n); // 1% DBC LP fee
    });

    it("strictly rejects lending operations through bonding curve", async () => {
      try {
        await adapter.buildAction({} as any, {
          action: "borrow",
          assetMint: "",
          quoteMint: "",
          amountNative: 100n,
        });
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.message).to.include("does not support lending actions");
      }
    });
  });

  describe("Kamino Lend Adapter", () => {
    const adapter = getVenueAdapter("kamino") as KaminoAdapter;

    it("reports honest UNSUPPORTED_ON_DEVNET status", () => {
      const caps = adapter.getCapabilities();
      expect(caps.deploymentStatus).to.equal("UNSUPPORTED_ON_DEVNET");
      expect(caps.statusReason).to.include("Mainnet-only");
    });

    it("returns unavailable quote with transparent reason", async () => {
      const quote = await adapter.quoteAction({
        action: "borrow",
        assetMint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
        quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
        amountNative: 50_000_000n,
      });
      expect(quote.isAvailable).to.be.false;
      expect(quote.unavailableReason).to.include("unsupported on Devnet");
    });

    it("strictly refuses to generate fake Devnet transactions", async () => {
      try {
        await adapter.buildAction({} as any, {
          action: "borrow",
          assetMint: "",
          quoteMint: "",
          amountNative: 100n,
        });
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.message).to.include("unsupported on Devnet");
      }
    });
  });

  describe("Jupiter Lend & Swap Adapter", () => {
    const adapter = getVenueAdapter("jupiter") as JupiterAdapter;

    it("reports honest UNSUPPORTED_ON_DEVNET status", () => {
      const caps = adapter.getCapabilities();
      expect(caps.deploymentStatus).to.equal("UNSUPPORTED_ON_DEVNET");
      expect(caps.statusReason).to.include("Mainnet-only");
    });

    it("returns unavailable quote with transparent reason", async () => {
      const quote = await adapter.quoteAction({
        action: "borrow",
        assetMint: "CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq",
        quoteMint: "23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc",
        amountNative: 50_000_000n,
      });
      expect(quote.isAvailable).to.be.false;
      expect(quote.unavailableReason).to.include("unsupported on Devnet");
    });

    it("strictly refuses to generate fake Devnet transactions", async () => {
      try {
        await adapter.buildAction({} as any, {
          action: "borrow",
          assetMint: "",
          quoteMint: "",
          amountNative: 100n,
        });
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.message).to.include("unsupported on Devnet");
      }
    });
  });
});
