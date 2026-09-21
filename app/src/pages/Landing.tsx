import React, { useEffect } from "react";
import { LandingFormat } from "../components/landing/format/LandingFormat";
import "../styles/landing-format.css";

/**
 * Landing Page — Architectural Format Rebuild
 * Modular, zero-leak, 60fps presentation directly adapted from
 * format-kit.html, format-kit-2.html, and one-frame-four-shapes.html.
 */
export default function Landing() {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.scrollPaddingTop;
    root.style.scrollPaddingTop = "20px";
    return () => {
      root.style.scrollPaddingTop = prev;
    };
  }, []);

  return <LandingFormat />;
}
