/**
 * GET /api/automation/tick
 *
 * Vercel Cron handler — triggered every 5 minutes by Vercel scheduler.
 * Also accepts POST from the UI "Run All" button for manual triggering.
 *
 * Pipeline for each due task:
 *   1. Read real Devnet state
 *   2. Evaluate deterministic condition
 *   3. Check Circuit permission engine
 *   4. Execute if permitted (requires AGENT_SIGNER_SECRET)
 *   5. Verify on-chain result
 *   6. Record full execution record
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAllActiveTasks, updateTask, logExecution } from "./_store";
import { runTaskPipeline } from "./_engine";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();
  const tasks = getAllActiveTasks();

  // Filter: which tasks are due?
  const dueTasks = tasks.filter(t => {
    if (t.status !== "ACTIVE") return false;
    if (t.nextRunAt === null) return true;
    return now >= t.nextRunAt;
  });

  const results: unknown[] = [];

  for (const task of dueTasks) {
    // Check EMERGENCY state — skip risk-increasing tasks
    // (Full risk state read happens inside runTaskPipeline)

    try {
      // Mark as running
      updateTask(task.id, { status: "RUNNING" });

      const result = await runTaskPipeline(task);

      // Update task state after execution
      const succeeded = ["OBSERVED", "CONDITION_NOT_MET", "CONFIRMED", "SUBMITTED"].includes(result.outcome);
      updateTask(task.id, {
        status: "ACTIVE",
        lastCheckedAt: now,
        lastResult: result,
        nextRunAt: now + task.frequencyMinutes * 60_000,
        executionsToday: task.executionsToday + 1,
        consecutiveFailures: succeeded ? 0 : task.consecutiveFailures + 1,
      });

      // Auto-pause if too many consecutive failures
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
    tasksFound: tasks.length,
    tasksDue: dueTasks.length,
    results,
  });
}
