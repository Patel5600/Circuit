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
} from "../api/automation/_store";
import {
  evaluateCondition,
  checkAutomationPermission,
  PortfolioState,
} from "../api/automation/_engine";
import { AutomationTask, WatchCondition } from "../app/src/lib/automation/types";

describe("Autonomous Operations Extension — Engine & Store Unit Tests", () => {
  const OWNER_A = "8VjvTWpKHJYkMzhNDhVWWJTLx1FPBVfCextL5fDRgq11";
  const OWNER_B = "62cWkF95f74iVj95mR6qPqE564r1mNqZp8iW2E5Lp4Z1";

  function createMockTask(overrides: Partial<AutomationTask> = {}): AutomationTask {
    return {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      owner: OWNER_A,
      name: "Portfolio Health Check",
      type: "OBSERVE",
      mode: "SCHEDULE",
      status: "ACTIVE",
      createdAt: Date.now(),
      executionsCount: 0,
      executionsToday: 0,
      maxExecutionsPerDay: 10,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3,
      schedule: {
        frequency: "DAILY",
        hourUtc: 9,
        minuteUtc: 0,
      },
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
      const task = createMockTask({ executionsCount: 0, status: "ACTIVE" });
      createTask(task);

      const updated = updateTask(task.id, {
        executionsCount: 1,
        status: "WAITING",
        lastRunTs: 1700000000,
      });

      expect(updated).to.not.be.undefined;
      expect(updated?.executionsCount).to.equal(1);
      expect(updated?.status).to.equal("WAITING");
      expect(updated?.lastRunTs).to.equal(1700000000);

      // Also verify stored state is updated
      const fetched = getTask(task.id);
      expect(fetched?.executionsCount).to.equal(1);
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
      };
      expect(evaluateCondition(ltCond, portfolio).met).to.be.true;

      const gteCond: WatchCondition = {
        field: "health_factor",
        operator: "gte",
        threshold: 2.0,
      };
      expect(evaluateCondition(gteCond, portfolio).met).to.be.false;
    });

    it("evaluates risk_state string equality conditions (eq, neq)", () => {
      const portfolio = createMockPortfolio({ riskState: "DEFENSIVE" });

      const eqDefensive: WatchCondition = {
        field: "risk_state",
        operator: "eq",
        threshold: "DEFENSIVE",
      };
      expect(evaluateCondition(eqDefensive, portfolio).met).to.be.true;

      const neqSafe: WatchCondition = {
        field: "risk_state",
        operator: "neq",
        threshold: "SAFE",
      };
      expect(evaluateCondition(neqSafe, portfolio).met).to.be.true;

      const eqSafe: WatchCondition = {
        field: "risk_state",
        operator: "eq",
        threshold: "SAFE",
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
      };
      expect(evaluateCondition(capCond, portfolio).met).to.be.true;

      const ltvCond: WatchCondition = {
        field: "ltv_bps",
        operator: "gte",
        threshold: 4000,
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
          maxAmountPerActionUsd: 0,
          targetLtvBps: 5000,
          maxLtvBps: 6500,
          minHealthFactor: 1.5,
          riskAdaptive: true,
          rebalanceDirection: "MAINTAIN",
        },
      });
      const resZero = checkAutomationPermission(zeroAmountTask, safePortfolio);
      expect(resZero.allowed).to.be.false;
      expect(resZero.reasonCode).to.equal("POLICY_AMOUNT_ZERO");

      // riskAdaptive active with non-SAFE state -> blocked
      const adaptiveTask = createMockTask({
        type: "BORROW",
        policy: {
          maxAmountPerActionUsd: 500,
          targetLtvBps: 5000,
          maxLtvBps: 6500,
          minHealthFactor: 1.5,
          riskAdaptive: true,
          rebalanceDirection: "MAINTAIN",
        },
      });
      const resAdaptive = checkAutomationPermission(adaptiveTask, nonSafePortfolio);
      expect(resAdaptive.allowed).to.be.false;
      expect(resAdaptive.reasonCode).to.equal("BORROW_DISABLED_BY_RISK_STATE");
    });
  });
});
