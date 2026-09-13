import React, { createContext, useContext, useState, useMemo } from "react";

export type RatchetTier = "SAFE" | "RESTRICTED" | "DEFENSIVE" | "EMERGENCY";

export interface RevertSimulationDetails {
  programId: string;
  instruction: string;
  errorCode: string;
  errorNumber: number;
  errorMessage: string;
  logs: string[];
  computeUnits: number;
}

export interface DemoContextValue {
  // Preloaded Demo Position
  nvdaCollateral: number; // e.g. 10 NVDA
  nvdaPriceUsd: number; // e.g. 138.25
  borrowDebtUsd: number; // e.g. 500.00
  effectiveHf: number; // computed
  baseLtvBps: number; // 7000 (70%)
  liqThresholdBps: number; // 8000 (80%)

  // Risk Ratchet State
  ratchetState: RatchetTier;
  guardReason: string;
  confBps: number;
  riskEpoch: number;
  consecutiveObservations: number;
  requiredObservations: number;
  lastStressSlot: number;
  activeShock: string | null;

  // Actions / Triggers
  triggerConfidenceShock: () => void;
  triggerMarketClose: () => void;
  triggerCustodyImpairment: () => void;
  triggerStepRecovery: () => void;
  resetDemo: () => void;

  // On-chain Revert Simulation Modal
  isRevertModalOpen: boolean;
  revertDetails: RevertSimulationDetails | null;
  openRevertModal: (details?: Partial<RevertSimulationDetails>) => void;
  closeRevertModal: () => void;

  // Dual-Collateral Concentration Sandbox (NVDA + AAPL)
  allocationNvdaPct: number; // 50 to 90
  setAllocationNvdaPct: (val: number) => void;
  aaplPriceUsd: number;
  concentrationPenaltyBps: number;
  effectiveLtvBps: number;
  marketDropPct: number; // 0 to -25
  setMarketDropPct: (val: number) => void;
  stressedHfBalanced: number;
  stressedHfConcentrated: number;
}

const DemoHarnessContext = createContext<DemoContextValue | null>(null);

export function DemoHarnessProvider({ children }: { children: React.ReactNode }) {
  // Base parameters
  const nvdaCollateral = 10;
  const nvdaPriceUsd = 138.25;
  const aaplPriceUsd = 224.50;
  const [borrowDebtUsd] = useState(500.0);
  const baseLtvBps = 7000;
  const liqThresholdBps = 8000;

  // Ratchet parameters
  const [ratchetState, setRatchetState] = useState<RatchetTier>("SAFE");
  const [guardReason, setGuardReason] = useState<string>("All safety checks nominal");
  const [confBps, setConfBps] = useState<number>(24);
  const [riskEpoch, setRiskEpoch] = useState<number>(0);
  const [consecutiveObservations, setConsecutiveObservations] = useState<number>(0);
  const requiredObservations = 5;
  const [lastStressSlot, setLastStressSlot] = useState<number>(0);
  const [activeShock, setActiveShock] = useState<string | null>(null);

  // Revert Modal
  const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);
  const [revertDetails, setRevertDetails] = useState<RevertSimulationDetails | null>(null);

  // Concentration Sandbox parameters
  const [allocationNvdaPct, setAllocationNvdaPct] = useState(50);
  const [marketDropPct, setMarketDropPct] = useState(0);

  // Derived Effective HF
  const totalCollateralUsd = nvdaCollateral * nvdaPriceUsd;
  const effectiveHf = useMemo(() => {
    if (borrowDebtUsd <= 0) return 999;
    return (totalCollateralUsd * (liqThresholdBps / 10_000)) / borrowDebtUsd;
  }, [totalCollateralUsd, borrowDebtUsd, liqThresholdBps]);

  // Concentration Penalty Math
  // Threshold = 40%, Slope = 0.36
  const concentrationPenaltyBps = useMemo(() => {
    const maxWeight = Math.max(allocationNvdaPct, 100 - allocationNvdaPct);
    if (maxWeight <= 40) return 0;
    const excess = maxWeight - 40; // e.g. 50 at 90%
    return Math.round(excess * 100 * 0.36); // e.g. 5000 * 0.36 = 1800 BPS
  }, [allocationNvdaPct]);

  const effectiveLtvBps = useMemo(() => {
    return Math.max(3000, baseLtvBps - concentrationPenaltyBps);
  }, [baseLtvBps, concentrationPenaltyBps]);

  // Stressed HFs under Gap-Down
  const { stressedHfBalanced, stressedHfConcentrated } = useMemo(() => {
    const sandboxDebt = 1200;

    // Drop applies primarily to NVDA (equity gap-down)
    const nvdaMultiplier = (100 + marketDropPct) / 100;
    
    // Balanced 50/50: $1,400 NVDA + $1,400 AAPL
    const balancedValue = 1400 * nvdaMultiplier + 1400;
    const hfBalanced = (balancedValue * 0.80) / sandboxDebt;

    // Concentrated 90/10: $2,520 NVDA + $280 AAPL
    const concentratedValue = 2520 * nvdaMultiplier + 280;
    const hfConcentrated = (concentratedValue * 0.80) / sandboxDebt;

    return {
      stressedHfBalanced: Number(hfBalanced.toFixed(2)),
      stressedHfConcentrated: Number(hfConcentrated.toFixed(2)),
    };
  }, [marketDropPct]);

  // Triggers
  const triggerConfidenceShock = () => {
    setRatchetState("RESTRICTED");
    setGuardReason("Confidence too wide: 285 bps > 150 bps allowable threshold");
    setConfBps(285);
    setRiskEpoch((e) => e + 1);
    setConsecutiveObservations(0);
    setLastStressSlot(328491024);
    setActiveShock("conf_spike");
  };

  const triggerMarketClose = () => {
    setRatchetState("RESTRICTED");
    setGuardReason("Reference exchange (NYSE) closed outside regular trading hours");
    setConfBps(42);
    setRiskEpoch((e) => e + 1);
    setConsecutiveObservations(0);
    setLastStressSlot(328491040);
    setActiveShock("market_close");
  };

  const triggerCustodyImpairment = () => {
    setRatchetState("EMERGENCY");
    setGuardReason("Upstream broker-dealer custody settlement link impaired");
    setConfBps(95);
    setRiskEpoch((e) => e + 1);
    setConsecutiveObservations(0);
    setLastStressSlot(328491088);
    setActiveShock("custody_impaired");
  };

  const triggerStepRecovery = () => {
    if (ratchetState === "SAFE") return;

    if (consecutiveObservations + 1 >= requiredObservations) {
      // Step up one tier
      if (ratchetState === "EMERGENCY") {
        setRatchetState("DEFENSIVE");
        setGuardReason("Ratchet de-escalated to Defensive mode (conf <= 250 bps)");
      } else if (ratchetState === "DEFENSIVE") {
        setRatchetState("RESTRICTED");
        setGuardReason("Ratchet de-escalated to Restricted mode (conf <= 100 bps)");
      } else if (ratchetState === "RESTRICTED") {
        setRatchetState("SAFE");
        setGuardReason("All safety checks nominal — full borrow capacity restored");
        setConfBps(24);
        setActiveShock(null);
      }
      setConsecutiveObservations(0);
    } else {
      setConsecutiveObservations((c) => c + 1);
      setGuardReason(`Recovery crank active: ${consecutiveObservations + 1}/${requiredObservations} healthy observations`);
    }
  };

  const resetDemo = () => {
    setRatchetState("SAFE");
    setGuardReason("All safety checks nominal");
    setConfBps(24);
    setRiskEpoch(0);
    setConsecutiveObservations(0);
    setActiveShock(null);
    setAllocationNvdaPct(50);
    setMarketDropPct(0);
  };

  const openRevertModal = (details?: Partial<RevertSimulationDetails>) => {
    setRevertDetails({
      programId: "Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2",
      instruction: "Borrow",
      errorCode: details?.errorCode || "ConfidenceTooWide",
      errorNumber: details?.errorNumber || 6004,
      errorMessage:
        details?.errorMessage ||
        "Oracle confidence interval is too wide for credit origination (285 bps > 150 bps limit).",
      logs: details?.logs || [
        "Program Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 invoke [1]",
        "Program log: Instruction: Borrow",
        "Program log: [Circuit::Oracle] Validating Pyth PriceUpdateV2 account",
        "Program log: [Circuit::Oracle] Feed ID: ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        "Program log: [Circuit::Oracle] Spot price: $138.25 | Confidence width: 285 bps",
        "Program log: [Circuit::Ratchet] Confidence exceeds allowable limit for Safe tier: 285 bps > 150 bps",
        "Program log: AnchorError caused by account: price_update. Error Code: ConfidenceTooWide. Error Number: 6004. Error Message: Oracle confidence interval too wide.",
        "Program Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 consumed 14,820 of 200,000 compute units",
        "Program Cq4Lvd6Kgr3a2aP6ENPVGQ8tUpbkGmoWr9ZDBdXGiTs2 failed: custom program error: 0x1774",
      ],
      computeUnits: details?.computeUnits || 14820,
    });
    setIsRevertModalOpen(true);
  };

  const closeRevertModal = () => {
    setIsRevertModalOpen(false);
  };

  return (
    <DemoHarnessContext.Provider
      value={{
        nvdaCollateral,
        nvdaPriceUsd,
        borrowDebtUsd,
        effectiveHf,
        baseLtvBps,
        liqThresholdBps,
        ratchetState,
        guardReason,
        confBps,
        riskEpoch,
        consecutiveObservations,
        requiredObservations,
        lastStressSlot,
        activeShock,
        triggerConfidenceShock,
        triggerMarketClose,
        triggerCustodyImpairment,
        triggerStepRecovery,
        resetDemo,
        isRevertModalOpen,
        revertDetails,
        openRevertModal,
        closeRevertModal,
        allocationNvdaPct,
        setAllocationNvdaPct,
        aaplPriceUsd,
        concentrationPenaltyBps,
        effectiveLtvBps,
        marketDropPct,
        setMarketDropPct,
        stressedHfBalanced,
        stressedHfConcentrated,
      }}
    >
      {children}
    </DemoHarnessContext.Provider>
  );
}

export function useDemoHarness(): DemoContextValue {
  const ctx = useContext(DemoHarnessContext);
  if (!ctx) {
    throw new Error("useDemoHarness must be used within a DemoHarnessProvider");
  }
  return ctx;
}
