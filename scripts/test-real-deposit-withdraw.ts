import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROGRAM_ID = new PublicKey("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");
const COLLATERAL_MINT = new PublicKey("CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq"); // NVDAx
const QUOTE_MINT = new PublicKey("23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc"); // USDC
const PRICE_UPDATE = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"); // Pyth NVDA

const UPGRADE_AUTH_SECRET = Uint8Array.from([
  184, 0, 156, 19, 64, 79, 32, 44, 114, 144, 87, 50, 135, 57, 173, 156,
  225, 188, 148, 105, 153, 63, 190, 89, 204, 76, 205, 160, 21, 44, 208, 119,
  209, 30, 9, 153, 59, 205, 199, 232, 53, 46, 211, 86, 216, 26, 22, 52,
  52, 167, 15, 98, 14, 33, 84, 170, 65, 77, 130, 192, 254, 200, 105, 68
]);

async function main() {
  console.log("=== TESTING REAL DEPOSIT & WITHDRAW ON SOLANA DEVNET ===");
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");

  const funderSecret = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), ".config", "solana", "id.json"), "utf8")
  );
  const funder = Keypair.fromSecretKey(Uint8Array.from(funderSecret));
  const mintAuth = Keypair.fromSecretKey(UPGRADE_AUTH_SECRET);
  console.log("Using funder:", funder.publicKey.toBase58());

  // Load client IDL
  const idlPath = path.resolve(__dirname, "../app/src/idl/circuit.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const provider = new AnchorProvider(conn, { publicKey: funder.publicKey } as any, { commitment: "confirmed" });
  const program = new Program(idl, provider);

  const [protocolConfig] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], PROGRAM_ID);
  const [assetConfig] = PublicKey.findProgramAddressSync([Buffer.from("asset"), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);
  const [position] = PublicKey.findProgramAddressSync([Buffer.from("position"), funder.publicKey.toBuffer(), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);
  const [ratchet] = PublicKey.findProgramAddressSync([Buffer.from("ratchet"), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);

  const collateralVault = getAssociatedTokenAddressSync(COLLATERAL_MINT, protocolConfig, true);
  const funderCollateralAta = getAssociatedTokenAddressSync(COLLATERAL_MINT, funder.publicKey, true);

  console.log("Protocol Config:", protocolConfig.toBase58());
  console.log("Asset Config:", assetConfig.toBase58());
  console.log("Position PDA:", position.toBase58());
  console.log("Collateral Vault:", collateralVault.toBase58());
  console.log("User Collateral ATA:", funderCollateralAta.toBase58());

  // 1. Ensure user has 10 NVDAx tokens
  console.log("\n1. Ensuring user has 10 NVDAx tokens...");
  const mintTx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      funder.publicKey,
      funderCollateralAta,
      funder.publicKey,
      COLLATERAL_MINT
    ),
    createMintToInstruction(
      COLLATERAL_MINT,
      funderCollateralAta,
      mintAuth.publicKey,
      10_000_000n // 10 NVDAx
    )
  );
  const mintSig = await sendAndConfirmTransaction(conn, mintTx, [funder, mintAuth], { commitment: "confirmed" });
  console.log("  ✓ Minted 10 NVDAx:", `https://explorer.solana.com/tx/${mintSig}?cluster=devnet`);

  // 2. Test DEPOSIT (2 NVDAx)
  console.log("\n2. Executing DEPOSIT of 2 NVDAx...");
  const depositIx = await program.methods
    .deposit(new BN(2_000_000))
    .accountsPartial({
      owner: funder.publicKey,
      protocolConfig,
      assetConfig,
      mint: COLLATERAL_MINT,
      position,
      userCollateralAta: funderCollateralAta,
      collateralVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const depositTx = new Transaction().add(depositIx);
  try {
    const depositSig = await sendAndConfirmTransaction(conn, depositTx, [funder], { commitment: "confirmed" });
    console.log("  ✓ DEPOSIT SUCCESSFUL! Tx:", `https://explorer.solana.com/tx/${depositSig}?cluster=devnet`);
  } catch (e: any) {
    console.error("  ✗ DEPOSIT FAILED:", e.message);
    if (e.logs) console.error("Logs:", e.logs);
    throw e;
  }

  // 3. Test WITHDRAW (1 NVDAx)
  console.log("\n3. Executing WITHDRAW of 1 NVDAx...");
  const withdrawIx = await program.methods
    .withdraw(new BN(1_000_000))
    .accountsPartial({
      owner: funder.publicKey,
      protocolConfig,
      assetConfig,
      position,
      priceUpdate: PRICE_UPDATE,
      collateralMint: COLLATERAL_MINT,
      quoteMint: QUOTE_MINT,
      userCollateralAta: funderCollateralAta,
      collateralVault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts([
      { pubkey: ratchet, isWritable: false, isSigner: false }
    ])
    .instruction();

  const withdrawTx = new Transaction().add(withdrawIx);
  try {
    const withdrawSig = await sendAndConfirmTransaction(conn, withdrawTx, [funder], { commitment: "confirmed" });
    console.log("  ✓ WITHDRAW SUCCESSFUL! Tx:", `https://explorer.solana.com/tx/${withdrawSig}?cluster=devnet`);
  } catch (e: any) {
    console.error("  ✗ WITHDRAW FAILED:", e.message);
    if (e.logs) console.error("Logs:", e.logs);
    throw e;
  }

  console.log("\n=== ALL DEPOSIT AND WITHDRAW TESTS PASSED ON SOLANA DEVNET ===");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
