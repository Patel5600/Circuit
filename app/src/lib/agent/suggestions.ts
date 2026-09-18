/**
 * Circuit Protocol — Contextual Agent Prompt Suggestions
 *
 * Dynamically computes 2 to 4 concise contextual action chips based on real protocol state:
 * - Active asset symbol
 * - Risk ratchet regime (SAFE / RESTRICTED / DEFENSIVE / EMERGENCY)
 * - Open position collateral and debt
 * - Active on-chain agent authority delegation
 *
 * Never renders a static hardcoded wall of prompts.
 */

import { DeployedMarket } from "../../data/markets";

export interface ContextualSuggestionsParams {
  activeAsset: DeployedMarket;
  riskState: string;
  hasPosition: boolean;
  totalDebtUsd: number;
  hasActiveAuthority: boolean;
}

export function getContextualSuggestions({
  activeAsset,
  riskState,
  hasPosition,
  totalDebtUsd,
  hasActiveAuthority,
}: ContextualSuggestionsParams): string[] {
  const sym = activeAsset.symbol || activeAsset.tokenSymbol;

  // 1. In high risk regimes (DEFENSIVE / EMERGENCY), suggestions must focus on risk mitigation & capital recovery
  if (riskState === "DEFENSIVE" || riskState === "EMERGENCY") {
    return [
      "Why restricted?",
      "What can I still do?",
      totalDebtUsd > 0 ? "Repay debt" : "Show recovery options",
    ];
  }

  // 2. If user already has an active collateral position in this asset
  if (hasPosition) {
    return [
      "Check risk",
      `Borrow against ${sym}`,
      `Deposit ${sym}`,
      `Chart ${sym}`,
    ];
  }

  // 3. If user has outstanding debt in the protocol
  if (totalDebtUsd > 0) {
    return [
      "Repay debt",
      `Deposit ${sym}`,
      "Check risk",
      `Chart ${sym}`,
    ];
  }

  // 4. If user has not yet delegated agent authority
  if (!hasActiveAuthority) {
    return [
      `Deposit ${sym}`,
      `Check ${sym} market`,
      "Configure Agent access",
      `Chart ${sym}`,
    ];
  }

  // 5. Default safe exploratory suggestions (max 4)
  return [
    `Deposit ${sym}`,
    `Check ${sym} market`,
    "Check risk",
    `Chart ${sym}`,
  ];
}
