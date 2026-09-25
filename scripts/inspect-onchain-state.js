const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");

const PROGRAM_ID = new PublicKey("Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2");
const WALLET = new PublicKey("7VdxH8GXEq8D771Eh6y9CtQyRjumjDoiid3ycGqLSEoJ");
const NVDA_MINT = new PublicKey("CARqKy5GTCxz5G1tFiYA96A3Q8jaUE9Vppk7cjGJxRqq");
const USDC_MINT = new PublicKey("23hpSsK3h4na3pwSUf1YzaDF9nzX3t2PppJJf16Qpkxc");
const PYTH_NVDA = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");

const conn = new Connection("https://api.devnet.solana.com", "confirmed");

async function main() {
  console.log("=== 1. WALLET & BALANCES ===");
  console.log("Wallet:", WALLET.toBase58());
  const sol = await conn.getBalance(WALLET);
  console.log("SOL:", sol / 1e9);

  const nvdaAta = getAssociatedTokenAddressSync(NVDA_MINT, WALLET, true);
  const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, WALLET, true);
  console.log("NVDAx ATA:", nvdaAta.toBase58());
  const nvdaAtaInfo = await conn.getAccountInfo(nvdaAta);
  if (nvdaAtaInfo) {
    const raw = nvdaAtaInfo.data.readBigUInt64LE(64);
    console.log("Wallet NVDAx Balance:", (Number(raw) / 1e6).toFixed(4), "(raw: " + raw.toString() + ")");
  } else {
    console.log("Wallet NVDAx ATA does not exist!");
  }

  const usdcAtaInfo = await conn.getAccountInfo(usdcAta);
  if (usdcAtaInfo) {
    const raw = usdcAtaInfo.data.readBigUInt64LE(64);
    console.log("Wallet USDC Balance:", (Number(raw) / 1e6).toFixed(4), "(raw: " + raw.toString() + ")");
  } else {
    console.log("Wallet USDC ATA does not exist!");
  }

  console.log("\n=== 2. POSITION ACCOUNT ===");
  const [posPda] = PublicKey.findProgramAddressSync([Buffer.from("position"), WALLET.toBuffer(), NVDA_MINT.toBuffer()], PROGRAM_ID);
  console.log("Position PDA:", posPda.toBase58());
  const posInfo = await conn.getAccountInfo(posPda);
  if (posInfo) {
    console.log("Position exists, length:", posInfo.data.length);
    const owner = new PublicKey(posInfo.data.slice(8, 40));
    const assetMint = new PublicKey(posInfo.data.slice(40, 72));
    const collateral = posInfo.data.readBigUInt64LE(72);
    const debt = posInfo.data.readBigUInt64LE(80);
    const lastValidPrice = posInfo.data.readBigInt64LE(88);
    const lastValidExpo = posInfo.data.readInt32LE(96);
    const state = posInfo.data[100];
    const bump = posInfo.data[101];

    console.log("  Owner:", owner.toBase58());
    console.log("  Asset Mint:", assetMint.toBase58());
    console.log("  Collateral:", (Number(collateral) / 1e6).toFixed(4), "NVDAx (raw: " + collateral.toString() + ")");
    console.log("  Debt:", (Number(debt) / 1e6).toFixed(4), "USDC (raw: " + debt.toString() + ")");
    console.log("  Last Valid Price:", lastValidPrice.toString(), "expo:", lastValidExpo);
    console.log("  State:", state);
  } else {
    console.log("Position account does NOT exist!");
  }

  console.log("\n=== 3. PROTOCOL CONFIG & VAULTS ===");
  const [protocolConfig] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], PROGRAM_ID);
  console.log("ProtocolConfig PDA:", protocolConfig.toBase58());
  const protoInfo = await conn.getAccountInfo(protocolConfig);
  if (protoInfo) {
    const admin = new PublicKey(protoInfo.data.slice(8, 40));
    const paused = protoInfo.data[40] !== 0;
    const minHfBps = protoInfo.data.readBigUInt64LE(48);
    const borrowFeeBps = protoInfo.data.readBigUInt64LE(56);
    const feeEnabled = protoInfo.data[64] !== 0;
    console.log("  Admin:", admin.toBase58());
    console.log("  Paused:", paused);
    console.log("  Min HF Bps:", minHfBps.toString());
    console.log("  Borrow Fee Bps:", borrowFeeBps.toString());
    console.log("  Fee Enabled:", feeEnabled);
  }

  const collatVault = getAssociatedTokenAddressSync(NVDA_MINT, protocolConfig, true);
  const quoteVault = getAssociatedTokenAddressSync(USDC_MINT, protocolConfig, true);
  console.log("Protocol Collateral Vault (NVDAx):", collatVault.toBase58());
  const cvInfo = await conn.getAccountInfo(collatVault);
  if (cvInfo) {
    const raw = cvInfo.data.readBigUInt64LE(64);
    console.log("  Vault NVDAx Balance:", (Number(raw) / 1e6).toFixed(4));
  }
  console.log("Protocol Liquidity Vault (USDC):", quoteVault.toBase58());
  const qvInfo = await conn.getAccountInfo(quoteVault);
  if (qvInfo) {
    const raw = qvInfo.data.readBigUInt64LE(64);
    console.log("  Vault USDC Liquidity:", (Number(raw) / 1e6).toFixed(4));
  }

  console.log("\n=== 4. ASSET CONFIG ===");
  const [assetConfig] = PublicKey.findProgramAddressSync([Buffer.from("asset"), NVDA_MINT.toBuffer()], PROGRAM_ID);
  console.log("AssetConfig PDA:", assetConfig.toBase58());
  const acInfo = await conn.getAccountInfo(assetConfig);
  if (acInfo) {
    const mint = new PublicKey(acInfo.data.slice(8, 40));
    const feed = new PublicKey(acInfo.data.slice(40, 72));
    const baseLtv = acInfo.data.readBigUInt64LE(104);
    const liqThresh = acInfo.data.readBigUInt64LE(112);
    const maxOracleAge = acInfo.data.readBigUInt64LE(128);
    const maxConfBps = acInfo.data.readBigUInt64LE(136);
    const custodyByte = acInfo.data[144];
    console.log("  Mint:", mint.toBase58());
    console.log("  Feed:", feed.toBase58());
    console.log("  Base LTV Bps:", baseLtv.toString());
    console.log("  Liq Threshold Bps:", liqThresh.toString());
    console.log("  Max Oracle Age:", maxOracleAge.toString());
    console.log("  Max Conf Bps:", maxConfBps.toString());
    console.log("  Custody byte:", custodyByte);
  }

  console.log("\n=== 5. PYTH PRICE ACCOUNT ===");
  console.log("Pyth Account:", PYTH_NVDA.toBase58());
  const pythInfo = await conn.getAccountInfo(PYTH_NVDA);
  if (pythInfo) {
    console.log("  Length:", pythInfo.data.length);
    // Parse price update v2
    const price = pythInfo.data.readBigInt64LE(73);
    const conf = pythInfo.data.readBigUInt64LE(81);
    const expo = pythInfo.data.readInt32LE(89);
    const publishTime = pythInfo.data.readBigInt64LE(93);
    const now = Math.floor(Date.now() / 1000);
    const age = now - Number(publishTime);
    console.log("  Price:", (Number(price) * Math.pow(10, expo)).toFixed(2));
    console.log("  Conf:", (Number(conf) * Math.pow(10, expo)).toFixed(4));
    console.log("  Publish Time:", publishTime.toString(), "Age (sec):", age);
  }
}

main().catch(console.error);
