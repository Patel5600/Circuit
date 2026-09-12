import React from "react";
import { Link } from "react-router-dom";

import { PageContainer } from "../components/layout/AppShell";
import { Card, Icon, Pill } from "../components/ui";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does circuit actually do?",
    a: (
      <>
        It lets you borrow against tokenized stock you already hold. Before it
        allows any action that increases your risk, it verifies that the price it
        is using is recent, that the market agrees on that price closely enough,
        and that the underlying stock market is open.
      </>
    ),
  },
  {
    q: "Why is borrowing sometimes unavailable?",
    a: (
      <>
        Because one of those checks did not pass. Borrowing is the moment new
        risk is created, so it is the moment the strictest conditions apply. Your
        existing position keeps working, and repaying is always available.
      </>
    ),
  },
  {
    q: "What is a health factor?",
    a: (
      <>
        It is how much cushion your position has. Above 1.00 you are safe. At or
        below 1.00 your collateral can be sold to repay what you owe. Depositing
        more collateral or repaying raises it; borrowing more or withdrawing
        lowers it.
      </>
    ),
  },
  {
    q: "What happens if my health factor falls to 1.00?",
    a: (
      <>
        Your position becomes eligible for liquidation: anyone can repay your
        debt in exchange for your collateral plus a small bonus. This is
        automatic and rule-based, not a decision anyone makes about you.
      </>
    ),
  },
  {
    q: "Why does the stock market being closed matter?",
    a: (
      <>
        Tokenized stock trades continuously, but the stock it represents does
        not. When the reference market is closed, prices are far less reliable,
        so circuit does not create new credit against them.
      </>
    ),
  },
  {
    q: "Who controls my collateral?",
    a: (
      <>
        It is held by an account the program itself owns, not by an operator or
        company wallet. Funds move only through the program's own rules. You can
        confirm this yourself on the{" "}
        <Link to="/app/verify" style={{ color: "var(--accent)" }}>
          verification page
        </Link>
        .
      </>
    ),
  },
];

const GATES: { title: string; plain: string; blocked: string }[] = [
  {
    title: "Price freshness",
    plain: "The price must have been published recently.",
    blocked: "If it is too old, borrowing is blocked until a newer one arrives.",
  },
  {
    title: "Price certainty",
    plain: "Sources must agree on the price within a set tolerance.",
    blocked: "If they disagree too much, borrowing is blocked.",
  },
  {
    title: "Market session",
    plain: "The reference stock market must be open.",
    blocked: "Outside regular hours, new borrowing is paused.",
  },
  {
    title: "Position safety",
    plain: "Your health factor must stay above the minimum.",
    blocked: "Any action that would breach it is refused up front.",
  },
];

export default function Learn() {
  return (
    <PageContainer
      title="How circuit works"
      subtitle="A short, plain-language guide. No blockchain knowledge needed."
      narrow
    >
      <div className="stack g-16">
        <Card>
          <h2 className="t-title" style={{ marginBottom: 12 }}>
            The idea in one line
          </h2>
          <p className="t-body muted">
            Deposit tokenized stock, see how much you can safely borrow against
            it, borrow, and let circuit watch the risk for you.
          </p>

          <div className="stack g-8" style={{ marginTop: 18 }}>
            {["Deposit tokenized equity", "circuit verifies market conditions", "Borrow within a safe limit", "Repay or withdraw at any time"].map(
              (step, i) => (
                <div key={step} className="row g-10">
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      fontSize: 11,
                      fontWeight: 700,
                      background: "var(--surface-3)",
                      color: "var(--text-2)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="t-sm">{step}</span>
                </div>
              )
            )}
          </div>
        </Card>

        <Card title="The four safety checks">
          <p className="t-sm muted" style={{ marginBottom: 16 }}>
            These run inside the program, in the same transaction as your borrow.
            They cannot be skipped by this or any other interface.
          </p>
          <div className="stack g-14">
            {GATES.map((g) => (
              <div
                key={g.title}
                style={{
                  padding: 14,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  background: "var(--bg-elevated)",
                }}
              >
                <div className="row between g-10" style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{g.title}</span>
                  <Pill tone="warning">BLOCKS BORROWING</Pill>
                </div>
                <p className="t-sm muted">{g.plain}</p>
                <p className="t-meta" style={{ marginTop: 4 }}>
                  {g.blocked}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Common questions">
          <div className="stack g-4">
            {FAQ.map((f) => (
              <details
                key={f.q}
                style={{
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 10,
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    padding: "11px 0",
                    fontWeight: 600,
                    fontSize: 14,
                    listStyle: "none",
                  }}
                >
                  <span className="row g-8">
                    <span style={{ color: "var(--text-3)" }}>
                      <Icon name="chevron" size={14} />
                    </span>
                    {f.q}
                  </span>
                </summary>
                <p className="t-sm muted" style={{ paddingLeft: 22, paddingBottom: 6 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </Card>

        <Card quiet>
          <div className="row between g-12 wrap">
            <p className="t-sm muted" style={{ maxWidth: "44ch" }}>
              Want the technical detail instead? Every account and price the
              protocol uses is inspectable.
            </p>
            <Link to="/app/verify" className="btn btn--secondary btn--sm">
              On-chain verification
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
