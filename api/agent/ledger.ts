/**
 * Circuit Protocol — Server-Side Agent Credit Ledger
 *
 * Append-only, idempotent, resource-metered compute budget system for Circuit Agent.
 *
 * Cardinal Invariant:
 * Agent Credits govern COMPUTE.
 * Circuit Permissions govern CAPITAL.
 * At 0 credits: AI stops. Circuit manual protocol operations NEVER stop.
 */


export type LedgerEntryType =
  | "FIRST_CONNECT"
  | "RESERVATION"
  | "CONSUMPTION"
  | "RELEASE"
  | "EXPIRED"
  | "ADJUSTMENT";

export interface LedgerEntry {
  id: string;
  walletAddress: string;
  entryType: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  reservedAfter: number;
  availableAfter: number;
  referenceId?: string;
  description: string;
  timestamp: number;
  network: string;
}

export interface CreditReservation {
  reservationId: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
  description: string;
  referenceId?: string;
}

export type CreditRegime =
  | "FULL_CAPABILITY" // 100-76
  | "NORMAL_USAGE"    // 75-51
  | "COST_AWARE"     // 50-26
  | "CONSERVATION"   // 25-11
  | "LOW_CREDIT"     // 10-1
  | "BLOCKED";       // 0

export interface WalletCreditAccount {
  walletAddress: string;
  firstConnectClaimed: boolean;
  totalGranted: number;
  totalConsumed: number;
  currentReserved: number;
  available: number;
  regime: CreditRegime;
  ledgerVersion: number;
  createdAt: number;
  updatedAt: number;
  activeReservations: Record<string, CreditReservation>;
}

// ── In-Memory Append-Only Store ─────────────────────────────────────────────
const accountsStore = new Map<string, WalletCreditAccount>();
const ledgerStore = new Map<string, LedgerEntry[]>();
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
const accountLocks = new Set<string>();

const FIRST_CONNECT_GRANT_AMOUNT = 100;
const DEFAULT_NETWORK = "devnet";
const RESERVATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function deriveCreditRegime(available: number): CreditRegime {
  if (available <= 0) return "BLOCKED";
  if (available <= 10) return "LOW_CREDIT";
  if (available <= 25) return "CONSERVATION";
  if (available <= 50) return "COST_AWARE";
  if (available <= 75) return "NORMAL_USAGE";
  return "FULL_CAPABILITY";
}

function randomHex(bytes: number): string {
  let str = "";
  for (let i = 0; i < bytes; i++) {
    str += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return str;
}

function uid(prefix = "cldg"): string {
  return `${prefix}_${Date.now()}_${randomHex(4)}`;
}

function acquireLock(wallet: string): boolean {
  if (accountLocks.has(wallet)) return false;
  accountLocks.add(wallet);
  return true;
}

function releaseLock(wallet: string): void {
  accountLocks.delete(wallet);
}

function getOrCreateAccount(walletAddress: string): WalletCreditAccount {
  let acc = accountsStore.get(walletAddress);
  if (!acc) {
    acc = {
      walletAddress,
      firstConnectClaimed: false,
      totalGranted: 0,
      totalConsumed: 0,
      currentReserved: 0,
      available: 0,
      regime: "BLOCKED",
      ledgerVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      activeReservations: {},
    };
    accountsStore.set(walletAddress, acc);
    ledgerStore.set(walletAddress, []);
  }
  return acc;
}

// ── Authentication Challenge & Idempotent Grant ──────────────────────────────

export function generateAuthChallenge(walletAddress: string): string {
  const nonce = randomHex(16);
  const timestamp = Date.now();
  const challenge = `Circuit Agent Authorization Challenge: ${walletAddress} at ${timestamp} (nonce: ${nonce})`;
  challengeStore.set(walletAddress, {
    challenge,
    expiresAt: timestamp + 5 * 60 * 1000,
  });
  return challenge;
}

export function verifyChallengeFormat(walletAddress: string, providedChallenge: string): boolean {
  const stored = challengeStore.get(walletAddress);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    challengeStore.delete(walletAddress);
    return false;
  }
  return stored.challenge === providedChallenge;
}

/**
 * Claim the one-time introductory 100-credit grant.
 * Idempotent: Can only be claimed once per wallet address.
 */
export function claimFirstConnectGrant(
  walletAddress: string,
  network = DEFAULT_NETWORK,
  signatureProof?: string
): { success: boolean; account: WalletCreditAccount; message: string; granted: boolean } {
  // Validate public key syntax
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    throw new Error(`Invalid Solana public key format: ${walletAddress}`);
  }

  while (!acquireLock(walletAddress)) {
    // Atomic spinlock
  }

  try {
    const acc = getOrCreateAccount(walletAddress);

    if (acc.firstConnectClaimed) {
      return {
        success: true,
        account: acc,
        message: "First-connect introductory credits already claimed.",
        granted: false,
      };
    }

    acc.firstConnectClaimed = true;
    acc.totalGranted += FIRST_CONNECT_GRANT_AMOUNT;
    acc.available = acc.totalGranted - acc.totalConsumed - acc.currentReserved;
    acc.regime = deriveCreditRegime(acc.available);
    acc.ledgerVersion += 1;
    acc.updatedAt = Date.now();

    const entry: LedgerEntry = {
      id: uid("grant"),
      walletAddress,
      entryType: "FIRST_CONNECT",
      amount: FIRST_CONNECT_GRANT_AMOUNT,
      balanceAfter: acc.totalGranted - acc.totalConsumed,
      reservedAfter: acc.currentReserved,
      availableAfter: acc.available,
      description: "One-time introductory Agent compute grant (100 credits)",
      timestamp: Date.now(),
      network,
    };

    const entries = ledgerStore.get(walletAddress) || [];
    entries.push(entry);
    ledgerStore.set(walletAddress, entries);

    return {
      success: true,
      account: acc,
      message: "100 introductory Agent credits successfully granted.",
      granted: true,
    };
  } finally {
    releaseLock(walletAddress);
  }
}

// ── Atomic Credit Reservation & Settlement ─────────────────────────────────

export interface ReservationResult {
  success: boolean;
  reservationId?: string;
  error?: string;
  availableAfter?: number;
  reservedAfter?: number;
}

export function reserveCredits(
  walletAddress: string,
  amount: number,
  referenceId?: string,
  description = "Agent execution reservation",
  ttlMs = RESERVATION_TTL_MS
): ReservationResult {
  if (amount <= 0) {
    return { success: false, error: "Reservation amount must be positive" };
  }

  while (!acquireLock(walletAddress)) {
    // Spinlock
  }

  try {
    // Expire any stale reservations before checking balance
    expireStaleReservationsInternal(walletAddress);

    const acc = getOrCreateAccount(walletAddress);

    if (acc.available < amount) {
      return {
        success: false,
        error: `Insufficient available Agent credits (Available: ${acc.available}, Requested: ${amount})`,
        availableAfter: acc.available,
        reservedAfter: acc.currentReserved,
      };
    }

    const reservationId = uid("res");
    const reservation: CreditReservation = {
      reservationId,
      amount,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      description,
      referenceId,
    };

    acc.currentReserved += amount;
    acc.available = acc.totalGranted - acc.totalConsumed - acc.currentReserved;
    acc.regime = deriveCreditRegime(acc.available);
    acc.activeReservations[reservationId] = reservation;
    acc.ledgerVersion += 1;
    acc.updatedAt = Date.now();

    const entry: LedgerEntry = {
      id: uid("res_ent"),
      walletAddress,
      entryType: "RESERVATION",
      amount,
      balanceAfter: acc.totalGranted - acc.totalConsumed,
      reservedAfter: acc.currentReserved,
      availableAfter: acc.available,
      referenceId,
      description: `Reserved ${amount} credits for ${description}`,
      timestamp: Date.now(),
      network: DEFAULT_NETWORK,
    };

    const entries = ledgerStore.get(walletAddress) || [];
    entries.push(entry);
    ledgerStore.set(walletAddress, entries);

    return {
      success: true,
      reservationId,
      availableAfter: acc.available,
      reservedAfter: acc.currentReserved,
    };
  } finally {
    releaseLock(walletAddress);
  }
}

export interface SettlementResult {
  success: boolean;
  consumed: number;
  released: number;
  availableAfter: number;
  error?: string;
}

export function settleCredits(
  walletAddress: string,
  reservationId: string,
  actualConsumed: number,
  description = "Agent execution completed"
): SettlementResult {
  while (!acquireLock(walletAddress)) {
    // Spinlock
  }

  try {
    const acc = getOrCreateAccount(walletAddress);
    const reservation = acc.activeReservations[reservationId];

    if (!reservation) {
      return {
        success: false,
        consumed: 0,
        released: 0,
        availableAfter: acc.available,
        error: `Reservation ${reservationId} not found or already settled.`,
      };
    }

    const reservedAmount = reservation.amount;
    const finalConsumed = Math.min(Math.max(0, actualConsumed), reservedAmount);
    const unusedAmount = reservedAmount - finalConsumed;

    acc.currentReserved -= reservedAmount;
    acc.totalConsumed += finalConsumed;
    acc.available = acc.totalGranted - acc.totalConsumed - acc.currentReserved;
    acc.regime = deriveCreditRegime(acc.available);
    delete acc.activeReservations[reservationId];
    acc.ledgerVersion += 1;
    acc.updatedAt = Date.now();

    const entries = ledgerStore.get(walletAddress) || [];

    // Log consumption
    if (finalConsumed > 0) {
      entries.push({
        id: uid("cons"),
        walletAddress,
        entryType: "CONSUMPTION",
        amount: finalConsumed,
        balanceAfter: acc.totalGranted - acc.totalConsumed,
        reservedAfter: acc.currentReserved,
        availableAfter: acc.available,
        referenceId: reservation.referenceId,
        description: `Consumed ${finalConsumed} credits: ${description}`,
        timestamp: Date.now(),
        network: DEFAULT_NETWORK,
      });
    }

    // Log release of unused credits
    if (unusedAmount > 0) {
      entries.push({
        id: uid("rel"),
        walletAddress,
        entryType: "RELEASE",
        amount: unusedAmount,
        balanceAfter: acc.totalGranted - acc.totalConsumed,
        reservedAfter: acc.currentReserved,
        availableAfter: acc.available,
        referenceId: reservation.referenceId,
        description: `Released ${unusedAmount} unused reserved credits`,
        timestamp: Date.now(),
        network: DEFAULT_NETWORK,
      });
    }

    ledgerStore.set(walletAddress, entries);

    return {
      success: true,
      consumed: finalConsumed,
      released: unusedAmount,
      availableAfter: acc.available,
    };
  } finally {
    releaseLock(walletAddress);
  }
}

/**
 * Release an active reservation in full back to available balance.
 */
export function releaseReservation(
  walletAddress: string,
  reservationId: string,
  reason = "Reservation cancelled"
): SettlementResult {
  return settleCredits(walletAddress, reservationId, 0, reason);
}

/**
 * Direct atomic consumption for low-cost operations (e.g. Lite 1-credit queries).
 */
export function consumeCreditsDirect(
  walletAddress: string,
  amount: number,
  description = "Direct agent operation",
  referenceId?: string
): { success: boolean; availableAfter: number; error?: string } {
  while (!acquireLock(walletAddress)) {
    // Spinlock
  }

  try {
    const acc = getOrCreateAccount(walletAddress);

    if (acc.available < amount) {
      return {
        success: false,
        availableAfter: acc.available,
        error: `Insufficient available credits (Available: ${acc.available}, Required: ${amount})`,
      };
    }

    acc.totalConsumed += amount;
    acc.available = acc.totalGranted - acc.totalConsumed - acc.currentReserved;
    acc.regime = deriveCreditRegime(acc.available);
    acc.ledgerVersion += 1;
    acc.updatedAt = Date.now();

    const entry: LedgerEntry = {
      id: uid("cons_dir"),
      walletAddress,
      entryType: "CONSUMPTION",
      amount,
      balanceAfter: acc.totalGranted - acc.totalConsumed,
      reservedAfter: acc.currentReserved,
      availableAfter: acc.available,
      referenceId,
      description,
      timestamp: Date.now(),
      network: DEFAULT_NETWORK,
    };

    const entries = ledgerStore.get(walletAddress) || [];
    entries.push(entry);
    ledgerStore.set(walletAddress, entries);

    return {
      success: true,
      availableAfter: acc.available,
    };
  } finally {
    releaseLock(walletAddress);
  }
}

function expireStaleReservationsInternal(walletAddress: string): void {
  const acc = accountsStore.get(walletAddress);
  if (!acc) return;

  const now = Date.now();
  const entries = ledgerStore.get(walletAddress) || [];

  for (const [resId, res] of Object.entries(acc.activeReservations)) {
    if (now > res.expiresAt) {
      acc.currentReserved -= res.amount;
      delete acc.activeReservations[resId];

      entries.push({
        id: uid("exp"),
        walletAddress,
        entryType: "EXPIRED",
        amount: res.amount,
        balanceAfter: acc.totalGranted - acc.totalConsumed,
        reservedAfter: acc.currentReserved,
        availableAfter: acc.totalGranted - acc.totalConsumed - acc.currentReserved,
        referenceId: res.referenceId,
        description: `Expired reservation ${resId} of ${res.amount} credits restored to available`,
        timestamp: now,
        network: DEFAULT_NETWORK,
      });
    }
  }

  acc.available = acc.totalGranted - acc.totalConsumed - acc.currentReserved;
  acc.regime = deriveCreditRegime(acc.available);
}

export function getAccount(walletAddress: string): WalletCreditAccount {
  while (!acquireLock(walletAddress)) {
    // Spinlock
  }
  try {
    expireStaleReservationsInternal(walletAddress);
    return { ...getOrCreateAccount(walletAddress) };
  } finally {
    releaseLock(walletAddress);
  }
}

export function getLedgerHistory(walletAddress: string): LedgerEntry[] {
  return [...(ledgerStore.get(walletAddress) || [])];
}

export function resetLedgerForTesting(): void {
  accountsStore.clear();
  ledgerStore.clear();
  challengeStore.clear();
  accountLocks.clear();
}
