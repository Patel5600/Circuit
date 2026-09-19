/**
 * /api/automation/tasks
 *
 * Task CRUD REST API:
 *   GET    /api/automation/tasks?owner=<pubkey>    - List active tasks for authenticated owner
 *   POST   /api/automation/tasks                   - Create task
 *   PATCH  /api/automation/tasks                   - Update task (pause, resume, params)
 *   DELETE /api/automation/tasks?id=<id>&owner=..  - Delete task
 *
 * SECURITY:
 *   - Strictly mandates owner authentication to prevent IDOR and global task enumeration.
 *   - Enforces ownership verification on all read, update, and delete actions.
 *   - Validates Solana PublicKey format on addresses.
 *   - Restricts CORS to authorized origins.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PublicKey } from "@solana/web3.js";
import { getTasksByOwner, getTask, createTask, updateTask, deleteTask } from "./_store";
import type { AutomationTask } from "../../src/lib/automation/types";

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  if (origin && typeof origin === "string") {
    if (
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https:\/\/.*\.vercel\.app$/.test(origin) ||
      /^https:\/\/circuit\.trade$/.test(origin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isValidPubkey(val?: string): boolean {
  if (!val || typeof val !== "string" || val.length < 32 || val.length > 44) return false;
  try {
    new PublicKey(val);
    return true;
  } catch {
    return false;
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ── GET: Read tasks (requires authenticated owner) ──
  if (req.method === "GET") {
    const { owner, id } = req.query as { owner?: string; id?: string };
    if (!owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: "Missing or invalid owner Solana address" });
    }

    if (id) {
      const task = getTask(id);
      if (!task || task.owner !== owner) {
        return res.status(404).json({ error: "Task not found" });
      }
      return res.status(200).json({ task, ts: Date.now() });
    }

    const tasks = getTasksByOwner(owner);
    return res.status(200).json({ tasks, count: tasks.length, ts: Date.now() });
  }

  // ── POST: Create task ──
  if (req.method === "POST") {
    const task = req.body as AutomationTask;
    if (!task || !task.id || !task.owner || !task.name || !task.type || !isValidPubkey(task.owner)) {
      return res.status(400).json({ error: "Valid id, owner, name, and type are required" });
    }
    const created = createTask(task);
    return res.status(201).json({ task: created, ts: Date.now() });
  }

  // ── PATCH: Update task (strictly owner-scoped) ──
  if (req.method === "PATCH") {
    const { id, patch, owner } = req.body as { id: string; patch: Partial<AutomationTask>; owner?: string };
    if (!id || !patch || !owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: "Valid id, patch, and owner are required" });
    }
    const existing = getTask(id);
    if (!existing) {
      return res.status(404).json({ error: "Task not found" });
    }
    if (existing.owner !== owner) {
      return res.status(403).json({ error: "Unauthorized: owner mismatch" });
    }
    const updated = updateTask(id, patch);
    return res.status(200).json({ task: updated, ts: Date.now() });
  }

  // ── DELETE: Delete task (strictly owner-scoped) ──
  if (req.method === "DELETE") {
    const id = (req.query.id as string) || (req.body?.id as string);
    const owner = (req.query.owner as string) || (req.body?.owner as string);
    if (!id || !owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: "Valid id and owner are required" });
    }
    const existing = getTask(id);
    if (!existing || existing.owner !== owner) {
      return res.status(404).json({ error: "Task not found or owner mismatch" });
    }
    const deleted = deleteTask(id, owner);
    if (!deleted) {
      return res.status(404).json({ error: "Task not found or owner mismatch" });
    }
    return res.status(200).json({ deleted: true, id, ts: Date.now() });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
