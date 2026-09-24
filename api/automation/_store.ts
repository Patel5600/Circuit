/**
 * Circuit Protocol — Server-Side Task & Durable Intent Store
 *
 * In-memory Map shared across API handlers within the same process.
 * Stores both legacy AutomationTasks and modern condition-aware DurableIntents.
 *
 * Provides concurrency control via taskId/intentId execution leases to prevent
 * duplicate execution, race conditions, and replay attacks.
 */

import type { AutomationTask } from "../../app/src/lib/automation/types";
import type { DurableIntent, MachineReadableDecision } from "../../app/src/lib/agent/intent/types";

// Legacy task store
const taskStore = new Map<string, AutomationTask>();
const executionLog: { id: string; ts: number; owner: string; result: unknown }[] = [];
const MAX_EXEC_LOG = 500;

// Modern Durable Intent Store
const intentStore = new Map<string, DurableIntent>();
const decisionLog: MachineReadableDecision[] = [];
const MAX_DECISION_LOG = 1000;

// Concurrency control for idempotent execution
const runningLocks = new Set<string>();

export function acquireTaskLock(id: string): boolean {
  if (runningLocks.has(id)) return false;
  runningLocks.add(id);
  return true;
}

export function releaseTaskLock(id: string): void {
  runningLocks.delete(id);
}

export function isTaskLocked(id: string): boolean {
  return runningLocks.has(id);
}

// ── Legacy Task Methods ───────────────────────────────────────────────────

export function syncTasks(owner: string, tasks: AutomationTask[]): void {
  for (const [id, t] of taskStore.entries()) {
    if (t.owner === owner) taskStore.delete(id);
  }
  for (const task of tasks) {
    taskStore.set(task.id, task);
  }
}

export function createTask(task: AutomationTask): AutomationTask {
  taskStore.set(task.id, task);
  return task;
}

export function getAllActiveTasks(): AutomationTask[] {
  return Array.from(taskStore.values()).filter(
    t => t.status === "ACTIVE" || t.status === "WAITING"
  );
}

export function getTasksByOwner(owner: string): AutomationTask[] {
  return Array.from(taskStore.values()).filter(t => t.owner === owner);
}

export function getTask(id: string): AutomationTask | undefined {
  return taskStore.get(id);
}

export function updateTask(id: string, patch: Partial<AutomationTask>): AutomationTask | undefined {
  const existing = taskStore.get(id);
  if (existing) {
    const updated = { ...existing, ...patch };
    taskStore.set(id, updated);
    return updated;
  }
  return undefined;
}

export function deleteTask(id: string, owner?: string): boolean {
  const existing = taskStore.get(id);
  if (!existing) return false;
  if (owner && existing.owner !== owner) return false;
  return taskStore.delete(id);
}

export function logExecution(owner: string, execId: string, result: unknown): void {
  const existingIdx = executionLog.findIndex(l => l.id === execId);
  if (existingIdx >= 0) {
    executionLog[existingIdx] = { id: execId, ts: Date.now(), owner, result };
    return;
  }
  executionLog.unshift({ id: execId, ts: Date.now(), owner, result });
  if (executionLog.length > MAX_EXEC_LOG) executionLog.length = MAX_EXEC_LOG;
}

export function getExecutionLogs(owner?: string): Array<{ id: string; ts: number; owner: string; result: unknown }> {
  if (!owner) return executionLog;
  return executionLog.filter(l => l.owner === owner);
}

// ── Modern Durable Intent Methods ─────────────────────────────────────────

export function createDurableIntentServer(intent: DurableIntent): DurableIntent {
  intentStore.set(intent.id, intent);
  return intent;
}

export function getDurableIntentServer(id: string): DurableIntent | undefined {
  return intentStore.get(id);
}

export function getAllActiveDurableIntents(): DurableIntent[] {
  return Array.from(intentStore.values()).filter(i =>
    i.status === "ARMED" || i.status === "WATCHING" || i.status === "TRIGGERED" || i.status === "WAITING"
  );
}

export function getDurableIntentsByOwner(owner: string): DurableIntent[] {
  return Array.from(intentStore.values()).filter(i => i.owner === owner);
}

export function updateDurableIntentServer(id: string, patch: Partial<DurableIntent>): DurableIntent | undefined {
  const existing = intentStore.get(id);
  if (existing) {
    const updated = { ...existing, ...patch };
    intentStore.set(id, updated);
    return updated;
  }
  return undefined;
}

export function deleteDurableIntentServer(id: string, owner?: string): boolean {
  const existing = intentStore.get(id);
  if (!existing) return false;
  if (owner && existing.owner !== owner) return false;
  return intentStore.delete(id);
}

export function logDecisionRecord(decision: MachineReadableDecision): void {
  decisionLog.unshift(decision);
  if (decisionLog.length > MAX_DECISION_LOG) decisionLog.length = MAX_DECISION_LOG;
}

export function getDecisionRecords(intentId?: string): MachineReadableDecision[] {
  if (!intentId) return decisionLog;
  return decisionLog.filter(d => d.intentId === intentId);
}
