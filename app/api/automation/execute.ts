/**
 * POST /api/automation/execute
 * Manual trigger for a single task from the UI "Run Now" button.
 * Accepts full task object in body (client-side source of truth).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PublicKey } from "@solana/web3.js";
import { runTaskPipeline } from "./_engine";
import { syncTasks, logExecution } from "./_store";
import type { AutomationTask, ExecutionRecord } from "../../src/lib/automation/types";

// In-memory rate limiting: owner -> timestamp
const executeRateLimit = new Map<string, number>();
const MIN_INTERVAL_MS = 2000; // Minimum 2s between manual triggers per owner

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { task, owner } = req.body as { task: AutomationTask; owner: string };
  if (!task || !owner || !isValidPubkey(owner)) {
    return res.status(400).json({ error: "Valid task and owner are required" });
  }

  if (task.owner !== owner) {
    return res.status(403).json({ error: "Unauthorized: task owner mismatch" });
  }

  // Rate limit check
  const now = Date.now();
  const lastExec = executeRateLimit.get(owner) || 0;
  if (now - lastExec < MIN_INTERVAL_MS) {
    return res.status(429).json({ error: "Too many execution requests. Please wait a moment." });
  }
  executeRateLimit.set(owner, now);

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
    logExecution(owner, result.executionId, record);
    return res.status(200).json(record);
  } catch (err) {
    console.error("Execute pipeline error:", err);
    return res.status(500).json({ error: "Pipeline execution failed", detail: String(err) });
  }
}
