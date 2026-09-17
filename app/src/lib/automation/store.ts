/**
 * Circuit Protocol — Client-Side Automation Store
 *
 * Persists task definitions and execution history in localStorage.
 * Syncs to the server via /api/automation/sync so Vercel Cron can
 * execute tasks even when the browser is closed (last-known state).
 */

import type { AutomationTask, ExecutionRecord, ParsedTaskProposal, FrequencyMinutes } from "./types";

const TASKS_KEY = "circuit_automation_tasks_v1";
const EXECUTIONS_KEY = "circuit_automation_executions_v1";
const MAX_EXECUTIONS_HISTORY = 100;

function uid(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function execUid(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadTasks(): AutomationTask[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AutomationTask[];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: AutomationTask[]): void {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch { /* storage full — ignore */ }
}

export function createTask(
  owner: string,
  proposal: ParsedTaskProposal
): AutomationTask {
  const now = Date.now();
  const task: AutomationTask = {
    id: uid(),
    owner,
    name: proposal.name,
    type: proposal.type,
    status: "ACTIVE",
    condition: proposal.condition,
    policy: proposal.policy,
    frequencyMinutes: proposal.frequencyMinutes,
    createdAt: now,
    activatedAt: now,
    expiresAt: proposal.expireDays > 0 ? now + proposal.expireDays * 86400_000 : null,
    lastCheckedAt: null,
    nextRunAt: now, // run immediately on first tick
    lastResult: null,
    maxExecutionsPerDay: 288, // default: max every 5min = 288/day
    executionsToday: 0,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
  };
  const tasks = loadTasks();
  saveTasks([...tasks, task]);
  return task;
}

export function updateTask(id: string, patch: Partial<AutomationTask>): AutomationTask | null {
  const tasks = loadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  // Policy is immutable after activation — never let caller silently mutate it
  const { policy: _ignored, ...safePatch } = patch;
  void _ignored;
  tasks[idx] = { ...tasks[idx], ...safePatch };
  saveTasks(tasks);
  return tasks[idx];
}

export function pauseTask(id: string): void {
  updateTask(id, { status: "PAUSED" });
}

export function resumeTask(id: string): void {
  updateTask(id, { status: "ACTIVE", nextRunAt: Date.now() });
}

export function deleteTask(id: string): void {
  const tasks = loadTasks().filter(t => t.id !== id);
  saveTasks(tasks);
}

export function loadExecutions(): ExecutionRecord[] {
  try {
    const raw = localStorage.getItem(EXECUTIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExecutionRecord[];
  } catch {
    return [];
  }
}

export function addExecution(record: ExecutionRecord): void {
  const execs = loadExecutions();
  const updated = [record, ...execs].slice(0, MAX_EXECUTIONS_HISTORY);
  try {
    localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

export function makeExecutionId(): string {
  return execUid();
}

/** Push task list to server so Cron handler has current state */
export async function syncToServer(owner: string): Promise<void> {
  const tasks = loadTasks().filter(t => t.owner === owner && t.status === "ACTIVE");
  try {
    await fetch("/api/automation/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, tasks }),
    });
  } catch { /* sync is best-effort */ }
}

/** Ask server to evaluate conditions NOW and return result */
export async function triggerNow(taskId: string, owner: string): Promise<ExecutionRecord | null> {
  try {
    const tasks = loadTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;
    const res = await fetch("/api/automation/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, owner }),
    });
    if (!res.ok) return null;
    const record = await res.json() as ExecutionRecord;
    addExecution(record);
    // Update task with result
    updateTask(taskId, {
      lastCheckedAt: Date.now(),
      lastResult: record,
      nextRunAt: Date.now() + task.frequencyMinutes * 60_000,
    });
    return record;
  } catch {
    return null;
  }
}

export function parseTaskProposal(text: string): ParsedTaskProposal | null {
  const match = text.match(/CIRCUIT_TASK:\s*(\{[\s\S]+?\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as ParsedTaskProposal;
  } catch {
    return null;
  }
}
