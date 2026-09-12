/**
 * One-shot devnet bootstrap for Circuit Protocol.
 *
 * Steps, each idempotent so the script can be re-run safely:
 *   1. verify the program is deployed and the deployer is funded
 *   2. initialize_protocol            (skipped if ProtocolConfig exists)
 *   3. create the equity + quote test mints (reused if already in deployment.json)
 *   4. register_asset                 (skipped if AssetConfig exists)
 *   5. seed the protocol liquidity vault with lendable quote tokens
 *   6. mint test collateral to the deployer
 *   7. resolve the Pyth price account and try refresh_guard
 *   8. write devnet/deployment.json and print the frontend env block
 *
 * Usage: npm run setup:devnet
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

import {
  CLUSTER,
  RPC_URL,
  FEED_ID_HEX,
  assetConfigPda,
  connection,
  deployer,
  env,
  explorer,
  feedIdBytes,
  loadIdl,
  marketGuardPda,
  positionPda,
  programId,
  protocolConfigPda,
  readDeployment,
  resolvePriceAccount,
  sol,
  writeDeployment,
} from "./lib/config";

const DECIMALS = 6;
const TOKEN = 10 ** DECIMALS;

// Risk parameters for the registered asset.
const MIN_HEALTH_FACTOR_BPS = 10_000; // 1.0
/**
 * Devnet sponsored feeds are pushed every few minutes rather than continuously
 * (SOL/USD observed at 198s and 291s old), so a mainnet-style 30-60s bound
 * would make borrow fail almost always here. Tighten this for production.
 */
const MAX_ORACLE_AGE = Number(env("SETUP_MAX_ORACLE_AGE", "600"));
const MAX_CONF_BPS = 200; // 2%
const BASE_LTV_BPS = 7_000; // 70%
const LIQ_THRESHOLD_BPS = 8_000; // 80%
const LIQ_BONUS_BPS = 500; // 5%

let step = 0;
function heading(text: string) {
  step++;
  console.log(`\n[${step}] ${text}`);
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

  console.log("Circuit Protocol - devnet setup");
  console.log(`cluster : ${CLUSTER}`);
  console.log(`rpc     : ${RPC_URL}`);
  console.log(`program : ${pid.toBase58()}`);
  console.log(`deployer: ${admin.publicKey.toBase58()}`);

  // -- 1. preflight -------------------------------------------------------
  heading("Preflight");

  const balance = await conn.getBalance(admin.publicKey);
  console.log(`    balance: ${sol(balance)} SOL`);
  if (balance < 200_000_000) {
    throw new Error(
      `deployer has only ${sol(balance)} SOL. Run \`npm run fund\` first.`
    );
  }

  const programInfo = await conn.getAccountInfo(pid);
  if (!programInfo) {
    throw new Error(
      `program ${pid.toBase58()} is not deployed on ${CLUSTER}.\n` +
        `Deploy it first:  anchor deploy --provider.cluster ${CLUSTER}`
    );
  }
  if (!programInfo.executable) {
    throw new Error(`account ${pid.toBase58()} exists but is not executable`);
  }
  console.log(`    program is deployed and executable`);

  const provider = new AnchorProvider(conn, new Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new Program(idl, provider);

  const previous = readDeployment();

  // -- 2. initialize_protocol --------------------------------------------
  heading("Protocol configuration");
  const protocolConfig = protocolConfigPda(pid);
  console.log(`    ProtocolConfig PDA: ${protocolConfig.toBase58()}`);

  if (await conn.getAccountInfo(protocolConfig)) {
    console.log("    already initialized, skipping");
  } else {
    const ix = await program.methods
      .initializeProtocol(
        new BN(MIN_HEALTH_FACTOR_BPS),
        new BN(MAX_ORACLE_AGE),
        new BN(MAX_CONF_BPS),
        new BN(LIQ_BONUS_BPS)
      )
      .accountsPartial({
        authority: admin.publicKey,
        protocolConfig,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendTx(conn, [ix], [admin], "initialize_protocol");
  }

  // -- 3. mints -----------------------------------------------------------
  heading("Test mints");

  let equityMint: PublicKey;
  let quoteMint: PublicKey;

  const reusableMints =
    previous?.equityMint &&
    previous?.quoteMint &&
    (await conn.getAccountInfo(new PublicKey(previous.equityMint))) &&
    (await conn.getAccountInfo(new PublicKey(previous.quoteMint)));

  if (reusableMints) {
    equityMint = new PublicKey(previous!.equityMint);
    quoteMint = new PublicKey(previous!.quoteMint);
    console.log("    reusing mints from devnet/deployment.json");
  } else {
    const equityKp = Keypair.generate();
    const quoteKp = Keypair.generate();
    equityMint = equityKp.publicKey;
    quoteMint = quoteKp.publicKey;

    const rent = await getMinimumBalanceForRentExemptMint(conn);
    const mintIxs = (mint: PublicKey) => [
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mint,
        space: MINT_SIZE,
        lamports: rent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint, DECIMALS, admin.publicKey, null),
    ];

    await sendTx(
      conn,
      [...mintIxs(equityMint), ...mintIxs(quoteMint)],
      [admin, equityKp, quoteKp],
      "create mints"
    );
  }

  console.log(`    equity (collateral): ${equityMint.toBase58()}`);
  console.log(`    quote  (borrowable): ${quoteMint.toBase58()}`);

  // -- 4. register_asset --------------------------------------------------
  heading("Asset registration");

  const assetConfig = assetConfigPda(equityMint, pid);
  const marketGuard = marketGuardPda(FEED_ID_HEX, pid);
  const collateralVault = getAssociatedTokenAddressSync(
    equityMint,
    protocolConfig,
    true
  );
  const liquidityVault = getAssociatedTokenAddressSync(
    quoteMint,
    protocolConfig,
    true
  );

  console.log(`    AssetConfig  PDA: ${assetConfig.toBase58()}`);
  console.log(`    MarketGuard  PDA: ${marketGuard.toBase58()}`);
  console.log(`    collateral vault: ${collateralVault.toBase58()}`);
  console.log(`    liquidity  vault: ${liquidityVault.toBase58()}`);

  if (await conn.getAccountInfo(assetConfig)) {
    console.log("    already registered, skipping");
  } else {
    const ix = await program.methods
      .registerAsset(
        Array.from(feedIdBytes()),
        new BN(BASE_LTV_BPS),
        new BN(LIQ_THRESHOLD_BPS),
        new BN(LIQ_BONUS_BPS),
        new BN(MAX_ORACLE_AGE),
        new BN(MAX_CONF_BPS)
      )
      .accountsPartial({
        authority: admin.publicKey,
        protocolConfig,
        mint: equityMint,
        quoteMint,
        assetConfig,
        marketGuard,
        collateralVault,
        liquidityVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendTx(conn, [ix], [admin], "register_asset");
  }

  // -- 5 & 6. seed liquidity and collateral -------------------------------
  heading("Seeding balances");

  const liquidityTarget = BigInt(Number(env("SETUP_LIQUIDITY", "100000"))) * BigInt(TOKEN);
  const collateralTarget = BigInt(Number(env("SETUP_COLLATERAL", "1000"))) * BigInt(TOKEN);

  const vaultBalance = await conn
    .getTokenAccountBalance(liquidityVault)
    .then((r) => BigInt(r.value.amount))
    .catch(() => 0n);

  if (vaultBalance >= liquidityTarget) {
    console.log(
      `    liquidity vault already holds ${vaultBalance / BigInt(TOKEN)} quote tokens`
    );
  } else {
    const delta = liquidityTarget - vaultBalance;
    await sendTx(
      conn,
      [
        createMintToInstruction(
          quoteMint,
          liquidityVault,
          admin.publicKey,
          delta
        ),
      ],
      [admin],
      `mint ${delta / BigInt(TOKEN)} quote tokens to the liquidity vault`
    );
  }

  const adminEquityAta = getAssociatedTokenAddressSync(
    equityMint,
    admin.publicKey
  );
  const adminQuoteAta = getAssociatedTokenAddressSync(
    quoteMint,
    admin.publicKey
  );

  const equityBalance = await conn
    .getTokenAccountBalance(adminEquityAta)
    .then((r) => BigInt(r.value.amount))
    .catch(() => 0n);

  if (equityBalance >= collateralTarget) {
    console.log(
      `    deployer already holds ${equityBalance / BigInt(TOKEN)} equity tokens`
    );
  } else {
    await sendTx(
      conn,
      [
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          adminEquityAta,
          admin.publicKey,
          equityMint
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          adminQuoteAta,
          admin.publicKey,
          quoteMint
        ),
        createMintToInstruction(
          equityMint,
          adminEquityAta,
          admin.publicKey,
          collateralTarget - equityBalance
        ),
      ],
      [admin],
      `mint ${collateralTarget / BigInt(TOKEN)} equity tokens to the deployer`
    );
  }

  // -- 7. oracle ----------------------------------------------------------
  heading("Pyth oracle");

  let priceAccount: PublicKey | null = null;
  const resolved = await resolvePriceAccount(conn, FEED_ID_HEX);

  if (!resolved) {
    console.log(
      [
        `    WARNING: no PriceUpdateV2 account found for feed ${FEED_ID_HEX}.`,
        "    Borrow, withdraw-with-debt, liquidate and refresh_guard all require one.",
        "    Fix by either:",
        "      - setting VITE_PYTH_FEED_ID to a feed Pyth sponsors on devnet, or",
        "      - posting your own update and setting VITE_PYTH_PRICE_ACCOUNT.",
        "    Setup will continue; the protocol is usable for deposit/repay only.",
      ].join("\n")
    );
  } else {
    priceAccount = resolved.address;
    console.log(`    price account: ${priceAccount.toBase58()}`);
    console.log(`    source       : ${resolved.source}`);

    heading("refresh_guard");
    try {
      const ix = await program.methods
        .refreshGuard()
        .accountsPartial({
          caller: admin.publicKey,
          assetConfig,
          marketGuard,
          priceUpdate: priceAccount,
        })
        .instruction();
      await sendTx(conn, [ix], [admin], "refresh_guard");

      const guard: any = await (program.account as any).marketGuard.fetch(
        marketGuard
      );
      const state = Object.keys(guard.marketState)[0];
      const reason = Object.keys(guard.reason)[0];
      console.log(`    market state: ${state} (${reason})`);
      console.log(`    last valid price: ${guard.lastValidPrice.toString()}`);
      if (state !== "safe") {
        console.log(
          "    Note: a non-Safe state is expected outside NYSE hours (09:30-16:00 ET, Mon-Fri)."
        );
      }
    } catch (e: any) {
      console.log(`    refresh_guard failed: ${e.message ?? e}`);
    }
  }

  // -- 8. artifact --------------------------------------------------------
  heading("Writing devnet/deployment.json");

  const deployment = {
    cluster: CLUSTER,
    rpcUrl: RPC_URL,
    programId: pid.toBase58(),
    authority: admin.publicKey.toBase58(),
    equityMint: equityMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
    decimals: DECIMALS,
    pdas: {
      protocolConfig: protocolConfig.toBase58(),
      assetConfig: assetConfig.toBase58(),
      marketGuard: marketGuard.toBase58(),
      deployerPosition: positionPda(admin.publicKey, equityMint, pid).toBase58(),
    },
    vaults: {
      collateral: collateralVault.toBase58(),
      liquidity: liquidityVault.toBase58(),
    },
    oracle: {
      feedId: FEED_ID_HEX,
      priceAccount: priceAccount ? priceAccount.toBase58() : null,
    },
    riskParameters: {
      minHealthFactorBps: MIN_HEALTH_FACTOR_BPS,
      baseLtvBps: BASE_LTV_BPS,
      liquidationThresholdBps: LIQ_THRESHOLD_BPS,
      liquidationBonusBps: LIQ_BONUS_BPS,
      maxOracleAge: MAX_ORACLE_AGE,
      maxConfBps: MAX_CONF_BPS,
    },
    updatedAt: new Date().toISOString(),
  };

  writeDeployment(deployment);
  console.log("    written");

  console.log("\nFrontend environment (copy into app/.env.local):");
  console.log("-".repeat(60));
  console.log(`VITE_CLUSTER=${CLUSTER}`);
  console.log(`VITE_RPC_URL=${RPC_URL}`);
  console.log(`VITE_PROGRAM_ID=${pid.toBase58()}`);
  console.log(`VITE_EQUITY_MINT=${equityMint.toBase58()}`);
  console.log(`VITE_QUOTE_MINT=${quoteMint.toBase58()}`);
  console.log(`VITE_PYTH_FEED_ID=${FEED_ID_HEX}`);
  console.log(
    `VITE_PYTH_PRICE_ACCOUNT=${priceAccount ? priceAccount.toBase58() : ""}`
  );
  console.log("-".repeat(60));
  console.log("\nSetup complete.");
}

main().catch((e) => {
  console.error("\nsetup-devnet failed:", e.message ?? e);
  process.exit(1);
});
