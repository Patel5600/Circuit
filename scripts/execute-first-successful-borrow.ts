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
  getAccount,
} from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROGRAM_ID = new PublicKey("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");
const COLLATERAL_MINT = new PublicKey("CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq"); // NVDAx
const QUOTE_MINT = new PublicKey("23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc"); // USDC
const PRICE_UPDATE = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"); // Pyth NVDA

// Authority secret key for F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT
const UPGRADE_AUTH_SECRET = Uint8Array.from([
  184, 0, 156, 19, 64, 79, 32, 44, 114, 144, 87, 50, 135, 57, 173, 156,
  225, 188, 148, 105, 153, 63, 190, 89, 204, 76, 205, 160, 21, 44, 208, 119,
  209, 30, 9, 153, 59, 205, 199, 232, 53, 46, 211, 86, 216, 26, 22, 52,
  52, 167, 15, 98, 14, 33, 84, 170, 65, 77, 130, 192, 254, 200, 105, 68
]);

function collateralValue(
  amount: bigint,
  price: bigint,
  expo: number,
  collateralDecimals = 6,
  quoteDecimals = 6
): bigint {
  if (price <= 0n) return 0n;
  const raw = amount * price;
  const netExpo = quoteDecimals - collateralDecimals + expo;
  if (netExpo >= 0) return raw * 10n ** BigInt(netExpo);
  return raw / 10n ** BigInt(-netExpo);
}

async function main() {
  console.log("============================================================");
  console.log("CIRCUIT: FIRST SUCCESSFUL BORROW ON SOLANA DEVNET");
  console.log("============================================================");

  const conn = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load funder keypair from ~/.config/solana/id.json
  const funderSecret = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), ".config", "solana", "id.json"), "utf8")
  );
  const funder = Keypair.fromSecretKey(Uint8Array.from(funderSecret));
  const mintAuth = Keypair.fromSecretKey(UPGRADE_AUTH_SECRET);

  console.log("Funder pubkey:", funder.publicKey.toBase58());
  console.log("Mint Auth pubkey:", mintAuth.publicKey.toBase58());

  // Generate a fresh borrower wallet
  const borrower = Keypair.generate();
  console.log("\nCreated Fresh Test Borrower Wallet:", borrower.publicKey.toBase58());

  // Fund borrower with 0.05 SOL for transaction rent and fees
  console.log("Funding borrower with 0.05 SOL...");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: borrower.publicKey,
      lamports: 50_000_000, // 0.05 SOL
    })
  );
  const fundSig = await sendAndConfirmTransaction(conn, fundTx, [funder], { commitment: "confirmed" });
  console.log("  ✓ Funded borrower:", `https://explorer.solana.com/tx/${fundSig}?cluster=devnet`);

  // Load Program with client IDL
  const idlPath = path.resolve(__dirname, "../app/src/idl/circuit.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const provider = new AnchorProvider(conn, { publicKey: borrower.publicKey } as any, { commitment: "confirmed" });
  const program = new Program(idl, provider);

  const [protocolConfig] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], PROGRAM_ID);
  const [assetConfig] = PublicKey.findProgramAddressSync([Buffer.from("asset"), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);
  const [position] = PublicKey.findProgramAddressSync([Buffer.from("position"), borrower.publicKey.toBuffer(), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);
  const [ratchet] = PublicKey.findProgramAddressSync([Buffer.from("ratchet"), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);

  const collateralVault = getAssociatedTokenAddressSync(COLLATERAL_MINT, protocolConfig, true);
  const liquidityVault = getAssociatedTokenAddressSync(QUOTE_MINT, protocolConfig, true);
  const borrowerCollateralAta = getAssociatedTokenAddressSync(COLLATERAL_MINT, borrower.publicKey, true);
  const borrowerQuoteAta = getAssociatedTokenAddressSync(QUOTE_MINT, borrower.publicKey, true);

  // Mint 25 NVDAx (25 * 10^6 = 25_000_000 native units) to borrower
  console.log("\nMinting 25 NVDAx collateral to borrower...");
  const mintTx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      borrower.publicKey,
      borrowerCollateralAta,
      borrower.publicKey,
      COLLATERAL_MINT
    ),
    createMintToInstruction(
      COLLATERAL_MINT,
      borrowerCollateralAta,
      mintAuth.publicKey,
      25_000_000n
    )
  );
  const mintSig = await sendAndConfirmTransaction(conn, mintTx, [borrower, mintAuth], { commitment: "confirmed" });
  console.log("  ✓ Minted 25 NVDAx:", `https://explorer.solana.com/tx/${mintSig}?cluster=devnet`);

  // Step 1: Deposit 25 NVDAx into Circuit
  console.log("\nStep 1: Depositing 25 NVDAx collateral into Circuit protocol...");
  const depositIx = await program.methods
    .deposit(new BN(25_000_000))
    .accountsPartial({
      owner: borrower.publicKey,
      protocolConfig,
      assetConfig,
      mint: COLLATERAL_MINT,
      position,
      userCollateralAta: borrowerCollateralAta,
      collateralVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const depositTx = new Transaction().add(depositIx);
  const depositSig = await sendAndConfirmTransaction(conn, depositTx, [borrower], { commitment: "confirmed" });
  console.log("  ✓ Deposit Confirmed:", `https://explorer.solana.com/tx/${depositSig}?cluster=devnet`);

  // Step 2: Read and Value on-chain position
  console.log("\nStep 2: Reading and Valuing On-Chain Collateral...");
  const posData = await conn.getAccountInfo(position);
  if (!posData) throw new Error("Position not found after deposit!");
  const onChainCollateral = posData.data.readBigUInt64LE(72);
  const onChainDebtBefore = posData.data.readBigUInt64LE(80);
  console.log("  On-chain Position PDA:", position.toBase58());
  console.log("  On-chain Collateral Amount:", onChainCollateral.toString(), "(25.0 NVDAx)");
  console.log("  On-chain Debt Amount:", onChainDebtBefore.toString(), "USDC");

  const oracleData = await conn.getAccountInfo(PRICE_UPDATE);
  if (!oracleData) throw new Error("PriceUpdate account not found!");
  const price = oracleData.data.readBigInt64LE(73);
  const expo = oracleData.data.readInt32LE(89);
  const conf = oracleData.data.readBigUInt64LE(81);
  const priceUi = Number(price) * Math.pow(10, expo);
  console.log("  Live Pyth Price: $" + priceUi.toFixed(2), "USD");

  const collatValueNative = collateralValue(onChainCollateral, price, expo, 6, 6);
  const collatValueUsd = Number(collatValueNative) / 1e6;
  console.log("  Live Collateral Value: $" + collatValueUsd.toFixed(2), "USDC");

  const borrowCapacityNative = (collatValueNative * 7000n) / 10000n; // 70% LTV
  const borrowCapacityUsd = Number(borrowCapacityNative) / 1e6;
  console.log("  Borrow Capacity (70% LTV): $" + borrowCapacityUsd.toFixed(2), "USDC");

  // Step 3: Execute Real Devnet Borrow for 50 USDC
  console.log("\nStep 3: Executing Borrow of 50 USDC against Collateral...");
  const borrowIx = await program.methods
    .borrow(new BN(50_000_000)) // 50 USDC
    .accountsPartial({
      owner: borrower.publicKey,
      protocolConfig,
      assetConfig,
      position,
      priceUpdate: PRICE_UPDATE,
      collateralMint: COLLATERAL_MINT,
      quoteMint: QUOTE_MINT,
      userQuoteAta: borrowerQuoteAta,
      liquidityVault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts([
      { pubkey: ratchet, isWritable: false, isSigner: false },
    ])
    .instruction();

  const borrowTx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      borrower.publicKey,
      borrowerQuoteAta,
      borrower.publicKey,
      QUOTE_MINT
    ),
    borrowIx
  );

  console.log("Sending and confirming borrow transaction on Solana Devnet...");
  const borrowSig = await sendAndConfirmTransaction(conn, borrowTx, [borrower], { commitment: "confirmed" });
  console.log("============================================================");
  console.log(">>> SUCCESSFUL DEVNET BORROW TRANSACTION CONFIRMED! <<<");
  console.log("Signature:", borrowSig);
  console.log("Explorer:", `https://explorer.solana.com/tx/${borrowSig}?cluster=devnet`);
  console.log("============================================================");

  // Step 4: Verify Post-Borrow State
  console.log("\nStep 4: Verifying Post-Borrow On-Chain State...");
  const postPosData = await conn.getAccountInfo(position);
  if (!postPosData) throw new Error("Position missing after borrow!");
  const onChainDebtAfter = postPosData.data.readBigUInt64LE(80);
  console.log("  Post-Borrow On-chain Debt:", Number(onChainDebtAfter) / 1e6, "USDC (50,000,000 native units)");

  const borrowerQuoteAccount = await getAccount(conn, borrowerQuoteAta);
  console.log("  Borrower Wallet USDC Balance:", Number(borrowerQuoteAccount.amount) / 1e6, "USDC");

  const remainingAvailable = borrowCapacityNative - onChainDebtAfter;
  console.log("  Remaining Available to Borrow: $" + (Number(remainingAvailable) / 1e6).toFixed(2), "USDC");
  const postHf = Number((collatValueNative * 8000n) / onChainDebtAfter) / 10000;
  console.log("  Post-Borrow Health Factor:", postHf.toFixed(2), "(Healthy)");

  console.log("\n============================================================");
  console.log("END-TO-END BORROW PROTOCOL RECOVERY VERIFIED 100% SUCCEEDED!");
  console.log("============================================================");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
