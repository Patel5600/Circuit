import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
} from "@solana/wallet-adapter-wallets";

import { RPC_URL } from "../config";

/**
 * Solana + wallet context.
 *
 * Deliberately mounted only under /app rather than at the application root. The
 * wallet adapter stack is by far the largest dependency in the bundle, and the
 * landing page needs none of it - scoping the providers here keeps that weight
 * off the first visit.
 *
 * One connection and one wallet session are shared by every app route.
 */

// The adapter packages ship provider types that do not accept children under
// React 18's stricter JSX typing, so they are widened locally.
const ConnectionProviderAny = ConnectionProvider as any;
const WalletProviderAny = WalletProvider as any;
const WalletModalProviderAny = WalletModalProvider as any;

export default function SolanaProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProviderAny
      endpoint={RPC_URL}
      config={{ commitment: "confirmed" }}
    >
      <WalletProviderAny wallets={wallets} autoConnect>
        <WalletModalProviderAny>{children}</WalletModalProviderAny>
      </WalletProviderAny>
    </ConnectionProviderAny>
  );
}
