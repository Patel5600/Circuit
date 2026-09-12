import React from "react";
import { Link } from "react-router-dom";

import { CircuitWordmark } from "../components/brand/CircuitLogo";
import { Icon } from "../components/ui";

export default function NotFound() {
  return (
    <div
      className="stack g-20"
      style={{
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <CircuitWordmark size={26} />
      <div>
        <h1 className="t-section" style={{ marginBottom: 8 }}>
          Page not found
        </h1>
        <p className="t-body muted" style={{ maxWidth: "42ch" }}>
          That page does not exist. It may have moved.
        </p>
      </div>
      <div className="row g-10 wrap" style={{ justifyContent: "center" }}>
        <Link to="/app" className="btn btn--primary">
          Go to dashboard
          <Icon name="arrowRight" size={15} />
        </Link>
        <Link to="/" className="btn btn--ghost">
          Home
        </Link>
      </div>
    </div>
  );
}
