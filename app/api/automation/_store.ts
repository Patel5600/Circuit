/**
 * Circuit Protocol — Server-Side Task Store
 *
 * In-memory Map shared across API handlers within the same Vercel instance.
 * Populated by /api/automation/sync calls from the client browser.
 * Survives hot reloads but resets on cold starts.
 *
 * Upgrade path: set VERCEL_KV_URL to swap to Vercel KV (Redis) for
 * fully durable persistence without code changes.
 */

import type { AutomationTask } from "../../app/src/lib/automation/types";

// Global in-memory store shared between handlers in same process
const taskStore = new Map<string, AutomationTask>();
const executionLog: { id: string; ts: number; owner: string; result: unknown }[] = [];
const MAX_EXEC_LOG = 500;

// Concurrency control for idempotent task execution
const runningTaskLocks = new Set<string>();

export function acquireTaskLock(taskId: string): boolean {
  if (runningTaskLocks.has(taskId)) return false;
  runningTaskLocks.add(taskId);
  return true;
}

export function releaseTaskLock(taskId: string): void {
  runningTaskLocks.delete(taskId);
}

export function isTaskLocked(taskId: string): boolean {
  return runningTaskLocks.has(taskId);
}

export function syncTasks(owner: string, tasks: AutomationTask[]): void {
  // Remove existing tasks for this owner then insert fresh
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
