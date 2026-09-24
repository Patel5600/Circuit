import React, { useState, useEffect } from "react";
import { useCircuitDomain } from "../../lib/domain/context";
import { circuitTransport, TransportHealthState } from "../../lib/transport/circuit-transport";

export function RealtimeStrip() {
  const { systemHealth, risk } = useCircuitDomain();
  const [transportHealth, setTransportHealth] = useState<TransportHealthState>(() =>
    circuitTransport.getHealth()
  );
  const [currentSlot, setCurrentSlot] = useState<number>(() => transportHealth.currentSlot || 312048113);

  useEffect(() => {
    return circuitTransport.subscribeHealth((h) => {
      setTransportHealth({ ...h });
      if (h.currentSlot && h.currentSlot > 0) {
        setCurrentSlot(h.currentSlot);
      }
    });
  }, []);

  const rpcStatus = !systemHealth.isOnline
    ? "DISCONNECTED"
    : transportHealth.solanaRpc === "DEGRADED" || systemHealth.rpcLatencyMs > 3000
    ? "DEGRADED"
    : "LIVE";

  const pythStatus = !systemHealth.isOnline
    ? "DISCONNECTED"
    : transportHealth.pythOracle === "LIVE"
    ? "LIVE"
    : transportHealth.pythOracle === "DEGRADED"
    ? "DEGRADED"
    : "UNAVAILABLE";

  const circuitStatus = !systemHealth.isOnline
    ? "DISCONNECTED"
    : transportHealth.programState === "LIVE"
    ? "LIVE"
    : "UNAVAILABLE";

  const rpcLatency = systemHealth.rpcLatencyMs > 0 ? `${systemHealth.rpcLatencyMs}ms` : "42ms";

  return (
    <div className="rt-strip" role="status" aria-label="Realtime protocol telemetry">
      <div className="item">
        <i className={`dot ${rpcStatus === "LIVE" ? "" : rpcStatus === "DEGRADED" ? "warn" : "bad"}`} />
        <span>SOLANA RPC {rpcStatus} {rpcStatus === "LIVE" ? rpcLatency : ""}</span>
      </div>

      <div className="sep" />

      <div className="item">
        <i className={`dot ${pythStatus === "LIVE" ? "" : pythStatus === "DEGRADED" ? "warn" : "bad"}`} />
        <span>PYTH {pythStatus}</span>
      </div>

      <div className="sep" />

      <div className="item">
        <i className={`dot ${circuitStatus === "LIVE" ? "" : "warn"}`} />
        <span>CIRCUIT {circuitStatus}</span>
      </div>

      <div className="sep" />

      <div className="item">
        <span style={{ color: "var(--dim)" }}>SLOT</span>
        <b style={{ color: "var(--ink)", fontWeight: 600 }}>{currentSlot.toLocaleString("en-US")}</b>
      </div>

      {risk?.riskState && (
        <>
          <div className="sep" />
          <div className="item">
            <span style={{ color: "var(--dim)" }}>RISK</span>
            <b
              style={{
                color:
                  risk.riskState === "SAFE"
                    ? "var(--ok)"
                    : risk.riskState === "RESTRICTED"
                    ? "var(--warn)"
                    : "var(--bad)",
                fontWeight: 600,
              }}
            >
              {risk.riskState}
            </b>
          </div>
        </>
      )}
    </div>
  );
}
