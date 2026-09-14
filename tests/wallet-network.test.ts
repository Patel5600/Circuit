import { expect } from "chai";
import {
  getWalletStatus,
  formatSol,
  DEVNET_GENESIS_HASH,
} from "../app/src/lib/domain/wallet";

describe("Wallet State Machine & Network Safety Tests", () => {
  describe("1. Wallet State Transitions", () => {
    it("identifies WRONG_NETWORK as highest priority safety block", () => {
      const status = getWalletStatus({
        connected: true,
        connecting: false,
        isWrongNetwork: true,
        isRpcDegraded: false,
        isSigning: true,
      });
      expect(status).to.equal("WRONG_NETWORK");
    });

    it("identifies TX_SIGNING during active user signing approval", () => {
      const status = getWalletStatus({
        connected: true,
        connecting: false,
        isWrongNetwork: false,
        isRpcDegraded: false,
        isSigning: true,
      });
      expect(status).to.equal("TX_SIGNING");
    });

    it("identifies TX_CONFIRMING while awaiting block confirmation", () => {
      const status = getWalletStatus({
        connected: true,
        connecting: false,
        isWrongNetwork: false,
        isRpcDegraded: false,
        isConfirming: true,
      });
      expect(status).to.equal("TX_CONFIRMING");
    });

    it("identifies RPC_DEGRADED when connected but endpoints are degraded", () => {
      const status = getWalletStatus({
        connected: true,
        connecting: false,
        isWrongNetwork: false,
        isRpcDegraded: true,
      });
      expect(status).to.equal("RPC_DEGRADED");
    });

    it("identifies CONNECTED when safely attached to Devnet", () => {
      const status = getWalletStatus({
        connected: true,
        connecting: false,
        isWrongNetwork: false,
        isRpcDegraded: false,
      });
      expect(status).to.equal("CONNECTED");
    });

    it("identifies DISCONNECTED when no session is active", () => {
      const status = getWalletStatus({
        connected: false,
        connecting: false,
        isWrongNetwork: false,
        isRpcDegraded: false,
      });
      expect(status).to.equal("DISCONNECTED");
    });
  });

  describe("2. Devnet Balance Formatting", () => {
    it("formats 0 lamports as 0.00 SOL", () => {
      expect(formatSol(0n)).to.equal("0.00 SOL");
    });

    it("formats standard SOL balance accurately", () => {
      expect(formatSol(850_000_000n)).to.equal("0.85 SOL");
      expect(formatSol(2_500_000_000n)).to.equal("2.50 SOL");
    });

    it("clamps tiny non-zero lamports to <0.001 SOL", () => {
      expect(formatSol(50_000n)).to.equal("<0.001 SOL");
    });
  });

  describe("3. Cluster Verification Invariants", () => {
    it("binds to canonical Solana Devnet genesis hash", () => {
      expect(DEVNET_GENESIS_HASH).to.equal("EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
    });
  });
});
