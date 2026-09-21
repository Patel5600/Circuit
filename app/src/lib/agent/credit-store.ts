/**
 * Circuit Protocol — Client-Side Agent Credit Store
 *
 * Reactive state store managing Agent compute credits, reservations,
 * and introductory grant claims in the frontend.
 */

import { getCreditRegime, CreditRegime, getCreditWarning, DEFAULT_CREDIT_POLICY } from "./credit-policy";

export interface ClientCreditState {
  owner: string | null;
  available: number;
  reserved: number;
  totalGranted: number;
  totalConsumed: number;
  regime: CreditRegime;
  warning: string | null;
  loading: boolean;
  firstConnectClaimed: boolean;
}

type CreditListener = (state: ClientCreditState) => void;

class AgentCreditStore {
  private state: ClientCreditState = {
    owner: null,
    available: 100,
    reserved: 0,
    totalGranted: 100,
    totalConsumed: 0,
    regime: "FULL_CAPABILITY",
    warning: null,
    loading: false,
    firstConnectClaimed: false,
  };

  private listeners = new Set<CreditListener>();

  public getState(): ClientCreditState {
    return { ...this.state };
  }

  public subscribe(listener: CreditListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const s = this.getState();
    this.listeners.forEach(l => l(s));
  }

  public async loadForWallet(owner: string): Promise<void> {
    if (!owner) return;
    this.state.owner = owner;
    this.state.loading = true;
    this.emit();

    try {
      const res = await fetch(`/api/agent/credit?owner=${owner}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.account) {
          this.applyAccount(data.account);
          // If first connect not claimed, auto-claim
          if (!data.account.firstConnectClaimed) {
            await this.claimIntroductoryGrant(owner);
          }
          return;
        }
      }
      // If endpoint unavailable (e.g. offline dev), fallback to optimistic local first grant
      this.applyFallbackGrant(owner);
    } catch {
      this.applyFallbackGrant(owner);
    } finally {
      this.state.loading = false;
      this.emit();
    }
  }

  public async claimIntroductoryGrant(owner: string): Promise<boolean> {
    try {
      const res = await fetch("/api/agent/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", owner }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.account) {
          this.applyAccount(data.account);
          return true;
        }
      }
    } catch {
      // Fallback
    }
    this.applyFallbackGrant(owner);
    return true;
  }

  public async reserve(amount: number, description?: string, refId?: string): Promise<{ success: boolean; reservationId?: string }> {
    if (!this.state.owner || this.state.available < amount) {
      return { success: false };
    }

    try {
      const res = await fetch("/api/agent/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reserve",
          owner: this.state.owner,
          amount,
          description,
          referenceId: refId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        this.state.reserved = data.reservedAfter ?? (this.state.reserved + amount);
        this.state.available = data.availableAfter ?? Math.max(0, this.state.available - amount);
        this.state.regime = getCreditRegime(this.state.available);
        this.state.warning = getCreditWarning(this.state.available);
        this.emit();
        return { success: true, reservationId: data.reservationId };
      }
    } catch {
      // Optimistic local reservation
      this.state.reserved += amount;
      this.state.available = Math.max(0, this.state.available - amount);
      this.state.regime = getCreditRegime(this.state.available);
      this.state.warning = getCreditWarning(this.state.available);
      this.emit();
      return { success: true, reservationId: `local_res_${Date.now()}` };
    }

    return { success: false };
  }

  public async settle(reservationId: string, actualConsumed: number): Promise<void> {
    if (!this.state.owner) return;

    try {
      const res = await fetch("/api/agent/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settle",
          owner: this.state.owner,
          reservationId,
          amount: actualConsumed,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        this.state.totalConsumed += data.consumed ?? actualConsumed;
        this.state.available = data.availableAfter ?? this.state.available;
        this.state.reserved = Math.max(0, this.state.reserved - (data.consumed + data.released));
        this.state.regime = getCreditRegime(this.state.available);
        this.state.warning = getCreditWarning(this.state.available);
        this.emit();
        return;
      }
    } catch {
      // Optimistic local settle
    }
  }

  public async consumeDirect(amount: number, description?: string): Promise<boolean> {
    if (!this.state.owner || this.state.available < amount) return false;

    // Optimistic decrement
    this.state.available = Math.max(0, this.state.available - amount);
    this.state.totalConsumed += amount;
    this.state.regime = getCreditRegime(this.state.available);
    this.state.warning = getCreditWarning(this.state.available);
    this.emit();

    try {
      await fetch("/api/agent/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "consume",
          owner: this.state.owner,
          amount,
          description,
        }),
      });
      return true;
    } catch {
      return true;
    }
  }

  private applyAccount(account: any): void {
    this.state.available = account.available ?? 0;
    this.state.reserved = account.currentReserved ?? 0;
    this.state.totalGranted = account.totalGranted ?? 0;
    this.state.totalConsumed = account.totalConsumed ?? 0;
    this.state.firstConnectClaimed = Boolean(account.firstConnectClaimed);
    this.state.regime = getCreditRegime(this.state.available);
    this.state.warning = getCreditWarning(this.state.available);
  }

  private applyFallbackGrant(owner: string): void {
    this.state.owner = owner;
    if (!this.state.firstConnectClaimed) {
      this.state.firstConnectClaimed = true;
      this.state.totalGranted = 100;
      this.state.available = 100;
      this.state.reserved = 0;
      this.state.totalConsumed = 0;
      this.state.regime = "FULL_CAPABILITY";
      this.state.warning = null;
    }
  }
}

export const agentCreditStore = new AgentCreditStore();
