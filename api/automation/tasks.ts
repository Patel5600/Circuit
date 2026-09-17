/**
 * GET  /api/automation/tasks?owner=<pubkey>
 * Returns active tasks for a wallet (from server-side store).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAllActiveTasks } from "./_store";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { owner } = req.query as { owner?: string };
  const all = getAllActiveTasks();
  const tasks = owner ? all.filter(t => t.owner === owner) : all;
  return res.status(200).json({ tasks, count: tasks.length, ts: Date.now() });
}
