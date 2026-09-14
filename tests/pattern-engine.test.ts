import { expect } from "chai";
import { detectActivityPatterns } from "../app/src/lib/activity/pattern-engine";
import { ActivityEvent } from "../app/src/lib/domain/types";

describe("On-Chain Activity Pattern Engine Tests", () => {
  const now = Date.now();

  it("returns empty patterns when no events exist", () => {
    const patterns = detectActivityPatterns([]);
    expect(patterns).to.deep.equal([]);
  });

  it("detects RAPID_COLLATERAL_CHANGES for 3+ collateral events in 5 minutes", () => {
    const events: ActivityEvent[] = [
      {
        id: "ev-1",
        type: "DEPOSIT",
        action: "Deposit",
        assetSymbol: "NVDA",
        amountNative: 10_000_000n,
        amountUi: 10,
        status: "CONFIRMED",
        timestamp: now - 30_000,
        signature: "sig1",
        wallet: "wallet1",
      },
      {
        id: "ev-2",
        type: "DEPOSIT",
        action: "Deposit",
        assetSymbol: "GOOGL",
        amountNative: 5_000_000n,
        amountUi: 5,
        status: "CONFIRMED",
        timestamp: now - 60_000,
        signature: "sig2",
        wallet: "wallet1",
      },
      {
        id: "ev-3",
        type: "WITHDRAW",
        action: "Withdraw",
        assetSymbol: "NVDA",
        amountNative: 2_000_000n,
        amountUi: 2,
        status: "CONFIRMED",
        timestamp: now - 90_000,
        signature: "sig3",
        wallet: "wallet1",
      },
    ];

    const patterns = detectActivityPatterns(events);
    expect(patterns.some((p) => p.name === "RAPID COLLATERAL CHANGES")).to.be.true;
    const pat = patterns.find((p) => p.name === "RAPID COLLATERAL CHANGES")!;
    expect(pat.severity).to.equal("warning");
    expect(pat.affectedAssets).to.include("NVDA");
    expect(pat.affectedAssets).to.include("GOOGL");
  });

  it("detects RAPID_CREDIT_CYCLE when borrow and repay occur within 10 minutes", () => {
    const events: ActivityEvent[] = [
      {
        id: "ev-borrow",
        type: "BORROW",
        action: "Borrow",
        assetSymbol: "USDC",
        amountNative: 500_000_000n,
        amountUi: 500,
        status: "CONFIRMED",
        timestamp: now - 120_000,
        signature: "sigB",
        wallet: "wallet1",
      },
      {
        id: "ev-repay",
        type: "REPAY",
        action: "Repay",
        assetSymbol: "USDC",
        amountNative: 500_000_000n,
        amountUi: 500,
        status: "CONFIRMED",
        timestamp: now - 30_000,
        signature: "sigR",
        wallet: "wallet1",
      },
    ];

    const patterns = detectActivityPatterns(events);
    expect(patterns.some((p) => p.name === "RAPID CREDIT CYCLE")).to.be.true;
    const pat = patterns.find((p) => p.name === "RAPID CREDIT CYCLE")!;
    expect(pat.severity).to.equal("info");
  });

  it("detects REPEATED_TRANSACTION_REJECTIONS when 2+ actions fail within 15 minutes", () => {
    const events: ActivityEvent[] = [
      {
        id: "ev-f1",
        type: "BORROW",
        action: "Borrow",
        assetSymbol: "USDC",
        amountNative: 1000_000_000n,
        amountUi: 1000,
        status: "FAILED",
        timestamp: now - 60_000,
        signature: "sigF1",
        wallet: "wallet1",
      },
      {
        id: "ev-f2",
        type: "WITHDRAW",
        action: "Withdraw",
        assetSymbol: "NVDA",
        amountNative: 50_000_000n,
        amountUi: 50,
        status: "FAILED",
        timestamp: now - 120_000,
        signature: "sigF2",
        wallet: "wallet1",
      },
    ];

    const patterns = detectActivityPatterns(events);
    expect(patterns.some((p) => p.name === "REPEATED TRANSACTION REJECTIONS")).to.be.true;
    const pat = patterns.find((p) => p.name === "REPEATED TRANSACTION REJECTIONS")!;
    expect(pat.severity).to.equal("critical");
  });

  it("detects RESTRICTED-STATE INTERACTION when actions are attempted during DEFENSIVE or EMERGENCY", () => {
    const events: ActivityEvent[] = [
      {
        id: "ev-def",
        type: "BORROW",
        action: "Borrow",
        assetSymbol: "USDC",
        amountNative: 500_000_000n,
        amountUi: 500,
        status: "FAILED",
        timestamp: now - 10_000,
        signature: null,
        wallet: "wallet1",
        riskStateAtAction: "DEFENSIVE",
      },
    ];

    const patterns = detectActivityPatterns(events);
    expect(patterns.some((p) => p.name === "RESTRICTED-STATE INTERACTION")).to.be.true;
  });
});
