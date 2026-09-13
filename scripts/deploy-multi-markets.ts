/**
 * Circuit Protocol — Multi-Asset & Multi-Quote Devnet Deployment Script
 *
 * Deploys 11+ tokenized equity collateral markets and multiple quote tokens:
 *   - NVDAx, AAPLx, MSFTx, AMZNx, GOOGLx, METAx, TSLAx, NFLXx, COINx, AMDx, SPYx
 *   - Quote tokens: USDC, WSOLx
 *
 * Each market receives:
 *   - Real SPL Token Mint
 *   - AssetConfig PDA on Devnet
 *   - MarketGuard PDA on Devnet
 *   - Collateral Vault ATA (ProtocolConfig)
 *   - Liquidity Vault ATA (ProtocolConfig)
 *   - Seeded liquidity & borrower test funds
 *
 * Outputs:
 *   - devnet/markets.json
 *   - app/src/data/markets.json
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

import {
  CLUSTER,
  RPC_URL,
  connection,
  deployer,
  explorer,
  loadIdl,
  programId,
  protocolConfigPda,
  readDeployment,
} from "./lib/config";

const DECIMALS = 6;
const TOKEN_UNIT = 10 ** DECIMALS;

interface AssetSpec {
  symbol: string;
  name: string;
  tokenSymbol: string;
  feedIdHex: string;
  baseLtvBps: number;
  liqThresholdBps: number;
  liqBonusBps: number;
  maxOracleAge: number;
  maxConfBps: number;
  quoteSymbol: string; // "USDC" or "WSOL"
}

const ASSET_SPECS: AssetSpec[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    tokenSymbol: "NVDAx",
    feedIdHex: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", // Active sponsored feed
    baseLtvBps: 7000,
    liqThresholdBps: 8000,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    tokenSymbol: "AAPLx",
    feedIdHex: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b17d1533cf6ae859",
    baseLtvBps: 7000,
    liqThresholdBps: 8000,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    tokenSymbol: "MSFTx",
    feedIdHex: "034f59c84918e77c593685e8a3297a7a514ddb00085420313f8c5b0561571d8a",
    baseLtvBps: 7000,
    liqThresholdBps: 8000,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    tokenSymbol: "AMZNx",
    feedIdHex: "8894df05be17034beea20b6e9dfefdf84e1b40283b8b171cc430852e987178c7",
    baseLtvBps: 6500,
    liqThresholdBps: 7500,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    tokenSymbol: "GOOGLx",
    feedIdHex: "c796bbf0eb98ff599be821eb59cae31be182440fae41f1737f02fc00b86a83e5",
    baseLtvBps: 7000,
    liqThresholdBps: 8000,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "META",
    name: "Meta Platforms Inc.",
    tokenSymbol: "METAx",
    feedIdHex: "d87e0fa125c150fc90fe9c43d99d1fa9ff506e7884ffdd2475e7a9183783c509",
    baseLtvBps: 6500,
    liqThresholdBps: 7500,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    tokenSymbol: "TSLAx",
    feedIdHex: "4aa5a9531818296a267e802058b76fc888e7456d94a9749176182db596238bfa",
    baseLtvBps: 6000,
    liqThresholdBps: 7000,
    liqBonusBps: 600,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "NFLX",
    name: "Netflix Inc.",
    tokenSymbol: "NFLXx",
    feedIdHex: "02868ff1853db5c33842cb838ce479868be8db30058b8fd91d8e1c6aaeb43d92",
    baseLtvBps: 6500,
    liqThresholdBps: 7500,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "COIN",
    name: "Coinbase Global",
    tokenSymbol: "COINx",
    feedIdHex: "84654fd2e7845f7457788448eb5850949dbeee0418c30c80b2a59a72cc33e680",
    baseLtvBps: 6000,
    liqThresholdBps: 7000,
    liqBonusBps: 600,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    tokenSymbol: "AMDx",
    feedIdHex: "825efd1645c3b53c7c10b41c9ec437a346e969ba1be9a2ae454fa572a1599321",
    baseLtvBps: 6500,
    liqThresholdBps: 7500,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "USDC",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    tokenSymbol: "SPYx",
    feedIdHex: "26e2e5052960be41f5a5433a08b9815a5cb3556ea5e45c4723924dbbcfbcf2ec",
    baseLtvBps: 7500,
    liqThresholdBps: 8500,
    liqBonusBps: 400,
    maxOracleAge: 600,
    maxConfBps: 150,
    quoteSymbol: "USDC",
  },
  {
    symbol: "NVDA-SOL",
    name: "NVIDIA (Borrow SOL)",
    tokenSymbol: "NVDAx",
    feedIdHex: "0000000000000000000000000000000000000000000000000000000000000001", // Distinct feed for second market
    baseLtvBps: 6500,
    liqThresholdBps: 7500,
    liqBonusBps: 500,
    maxOracleAge: 600,
    maxConfBps: 200,
    quoteSymbol: "WSOL",
  },
];

function feedBytes(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean.padStart(64, "0"), "hex");
}

async function sendTx(
  conn: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  label: string
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(...signers);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  console.log(`    ${label}: ${explorer("tx", sig)}`);
  return sig;
}

async function main() {
  const conn = connection();
  const admin = deployer();
  const pid = programId();
  const idl = loadIdl();

  console.log("============================================================");
  console.log("Circuit Protocol — Multi-Asset Devnet Market Deployment");
  console.log("============================================================");
  console.log(`cluster : ${CLUSTER}`);
  console.log(`rpc     : ${RPC_URL}`);
  console.log(`program : ${pid.toBase58()}`);
  console.log(`deployer: ${admin.publicKey.toBase58()}`);

  const balance = await conn.getBalance(admin.publicKey);
  console.log(`balance : ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 100_000_000) {
    throw new Error("Insufficient SOL balance for multi-asset deployment.");
  }

  const provider = new AnchorProvider(conn, new Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new Program(idl, provider);
  const protocolConfig = protocolConfigPda(pid);

  // Check ProtocolConfig
  const protocolInfo = await conn.getAccountInfo(protocolConfig);
  if (!protocolInfo) {
    throw new Error("ProtocolConfig PDA is not initialized. Run setup-devnet.ts first.");
  }
  console.log(`ProtocolConfig PDA: ${protocolConfig.toBase58()} (Initialized)`);

  // Load existing deployment to preserve existing NVDAx and USDC mints
  const prev = readDeployment();
  const rent = await getMinimumBalanceForRentExemptMint(conn);

  // 1. Quote Mints (USDC and WSOLx)
  console.log("\n[1] Quote Tokens Setup (Borrow Items)");

  // USDC Mint
  let usdcMint: PublicKey;
  if (prev?.quoteMint && (await conn.getAccountInfo(new PublicKey(prev.quoteMint)))) {
    usdcMint = new PublicKey(prev.quoteMint);
    console.log(`    USDC mint (reused): ${usdcMint.toBase58()}`);
  } else {
    const usdcKp = Keypair.generate();
    usdcMint = usdcKp.publicKey;
    await sendTx(
      conn,
      [
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: usdcMint,
          space: MINT_SIZE,
          lamports: rent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(usdcMint, DECIMALS, admin.publicKey, null),
      ],
      [admin, usdcKp],
      "create USDC mint"
    );
    console.log(`    USDC mint (created): ${usdcMint.toBase58()}`);
  }

  // WSOLx Quote Mint
  let wsolMint: PublicKey;
  const marketsFile = path.resolve(__dirname, "../devnet/markets.json");
  let existingMarkets: any = {};
  if (fs.existsSync(marketsFile)) {
    try {
      existingMarkets = JSON.parse(fs.readFileSync(marketsFile, "utf8"));
    } catch {}
  }

  if (existingMarkets.quoteMints?.WSOL && (await conn.getAccountInfo(new PublicKey(existingMarkets.quoteMints.WSOL)))) {
    wsolMint = new PublicKey(existingMarkets.quoteMints.WSOL);
    console.log(`    WSOLx mint (reused): ${wsolMint.toBase58()}`);
  } else {
    const wsolKp = Keypair.generate();
    wsolMint = wsolKp.publicKey;
    await sendTx(
      conn,
      [
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: wsolMint,
          space: MINT_SIZE,
          lamports: rent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(wsolMint, DECIMALS, admin.publicKey, null),
      ],
      [admin, wsolKp],
      "create WSOLx mint"
    );
    console.log(`    WSOLx mint (created): ${wsolMint.toBase58()}`);
  }

  const quoteMints: Record<string, PublicKey> = {
    USDC: usdcMint,
    WSOL: wsolMint,
  };

  // 2. Deploy 11+ Stock Collateral Assets
  console.log("\n[2] Deploying & Registering 11+ Stock Collateral Assets");

  const deployedMarkets: any[] = [];

  for (let i = 0; i < ASSET_SPECS.length; i++) {
    const spec = ASSET_SPECS[i];
    console.log(`\n--- [${i + 1}/${ASSET_SPECS.length}] Market: ${spec.name} (${spec.tokenSymbol}) ---`);

    const quoteMint = quoteMints[spec.quoteSymbol];

    // Check if mint exists
    let equityMint: PublicKey;
    if (spec.symbol === "NVDA" && prev?.equityMint && (await conn.getAccountInfo(new PublicKey(prev.equityMint)))) {
      equityMint = new PublicKey(prev.equityMint);
      console.log(`    reusing NVDAx mint: ${equityMint.toBase58()}`);
    } else if (
      existingMarkets.markets &&
      existingMarkets.markets[spec.symbol]?.mint &&
      (await conn.getAccountInfo(new PublicKey(existingMarkets.markets[spec.symbol].mint)))
    ) {
      equityMint = new PublicKey(existingMarkets.markets[spec.symbol].mint);
      console.log(`    reusing existing mint: ${equityMint.toBase58()}`);
    } else {
      const equityKp = Keypair.generate();
      equityMint = equityKp.publicKey;
      await sendTx(
        conn,
        [
          SystemProgram.createAccount({
            fromPubkey: admin.publicKey,
            newAccountPubkey: equityMint,
            space: MINT_SIZE,
            lamports: rent,
            programId: TOKEN_PROGRAM_ID,
          }),
          createInitializeMint2Instruction(equityMint, DECIMALS, admin.publicKey, null),
        ],
        [admin, equityKp],
        `create ${spec.tokenSymbol} mint`
      );
      console.log(`    created ${spec.tokenSymbol} mint: ${equityMint.toBase58()}`);
    }

    // PDAs
    const [assetConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("asset"), equityMint.toBuffer()],
      pid
    );
    const feed = feedBytes(spec.feedIdHex);
    const [marketGuardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("guard"), feed],
      pid
    );
    const collateralVault = getAssociatedTokenAddressSync(equityMint, protocolConfig, true);
    const liquidityVault = getAssociatedTokenAddressSync(quoteMint, protocolConfig, true);

    console.log(`    AssetConfig PDA : ${assetConfigPda.toBase58()}`);
    console.log(`    MarketGuard PDA : ${marketGuardPda.toBase58()}`);
    console.log(`    Collateral Vault: ${collateralVault.toBase58()}`);
    console.log(`    Liquidity Vault : ${liquidityVault.toBase58()}`);

    // Register asset if not already registered
    const assetInfo = await conn.getAccountInfo(assetConfigPda);
    if (assetInfo) {
      console.log(`    already registered on-chain, skipping registration`);
    } else {
      console.log(`    calling register_asset...`);
      const ix = await program.methods
        .registerAsset(
          Array.from(feed),
          new BN(spec.baseLtvBps),
          new BN(spec.liqThresholdBps),
          new BN(spec.liqBonusBps),
          new BN(spec.maxOracleAge),
          new BN(spec.maxConfBps)
        )
        .accountsPartial({
          authority: admin.publicKey,
          protocolConfig,
          mint: equityMint,
          quoteMint,
          assetConfig: assetConfigPda,
          marketGuard: marketGuardPda,
          collateralVault,
          liquidityVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await sendTx(conn, [ix], [admin], `register_asset (${spec.symbol})`);
    }

    // Seed Liquidity Vault ($100,000 quote tokens)
    try {
      const vaultAtaInfo = await conn.getAccountInfo(liquidityVault);
      if (vaultAtaInfo) {
        // Mint additional liquidity to vault
        const mintQuoteIx = createMintToInstruction(
          quoteMint,
          liquidityVault,
          admin.publicKey,
          BigInt(100_000 * TOKEN_UNIT)
        );
        await sendTx(conn, [mintQuoteIx], [admin], `seed liquidity vault (${spec.quoteSymbol})`);
      }
    } catch (e: any) {
      console.log(`    liquidity seed note: ${e.message}`);
    }

    // Mint Collateral to Admin (1,000 tokens)
    try {
      const adminCollateralAta = getAssociatedTokenAddressSync(equityMint, admin.publicKey);
      const mintColIxs = [
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          adminCollateralAta,
          admin.publicKey,
          equityMint
        ),
        createMintToInstruction(
          equityMint,
          adminCollateralAta,
          admin.publicKey,
          BigInt(1_000 * TOKEN_UNIT)
        ),
      ];
      await sendTx(conn, mintColIxs, [admin], `mint 1,000 ${spec.tokenSymbol} to deployer`);
    } catch (e: any) {
      console.log(`    collateral mint note: ${e.message}`);
    }

    deployedMarkets.push({
      symbol: spec.symbol,
      name: spec.name,
      tokenSymbol: spec.tokenSymbol,
      mint: equityMint.toBase58(),
      quoteSymbol: spec.quoteSymbol,
      quoteMint: quoteMint.toBase58(),
      assetConfigPda: assetConfigPda.toBase58(),
      marketGuardPda: marketGuardPda.toBase58(),
      collateralVault: collateralVault.toBase58(),
      liquidityVault: liquidityVault.toBase58(),
      feedId: spec.feedIdHex,
      baseLtvBps: spec.baseLtvBps,
      liqThresholdBps: spec.liqThresholdBps,
      liqBonusBps: spec.liqBonusBps,
    });
  }

  // 3. Write Manifest
  const outputData = {
    cluster: CLUSTER,
    programId: pid.toBase58(),
    authority: admin.publicKey.toBase58(),
    protocolConfig: protocolConfig.toBase58(),
    quoteMints: {
      USDC: usdcMint.toBase58(),
      WSOL: wsolMint.toBase58(),
    },
    markets: deployedMarkets,
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.resolve(__dirname, "../devnet"), { recursive: true });
  fs.writeFileSync(
    path.resolve(__dirname, "../devnet/markets.json"),
    JSON.stringify(outputData, null, 2)
  );
  console.log(`\nWritten devnet/markets.json`);

  fs.mkdirSync(path.resolve(__dirname, "../app/src/data"), { recursive: true });
  fs.writeFileSync(
    path.resolve(__dirname, "../app/src/data/markets.json"),
    JSON.stringify(outputData, null, 2)
  );
  console.log(`Written app/src/data/markets.json`);

  console.log("\n============================================================");
  console.log(`Successfully deployed ${deployedMarkets.length} live collateral markets!`);
  console.log("============================================================");
}

main().catch((err) => {
  console.error("Multi-market deployment failed:", err);
  process.exit(1);
});
