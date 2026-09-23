import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  VENUE_CREDIT,
  VENUE_METEORA_DBC,
  VENUE_TRADING,
  ENVELOPE_ACTION_BORROW,
  ENVELOPE_ACTION_WITHDRAW,
  ENVELOPE_ACTION_SWAP,
  ENVELOPE_ACTION_ENTER_LIQUIDITY,
  ENVELOPE_ACTION_EXIT_LIQUIDITY,
  ENVELOPE_ACTION_REBALANCE,
  ENVELOPE_ACTION_REPAY,
  ENVELOPE_ACTION_DEPOSIT,
  DEFAULT_ENVELOPE_TTL_SLOTS,
  MAX_ENVELOPE_TTL_SLOTS,
  VENUE_LABELS,
  ACTION_LABELS,
  ENVELOPE_ACTION_LABELS,
  getVenueLabel,
  getActionLabel,
  RISK_ENVELOPE_DISCRIMINATOR,
  RISK_ENVELOPE_ACCOUNT_SIZE,
  RISK_ENVELOPE_DATA_SIZE,
  decodeRiskEnvelope,
  decodeRiskEnvelopeBuffer,
  riskEnvelopePda,
} from "../app/src/lib/envelope";

describe("RiskEnvelope Client Types & Decoders", () => {
  it("defines all constants matching onchain Rust", () => {
    expect(VENUE_CREDIT).to.equal(0);
    expect(VENUE_METEORA_DBC).to.equal(1);
    expect(VENUE_TRADING).to.equal(2);

    expect(ENVELOPE_ACTION_BORROW).to.equal(1);
    expect(ENVELOPE_ACTION_WITHDRAW).to.equal(2);
    expect(ENVELOPE_ACTION_SWAP).to.equal(3);
    expect(ENVELOPE_ACTION_ENTER_LIQUIDITY).to.equal(4);
    expect(ENVELOPE_ACTION_EXIT_LIQUIDITY).to.equal(5);
    expect(ENVELOPE_ACTION_REBALANCE).to.equal(6);
    expect(ENVELOPE_ACTION_REPAY).to.equal(7);
    expect(ENVELOPE_ACTION_DEPOSIT).to.equal(8);

    expect(DEFAULT_ENVELOPE_TTL_SLOTS).to.equal(20);
    expect(MAX_ENVELOPE_TTL_SLOTS).to.equal(100);
  });

  it("maps venue and action labels correctly", () => {
    expect(VENUE_LABELS[VENUE_CREDIT]).to.equal("Credit");
    expect(VENUE_LABELS[VENUE_METEORA_DBC]).to.equal("Meteora DBC");
    expect(VENUE_LABELS[VENUE_TRADING]).to.equal("Trading");

    expect(ACTION_LABELS[ENVELOPE_ACTION_BORROW]).to.equal("Borrow");
    expect(ACTION_LABELS[ENVELOPE_ACTION_WITHDRAW]).to.equal("Withdraw");
    expect(ACTION_LABELS[ENVELOPE_ACTION_SWAP]).to.equal("Swap");
    expect(ACTION_LABELS[ENVELOPE_ACTION_ENTER_LIQUIDITY]).to.equal("Enter Liquidity");
    expect(ACTION_LABELS[ENVELOPE_ACTION_EXIT_LIQUIDITY]).to.equal("Exit Liquidity");
    expect(ACTION_LABELS[ENVELOPE_ACTION_REBALANCE]).to.equal("Rebalance");
    expect(ACTION_LABELS[ENVELOPE_ACTION_REPAY]).to.equal("Repay");
    expect(ACTION_LABELS[ENVELOPE_ACTION_DEPOSIT]).to.equal("Deposit");

    expect(ENVELOPE_ACTION_LABELS).to.deep.equal(ACTION_LABELS);
    expect(getVenueLabel(VENUE_CREDIT)).to.equal("Credit");
    expect(getActionLabel(ENVELOPE_ACTION_SWAP)).to.equal("Swap");
  });

  it("decodes binary buffer containing full 203-byte account data", () => {
    const owner = new PublicKey("11111111111111111111111111111112");
    const actor = new PublicKey("11111111111111111111111111111113");
    const assetMint = new PublicKey("11111111111111111111111111111114");
    const nonce = 77n;

    const buf = Buffer.alloc(RISK_ENVELOPE_ACCOUNT_SIZE);
    RISK_ENVELOPE_DISCRIMINATOR.forEach((b, i) => {
      buf[i] = b;
    });
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    buf.set(owner.toBuffer(), 8);
    buf.set(actor.toBuffer(), 40);
    buf.set(assetMint.toBuffer(), 72);
    view.setUint8(104, VENUE_METEORA_DBC);
    view.setUint8(105, ENVELOPE_ACTION_SWAP);
    view.setBigUint64(106, 250_000_000n, true);
    view.setBigUint64(114, 7000n, true);
    view.setBigUint64(122, 120n, true);
    view.setUint8(130, 0); // safe
    view.setBigUint64(131, 3n, true);
    view.setBigUint64(139, 15n, true);
    view.setBigInt64(147, 4500000000n, true);
    view.setInt32(155, -6, true);
    view.setUint16(159, 1, true);
    view.setBigUint64(161, 10n, true);
    view.setBigUint64(169, 1000n, true);
    view.setBigUint64(177, 1020n, true);
    view.setBigUint64(185, nonce, true);
    view.setUint8(193, 0);
    view.setBigUint64(194, 0n, true);
    view.setUint8(202, 253);

    const decoded = decodeRiskEnvelopeBuffer(buf);
    expect(decoded.owner.toBase58()).to.equal(owner.toBase58());
    expect(decoded.actor.toBase58()).to.equal(actor.toBase58());
    expect(decoded.assetMint.toBase58()).to.equal(assetMint.toBase58());
    expect(decoded.venue).to.equal(VENUE_METEORA_DBC);
    expect(decoded.venueLabel).to.equal("Meteora DBC");
    expect(decoded.action).to.equal(ENVELOPE_ACTION_SWAP);
    expect(decoded.actionLabel).to.equal("Swap");
    expect(decoded.maxNotional).to.equal(250_000_000n);
    expect(decoded.maxLtvBps).to.equal(7000);
    expect(decoded.maxSlippageBps).to.equal(120);
    expect(decoded.riskState).to.equal("safe");
    expect(decoded.oracleFreshness).to.equal(3n);
    expect(decoded.confidenceLimitBps).to.equal(15n);
    expect(decoded.oraclePrice).to.equal(4500000000n);
    expect(decoded.oracleExpo).to.equal(-6);
    expect(decoded.policyVersion).to.equal(1);
    expect(decoded.riskEpoch).to.equal(10n);
    expect(decoded.authorizedAtSlot).to.equal(1000n);
    expect(decoded.expiresAtSlot).to.equal(1020n);
    expect(decoded.nonce).to.equal(77n);
    expect(decoded.consumed).to.equal(false);
    expect(decoded.consumedAtSlot).to.equal(0n);
    expect(decoded.bump).to.equal(253);

    const expectedPda = riskEnvelopePda(owner, actor, assetMint, nonce);
    expect(decoded.address.toBase58()).to.equal(expectedPda.toBase58());
  });

  it("decodes raw struct without discriminator and object representations", () => {
    const owner = new PublicKey("11111111111111111111111111111112");
    const actor = new PublicKey("11111111111111111111111111111113");
    const assetMint = new PublicKey("11111111111111111111111111111114");

    const rawObj = {
      owner,
      actor,
      assetMint,
      venue: VENUE_TRADING,
      action: ENVELOPE_ACTION_REBALANCE,
      maxNotional: "999000",
      maxLtvBps: 4500,
      maxSlippageBps: 200,
      riskState: "defensive",
      oracleFreshness: 12n,
      confidenceLimitBps: 40n,
      oraclePrice: "100000000",
      oracleExpo: -8,
      policyVersion: 3,
      riskEpoch: 101n,
      authorizedAtSlot: 5000n,
      expiresAtSlot: 5020n,
      nonce: 1n,
      consumed: true,
      consumedAtSlot: 5015n,
      bump: 255,
    };

    const decoded = decodeRiskEnvelope(rawObj);
    expect(decoded.venue).to.equal(VENUE_TRADING);
    expect(decoded.venueLabel).to.equal("Trading");
    expect(decoded.action).to.equal(ENVELOPE_ACTION_REBALANCE);
    expect(decoded.actionLabel).to.equal("Rebalance");
    expect(decoded.riskState).to.equal("defensive");
    expect(decoded.maxNotional).to.equal(999000n);
    expect(decoded.consumed).to.equal(true);
    expect(decoded.consumedAtSlot).to.equal(5015n);
  });
});
