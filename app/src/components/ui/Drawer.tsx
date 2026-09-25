/**
 * Circuit Protocol - Institutional Slide-Out Drawer & Bottom Sheet
 *
 * Right-side sliding panel on desktop (width: 460px), smooth bottom sheet on mobile.
 * Features keyboard dismissal (ESC), backdrop click, and background scroll locking.
 */

import React, { useEffect, useCallback } from "react";
import { Icon } from "./Icon";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  width?: number | string;
  children: React.ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  width = 460,
  children,
}: DrawerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    },
    [open, onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="drawer-portal" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="drawer-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.72)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 900,
          animation: "fadeIn 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      />

      {/* Drawer Surface */}
      <aside
        className="drawer-surface"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: typeof width === "number" ? `${width}px` : width,
          maxWidth: "100vw",
          background: "var(--surface-1, #0a0c10)",
          borderLeft: "1px solid var(--border-strong, #1f232d)",
          zIndex: 901,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0, 0, 0, 0.8)",
          animation: "slideInRight 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        {/* Drawer Header */}
        <header
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border, #171a22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-2, #0d0f15)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 650,
                  margin: 0,
                  color: "var(--text, #ffffff)",
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && (
              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: 12,
                  color: "var(--text-3, #727a8e)",
                }}
              >
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: "transparent",
              border: "1px solid var(--border, #242938)",
              borderRadius: "var(--r-sm, 6px)",
              color: "var(--text-2, #9ea6b8)",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all var(--t-fast, 120ms)",
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        {/* Drawer Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px",
          }}
        >
          {children}
        </div>
      </aside>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (max-width: 640px) {
          .drawer-surface {
            top: auto !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            max-height: 85vh !important;
            border-left: none !important;
            border-top: 1px solid var(--border-strong, #1f232d) !important;
            border-radius: 16px 16px 0 0 !important;
            animation: slideUpBottom 320ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
          }
          @keyframes slideUpBottom {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        }
      `}</style>
    </div>
  );
}
