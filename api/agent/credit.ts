/**
 * /api/agent/credit
 *
 * Serverless API endpoint for Circuit Agent Credit Budget.
 * Provides idempotent first-connect grants, atomic reservations, settlements,
 * and ledger audit trail inspection.
 */

import type { VercelRequest, VercelResponse } from "../_types";
import {
  claimFirstConnectGrant,
  getAccount,
  getLedgerHistory,
  reserveCredits,
  settleCredits,
  consumeCreditsDirect,
  generateAuthChallenge,
  verifyChallengeFormat,
} from "./ledger.js";

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers?.origin;
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isValidPubkey(val?: string): boolean {
  return typeof val === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(val);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ── GET: Inspect credit balance and audit ledger ───────────────────────────
  if (req.method === "GET") {
    const { owner } = req.query as { owner?: string };
    if (!owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: "Missing or invalid owner Solana address" });
    }

    const account = getAccount(owner);
    const history = getLedgerHistory(owner);

    return res.status(200).json({
      account,
      history,
      ts: Date.now(),
    });
  }

  // ── POST: Credit lifecycle actions ────────────────────────────────────────
  if (req.method === "POST") {
    const { action, owner, amount, reservationId, referenceId, description, challenge, signature } = req.body || {};

    if (!owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: "Missing or invalid owner Solana address" });
    }

    // 1. Challenge generation
    if (action === "challenge") {
      const authChallenge = generateAuthChallenge(owner);
      return res.status(200).json({ challenge: authChallenge });
    }

    // 2. Claim Introductory Grant
    if (action === "claim") {
      try {
        const result = claimFirstConnectGrant(owner, "devnet", signature);
        return res.status(200).json(result);
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "Failed to claim credits" });
      }
    }

    // 3. Reserve Credits
    if (action === "reserve") {
      const numAmount = Number(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "Positive numeric reservation amount required" });
      }

      const resResult = reserveCredits(owner, numAmount, referenceId, description);
      if (!resResult.success) {
        return res.status(402).json({ error: resResult.error, availableAfter: resResult.availableAfter });
      }
      return res.status(200).json(resResult);
    }

    // 4. Settle Credits
    if (action === "settle") {
      if (!reservationId || typeof reservationId !== "string") {
        return res.status(400).json({ error: "Valid reservationId required for settlement" });
      }
      const numConsumed = Number(amount ?? 0);
      const settleResult = settleCredits(owner, reservationId, numConsumed, description);
      if (!settleResult.success) {
        return res.status(400).json({ error: settleResult.error });
      }
      return res.status(200).json(settleResult);
    }

    // 5. Direct Consume
    if (action === "consume") {
      const numAmount = Number(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "Positive numeric consumption amount required" });
      }
      const consumeResult = consumeCreditsDirect(owner, numAmount, description, referenceId);
      if (!consumeResult.success) {
        return res.status(402).json({ error: consumeResult.error });
      }
      return res.status(200).json(consumeResult);
    }

    return res.status(400).json({ error: `Unsupported credit action: ${action}` });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
