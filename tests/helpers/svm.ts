import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  LiteSVM,
  FailedTransactionMetadata,
  TransactionMetadata,
} from "litesvm";

/**
 * Bridge between web3.js v1 and LiteSVM.
 *
 * LiteSVM 1.4 is built on @solana/kit v8, where addresses are base58 strings
 * and a Transaction is `{ messageBytes, signatures }`. Anchor 1.2
 * (@anchor-lang/core) still depends on @solana/web3.js v1, which uses
 * `PublicKey` objects and a `Transaction` class. Rather than pick one stack and
 * lose either Anchor's IDL instruction builders or LiteSVM's modern runtime,
 * this module converts at the boundary.
 *
 * The conversion is exact, not approximate:
 *   - a signed web3.js `Transaction` already orders `tx.signatures` to match the
 *     compiled message's signer order, and JS preserves string-key insertion
 *     order, so the resulting signatures map is correctly ordered.
 *   - `serializeMessage()` produces precisely the wire-format compiled message
 *     bytes that Kit's `messageBytes` expects.
 */

export type SvmResult = TransactionMetadata | FailedTransactionMetadata;

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
  return res instanceof FailedTransactionMetadata;
}

export function logsOf(res: SvmResult): string[] {
  if (res instanceof FailedTransactionMetadata) {
    return res.meta()?.logs() ?? [];
  }
  return (res as TransactionMetadata).logs() ?? [];
}

export function errOf(res: SvmResult): string {
  if (res instanceof FailedTransactionMetadata) {
    return String(res.err());
  }
  return "";
}

/** Thin typed wrapper so tests never touch base58 conversion directly. */
export class Svm {
  constructor(readonly inner: LiteSVM) {}

  static create(): Svm {
    // Transaction history capacity 0 permits duplicate transactions, which the
    // suite relies on when replaying an identical instruction (e.g. depositing
    // the same amount twice).
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
