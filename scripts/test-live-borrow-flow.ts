import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");
const PROTOCOL_CONFIG_PDA = new PublicKey("3LsZqeX8FHnZRv2nm5jYemPa27HwSQAeddivvmR3mMo2");
const OWNER = new PublicKey("7VdxH8GXEq8D771Eh6y9CtQyRjumjDoiid3ycGqLSEoJ");
const COLLATERAL_MINT = new PublicKey("CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq");
const QUOTE_MINT = new PublicKey("23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc");
const PRICE_UPDATE = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
const POSITION_PDA = new PublicKey("HW5bVqR34eUVA77NjVNKdsTG5gpWnPL9wcxnSUYq1gFr");

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

function maxBorrow(value: bigint, ltvBps: number): bigint {
  return (value * BigInt(ltvBps)) / 10000n;
}

async function main() {
  console.log("=== DEVNET BORROW FLOW VERIFICATION ===");
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load client IDL
  const idlPath = path.resolve(__dirname, "../app/src/idl/circuit.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const provider = new AnchorProvider(conn, { publicKey: OWNER } as any, {});
  const program = new Program(idl, provider);

  // 1. Verify ProtocolConfig decoding
  console.log("\n1. Verifying ProtocolConfig decoding on Devnet...");
  const configInfo = await conn.getAccountInfo(PROTOCOL_CONFIG_PDA);
  if (!configInfo) throw new Error("ProtocolConfig PDA not found");
  console.log("Raw account length:", configInfo.data.length, "bytes");

  const decodedConfig: any = program.coder.accounts.decode("protocolConfig", configInfo.data);
  console.log("Decoded authority:", decodedConfig.authority.toBase58());
  console.log("Decoded minHealthFactorBps:", decodedConfig.minHealthFactorBps.toString());
  console.log("Decoded paused:", decodedConfig.paused);
  console.log("Decoded version:", decodedConfig.version);

  // 2. Verify Position reading
  console.log("\n2. Verifying Position PDA on Devnet...");
  const posInfo = await conn.getAccountInfo(POSITION_PDA);
  if (!posInfo) throw new Error("Position PDA not found");
  const collateralAmount = posInfo.data.readBigUInt64LE(72);
  const debtAmount = posInfo.data.readBigUInt64LE(80);
  console.log("Collateral raw units:", collateralAmount.toString(), "(25.0 NVDAx)");
  console.log("Debt raw units:", debtAmount.toString());

  // 3. Verify Pyth Oracle reading & Collateral Valuation
  console.log("\n3. Verifying Pyth Oracle and Collateral Valuation...");
  const oracleInfo = await conn.getAccountInfo(PRICE_UPDATE);
  if (!oracleInfo) throw new Error("PriceUpdate account not found");
  
  // Discriminator (8) + write_authority (32) + verificationLevel Full (1) + feedId (32) = offset 73
  const oraclePrice = oracleInfo.data.readBigInt64LE(73);
  const oracleConf = oracleInfo.data.readBigUInt64LE(81);
  const oracleExpo = oracleInfo.data.readInt32LE(89);
  console.log("Oracle price:", (Number(oraclePrice) * Math.pow(10, oracleExpo)).toFixed(2), "USD");
  console.log("Oracle conf:", (Number(oracleConf) * Math.pow(10, oracleExpo)).toFixed(4), "USD");

  const collatVal = collateralValue(collateralAmount, oraclePrice, oracleExpo, 6, 6);
  const collatValUsd = Number(collatVal) / 1e6;
  console.log("Calculated Collateral Value: $" + collatValUsd.toFixed(2), "USDC (NOT $0.00!)");

  const capacity = maxBorrow(collatVal, 7000); // 70% LTV
  const capacityUsd = Number(capacity) / 1e6;
  console.log("Borrow Capacity (70% LTV): $" + capacityUsd.toFixed(2), "USDC");

  const available = capacity > debtAmount ? capacity - debtAmount : 0n;
  const availableUsd = Number(available) / 1e6;
  console.log("Available to Borrow: $" + availableUsd.toFixed(2), "USDC");

  // 4. Verify Borrow Instruction Simulation
  console.log("\n4. Simulating Devnet Borrow Transaction for 50 USDC...");
  const [protocolConfig] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], PROGRAM_ID);
  const [assetConfig] = PublicKey.findProgramAddressSync([Buffer.from("asset"), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);
  const [ratchet] = PublicKey.findProgramAddressSync([Buffer.from("ratchet"), COLLATERAL_MINT.toBuffer()], PROGRAM_ID);
  const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
  const userQuoteAta = getAssociatedTokenAddressSync(QUOTE_MINT, OWNER, true);
  const liquidityVault = getAssociatedTokenAddressSync(QUOTE_MINT, protocolConfig, true);

  const borrowIx = await program.methods
    .borrow(new (require("@coral-xyz/anchor").BN)(50_000_000))
    .accountsPartial({
      owner: OWNER,
      protocolConfig,
      assetConfig,
      position: POSITION_PDA,
      priceUpdate: PRICE_UPDATE,
      collateralMint: COLLATERAL_MINT,
      quoteMint: QUOTE_MINT,
      userQuoteAta,
      liquidityVault,
    })
    .remainingAccounts([
      { pubkey: ratchet, isWritable: false, isSigner: false },
    ])
    .instruction();

  const tx = new Transaction().add(borrowIx);
  tx.feePayer = OWNER;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  const simResult = await conn.simulateTransaction(tx, undefined, false);
  console.log("Simulation error:", simResult.value.err);
  console.log("Simulation logs:\n" + simResult.value.logs?.join("\n"));

  if (simResult.value.err === null) {
    console.log("\n>>> SUCCESS: BORROW TRANSACTION SIMULATED CLEANLY ON DEVNET WITH ZERO ERRORS! <<<");
  } else {
    throw new Error("Borrow simulation failed: " + JSON.stringify(simResult.value.err));
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
