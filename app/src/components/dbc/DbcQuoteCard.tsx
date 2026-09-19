/**
 * Circuit Protocol — DBC Quote Card
 * Clearly separates QUOTED state from CONFIRMED state.
 * Never presents a quote as executed.
 */
import React from "react";
import { DbcSwapQuote } from "../../lib/meteora/dbc";

interface DbcQuoteCardProps {
  quote: DbcSwapQuote;
  inputSymbol: string;
  outputSymbol: string;
  inputDecimals: number;
  outputDecimals: number;
  /** If set, shows confirmed result section */
  confirmedAmountOut?: bigint;
  txSignature?: string;
}

function fmt(amount: bigint, decimals: number, digits = 4): string {
  const val = Number(amount) / 10 ** decimals;
  return val.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function DbcQuoteCard({
  quote,
  inputSymbol,
  outputSymbol,
  inputDecimals,
  outputDecimals,
  confirmedAmountOut,
  txSignature,
}: DbcQuoteCardProps) {
  const isConfirmed = confirmedAmountOut !== undefined;

  return (
    <div
      className="dbc-quote-card"
      style={{
        background: "var(--surface-1, #18181b)",
        border: `1px solid ${isConfirmed ? "#22c55e40" : "#3f3f46"}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Quote Section */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono, monospace)",
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "#71717a",
            background: "rgba(113,113,122,0.12)",
            padding: "1px 6px",
            borderRadius: 4,
          }}
        >
          QUOTED
        </span>
        <span style={{ fontSize: 10, color: "#52525b" }}>— not a commitment</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <QuoteRow
          label="Input"
          value={`${fmt(quote.amountIn, inputDecimals)} ${inputSymbol}`}
        />
        <QuoteRow
          label="Expected out"
          value={`${fmt(quote.estimatedAmountOut, outputDecimals)} ${outputSymbol}`}
        />
        <QuoteRow
          label="Minimum out"
          value={`${fmt(quote.minAmountOut, outputDecimals)} ${outputSymbol}`}
          hint="Enforced on-chain"
        />
        <QuoteRow
          label="Slippage"
          value={`${quote.slippageBps / 100}%`}
        />
        <QuoteRow
          label="Price impact"
          value={`~${quote.priceImpactBps / 100}%`}
        />
      </div>

      {/* Confirmed Section */}
      {isConfirmed && (
        <>
          <div
            style={{
              height: 1,
              background: "#22c55e30",
              margin: "4px 0",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono, monospace)",
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "#22c55e",
                background: "rgba(34,197,94,0.12)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              CONFIRMED
            </span>
          </div>
          <QuoteRow
            label="Received"
            value={`${fmt(confirmedAmountOut!, outputDecimals)} ${outputSymbol}`}
            highlight
          />
          {txSignature && (
            <QuoteRow
              label="Tx"
              value={
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#818cf8", fontSize: 11, fontFamily: "var(--font-mono)" }}
                >
                  {txSignature.slice(0, 8)}…{txSignature.slice(-8)}
                </a>
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function QuoteRow({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 12, color: "#71717a" }}>
        {label}
        {hint && (
          <span style={{ fontSize: 10, color: "#52525b", marginLeft: 4 }}>({hint})</span>
        )}
      </span>
      <span
        style={{
          fontSize: 12,
          color: highlight ? "#22c55e" : "#e4e4e7",
          fontWeight: highlight ? 600 : 400,
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
