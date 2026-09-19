import React from "react";
import { Icon } from "../ui";

export type TxStage =
  | "IDLE"
  | "READY"
  | "SIGNING"
  | "SUBMITTING"
  | "CONFIRMING"
  | "CONFIRMED"
  | "REJECTED"
  | "FAILED";

const STEPS: { stage: TxStage; label: string }[] = [
  { stage: "SIGNING", label: "SIGNING" },
  { stage: "SUBMITTING", label: "SUBMITTING" },
  { stage: "CONFIRMING", label: "CONFIRMING" },
  { stage: "CONFIRMED", label: "CONFIRMED" },
];

const STAGE_ORDER: TxStage[] = [
  "IDLE",
  "READY",
  "SIGNING",
  "SUBMITTING",
  "CONFIRMING",
  "CONFIRMED",
];

function stageIndex(stage: TxStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function isDone(current: TxStage, step: TxStage): boolean {
  if (current === "REJECTED" || current === "FAILED") return false;
  return stageIndex(current) > stageIndex(step);
}

function isActive(current: TxStage, step: TxStage): boolean {
  return current === step;
}

function isError(current: TxStage): boolean {
  return current === "REJECTED" || current === "FAILED";
}

/**
 * Renders a compact horizontal lifecycle bar:
 * SIGNING -> SUBMITTING -> CONFIRMING -> CONFIRMED
 *
 * Shows error state for REJECTED / FAILED.
 */
export function TransactionStatus({
  stage,
  signature,
  errorMessage,
}: {
  stage: TxStage;
  signature?: string | null;
  errorMessage?: string | null;
}) {
  if (stage === "IDLE" || stage === "READY") return null;

  const error = isError(stage);

  return (
    <div className="tx-lifecycle" role="status" aria-live="polite">
      {error ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--danger)",
            fontSize: 12,
            fontFamily: "var(--mono)",
          }}
        >
          <Icon name="cross" size={14} />
          <span>
            {stage === "REJECTED"
              ? "Transaction rejected by wallet."
              : errorMessage || "Transaction failed."}
          </span>
        </div>
      ) : (
        <>
          {STEPS.map((step, idx) => {
            const done = isDone(stage, step.stage);
            const active = isActive(stage, step.stage);
            const isLast = idx === STEPS.length - 1;

            return (
              <React.Fragment key={step.stage}>
                <div className="tx-step">
                  <div
                    className={`tx-step__dot${
                      active
                        ? " tx-step__dot--active"
                        : done
                        ? " tx-step__dot--done"
                        : ""
                    }`}
                    aria-hidden="true"
                  >
                    {done ? (
                      <Icon name="check" size={11} />
                    ) : active ? (
                      <Icon name="spinner" size={11} spin />
                    ) : (
                      String(idx + 1)
                    )}
                  </div>
                  <span
                    className={`tx-step__label${
                      active
                        ? " tx-step__label--active"
                        : done
                        ? " tx-step__label--done"
                        : ""
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={`tx-step__connector${done ? " tx-step__connector--done" : ""}`}
                  />
                )}
              </React.Fragment>
            );
          })}

          {stage === "CONFIRMED" && signature && (
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: 12,
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--mint)",
                textDecoration: "none",
              }}
            >
              View on explorer ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}
