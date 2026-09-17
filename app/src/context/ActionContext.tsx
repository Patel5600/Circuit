import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { DeployedMarket, getDeployedMarket } from "../data/markets";
import { Position as PositionModel } from "../lib/portfolio/provider";

export type ActionType = "deposit" | "withdraw" | "borrow" | "repay";

export interface ActionIntent {
  type: ActionType;
  market: DeployedMarket;
  position?: PositionModel | null;
  amount?: string;
}

interface ActionContextValue {
  actionIntent: ActionIntent | null;
  openAction: (intent: {
    type: ActionType;
    market: DeployedMarket | string;
    position?: PositionModel | null;
    amount?: string;
  }) => void;
  closeAction: () => void;
  setActionType: (type: ActionType) => void;
}

const ActionContext = createContext<ActionContextValue | null>(null);

export function ActionProvider({ children }: { children: React.ReactNode }) {
  const [actionIntent, setActionIntent] = useState<ActionIntent | null>(null);

  const openAction = useCallback(
    ({
      type,
      market,
      position,
      amount,
    }: {
      type: ActionType;
      market: DeployedMarket | string;
      position?: PositionModel | null;
      amount?: string;
    }) => {
      let resolvedMarket: DeployedMarket | undefined;
      if (typeof market === "string") {
        resolvedMarket = getDeployedMarket(market);
      } else {
        resolvedMarket = market;
      }

      if (!resolvedMarket) {
        console.warn("Could not resolve market for action:", market);
        return;
      }

      // Canonical immutable intent bound to this specific asset
      setActionIntent({
        type,
        market: resolvedMarket,
        position: position ?? null,
        amount,
      });
    },
    []
  );

  const closeAction = useCallback(() => {
    setActionIntent(null);
  }, []);

  const setActionType = useCallback((type: ActionType) => {
    setActionIntent((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        type,
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      actionIntent,
      openAction,
      closeAction,
      setActionType,
    }),
    [actionIntent, openAction, closeAction, setActionType]
  );

  return <ActionContext.Provider value={value}>{children}</ActionContext.Provider>;
}

export function useAction() {
  const context = useContext(ActionContext);
  if (!context) {
    throw new Error("useAction must be used within an ActionProvider");
  }
  return context;
}
