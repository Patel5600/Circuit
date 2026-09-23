import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { BN, AnchorProvider, Program } from "@anchor-lang/core";
import {
  buildAuthorizeActionInstruction,
  buildConsumeEnvelopeInstruction,
  buildCloseEnvelopeInstruction,
  protocolConfigPda,
  assetConfigPda,
  riskRatchetPda,
  riskEnvelopePda,
  positionPda,
  agentAuthorityPda,
  VENUE_CREDIT,
  VENUE_METEORA_DBC,
  ENVELOPE_ACTION_BORROW,
  ENVELOPE_ACTION_SWAP,
} from "../app/src/lib/envelope";
import {
  buildAuthorizeActionInstruction as protoBuildAuthorize,
  buildConsumeEnvelopeInstruction as protoBuildConsume,
  buildCloseEnvelopeInstruction as protoBuildClose,
} from "../app/src/lib/protocol";
const idl = require("../app/src/idl/circuit.json");

describe("RiskEnvelope Instruction Builders & Re-exports", () => {
  it("re-exports instruction builders identically from protocol.ts", () => {
    expect(buildAuthorizeActionInstruction).to.equal(protoBuildAuthorize);
    expect(buildConsumeEnvelopeInstruction).to.equal(protoBuildConsume);
    expect(buildCloseEnvelopeInstruction).to.equal(protoBuildClose);
  });

  it("builds authorizeAction instruction with default PDAs", async () => {
    const dummyKeypair = Keypair.generate();
    const stubWallet = {
      publicKey: dummyKeypair.publicKey,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    };
    const connection = {
      getAccountInfo: async () => null,
      getLatestBlockhash: async () => ({
        blockhash: "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM",
        lastValidBlockHeight: 100,
      }),
    } as any;
    const provider = new AnchorProvider(connection, stubWallet as any, {
      commitment: "confirmed",
    });
    const program = new Program(idl as any, provider);

    const payer = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const actor = Keypair.generate().publicKey;
    const assetMint = Keypair.generate().publicKey;
    const priceUpdate = Keypair.generate().publicKey;
    const nonce = 12345n;

    const ix = await buildAuthorizeActionInstruction(program, {
      payer,
      owner,
      actor,
      assetMint,
      priceUpdate,
      action: ENVELOPE_ACTION_BORROW,
      venue: VENUE_CREDIT,
      requestedAmount: 500000000n,
      nonce,
      maxSlippageBps: 100,
      ttlSlots: 30,
    });

    expect(ix.programId.toBase58()).to.equal(program.programId.toBase58());
    expect(ix.keys.length).to.equal(11);

    const expectedProtocolConfig = protocolConfigPda(program.programId);
    const expectedAssetConfig = assetConfigPda(assetMint, program.programId);
    const expectedRatchet = riskRatchetPda(undefined, program.programId);
    const expectedEnvelope = riskEnvelopePda(owner, actor, assetMint, nonce, program.programId);
    const expectedPosition = positionPda(owner, assetMint, program.programId);
    const expectedAuthority = agentAuthorityPda(owner, actor, assetMint, program.programId);

    expect(ix.keys[0].pubkey.toBase58()).to.equal(payer.toBase58());
    expect(ix.keys[0].isSigner).to.be.true;
    expect(ix.keys[0].isWritable).to.be.true;

    expect(ix.keys[1].pubkey.toBase58()).to.equal(owner.toBase58());
    expect(ix.keys[1].isSigner).to.be.false;

    expect(ix.keys[2].pubkey.toBase58()).to.equal(actor.toBase58());
    expect(ix.keys[2].isSigner).to.be.true;

    expect(ix.keys[3].pubkey.toBase58()).to.equal(expectedProtocolConfig.toBase58());
    expect(ix.keys[4].pubkey.toBase58()).to.equal(expectedAssetConfig.toBase58());
    expect(ix.keys[5].pubkey.toBase58()).to.equal(expectedRatchet.toBase58());
    expect(ix.keys[6].pubkey.toBase58()).to.equal(expectedPosition.toBase58());
    expect(ix.keys[7].pubkey.toBase58()).to.equal(expectedAuthority.toBase58());
    expect(ix.keys[8].pubkey.toBase58()).to.equal(expectedEnvelope.toBase58());
    expect(ix.keys[8].isWritable).to.be.true;

    expect(ix.keys[9].pubkey.toBase58()).to.equal(priceUpdate.toBase58());
    expect(ix.keys[10].pubkey.toBase58()).to.equal(SystemProgram.programId.toBase58());
  });

  it("builds authorizeAction instruction with explicit position/authority overrides", async () => {
    const dummyKeypair = Keypair.generate();
    const stubWallet = {
      publicKey: dummyKeypair.publicKey,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    };
    const connection = {
      getAccountInfo: async () => null,
      getLatestBlockhash: async () => ({
        blockhash: "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM",
        lastValidBlockHeight: 100,
      }),
    } as any;
    const provider = new AnchorProvider(connection, stubWallet as any, {
      commitment: "confirmed",
    });
    const program = new Program(idl as any, provider);

    const payer = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const actor = Keypair.generate().publicKey;
    const assetMint = Keypair.generate().publicKey;
    const priceUpdate = Keypair.generate().publicKey;
    const customPosition = Keypair.generate().publicKey;
    const customAuthority = Keypair.generate().publicKey;

    const ix = await buildAuthorizeActionInstruction(program, {
      payer,
      owner,
      actor,
      assetMint,
      priceUpdate,
      action: ENVELOPE_ACTION_SWAP,
      venue: VENUE_METEORA_DBC,
      requestedAmount: new BN(1000000),
      nonce: new BN(999),
      position: customPosition,
      agentAuthority: customAuthority,
    });

    expect(ix.keys[6].pubkey.toBase58()).to.equal(customPosition.toBase58());
    expect(ix.keys[7].pubkey.toBase58()).to.equal(customAuthority.toBase58());
  });

  it("builds consumeEnvelope instruction", async () => {
    const dummyKeypair = Keypair.generate();
    const stubWallet = {
      publicKey: dummyKeypair.publicKey,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    };
    const connection = {
      getAccountInfo: async () => null,
      getLatestBlockhash: async () => ({
        blockhash: "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM",
        lastValidBlockHeight: 100,
      }),
    } as any;
    const provider = new AnchorProvider(connection, stubWallet as any, {
      commitment: "confirmed",
    });
    const program = new Program(idl as any, provider);

    const actor = Keypair.generate().publicKey;
    const envelope = Keypair.generate().publicKey;
    const expectedRatchet = riskRatchetPda(undefined, program.programId);

    const ix = await buildConsumeEnvelopeInstruction(program, {
      actor,
      envelope,
      action: ENVELOPE_ACTION_BORROW,
      venue: VENUE_CREDIT,
      amount: 500000000n,
    });

    expect(ix.programId.toBase58()).to.equal(program.programId.toBase58());
    expect(ix.keys.length).to.equal(3);
    expect(ix.keys[0].pubkey.toBase58()).to.equal(actor.toBase58());
    expect(ix.keys[0].isSigner).to.be.true;
    expect(ix.keys[1].pubkey.toBase58()).to.equal(envelope.toBase58());
    expect(ix.keys[1].isWritable).to.be.true;
    expect(ix.keys[2].pubkey.toBase58()).to.equal(expectedRatchet.toBase58());
  });

  it("builds closeEnvelope instruction", async () => {
    const dummyKeypair = Keypair.generate();
    const stubWallet = {
      publicKey: dummyKeypair.publicKey,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    };
    const connection = {
      getAccountInfo: async () => null,
      getLatestBlockhash: async () => ({
        blockhash: "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM",
        lastValidBlockHeight: 100,
      }),
    } as any;
    const provider = new AnchorProvider(connection, stubWallet as any, {
      commitment: "confirmed",
    });
    const program = new Program(idl as any, provider);

    const closer = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const envelope = Keypair.generate().publicKey;

    const ix = await buildCloseEnvelopeInstruction(program, {
      closer,
      owner,
      envelope,
    });

    expect(ix.programId.toBase58()).to.equal(program.programId.toBase58());
    expect(ix.keys.length).to.equal(3);
    expect(ix.keys[0].pubkey.toBase58()).to.equal(closer.toBase58());
    expect(ix.keys[0].isSigner).to.be.true;
    expect(ix.keys[1].pubkey.toBase58()).to.equal(owner.toBase58());
    expect(ix.keys[1].isWritable).to.be.true;
    expect(ix.keys[2].pubkey.toBase58()).to.equal(envelope.toBase58());
    expect(ix.keys[2].isWritable).to.be.true;
  });
});
