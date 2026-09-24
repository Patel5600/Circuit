/**
 * Circuit Protocol — Client Durable Intent Store
 *
 * Persists durable intents in localStorage and syncs with backend /api/automation/intents.
 * Emits window events for real-time reactivity in the Autonomous UI.
 */

import type { DurableIntent, IntentStatus } from "./types";

const INTENTS_STORAGE_KEY = "circuit_durable_intents_v1";

export function loadIntents(): DurableIntent[] {
  try {
    const raw = localStorage.getItem(INTENTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DurableIntent[];
  } catch {
    return [];
  }
}

export function saveIntents(intents: DurableIntent[]): void {
  try {
    localStorage.setItem(INTENTS_STORAGE_KEY, JSON.stringify(intents));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("circuit_intents_changed"));
    }
  } catch {
    /* localStorage full or quota exceeded */
  }
}

export function subscribeIntents(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("circuit_intents_changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("circuit_intents_changed", handler);
    window.removeEventListener("storage", handler);
  };
}

export function createDurableIntent(intent: DurableIntent): DurableIntent {
  const current = loadIntents();
  const exists = current.some(i => i.id === intent.id);
  const updated = exists ? current.map(i => (i.id === intent.id ? intent : i)) : [...current, intent];
  saveIntents(updated);

  // Sync to backend asynchronously
  fetch("/api/automation/intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  }).catch(() => {});

  return intent;
}

export function updateDurableIntent(id: string, patch: Partial<DurableIntent>): DurableIntent | null {
  const current = loadIntents();
  const idx = current.findIndex(i => i.id === id);
  if (idx === -1) return null;

  current[idx] = { ...current[idx], ...patch };
  saveIntents(current);

  // Sync patch to backend asynchronously
  fetch("/api/automation/intents", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, patch }),
  }).catch(() => {});

  return current[idx];
}

export function pauseDurableIntent(id: string): DurableIntent | null {
  return updateDurableIntent(id, { status: "PAUSED" });
}

export function resumeDurableIntent(id: string): DurableIntent | null {
  return updateDurableIntent(id, { status: "ARMED" });
}

export function cancelDurableIntent(id: string): DurableIntent | null {
  return updateDurableIntent(id, { status: "CANCELLED" });
}

export function getActiveIntents(owner?: string): DurableIntent[] {
  const all = loadIntents();
  return all.filter(i => {
    if (owner && i.owner !== owner) return false;
    return i.status === "ARMED" || i.status === "WATCHING" || i.status === "TRIGGERED" || i.status === "WAITING";
  });
}
