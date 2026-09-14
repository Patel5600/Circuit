import React, { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PageContainer } from "../components/layout/AppShell";
import { Card, DataRow, Icon, Notice, Pill } from "../components/ui";
import {
  FAUCET_ASSETS,
  FaucetAsset,
  claimFaucetAsset,
  claimStarterPack,
  getCooldownRemaining,
  queryOnChainBalances,
  ClaimResult,
  COOLDOWN_MS,
  formatCooldown,
  sanitizeFaucetError,
} from "../lib/faucet";
import { MARKETS_DATA } from "../data/markets";

type CategoryFilter = "all" | "equity" | "quote" | "native";

export default function Faucet() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  // Address state: default to connected wallet if available
  const [manualAddress, setManualAddress] = useState("");
  const activeAddress = connected && publicKey ? publicKey.toBase58() : manualAddress.trim();
  const isConnected = connected && Boolean(publicKey) && (!manualAddress || manualAddress === publicKey?.toBase58());

  // Balances & Cooldowns
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});

  // Interaction state
  const [mintingSymbol, setMintingSymbol] = useState<string | null>(null);
  const [starterPackLoading, setStarterPackLoading] = useState(false);
  const [starterProgress, setStarterProgress] = useState("");
  const [recentClaims, setRecentClaims] = useState<ClaimResult[]>([]);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Logo map
  const metaMap = useMemo(() => {
    const map = new Map();
    for (const m of MARKETS_DATA) {
      map.set(m.symbol, m);
    }
    return map;
  }, []);

  // Update cooldowns every 10 seconds
  useEffect(() => {
    if (!activeAddress) return;
    const update = () => {
      const cd: Record<string, number> = {};
      for (const asset of FAUCET_ASSETS) {
        cd[asset.symbol] = getCooldownRemaining(activeAddress, asset.symbol);
      }
      setCooldowns(cd);
    };
    update();
    const timer = setInterval(update, 10_000);
    return () => clearInterval(timer);
  }, [activeAddress]);

  // Query live on-chain balances when address changes
  const refreshBalances = async (addr: string) => {
    if (!addr) return;
    setLoadingBalances(true);
    try {
      const b = await queryOnChainBalances(addr);
      setBalances(b);
    } catch (e) {
      console.warn("Failed to fetch on-chain balances:", e);
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    if (activeAddress && activeAddress.length >= 32) {
      refreshBalances(activeAddress);
    } else {
      setBalances({});
    }
  }, [activeAddress]);

  const handleClaim = async (asset: FaucetAsset) => {
    if (!activeAddress) {
      setErrorMsg("Please connect your Solana wallet or enter a valid recipient address.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setMintingSymbol(asset.symbol);

    try {
      const result = await claimFaucetAsset(activeAddress, asset, isConnected);
      setRecentClaims((prev) => [result, ...prev.slice(0, 7)]);
      setSuccessMsg(
        `Successfully minted ${result.amount.toLocaleString()} ${result.asset} on Devnet!`
      );
      // Refresh cooldowns and balances
      setCooldowns((prev) => ({ ...prev, [asset.symbol]: COOLDOWN_MS }));
      setTimeout(() => refreshBalances(activeAddress), 1500);
    } catch (err: any) {
      setErrorMsg(sanitizeFaucetError(err));
    } finally {
      setMintingSymbol(null);
    }
  };

  const handleClaimStarterPack = async () => {
    if (!activeAddress) {
      setErrorMsg("Please connect your wallet or enter a recipient address.");
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setStarterPackLoading(true);

    try {
      const results = await claimStarterPack(
        activeAddress,
        isConnected,
        (progress) => setStarterProgress(progress)
      );
      if (results.length > 0) {
        setRecentClaims((prev) => [...results, ...prev.slice(0, 5)]);
        setSuccessMsg(
          `Starter Pack claimed! Minted ${results.length} assets to ${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
        );
        setTimeout(() => refreshBalances(activeAddress), 2000);
      } else {
        setErrorMsg("All starter pack assets are currently on cooldown for this address.");
      }
    } catch (err: any) {
      setErrorMsg(sanitizeFaucetError(err));
    } finally {
      setStarterPackLoading(false);
      setStarterProgress("");
    }
  };

  const filteredAssets = useMemo(() => {
    if (filter === "all") return FAUCET_ASSETS;
    return FAUCET_ASSETS.filter((a) => a.category === filter);
  }, [filter]);

  return (
    <PageContainer
      title="Devnet Asset Faucet"
      subtitle="Mint live test collateral equities, borrow quote currencies, and Devnet SOL. 100% real on-chain Solana transactions."
      action={
        <div className="row g-8" style={{ alignItems: "center" }}>
          {connected ? (
            <Pill tone="success" withDot>
              100% Full Allowance
            </Pill>
          ) : (
            <Pill tone="warning" withDot>
              Address Mode: 20% Limit
            </Pill>
          )}
          {!connected && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setVisible(true)}
            >
              Connect for 100%
            </button>
          )}
        </div>
      }
    >
      <div className="stack g-20">
        {/* Banner Alert if any */}
        {errorMsg && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(207, 139, 139, 0.12)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--r)",
              color: "var(--danger)",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="row g-8" style={{ alignItems: "center" }}>
              <Icon name="alert" size={16} />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(127, 195, 154, 0.12)",
              border: "1px solid var(--success)",
              borderRadius: "var(--r)",
              color: "var(--success)",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="row g-8" style={{ alignItems: "center" }}>
              <Icon name="check" size={16} />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {/* Top Control Panel: Recipient Address & Tier Status */}
        <Card title="RECIPIENT & FAUCET ALLOCATION TIER">
          <div className="stack g-16" style={{ padding: "4px 0" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              {/* Address Input / Connected Status */}
              <div className="stack g-6">
                <label className="t-label">Recipient Solana Address</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder={
                      connected && publicKey
                        ? publicKey.toBase58()
                        : "Enter Solana wallet address (e.g. 7UVim...)"
                    }
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "var(--surface-2)",
                      border: `1px solid ${
                        isConnected ? "var(--success)" : "var(--border-strong)"
                      }`,
                      borderRadius: "var(--r)",
                      color: "var(--text)",
                      fontFamily: "var(--mono)",
                      fontSize: 13,
                    }}
                  />
                  {connected && publicKey && manualAddress && (
                    <button
                      type="button"
                      onClick={() => setManualAddress("")}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-3)",
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      Use Connected
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {isConnected ? (
                    <span style={{ color: "var(--success)" }}>
                      Connected wallet detected. Eligible for 100% full devnet grants.
                    </span>
                  ) : (
                    <span>
                      Manual address mode active. Capped at 20% limit per claim.{" "}
                      <button
                        type="button"
                        onClick={() => setVisible(true)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--accent)",
                          textDecoration: "underline",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Connect wallet
                      </button>{" "}
                      to unlock 100%.
                    </span>
                  )}
                </div>
              </div>

              {/* Tier Breakdown Card */}
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  padding: "12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <div className="row g-8" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <span className="t-label">Current Allowance Tier</span>
                  <Pill tone={isConnected ? "success" : "warning"} withDot>
                    {isConnected ? "100% Full Tier" : "20% Public Tier"}
                  </Pill>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.4 }}>
                  {isConnected ? (
                    <>
                      Grants: <strong>50 Shares</strong> per equity • <strong>10,000 USDC</strong> • <strong>1.0 SOL</strong> (4-hour cooldown)
                    </>
                  ) : (
                    <>
                      Grants: <strong>10 Shares</strong> per equity • <strong>2,000 USDC</strong> • <strong>0.2 SOL</strong> (4-hour cooldown)
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Starter Pack Action */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 16px",
                background: "linear-gradient(135deg, rgba(121, 194, 164, 0.08) 0%, rgba(139, 123, 196, 0.08) 100%)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r)",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  Instant Portfolio Starter Pack
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
                  Mint a ready-to-trade portfolio: {isConnected ? "50 NVDAx + 50 AAPLx + 10,000 USDC + 1.0 SOL" : "10 NVDAx + 10 AAPLx + 2,000 USDC + 0.2 SOL"}
                </div>
              </div>

              <button
                type="button"
                className="btn btn--accent"
                onClick={handleClaimStarterPack}
                disabled={starterPackLoading || !activeAddress}
                style={{ minWidth: 180 }}
              >
                {starterPackLoading ? (
                  <span className="row g-6" style={{ alignItems: "center" }}>
                    <Icon name="spinner" size={14} spin />
                    <span>{starterProgress || "Claiming..."}</span>
                  </span>
                ) : (
                  <span className="row g-6" style={{ alignItems: "center" }}>
                    <Icon name="faucet" size={15} />
                    <span>Claim Starter Pack ({isConnected ? "100%" : "20%"})</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </Card>

        {/* Filter Navigation */}
        <div className="row g-8" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div className="row g-6">
            {(
              [
                { key: "all", label: `All Assets (${FAUCET_ASSETS.length})` },
                { key: "equity", label: "Equities (11)" },
                { key: "quote", label: "Borrow Quotes (2)" },
                { key: "native", label: "Devnet SOL (1)" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                className="btn btn--sm"
                onClick={() => setFilter(t.key)}
                style={{
                  background: filter === t.key ? "var(--surface-3)" : "transparent",
                  borderColor: filter === t.key ? "var(--accent)" : "var(--border)",
                  color: filter === t.key ? "var(--text)" : "var(--text-2)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            Authority: <span className="mono">F5Jmu...ZFAT</span>
          </div>
        </div>

        {/* Assets Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 14,
          }}
        >
          {filteredAssets.map((asset) => {
            const meta = metaMap.get(asset.symbol);
            const remainingCd = cooldowns[asset.symbol] || 0;
            const isCooling = remainingCd > 0;
            const isBusy = mintingSymbol === asset.symbol;
            const amountToMint = isConnected ? asset.fullAmount : asset.addressAmount;
            const liveBalance = balances[asset.symbol];

            return (
              <div
                key={asset.symbol}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 14,
                  transition: "border-color var(--t-fast)",
                }}
              >
                {/* Asset Header */}
                <div className="stack g-8">
                  <div className="row g-10" style={{ alignItems: "center" }}>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-strong)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                      }}
                    >
                      {meta?.logoSvg ? (
                        <span style={{ transform: "scale(0.85)" }}>{meta.logoSvg}</span>
                      ) : asset.isNativeSol ? (
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#9945FF" }}>◎</span>
                      ) : asset.symbol === "USDC" ? (
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#2775CA" }}>$</span>
                      ) : (
                        <Icon name="layers" size={16} />
                      )}
                    </span>

                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row g-6" style={{ alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                          {asset.tokenSymbol}
                        </span>
                        <Pill
                          tone={
                            asset.category === "equity"
                              ? "accent"
                              : asset.category === "quote"
                              ? "neutral"
                              : "success"
                          }
                        >
                          {asset.category.toUpperCase()}
                        </Pill>
                      </div>
                      <div className="truncate" style={{ fontSize: 12, color: "var(--text-2)" }}>
                        {asset.name}
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, minHeight: 32 }}>
                    {asset.description}
                  </p>
                </div>

                {/* Mint Info & Live Balance */}
                <div
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: "var(--r-sm)",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>
                      Grant Allowance
                    </div>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>
                      {amountToMint.toLocaleString()} {asset.tokenSymbol}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase" }}>
                      Your Balance
                    </div>
                    <div style={{ fontWeight: 600, color: liveBalance !== undefined ? "var(--mint)" : "var(--text-3)" }}>
                      {liveBalance !== undefined
                        ? `${liveBalance.toLocaleString()} ${asset.tokenSymbol}`
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Claim Button */}
                <button
                  type="button"
                  className={`btn ${isCooling ? "btn--secondary" : "btn--primary"} btn--block`}
                  onClick={() => handleClaim(asset)}
                  disabled={isBusy || isCooling || !activeAddress}
                  style={{
                    fontSize: 13,
                    padding: "9px 14px",
                    opacity: isCooling ? 0.6 : 1,
                  }}
                >
                  {isBusy ? (
                    <span className="row g-6" style={{ alignItems: "center", justifyContent: "center" }}>
                      <Icon name="spinner" size={14} spin />
                      <span>Minting on-chain...</span>
                    </span>
                  ) : isCooling ? (
                    <span className="row g-6" style={{ alignItems: "center", justifyContent: "center" }}>
                      <Icon name="clock" size={14} />
                      <span>Cooldown ({formatCooldown(remainingCd)})</span>
                    </span>
                  ) : (
                    <span className="row g-6" style={{ alignItems: "center", justifyContent: "center" }}>
                      <Icon name="faucet" size={14} />
                      <span>
                        Claim {amountToMint.toLocaleString()} {asset.tokenSymbol}
                      </span>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Recent On-Chain Claims Log */}
        {recentClaims.length > 0 && (
          <Card title="RECENT DEVNET FAUCET TRANSACTIONS">
            <div className="stack g-8">
              {recentClaims.map((c) => (
                <div
                  key={c.signature}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    fontSize: 13,
                  }}
                >
                  <div className="row g-10" style={{ alignItems: "center" }}>
                    <Pill tone="success" withDot>
                      CONFIRMED
                    </Pill>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>
                      +{c.amount.toLocaleString()} {c.asset}
                    </span>
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                      to {c.recipient.slice(0, 4)}...{c.recipient.slice(-4)}
                    </span>
                  </div>

                  <a
                    href={c.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      textDecoration: "none",
                      fontSize: 12,
                    }}
                  >
                    <span className="mono">{c.signature.slice(0, 8)}...</span>
                    <Icon name="external" size={12} />
                  </a>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Transparency / Verification footer */}
        <Notice
          tone="neutral"
          title="Verifiable Devnet Mint Authority"
        >
          All Circuit equity collaterals and borrow quotes are minted directly via the protocol's devnet upgrade authority (<span className="mono">F5JmuDsKh9oswAhR9rJSfL2PGU1UpQF2cN3n7NjZrFAT</span>). The faucet automatically creates your Associated Token Account and covers all Solana network fees.
        </Notice>
      </div>
    </PageContainer>
  );
}
