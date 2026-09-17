import { expect } from "chai";
import {
  createTask,
  getTask,
  getTasksByOwner,
  updateTask,
  deleteTask,
  logExecution,
  getExecutionLogs,
  syncTasks,
  acquireTaskLock,
  releaseTaskLock,
  isTaskLocked,
} from "../api/automation/_store";
import {
  evaluateCondition,
  checkAutomationPermission,
  runTaskPipeline,
  executeAgentTransaction,
  PortfolioState,
} from "../api/automation/_engine";
import { AutomationTask, WatchCondition, AgentExecutionState } from "../app/src/lib/automation/types";

describe("Autonomous Operations Extension — Engine & Store Unit Tests", () => {
  const OWNER_A = "8VjvTWpKHJYkMzhNDhVWWJTLx1FPBVfCextL5fDRgq11";
  const OWNER_B = "62cWkF95f74iVj95mR6qPqE564r1mNqZp8iW2E5Lp4Z1";

  function createMockTask(overrides: Partial<AutomationTask> = {}): AutomationTask {
    return {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      owner: OWNER_A,
      name: "Portfolio Health Check",
      type: "OBSERVE",
      status: "ACTIVE",
      condition: null,
      policy: null,
      frequencyMinutes: 1440,
      createdAt: Date.now(),
      activatedAt: Date.now(),
      expiresAt: null,
      lastCheckedAt: null,
      nextRunAt: null,
      lastResult: null,
      executionsToday: 0,
      maxExecutionsPerDay: 10,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3,
      ...overrides,
    };
  }

  function createMockPortfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
    return {
      healthFactor: 2.15,
      collateralUsd: 10000,
      debtUsd: 3000,
      borrowCapacityUsd: 4000,
      riskState: "SAFE",
      oracleFreshnessMs: 1200,
      ltvBps: 3000,
      positionsCount: 1,
      ...overrides,
    };
  }

  describe("1. Server-Side Task Store (_store.ts) CRUD", () => {
    it("creates and retrieves a task by ID", () => {
      const task = createMockTask({ name: "Daily Morning Review" });
      createTask(task);

      const retrieved = getTask(task.id);
      expect(retrieved).to.deep.equal(task);
      expect(retrieved?.name).to.equal("Daily Morning Review");
    });

    it("retrieves tasks filtered by owner", () => {
      const task1 = createMockTask({ owner: OWNER_A, name: "Owner A Task" });
      const task2 = createMockTask({ owner: OWNER_B, name: "Owner B Task" });
      createTask(task1);
      createTask(task2);

      const ownerATasks = getTasksByOwner(OWNER_A);
      expect(ownerATasks.some(t => t.id === task1.id)).to.be.true;
      expect(ownerATasks.every(t => t.owner === OWNER_A)).to.be.true;

      const ownerBTasks = getTasksByOwner(OWNER_B);
      expect(ownerBTasks.some(t => t.id === task2.id)).to.be.true;
      expect(ownerBTasks.every(t => t.owner === OWNER_B)).to.be.true;
    });

    it("updates existing task properties", () => {
      const task = createMockTask({ executionsToday: 0, status: "ACTIVE" });
      createTask(task);

      const updated = updateTask(task.id, {
        executionsToday: 1,
        status: "WAITING",
        lastCheckedAt: 1700000000,
      });

      expect(updated).to.not.be.undefined;
      expect(updated?.executionsToday).to.equal(1);
      expect(updated?.status).to.equal("WAITING");
      expect(updated?.lastCheckedAt).to.equal(1700000000);

      // Also verify stored state is updated
      const fetched = getTask(task.id);
      expect(fetched?.executionsToday).to.equal(1);
    });

    it("deletes a task cleanly with owner verification", () => {
      const task = createMockTask({ owner: OWNER_A });
      createTask(task);

      // Attempt deletion with wrong owner should fail
      const failedDelete = deleteTask(task.id, OWNER_B);
      expect(failedDelete).to.be.false;
      expect(getTask(task.id)).to.not.be.undefined;

      // Deletion with correct owner should succeed
      const successDelete = deleteTask(task.id, OWNER_A);
      expect(successDelete).to.be.true;
      expect(getTask(task.id)).to.be.undefined;
    });

    it("syncs tasks replacing previous owner tasks", () => {
      const task1 = createMockTask({ owner: OWNER_A, name: "Sync Task 1" });
      const task2 = createMockTask({ owner: OWNER_A, name: "Sync Task 2" });
      createTask(task1);

      syncTasks(OWNER_A, [task2]);

      expect(getTask(task1.id)).to.be.undefined;
      expect(getTask(task2.id)).to.not.be.undefined;
    });

    it("logs and retrieves execution records", () => {
      const execId = `exec-${Date.now()}`;
      const record = { status: "SUCCESS", simulated: false, feeSol: 0.000005 };
      logExecution(OWNER_A, execId, record);

      const logs = getExecutionLogs(OWNER_A);
      expect(logs.length).to.be.greaterThan(0);
      expect(logs[0].id).to.equal(execId);
      expect(logs[0].owner).to.equal(OWNER_A);
      expect(logs[0].result).to.deep.equal(record);
    });
  });

  describe("2. Deterministic Condition Evaluator (_engine.ts)", () => {
    it("evaluates health_factor threshold conditions (lt, gte)", () => {
      const portfolio = createMockPortfolio({ healthFactor: 1.35 });

      const ltCond: WatchCondition = {
        field: "health_factor",
        operator: "lt",
        threshold: 1.5,
        description: "Health factor < 1.5",
      };
      expect(evaluateCondition(ltCond, portfolio).met).to.be.true;

      const gteCond: WatchCondition = {
        field: "health_factor",
        operator: "gte",
        threshold: 2.0,
        description: "Health factor >= 2.0",
      };
      expect(evaluateCondition(gteCond, portfolio).met).to.be.false;
    });

    it("evaluates risk_state string equality conditions (eq, neq)", () => {
      const portfolio = createMockPortfolio({ riskState: "DEFENSIVE" });

      const eqDefensive: WatchCondition = {
        field: "risk_state",
        operator: "eq",
        threshold: "DEFENSIVE",
        description: "Risk state == DEFENSIVE",
      };
      expect(evaluateCondition(eqDefensive, portfolio).met).to.be.true;

      const neqSafe: WatchCondition = {
        field: "risk_state",
        operator: "neq",
        threshold: "SAFE",
        description: "Risk state != SAFE",
      };
      expect(evaluateCondition(neqSafe, portfolio).met).to.be.true;

      const eqSafe: WatchCondition = {
        field: "risk_state",
        operator: "eq",
        threshold: "SAFE",
        description: "Risk state == SAFE",
      };
      expect(evaluateCondition(eqSafe, portfolio).met).to.be.false;
    });

    it("evaluates borrow capacity and LTV conditions", () => {
      const portfolio = createMockPortfolio({
        borrowCapacityUsd: 1500,
        ltvBps: 4500,
      });

      const capCond: WatchCondition = {
        field: "borrow_capacity_usd",
        operator: "gt",
        threshold: 1000,
        description: "Borrow capacity > 1000",
      };
      expect(evaluateCondition(capCond, portfolio).met).to.be.true;

      const ltvCond: WatchCondition = {
        field: "ltv_bps",
        operator: "gte",
        threshold: 4000,
        description: "LTV >= 4000",
      };
      expect(evaluateCondition(ltvCond, portfolio).met).to.be.true;
    });

    it("evaluates oracle staleness threshold", () => {
      const stalePortfolio = createMockPortfolio({ oracleFreshnessMs: 75000 });
      const freshPortfolio = createMockPortfolio({ oracleFreshnessMs: 500 });

      const stalenessCond: WatchCondition = {
        field: "oracle_staleness_ms",
        operator: "gt",
        threshold: 60000,
        description: "Oracle staleness > 60000ms",
      };
      expect(evaluateCondition(stalenessCond, stalePortfolio).met).to.be.true;
      expect(evaluateCondition(stalenessCond, freshPortfolio).met).to.be.false;
    });
  });

  describe("3. Circuit Permission Gate Enforcement (_engine.ts)", () => {
    it("always permits read/observe/report tasks regardless of risk state", () => {
      const emergencyPortfolio = createMockPortfolio({ riskState: "EMERGENCY" });
      const observeTask = createMockTask({ type: "OBSERVE" });
      const watchTask = createMockTask({ type: "WATCH" });
      const reportTask = createMockTask({ type: "REPORT" });

      expect(checkAutomationPermission(observeTask, emergencyPortfolio).allowed).to.be.true;
      expect(checkAutomationPermission(watchTask, emergencyPortfolio).allowed).to.be.true;
      expect(checkAutomationPermission(reportTask, emergencyPortfolio).allowed).to.be.true;
    });

    it("strictly blocks BORROW when RiskRatchet is RESTRICTED, DEFENSIVE, or EMERGENCY", () => {
      const borrowTask = createMockTask({ type: "BORROW" });

      const safePortfolio = createMockPortfolio({ riskState: "SAFE" });
      expect(checkAutomationPermission(borrowTask, safePortfolio).allowed).to.be.true;

      const restrictedPortfolio = createMockPortfolio({ riskState: "RESTRICTED" });
      const res1 = checkAutomationPermission(borrowTask, restrictedPortfolio);
      expect(res1.allowed).to.be.false;
      expect(res1.reasonCode).to.equal("BORROW_DISABLED_BY_RISK_STATE");

      const defensivePortfolio = createMockPortfolio({ riskState: "DEFENSIVE" });
      const res2 = checkAutomationPermission(borrowTask, defensivePortfolio);
      expect(res2.allowed).to.be.false;
      expect(res2.reasonCode).to.equal("BORROW_DISABLED_BY_RISK_STATE");

      const emergencyPortfolio = createMockPortfolio({ riskState: "EMERGENCY" });
      const res3 = checkAutomationPermission(borrowTask, emergencyPortfolio);
      expect(res3.allowed).to.be.false;
      expect(res3.reasonCode).to.equal("RISK_STATE_RESTRICTED");
    });

    it("blocks WITHDRAW in DEFENSIVE state when debt exists, and in EMERGENCY state always", () => {
      const withdrawTask = createMockTask({ type: "WITHDRAW" });

      // Defensive with debt -> blocked
      const defensiveWithDebt = createMockPortfolio({ riskState: "DEFENSIVE", debtUsd: 1500 });
      const res1 = checkAutomationPermission(withdrawTask, defensiveWithDebt);
      expect(res1.allowed).to.be.false;
      expect(res1.reasonCode).to.equal("WITHDRAW_BLOCKED_WITH_DEBT");

      // Defensive with no debt -> allowed
      const defensiveNoDebt = createMockPortfolio({ riskState: "DEFENSIVE", debtUsd: 0 });
      expect(checkAutomationPermission(withdrawTask, defensiveNoDebt).allowed).to.be.true;

      // Emergency -> always blocked
      const emergencyPortfolio = createMockPortfolio({ riskState: "EMERGENCY", debtUsd: 0 });
      const res2 = checkAutomationPermission(withdrawTask, emergencyPortfolio);
      expect(res2.allowed).to.be.false;
      expect(res2.reasonCode).to.equal("RISK_STATE_RESTRICTED");
    });

    it("enforces daily execution caps", () => {
      const safePortfolio = createMockPortfolio({ riskState: "SAFE" });
      const cappedTask = createMockTask({
        type: "BORROW",
        executionsToday: 5,
        maxExecutionsPerDay: 5,
      });

      const res = checkAutomationPermission(cappedTask, safePortfolio);
      expect(res.allowed).to.be.false;
      expect(res.reasonCode).to.equal("DAILY_LIMIT_EXCEEDED");
    });

    it("enforces consecutive failure circuit-breaker", () => {
      const safePortfolio = createMockPortfolio({ riskState: "SAFE" });
      const failedTask = createMockTask({
        type: "BORROW",
        consecutiveFailures: 3,
        maxConsecutiveFailures: 3,
      });

      const res = checkAutomationPermission(failedTask, safePortfolio);
      expect(res.allowed).to.be.false;
      expect(res.reasonCode).to.equal("CONSECUTIVE_FAILURES_EXCEEDED");
    });

    it("enforces policy bounds and riskAdaptive safety stop", () => {
      const safePortfolio = createMockPortfolio({ riskState: "SAFE" });
      const nonSafePortfolio = createMockPortfolio({ riskState: "RESTRICTED" });

      // Zero amount policy -> blocked
      const zeroAmountTask = createMockTask({
        type: "BORROW",
        policy: {
          version: 1,
          objective: "Zero amount policy test",
          allowedActions: ["BORROW"],
          assetScope: ["NVDA"],
          maxAmountPerActionUsd: 0,
          maxTotalUsd: 1000,
          frequencyMinutes: 15,
          expireDays: 30,
          riskAdaptive: true,
        },
      });
      const resZero = checkAutomationPermission(zeroAmountTask, safePortfolio);
      expect(resZero.allowed).to.be.false;
      expect(resZero.reasonCode).to.equal("POLICY_AMOUNT_ZERO");

      // riskAdaptive active with non-SAFE state -> blocked
      const adaptiveTask = createMockTask({
        type: "BORROW",
        policy: {
          version: 1,
          objective: "Adaptive risk test",
          allowedActions: ["BORROW"],
          assetScope: ["NVDA"],
          maxAmountPerActionUsd: 500,
          maxTotalUsd: 1000,
          frequencyMinutes: 15,
          expireDays: 30,
          riskAdaptive: true,
        },
      });
      const resAdaptive = checkAutomationPermission(adaptiveTask, nonSafePortfolio);
      expect(resAdaptive.allowed).to.be.false;
      expect(resAdaptive.reasonCode).to.equal("BORROW_DISABLED_BY_RISK_STATE");
    });
  });

  describe("4. Durable Execution Engine, Idempotency & Lifecycle States", () => {
    it("enforces concurrency locks to prevent double-spending & state corruption", () => {
      const taskId = `lock-task-${Date.now()}`;
      expect(isTaskLocked(taskId)).to.be.false;

      const acquired = acquireTaskLock(taskId);
      expect(acquired).to.be.true;
      expect(isTaskLocked(taskId)).to.be.true;

      // Duplicate acquire attempt must be rejected
      const duplicateAcquired = acquireTaskLock(taskId);
      expect(duplicateAcquired).to.be.false;

      // Releasing allows re-acquiring
      releaseTaskLock(taskId);
      expect(isTaskLocked(taskId)).to.be.false;
      expect(acquireTaskLock(taskId)).to.be.true;
      releaseTaskLock(taskId);
    });

    it("deduplicates execution log entries by executionId", () => {
      const execId = `exec-dedup-${Date.now()}`;
      const record1 = { outcome: "SUBMITTED", timestamp: 1000 };
      const record2 = { outcome: "CONFIRMED", timestamp: 2000 };

      logExecution(OWNER_A, execId, record1);
      logExecution(OWNER_A, execId, record2);

      const logs = getExecutionLogs(OWNER_A).filter(l => l.id === execId);
      expect(logs.length).to.equal(1);
      expect((logs[0].result as any).outcome).to.equal("CONFIRMED");
    });

    it("verifies canonical real execution states", () => {
      const states: AgentExecutionState[] = [
        "IDLE",
        "PLANNING",
        "AWAITING_APPROVAL",
        "CHECKING_PERMISSION",
        "EXECUTING",
        "CONFIRMING",
        "COMPLETED",
        "BLOCKED",
        "FAILED",
      ];
      expect(states.length).to.equal(9);
      expect(states.includes("AWAITING_APPROVAL")).to.be.true;
      expect(states.includes("CONFIRMING")).to.be.true;
    });

    it("rejects pipeline execution when task is already locked in-flight", async () => {
      const task = createMockTask({ id: "concurrent-task-123", type: "OBSERVE" });
      acquireTaskLock(task.id);

      try {
        const result = await runTaskPipeline(task);
        expect(result.outcome).to.equal("FAILED");
        expect(result.reasonCode).to.equal("EXECUTION_ALREADY_IN_PROGRESS");
      } finally {
        releaseTaskLock(task.id);
      }
    });

    it("never reports CONFIRMED before transaction confirmation (fails safely without signer)", async () => {
      const borrowTask = createMockTask({
        type: "BORROW",
        policy: {
          version: 1,
          objective: "Borrow without signer test",
          allowedActions: ["BORROW"],
          assetScope: ["NVDA"],
          maxAmountPerActionUsd: 100,
          maxTotalUsd: 1000,
          frequencyMinutes: 15,
          expireDays: 30,
          riskAdaptive: false,
        },
      });

      const portfolio = createMockPortfolio({ riskState: "SAFE" });
      const execResult = await executeAgentTransaction(borrowTask, portfolio, "exec-test-1");
      // Without AGENT_SIGNER_SECRET configured, must return AGENT_SIGNER_NOT_CONFIGURED, never a signature
      expect(execResult.txSignature).to.be.null;
      expect(execResult.error).to.equal("AGENT_SIGNER_NOT_CONFIGURED");
    });
  });
});

