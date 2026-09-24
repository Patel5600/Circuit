/**
 * /api/automation/intents
 *
 * REST endpoint for Durable Intents:
 *   GET    — list intents and decision logs for owner
 *   POST   — create or sync a durable intent
 *   PATCH  — update/pause/cancel an intent
 *   DELETE — delete an intent
 */

import type { VercelRequest, VercelResponse } from "../_types";
import type { DurableIntent } from "../../app/src/lib/agent/intent/types";
import {
  createDurableIntentServer,
  getDurableIntentsByOwner,
  getDurableIntentServer,
  updateDurableIntentServer,
  deleteDurableIntentServer,
  getDecisionRecords,
} from "./_store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET: list intents & decision logs for owner
  if (req.method === "GET") {
    const owner = (req.query?.owner as string) || "";
    const intentId = (req.query?.intentId as string) || "";

    if (intentId) {
      const intent = getDurableIntentServer(intentId);
      const decisions = getDecisionRecords(intentId);
      return res.status(200).json({ intent, decisions });
    }

    if (!owner) {
      return res.status(400).json({ error: "Missing required query param: owner" });
    }

    const intents = getDurableIntentsByOwner(owner);
    const decisions = getDecisionRecords();
    return res.status(200).json({ intents, decisions });
  }

  // POST: create a new durable intent
  if (req.method === "POST") {
    const body = req.body as DurableIntent;
    if (!body || !body.id || !body.owner) {
      return res.status(400).json({ error: "Invalid intent payload: missing id or owner" });
    }

    const created = createDurableIntentServer(body);
    return res.status(201).json({ intent: created });
  }

  // PATCH: update intent status or limits
  if (req.method === "PATCH") {
    const { id, patch } = req.body as { id: string; patch: Partial<DurableIntent> };
    if (!id || !patch) {
      return res.status(400).json({ error: "Missing id or patch" });
    }

    const updated = updateDurableIntentServer(id, patch);
    if (!updated) {
      return res.status(404).json({ error: "Intent not found" });
    }

    return res.status(200).json({ intent: updated });
  }

  // DELETE: remove an intent
  if (req.method === "DELETE") {
    const id = (req.query?.id as string) || "";
    const owner = (req.query?.owner as string) || "";

    if (!id) {
      return res.status(400).json({ error: "Missing required query param: id" });
    }

    const ok = deleteDurableIntentServer(id, owner);
    return res.status(ok ? 200 : 404).json({ success: ok });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
