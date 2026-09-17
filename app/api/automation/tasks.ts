/**
 * /api/automation/tasks
 *
 * Task CRUD REST API:
 *   GET    /api/automation/tasks?owner=<pubkey>    - List active tasks
 *   POST   /api/automation/tasks                   - Create task
 *   PATCH  /api/automation/tasks                   - Update task (pause, resume, params)
 *   DELETE /api/automation/tasks?id=<id>&owner=..  - Delete task
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAllActiveTasks, getTasksByOwner, getTask, createTask, updateTask, deleteTask } from "./_store";
import type { AutomationTask } from "../../app/src/lib/automation/types";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ── GET: Read tasks ──
  if (req.method === "GET") {
    const { owner, id } = req.query as { owner?: string; id?: string };
    if (id) {
      const task = getTask(id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      return res.status(200).json({ task, ts: Date.now() });
    }
    const tasks = owner ? getTasksByOwner(owner) : getAllActiveTasks();
    return res.status(200).json({ tasks, count: tasks.length, ts: Date.now() });
  }

  // ── POST: Create task ──
  if (req.method === "POST") {
    const task = req.body as AutomationTask;
    if (!task || !task.id || !task.owner || !task.name || !task.type) {
      return res.status(400).json({ error: "id, owner, name, and type are required" });
    }
    const created = createTask(task);
    return res.status(201).json({ task: created, ts: Date.now() });
  }

  // ── PATCH: Update task ──
  if (req.method === "PATCH") {
    const { id, patch, owner } = req.body as { id: string; patch: Partial<AutomationTask>; owner?: string };
    if (!id || !patch) {
      return res.status(400).json({ error: "id and patch required" });
    }
    const existing = getTask(id);
    if (!existing) {
      return res.status(404).json({ error: "Task not found" });
    }
    if (owner && existing.owner !== owner) {
      return res.status(403).json({ error: "Unauthorized: owner mismatch" });
    }
    const updated = updateTask(id, patch);
    return res.status(200).json({ task: updated, ts: Date.now() });
  }

  // ── DELETE: Delete task ──
  if (req.method === "DELETE") {
    const id = (req.query.id as string) || (req.body?.id as string);
    const owner = (req.query.owner as string) || (req.body?.owner as string);
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    const deleted = deleteTask(id, owner);
    if (!deleted) {
      return res.status(404).json({ error: "Task not found or owner mismatch" });
    }
    return res.status(200).json({ deleted: true, id, ts: Date.now() });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
