/**
 * Common Vercel Serverless Function Types
 * Decoupled from @vercel/node to guarantee 100% build compatibility across all environments.
 */

export interface VercelRequest {
  method?: string;
  body?: any;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export interface VercelResponse {
  setHeader: (name: string, value: string) => any;
  status: (code: number) => any;
  json: (data: any) => any;
  send: (body: any) => any;
  write: (chunk: any) => any;
  end: () => any;
}

export interface AutomationTask {
  id: string;
  owner: string;
  name?: string;
  type?: string;
  status?: string;
  createdAt?: number;
  [key: string]: any;
}

export interface MachineReadableDecision {
  intentId: string;
  timestamp: number;
  observation?: any;
  conditionsChecked?: any[];
  riskState?: string;
  authority?: any;
  permission?: any;
  decision?: string;
  actionProposed?: string;
  transaction?: any;
  resultSummary?: string;
  [key: string]: any;
}

export interface DurableIntent {
  id: string;
  owner: string;
  agentId: string;
  strategyId?: string;
  objective: string;
  triggerDescription: string;
  conditions: any[];
  action: any;
  assetScope: string[];
  amountLimits: {
    maxAmountUsd: number;
    targetAmountUsd: number;
    minAmountUsd?: number;
  };
  riskLimits: {
    maxLtvBps: number;
    targetLtvBps?: number;
    minHealthFactor?: number;
    maxSlippageBps?: number;
  };
  authoritySnapshot: {
    pda: string;
    agentWallet: string;
    ownerWallet: string;
    assetMint: string;
    maxBorrowLimit: number;
    maxWithdrawLimit: number;
    currentBorrowed: number;
    remainingBudgetUsd: number;
    expiryTs: number;
    nonce: number;
    valid: boolean;
  };
  policyVersion: number;
  status: string;
  createdAt: number;
  expiresAt: number;
  executionCount: number;
  maxExecutions: number;
  lastEvaluation?: any;
  lastDecision?: MachineReadableDecision;
  lastTransaction?: any;
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
  failureCount: number;
  nonce: number;
  isContinuous: boolean;
  [key: string]: any;
}
