import React from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { Button, EmptyState, Notice } from "../ui";
import { IS_CONFIGURED, missingConfig } from "../../config";

/** Shown when the build has no market wired up yet. */
export function ConfigNotice() {
  if (IS_CONFIGURED) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <Notice tone="warning" title="No market configured">
        This build does not yet point at a deployed market. Missing{" "}
        {missingConfig().join(" and ")}.
      </Notice>
    </div>
  );
}

/** Standard disconnected state, used by every page that needs a wallet. */
export function ConnectPrompt({
  what = "Your positions and transactions",
}: {
  what?: string;
}) {
  const { setVisible } = useWalletModal();
  return (
    <EmptyState
      icon="wallet"
      title="Connect your wallet"
      action={
        <Button variant="primary" icon="wallet" onClick={() => setVisible(true)}>
          Connect Wallet
        </Button>
      }
    >
      {what} will appear here.
    </EmptyState>
  );
}

/** Standard no-position state. */
export function NoPositionPrompt() {
  return (
    <EmptyState
      icon="deposit"
      title="No position yet"
      action={
        <Link to="/app/position" className="btn btn--primary">
          Deposit collateral
        </Link>
      }
    >
      Deposit tokenized equity to start using it as collateral.
    </EmptyState>
  );
}

/** Convenience wrapper: renders children only when a wallet is connected. */
export function RequireWallet({
  what,
  children,
}: {
  what?: string;
  children: React.ReactNode;
}) {
  const { connected } = useWallet();
  if (!connected) return <ConnectPrompt what={what} />;
  return <>{children}</>;
}
