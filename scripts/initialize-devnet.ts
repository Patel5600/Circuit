#!/usr/bin/env ts-node
/**
 * Circuit Protocol — Devnet Initialization Script
 *
 * Runs after `anchor deploy --provider.cluster devnet`.
 * Creates the protocol_config PDA and registers the NVDAx asset.
 *
 * Usage (from repo root, Windows):
 *   npm install --prefix . (root package.json)
 *   npx ts-node scripts/initialize-devnet.ts
 *
 * Or via WSL:
 *   node_modules/.bin/ts-node scripts/initialize-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, createMint, mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ── Config ──────────────────────────────────────────────────────────────────

const CLUSTER = "devnet";
const RPC = clusterApiUrl(CLUSTER);

// Program ID (matches declare_id! in lib.rs)
const PROGRAM_ID = new PublicKey("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");

// NVDA/USD Pyth feed ID on Pythnet (same feed used by devnet receiver)
const NVDA_PYTH_FEED_ID_HEX = "64ee2bc923a105553a1a9e5256e54f86641215be11b7d59048a1c97a55c2f826";

// Risk parameters (must match ARCHITECTURE.md)
const BASE_LTV_BPS        = 7000;   // 70%
const LIQ_THRESHOLD_BPS   = 8000;   // 80%
const LIQ_BONUS_BPS       = 500;    // 5%
const MIN_HEALTH_FACTOR   = 10000;  // 1.0 in BPS
const MAX_ORACLE_AGE      = 60;     // seconds
const MAX_CONF_BPS        = 100;    // 1%
const LIQUIDATION_BONUS   = 500;    // 5% global default

// ── Load admin keypair ───────────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const resolved = filePath.replace("~", os.homedir());
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

// Default: use the Anchor wallet configured in Anchor.toml (id.json)
// For signing upgrade-authority-gated instructions, use circuit-upgrade-authority.json
const adminKeypair = loadKeypair("~/.config/solana/id.json");

// ── Load IDL ─────────────────────────────────────────────────────────────────

const idlPath = path.join(__dirname, "../target/idl/circuit.json");
if (!fs.existsSync(idlPath)) {
  console.error("❌ IDL not found. Run `anchor build` first.");
  process.exit(1);
}
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

// ── Setup provider ───────────────────────────────────────────────────────────

const connection = new Connection(RPC, "confirmed");
const wallet = new anchor.Wallet(adminKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
  commitment: "confirmed",
  skipPreflight: false,
});
anchor.setProvider(provider);
const program = new anchor.Program(idl, provider);

// ── PDA derivation ───────────────────────────────────────────────────────────

const [protocolConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol")],
  PROGRAM_ID
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function feedIdBytes(hex: string): number[] {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) throw new Error(`Feed ID must be 32 bytes, got ${buf.length}`);
  return Array.from(buf);
}

async function checkBalance(): Promise<void> {
  const bal = await connection.getBalance(adminKeypair.publicKey);
  console.log(`Admin wallet: ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Balance:      ${bal / LAMPORTS_PER_SOL} SOL`);
  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    console.warn("⚠️  Low balance. Run: solana airdrop 2 --url devnet");
  }
}

// ── Step 1: Initialize Protocol ──────────────────────────────────────────────

async function initializeProtocol(): Promise<void> {
  // Check if already initialized
  const existing = await connection.getAccountInfo(protocolConfigPda);
  if (existing) {
    console.log(`✅ protocol_config already initialized: ${protocolConfigPda.toBase58()}`);
    return;
  }

  console.log("📋 Calling initialize_protocol...");
  const tx = await program.methods
    .initializeProtocol(
      new anchor.BN(MIN_HEALTH_FACTOR),
      new anchor.BN(MAX_ORACLE_AGE),
      new anchor.BN(MAX_CONF_BPS),
      new anchor.BN(LIQUIDATION_BONUS)
    )
    .accounts({
      authority: adminKeypair.publicKey,
      protocolConfig: protocolConfigPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(`✅ initialize_protocol: ${tx}`);
  console.log(`   protocol_config PDA: ${protocolConfigPda.toBase58()}`);
}

// ── Step 2: Create test mints ─────────────────────────────────────────────────

async function createTestMints(): Promise<{ equityMint: PublicKey; quoteMint: PublicKey }> {
  const mintsFile = path.join(__dirname, "../devnet/mints.json");

  if (fs.existsSync(mintsFile)) {
    const saved = JSON.parse(fs.readFileSync(mintsFile, "utf-8"));
    console.log(`✅ Test mints loaded from devnet/mints.json`);
    console.log(`   Equity mint (NVDAx): ${saved.equityMint}`);
    console.log(`   Quote mint (TEST-USDC): ${saved.quoteMint}`);
    return {
      equityMint: new PublicKey(saved.equityMint),
      quoteMint: new PublicKey(saved.quoteMint),
    };
  }

  console.log("🪙  Creating test equity mint (NVDAx, 6 decimals)...");
  const equityMint = await createMint(
    connection,
    adminKeypair,
    adminKeypair.publicKey,  // mint authority
    null,                     // freeze authority
    6,                        // decimals
  );

  console.log("💵  Creating test quote mint (TEST-USDC, 6 decimals)...");
  const quoteMint = await createMint(
    connection,
    adminKeypair,
    adminKeypair.publicKey,
    null,
    6,
  );

  const mintsData = {
    equityMint: equityMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
  };

  fs.mkdirSync(path.join(__dirname, "../devnet"), { recursive: true });
  fs.writeFileSync(mintsFile, JSON.stringify(mintsData, null, 2));
  console.log(`✅ Equity mint (NVDAx):     ${equityMint.toBase58()}`);
  console.log(`✅ Quote mint (TEST-USDC):  ${quoteMint.toBase58()}`);
  console.log(`   Saved to devnet/mints.json`);

  return { equityMint, quoteMint };
}

// ── Step 3: Register NVDAx Asset ─────────────────────────────────────────────

async function registerAsset(equityMint: PublicKey, quoteMint: PublicKey): Promise<void> {
  const [assetConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("asset"), equityMint.toBuffer()],
    PROGRAM_ID
  );

  const existing = await connection.getAccountInfo(assetConfigPda);
  if (existing) {
    console.log(`✅ asset_config already exists: ${assetConfigPda.toBase58()}`);
    return;
  }

  const feedIdBytesArr = feedIdBytes(NVDA_PYTH_FEED_ID_HEX);

  // Derive MarketGuard PDA
  const [marketGuardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), Buffer.from(feedIdBytesArr)],
    PROGRAM_ID
  );

  // Vault ATAs (owned by protocol_config)
  const collateralVault = await getAssociatedTokenAddress(equityMint, protocolConfigPda, true);
  const liquidityVault  = await getAssociatedTokenAddress(quoteMint,  protocolConfigPda, true);

  console.log("📋 Calling register_asset (NVDAx)...");
  const tx = await program.methods
    .registerAsset(
      feedIdBytesArr,
      new anchor.BN(BASE_LTV_BPS),
      new anchor.BN(LIQ_THRESHOLD_BPS),
      new anchor.BN(LIQ_BONUS_BPS),
      new anchor.BN(MAX_ORACLE_AGE),
      new anchor.BN(MAX_CONF_BPS)
    )
    .accounts({
      authority: adminKeypair.publicKey,
      protocolConfig: protocolConfigPda,
      assetConfig: assetConfigPda,
      marketGuard: marketGuardPda,
      mint: equityMint,
      quoteMint: quoteMint,
      collateralVault,
      liquidityVault,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(`✅ register_asset (NVDAx): ${tx}`);
  console.log(`   asset_config PDA:       ${assetConfigPda.toBase58()}`);
  console.log(`   market_guard PDA:       ${marketGuardPda.toBase58()}`);
  console.log(`   collateral_vault:       ${collateralVault.toBase58()}`);
  console.log(`   liquidity_vault:        ${liquidityVault.toBase58()}`);
}

// ── Step 4: Mint test tokens to admin ─────────────────────────────────────────

async function mintTestTokens(equityMint: PublicKey, quoteMint: PublicKey): Promise<void> {
  const EQUITY_AMOUNT = 1_000 * 1_000_000;  // 1,000 NVDAx
  const QUOTE_AMOUNT  = 100_000 * 1_000_000; // $100,000 TEST-USDC

  const adminEquityAta = await getOrCreateAssociatedTokenAccount(
    connection, adminKeypair, equityMint, adminKeypair.publicKey
  );
  const adminQuoteAta = await getOrCreateAssociatedTokenAccount(
    connection, adminKeypair, quoteMint, adminKeypair.publicKey
  );

  // Mint equity
  await mintTo(connection, adminKeypair, equityMint, adminEquityAta.address, adminKeypair, EQUITY_AMOUNT);
  console.log(`✅ Minted 1,000 NVDAx to admin: ${adminEquityAta.address.toBase58()}`);

  // Mint quote (fund liquidity vault)
  const [liquidityVault] = [await getAssociatedTokenAddress(quoteMint, protocolConfigPda, true)];
  await mintTo(connection, adminKeypair, quoteMint, adminQuoteAta.address, adminKeypair, QUOTE_AMOUNT);
  await mintTo(connection, adminKeypair, quoteMint, liquidityVault, adminKeypair, QUOTE_AMOUNT);
  console.log(`✅ Minted $100K TEST-USDC to admin ATA and liquidity vault`);
}

// ── Step 5: Save deployment manifest ─────────────────────────────────────────

async function saveDeployment(equityMint: PublicKey, quoteMint: PublicKey): Promise<void> {
  const [assetConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("asset"), equityMint.toBuffer()], PROGRAM_ID
  );
  const feedIdBytesArr = feedIdBytes(NVDA_PYTH_FEED_ID_HEX);
  const [marketGuardPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("guard"), Buffer.from(feedIdBytesArr)], PROGRAM_ID
  );
  const collateralVault = await getAssociatedTokenAddress(equityMint, protocolConfigPda, true);
  const liquidityVault  = await getAssociatedTokenAddress(quoteMint,  protocolConfigPda, true);

  const deployment = {
    cluster: CLUSTER,
    programId: PROGRAM_ID.toBase58(),
    upgradeAuthority: "F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT",
    pdas: {
      protocolConfig: protocolConfigPda.toBase58(),
      assetConfig:    assetConfigPda.toBase58(),
      marketGuard:    marketGuardPda.toBase58(),
    },
    vaults: {
      collateralVault: collateralVault.toBase58(),
      liquidityVault:  liquidityVault.toBase58(),
    },
    mints: {
      equityMint:  equityMint.toBase58(),
      quoteMint:   quoteMint.toBase58(),
    },
    oracle: {
      pythFeedId: NVDA_PYTH_FEED_ID_HEX,
      pythReceiverProgram: "rec5EKMGg6MxZYaMdyBfgwp4d5rCZzfKMi14Kbjghbh",
    },
    params: {
      baseLtvBps:           BASE_LTV_BPS,
      liquidationThresholdBps: LIQ_THRESHOLD_BPS,
      liquidationBonusBps:  LIQ_BONUS_BPS,
      minHealthFactorBps:   MIN_HEALTH_FACTOR,
      maxOracleAgeSecs:     MAX_ORACLE_AGE,
      maxConfBps:           MAX_CONF_BPS,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.join(__dirname, "../devnet"), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, "../devnet/deployment.json"),
    JSON.stringify(deployment, null, 2)
  );
  console.log("\n📄 Saved devnet/deployment.json");
  console.log(JSON.stringify(deployment, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════");
  console.log("  Circuit Protocol — Devnet Initialization");
  console.log("═══════════════════════════════════════════════\n");

  await checkBalance();
  console.log();

  await initializeProtocol();
  console.log();

  const { equityMint, quoteMint } = await createTestMints();
  console.log();

  await registerAsset(equityMint, quoteMint);
  console.log();

  await mintTestTokens(equityMint, quoteMint);
  console.log();

  await saveDeployment(equityMint, quoteMint);

  console.log("\n✅ Devnet initialization complete.");
  console.log("   protocol_config PDA exists — judges can now exercise all instructions.");
  console.log("   Run `anchor test --provider.cluster devnet` to smoke-test live.");
}

main().catch((err) => {
  console.error("❌ Initialization failed:", err);
  process.exit(1);
});
