import { expect } from "chai";
import {
  ADVERSARIAL_SCENARIOS,
  executeScenario,
  executeAllScenarios,
  getScenario,
  getScenarios,
  type ScenarioExecutionReceipt,
} from "../app/src/lib/adversarial-lab";

describe("Circuit Risk Kernel - 8 Adversarial Test Scenarios", () => {
  it("Verify all 8 canonical scenarios are defined with full configuration", () => {
    const scenarios = getScenarios();
    expect(scenarios.length).to.equal(8);

    for (let i = 1; i <= 8; i++) {
      const s = getScenario(i);
      expect(s).to.not.be.undefined;
      expect(s?.number).to.equal(i);
      expect(s?.id).to.be.a("string");
      expect(s?.name).to.be.a("string");
      expect(s?.validates).to.be.a("string");
      expect(s?.threatVector).to.be.a("string");
      expect(s?.setup).to.be.an("object");
      expect(s?.action).to.be.an("object");
      expect(s?.expected).to.be.an("object");
    }
  });

  it("Scenario 1: Stale Oracle Borrow is BLOCKED (Error: StaleOracle / OracleUnsafe)", async () => {
    const result = await executeScenario(1, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("BLOCKED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.equal("StaleOracle");
    expect(result.receipt.numericErrorCode).to.equal(6005);
    expect(result.receipt.validates).to.equal("Oracle freshness gate");
    expect(result.txSignature).to.have.length(88);
    expect(result.receipt.simulationLogs.length).to.be.greaterThan(0);
  });

  it("Scenario 2: Excess LTV Borrow is BLOCKED (Error: EffectiveLtvExceeded / BorrowExceedsCapacity)", async () => {
    const result = await executeScenario(2, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("BLOCKED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.equal("EffectiveLtvExceeded");
    expect(result.receipt.numericErrorCode).to.equal(6043);
    expect(result.receipt.validates).to.equal("Capital policy LTV ceiling");
    expect(result.txSignature).to.have.length(88);
  });

  it("Scenario 3: Expired Agent Authority is BLOCKED (Error: AgentAuthorityExpired)", async () => {
    const result = await executeScenario(3, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("BLOCKED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.equal("AgentAuthorityExpired");
    expect(result.receipt.numericErrorCode).to.equal(6050);
    expect(result.receipt.validates).to.equal("Authority expiry enforcement");
    expect(result.txSignature).to.have.length(88);
  });

  it("Scenario 4: Agent Amount > Policy Limit is BLOCKED (Error: AgentBorrowLimitExceeded)", async () => {
    const result = await executeScenario(4, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("BLOCKED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.equal("AgentBorrowLimitExceeded");
    expect(result.receipt.numericErrorCode).to.equal(6052);
    expect(result.receipt.validates).to.equal("Delegation boundary");
    expect(result.txSignature).to.have.length(88);
  });

  it("Scenario 5: Wrong Asset Scope is BLOCKED (Error: AssetScopeViolation / InvalidAsset)", async () => {
    const result = await executeScenario(5, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("BLOCKED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.equal("AssetScopeViolation");
    expect(result.receipt.numericErrorCode).to.equal(6066);
    expect(result.receipt.validates).to.equal("Asset isolation");
    expect(result.txSignature).to.have.length(88);
  });

  it("Scenario 6: Defensive State Borrow is BLOCKED (Error: RiskDefensive / BorrowDisabledByRiskPolicy)", async () => {
    const result = await executeScenario(6, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("BLOCKED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.equal("RiskDefensive");
    expect(result.receipt.numericErrorCode).to.equal(6031);
    expect(result.receipt.validates).to.equal("Risk-increasing gate");
    expect(result.txSignature).to.have.length(88);
  });

  it("Scenario 7: Emergency Borrow is BLOCKED (Error: RiskEmergency / CapitalPolicyBlocked)", async () => {
    const result = await executeScenario(7, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("BLOCKED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.equal("RiskEmergency");
    expect(result.receipt.numericErrorCode).to.equal(6032);
    expect(result.receipt.validates).to.equal("Emergency lockdown");
    expect(result.txSignature).to.have.length(88);
  });

  it("Scenario 8: Emergency Repay is ALLOWED (Confirmed execution / Risk-reducing exemption)", async () => {
    const result = await executeScenario(8, { simulatedLatency: false });
    expect(result.status).to.equal("PASS");
    expect(result.receipt.outcome).to.equal("ALLOWED");
    expect(result.receipt.errorMatched).to.be.true;
    expect(result.receipt.errorCode).to.be.null;
    expect(result.receipt.numericErrorCode).to.be.null;
    expect(result.receipt.validates).to.equal("Risk-reducing exemption");
    expect(result.txSignature).to.have.length(88);
  });

  it("executeAllScenarios runs all 8 scenarios and returns passing suite report", async () => {
    const report = await executeAllScenarios({ simulatedLatency: false });
    expect(report.total).to.equal(8);
    expect(report.passed).to.equal(8);
    expect(report.failed).to.equal(0);
    expect(report.allPassed).to.be.true;
    expect(report.receipts.length).to.equal(8);
  });
});
