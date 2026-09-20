/**
 * Circuit Protocol — Canonical Decision Log & Audit Trail
 *
 * Records every permission evaluation (ALLOWED or BLOCKED) and its
 * subsequent execution lifecycle.
 *
 * Core Invariant:
 * Every transaction or blocked intent is auditable back to:
 * - exact policy version
 * - risk state
 * - oracle state & confidence
 * - actor & owner identity
 * - deterministic reason code
 * - onchain transaction signature (if executed)
 */

import { ProtocolAction, ActorType, RiskRatchetState, PermissionReasonCode } from "../permission-engine";

export interface DecisionLogEntry {
  id: string;
  timestamp: number; // unix ms
  slot?: number;
  actor: ActorType;
  owner?: string;
  assetSymbol: string;
  action: ProtocolAction;
  requestedAmountUsd: number;
  riskState: RiskRatchetState;
  oraclePriceUsd?: number | null;
  oracleConfidenceBps?: number;
  oracleStatus?: string;
  policyVersion: number;
  allowed: boolean;
  reasonCode: PermissionReasonCode;
  message: string;
  effectiveLtvBps?: number;
  remainingRiskBudgetUsd?: number;
  venue: "CIRCUIT_LENDING" | "METEORA_DBC";
  executionStatus: "PENDING" | "EXECUTED" | "BLOCKED" | "REJECTED_BY_USER" | "FAILED";
  txSignature?: string;
  executionError?: string;
}

export type DecisionLogListener = (entries: DecisionLogEntry[]) => void;

const STORAGE_KEY = "circuit_decision_log_v1";
const MAX_ENTRIES = 150;

class DecisionLogStore {
  private _entries: DecisionLogEntry[] = [];
  private _listeners: Set<DecisionLogListener> = new Set();

  constructor() {
    this._load();
  }

  private _load() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this._entries = JSON.parse(raw);
        }
      } catch (e) {
        console.warn("[DecisionLog] Failed to load cached entries:", e);
      }
    }
  }

  private _save() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries.slice(0, MAX_ENTRIES)));
      } catch (e) {
        console.warn("[DecisionLog] Failed to persist entries:", e);
      }
    }
  }

  private _notify() {
    const snapshot = [...this._entries];
    this._listeners.forEach((fn) => fn(snapshot));
  }

  public recordDecision(entry: Omit<DecisionLogEntry, "id" | "timestamp">): DecisionLogEntry {
    const fullEntry: DecisionLogEntry = {
      ...entry,
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };

    this._entries.unshift(fullEntry);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(0, MAX_ENTRIES);
    }
    this._save();
    this._notify();
    return fullEntry;
  }

  public updateExecution(
    id: string,
    status: DecisionLogEntry["executionStatus"],
    txSignature?: string,
    error?: string
  ): void {
    const idx = this._entries.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this._entries[idx] = {
        ...this._entries[idx],
        executionStatus: status,
        txSignature: txSignature || this._entries[idx].txSignature,
        executionError: error || this._entries[idx].executionError,
      };
      this._save();
      this._notify();
    }
  }

  public getEntries(): DecisionLogEntry[] {
    return [...this._entries];
  }

  public clear(): void {
    this._entries = [];
    this._save();
    this._notify();
  }

  public subscribe(listener: DecisionLogListener): () => void {
    this._listeners.add(listener);
    listener([...this._entries]);
    return () => {
      this._listeners.delete(listener);
    };
  }
}

export const decisionLogStore = new DecisionLogStore();
