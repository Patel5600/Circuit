import React, { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";

export interface MenuOverlaySectionProps {
  simpleMode?: boolean;
}

type FormatType = "horizontal" | "rounded" | "vertical" | "circle";

export const MenuOverlaySection: React.FC<MenuOverlaySectionProps> = ({ simpleMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<FormatType>("horizontal");
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  const frameRef = useRef<HTMLDivElement | null>(null);
  const openBtnRef = useRef<HTMLButtonElement | null>(null);
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (frameRef.current && openBtnRef.current) {
      const f = frameRef.current.getBoundingClientRect();
      const b = openBtnRef.current.getBoundingClientRect();
      setOrigin({
        x: b.left - f.left + b.width / 2,
        y: b.top - f.top + b.height / 2,
      });
    } else {
      setOrigin({ x: e.clientX, y: e.clientY });
    }
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    openBtnRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        firstLinkRef.current?.focus({ preventScroll: true });
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <section className="lab lf-lab" aria-label="Menu Overlay Interactive Showcase">
      <div className="lab-head lf-lab-head">
        <h2>Menu overlay</h2>
        <p>
          {simpleMode
            ? "The menu opens as an expanding circle from the clicked button. Links slide into view, and hovering over an item morphs the geometric shape into that format."
            : "The menu opens as a circle growing out of the button that was pressed. Each link slides up from behind a mask, and hovering one morphs the white shape into that item's format."}
        </p>
      </div>

      <div
        className={`stage lf-stage menu-stage ${isOpen ? "open" : ""}`}
        data-note="Menu overlay"
      >
        <div className="menu-frame" ref={frameRef}>
          {/* Default Unopened Page Inside Frame */}
          <div className="menu-page">
            <header className="menu-top">
              <span style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>Circuit Format</span>
              <button
                ref={openBtnRef}
                type="button"
                className="lf-pill lf-pill-btn"
                id="menu-open-frame"
                aria-expanded={isOpen}
                aria-controls="menu-ov-frame"
                onClick={handleOpen}
              >
                Menu
              </button>
            </header>

            <p className="menu-hero">
              Everything<br />starts as a shape
            </p>
          </div>

          {/* Expanding Overlay Navigation */}
          <nav
            className="menu-ov"
            id="menu-ov-frame"
            aria-label="Format Menu Showcase"
            style={{
              "--mx": `${origin.x}px`,
              "--my": `${origin.y}px`,
            } as React.CSSProperties}
          >
            <button
              type="button"
              className="menu-close"
              onClick={handleClose}
              aria-label="Close stage menu"
            >
              Close
            </button>

            <ul className="menu-list">
              <li>
                <Link
                  to="/app"
                  ref={firstLinkRef}
                  data-f="horizontal"
                  style={{ "--i": 0 } as React.CSSProperties}
                  onPointerEnter={() => setActiveFormat("horizontal")}
                  onFocus={() => setActiveFormat("horizontal")}
                  onClick={handleClose}
                >
                  <span>Terminal</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/app/markets"
                  data-f="rounded"
                  style={{ "--i": 1 } as React.CSSProperties}
                  onPointerEnter={() => setActiveFormat("rounded")}
                  onFocus={() => setActiveFormat("rounded")}
                  onClick={handleClose}
                >
                  <span>Markets</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/app/borrow"
                  data-f="vertical"
                  style={{ "--i": 2 } as React.CSSProperties}
                  onPointerEnter={() => setActiveFormat("vertical")}
                  onFocus={() => setActiveFormat("vertical")}
                  onClick={handleClose}
                >
                  <span>Borrow & Credit</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/app/autonomous"
                  data-f="circle"
                  style={{ "--i": 3 } as React.CSSProperties}
                  onPointerEnter={() => setActiveFormat("circle")}
                  onFocus={() => setActiveFormat("circle")}
                  onClick={handleClose}
                >
                  <span>Autonomous Agent</span>
                </Link>
              </li>
            </ul>

            <div className="menu-shape" data-f={activeFormat} aria-hidden="true">
              <i className="ink" />
            </div>
          </nav>
        </div>
      </div>
    </section>
  );
};
