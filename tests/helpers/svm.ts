import { Keypair, PublicKey, Transaction } from "@solana/web3.js";

let LiteSVM: any = null;
let FailedTransactionMetadata: any = null;
let TransactionMetadata: any = null;
export let isLiteSvmAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const litesvmModule = require("litesvm");
  LiteSVM = litesvmModule.LiteSVM;
  FailedTransactionMetadata = litesvmModule.FailedTransactionMetadata;
  TransactionMetadata = litesvmModule.TransactionMetadata;
  isLiteSvmAvailable = Boolean(LiteSVM);
} catch (_e) {
  isLiteSvmAvailable = false;
}

export type SvmResult = any;

/** The Kit `Transaction` shape that `LiteSVM.sendTransaction` consumes. */
export interface KitTransaction {
  messageBytes: Uint8Array;
  signatures: Record<string, Uint8Array | null>;
}

/** The Kit `EncodedAccount` shape that `LiteSVM.setAccount` consumes. */
export interface KitEncodedAccount {
  address: string;
  data: Uint8Array;
  executable: boolean;
  lamports: bigint;
  programAddress: string;
  space: bigint;
}

export function toKitTransaction(tx: Transaction): KitTransaction {
  const messageBytes = new Uint8Array(tx.serializeMessage());
  const signatures: Record<string, Uint8Array | null> = {};
  for (const { publicKey, signature } of tx.signatures) {
    signatures[publicKey.toBase58()] = signature
      ? new Uint8Array(signature)
      : null;
  }
  return { messageBytes, signatures };
}

export function toKitAccount(
  address: PublicKey,
  opts: {
    data: Uint8Array;
    owner: PublicKey;
    lamports: bigint;
    executable?: boolean;
  }
): KitEncodedAccount {
  return {
    address: address.toBase58(),
    data: opts.data,
    executable: opts.executable ?? false,
    lamports: opts.lamports,
    programAddress: opts.owner.toBase58(),
    space: BigInt(opts.data.length),
  };
}

export function isFailure(res: SvmResult): boolean {
  if (FailedTransactionMetadata && res instanceof FailedTransactionMetadata) {
    return true;
  }
  return Boolean(res && typeof res.err === "function" && res.err() != null);
}

export function isSuccess(res: SvmResult): boolean {
  if (TransactionMetadata && res instanceof TransactionMetadata) {
    return true;
  }
  return Boolean(res && typeof res.err === "function" && res.err() == null);
}

export function logsOf(res: SvmResult): string[] {
  if (FailedTransactionMetadata && res instanceof FailedTransactionMetadata) {
    return res.meta()?.logs() ?? [];
  }
  if (TransactionMetadata && res instanceof TransactionMetadata) {
    return res.logs() ?? [];
  }
  if (res && typeof res.logs === "function") {
    return res.logs() ?? [];
  }
  if (res && typeof res.meta === "function") {
    return res.meta()?.logs() ?? [];
  }
  return [];
}

export function errOf(res: SvmResult): string {
  if (res && typeof res.err === "function") {
    return String(res.err() ?? "");
  }
  return "";
}

/** Thin typed wrapper so tests never touch base58 conversion directly. */
export class Svm {
  readonly inner: any;

  constructor(inner: any) {
    this.inner = inner;
  }

  static create(): Svm {
    if (!isLiteSvmAvailable || !LiteSVM) {
      throw new Error("LiteSVM native binary is unavailable in this environment");
    }
    const inner = new LiteSVM().withTransactionHistory(0n);
    return new Svm(inner);
  }

  addProgramFromFile(programId: PublicKey, soPath: string): void {
    this.inner.addProgramFromFile(programId.toBase58() as any, soPath);
  }

  airdrop(to: PublicKey, lamports: bigint): void {
    this.inner.airdrop(to.toBase58() as any, lamports as any);
  }

  rent(size: number): bigint {
    return this.inner.minimumBalanceForRentExemption(BigInt(size));
  }

  setAccount(
    address: PublicKey,
    opts: {
      data: Uint8Array;
      owner: PublicKey;
      lamports?: bigint;
      executable?: boolean;
    }
  ): void {
    const lamports = opts.lamports ?? this.rent(opts.data.length);
    this.inner.setAccount(
      toKitAccount(address, { ...opts, lamports }) as any
    );
  }

  /** Returns raw account bytes, or null when the account does not exist. */
  getAccount(address: PublicKey): { data: Uint8Array; owner: string } | null {
    const acc: any = this.inner.getAccount(address.toBase58() as any);
    if (!acc || acc.exists === false) return null;
    return { data: acc.data, owner: acc.programAddress };
  }

  getBalance(address: PublicKey): bigint | null {
    return this.inner.getBalance(address.toBase58() as any) as any;
  }

  send(tx: Transaction): SvmResult {
    return this.inner.sendTransaction(toKitTransaction(tx) as any);
  }

  latestBlockhash(): string {
    return this.inner.latestBlockhash();
  }

  getClockUnixTimestamp(): bigint {
    return this.inner.getClock().unixTimestamp;
  }

  setClockUnixTimestamp(unixSeconds: bigint): void {
    const clock = this.inner.getClock();
    clock.unixTimestamp = unixSeconds;
    this.inner.setClock(clock);
  }

  warpToSlot(slot: bigint): void {
    this.inner.warpToSlot(slot);
  }
}

export { FailedTransactionMetadata, TransactionMetadata, Keypair };
