/**
 * POST /api/automation/execute
 * Manual trigger for a single task from the UI "Run Now" button.
 * Accepts full task object in body (client-side source of truth).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runTaskPipeline } from "./_engine";
import { syncTasks } from "./_store";
import type { AutomationTask, ExecutionRecord } from "../../app/src/lib/automation/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { task, owner } = req.body as { task: AutomationTask; owner: string };
  if (!task || !owner) return res.status(400).json({ error: "task and owner required" });

  // Sync this task into server store so tick handler knows about it
  syncTasks(owner, [task]);

  try {
    const result = await runTaskPipeline(task);
    const record: ExecutionRecord = {
      ...result,
      taskName: task.name,
      taskType: task.type,
      owner,
    };
    return res.status(200).json(record);
  } catch (err) {
    console.error("Execute pipeline error:", err);
    return res.status(500).json({ error: "Pipeline execution failed", detail: String(err) });
  }
}
