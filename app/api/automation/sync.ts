/**
 * POST /api/automation/sync
 * Client pushes active task list so the Cron tick handler has current state.
 */
import type { VercelRequest, VercelResponse } from "../_types";
import { syncTasks } from "./_store";
import type { AutomationTask } from "../../src/lib/automation/types";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { owner, tasks } = req.body as { owner: string; tasks: AutomationTask[] };
  if (!owner || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "owner and tasks required" });
  }

  syncTasks(owner, tasks);
  return res.status(200).json({ synced: tasks.length, ts: Date.now() });
}
