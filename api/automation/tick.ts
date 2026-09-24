/**
 * GET /api/automation/tick
 *
 * Vercel Cron handler — triggered every 5 minutes by Vercel scheduler.
 * Also accepts POST from the UI for manual triggering / instant evaluation.
 *
 * Pipeline for each due task and active durable intent:
 *   1. Read real Devnet state
 *   2. Evaluate deterministic condition
 *   3. Re-evaluate Circuit permission engine
 *   4. Execute if permitted (requires AGENT_SIGNER_SECRET)
 *   5. Verify onchain result & reconcile state
 *   6. Record auditable decision log
 */
import type { VercelRequest, VercelResponse } from "../_types";
import {
  getAllActiveTasks,
  updateTask,
  logExecution,
  getAllActiveDurableIntents,
} from "./_store";
import { runTaskPipeline, runDurableIntentPipeline } from "./_engine";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();

  // 1. Process Modern Durable Intents (Persistent Autonomous Capital Agent)
  const activeIntents = getAllActiveDurableIntents();
  const intentDecisions: unknown[] = [];

  for (const intent of activeIntents) {
    try {
      const decision = await runDurableIntentPipeline(intent);
      intentDecisions.push(decision);
    } catch (err) {
      console.error(`Intent ${intent.id} execution error:`, err);
    }
  }

  // 2. Process Legacy Tasks
  const tasks = getAllActiveTasks();
  const dueTasks = tasks.filter(t => {
    if (t.status !== "ACTIVE") return false;
    if (t.nextRunAt === null) return true;
    return now >= t.nextRunAt;
  });

  const results: unknown[] = [];

  for (const task of dueTasks) {
    try {
      updateTask(task.id, { status: "RUNNING" });
      const result = await runTaskPipeline(task);

      const succeeded = ["OBSERVED", "CONDITION_NOT_MET", "CONFIRMED", "SUBMITTED"].includes(result.outcome);
      updateTask(task.id, {
        status: "ACTIVE",
        lastCheckedAt: now,
        lastResult: result,
        nextRunAt: now + task.frequencyMinutes * 60_000,
        executionsToday: task.executionsToday + 1,
        consecutiveFailures: succeeded ? 0 : task.consecutiveFailures + 1,
      });

      const updatedTask = { ...task, consecutiveFailures: succeeded ? 0 : task.consecutiveFailures + 1 };
      if (updatedTask.consecutiveFailures >= updatedTask.maxConsecutiveFailures) {
        updateTask(task.id, { status: "PAUSED" });
        console.warn(`Task ${task.id} paused after ${updatedTask.consecutiveFailures} consecutive failures`);
      }

      logExecution(task.owner, result.executionId, result);
      results.push({ taskId: task.id, taskName: task.name, ...result });
    } catch (err) {
      console.error(`Task ${task.id} pipeline error:`, err);
      updateTask(task.id, {
        status: "ACTIVE",
        consecutiveFailures: task.consecutiveFailures + 1,
        nextRunAt: now + task.frequencyMinutes * 60_000,
      });
    }
  }

  return res.status(200).json({
    ts: now,
    intentsActive: activeIntents.length,
    intentDecisions,
    tasksFound: tasks.length,
    tasksDue: dueTasks.length,
    results,
  });
}
