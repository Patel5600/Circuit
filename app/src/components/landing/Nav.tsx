import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CircuitWordmark } from "../brand/CircuitLogo";
import { Icon, Pill } from "../ui";
import { CLUSTER_LABEL } from "../../env";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#markets", label: "Markets" },
  { href: "#how", label: "How it works" },
  { href: "#technology", label: "Technology" },
];

/**
 * Floating navigation.
 *
 * Transparent over the hero, then gains a subtle surface once the user scrolls,
 * so it never competes with the headline on arrival. The mobile variant is a
 * full-screen overlay with focus trapped to the panel while open.
 */
export function Nav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page and allow Escape while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className={`nav${solid ? " nav--solid" : ""}`}>
        <Link to="/" aria-label="circuit home" className="nav__brand">
          <CircuitWordmark size={25} />
        </Link>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="nav__link">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="nav__right">
          <span className="nav__net">
            <Pill tone="accent" withDot>
              {CLUSTER_LABEL}
            </Pill>
          </span>
          <Link to="/app" className="btn btn--primary btn--sm">
            Launch App
          </Link>
          <button
            type="button"
            className="nav__burger iconbtn"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" size={17} />
          </button>
        </div>
      </header>

      {open && (
        <div className="navsheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="navsheet__top">
            <CircuitWordmark size={25} />
            <button
              type="button"
              className="iconbtn"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              autoFocus
            >
              <Icon name="close" size={17} />
            </button>
          </div>

          <nav className="navsheet__links" aria-label="Primary">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="navsheet__foot">
            <Pill tone="accent" withDot>
              Solana {CLUSTER_LABEL}
            </Pill>
            <Link
              to="/app"
              className="btn btn--primary btn--block"
              onClick={() => setOpen(false)}
            >
              Launch circuit
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
