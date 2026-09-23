import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export interface GlobalMenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  origin: { x: number; y: number };
  liveSlot?: number;
}

type FormatType = "horizontal" | "rounded" | "vertical" | "circle";

interface MenuItem {
  title: string;
  path: string;
  format: FormatType;
  sub: string;
}

const MENU_ITEMS: MenuItem[] = [
  { title: "Terminal", path: "/app", format: "horizontal", sub: "Core Trading & Account Interface" },
  { title: "Markets", path: "/app/markets", format: "rounded", sub: "Equity Pool Discovery & Liquidity" },
  { title: "Borrow & Credit", path: "/app/borrow", format: "vertical", sub: "Dynamic Underwriting & Leverage" },
  { title: "Autonomous Agent", path: "/app/autonomous", format: "circle", sub: "Autonomous Policy Execution" },
];

export const GlobalMenuOverlay: React.FC<GlobalMenuOverlayProps> = ({
  isOpen,
  onClose,
  origin,
  liveSlot,
}) => {
  const [currentFormat, setCurrentFormat] = useState<FormatType>("horizontal");
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  // Focus trap and lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("menu-locked");
      const timer = setTimeout(() => {
        firstLinkRef.current?.focus({ preventScroll: true });
      }, 400);
      return () => {
        clearTimeout(timer);
        document.body.classList.remove("menu-locked");
      };
    } else {
      document.body.classList.remove("menu-locked");
    }
  }, [isOpen]);

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <nav
      className={`menu-ov-global ${isOpen ? "open" : ""}`}
      style={{
        "--mx": `${origin.x}px`,
        "--my": `${origin.y}px`,
      } as React.CSSProperties}
      aria-label="Site navigation menu"
      aria-hidden={!isOpen}
      role="dialog"
      aria-modal="true"
    >
      {/* ── Top Header ── */}
      <header className="menu-ov-head">
        <div className="menu-ov-brand">
          <span>CIRCUIT</span>
          <span className="menu-ov-badge">V1.0 BETA</span>
        </div>
        <button
          type="button"
          className="menu-close"
          id="menu-close"
          onClick={onClose}
          aria-label="Close menu"
        >
          Close
        </button>
      </header>

      {/* ── Left: Staggered Navigation Typography ── */}
      <ul className="menu-list" role="list">
        {MENU_ITEMS.map((item, idx) => (
          <li key={item.path}>
            <Link
              to={item.path}
              ref={idx === 0 ? firstLinkRef : undefined}
              data-f={item.format}
              style={{ "--i": idx } as React.CSSProperties}
              onPointerEnter={() => setCurrentFormat(item.format)}
              onFocus={() => setCurrentFormat(item.format)}
              onClick={onClose}
            >
              <span>{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── Right: Format Morphing Shape ── */}
      <div className="menu-shape-container" aria-hidden="true">
        <div className="menu-shape" data-f={currentFormat}>
          <i className="ink" />
        </div>
        <span className="menu-shape-caption">FORMAT // {currentFormat}</span>
      </div>

      {/* ── Bottom: Protocol Meta & Secondary Links ── */}
      <footer className="menu-ov-foot">
        <div className="menu-ov-foot-l">
          <span>SOLANA DEVNET</span>
          {liveSlot !== undefined && <span>SLOT: {liveSlot}</span>}
        </div>
        <div className="menu-ov-foot-r">
          <Link to="/app/lab" onClick={onClose}>
            Adversarial Lab
          </Link>
          <Link to="/app/verify" onClick={onClose}>
            Verification
          </Link>
          <Link to="/app/faucet" onClick={onClose}>
            Faucet
          </Link>
          <Link to="/learn" onClick={onClose}>
            Architecture
          </Link>
          <a
            href="https://github.com/Patel5600/Circuit"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub ↗
          </a>
        </div>
      </footer>
    </nav>
  );
};
