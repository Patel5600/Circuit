/**
 * Circuit Protocol - Global Notification Toaster
 *
 * Provides institutional transaction and risk change notifications
 * with deduplication and direct Explorer links.
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import { Icon } from "./Icon";

export interface ToastItem {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message?: string;
  signature?: string;
  dedupeKey?: string;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      setToasts((prev) => {
        if (toast.dedupeKey && prev.some((t) => t.dedupeKey === toast.dedupeKey)) {
          return prev;
        }
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const newToast: ToastItem = { ...toast, id };

        // Auto remove after 5s
        setTimeout(() => {
          removeToast(id);
        }, 5500);

        return [...prev, newToast];
      });
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}

      {/* Floating Toast Container */}
      <div
        className="toast-container"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          pointerEvents: "none",
          maxWidth: 400,
          width: "calc(100vw - 48px)",
        }}
      >
        {toasts.map((t) => {
          const borderColor =
            t.type === "success"
              ? "var(--success, #7fc39a)"
              : t.type === "warning"
              ? "var(--warning, #e5a93b)"
              : t.type === "error"
              ? "var(--danger, #e05252)"
              : "var(--accent, #7fc39a)";

          return (
            <div
              key={t.id}
              style={{
                pointerEvents: "auto",
                background: "var(--surface-1, #0d0f15)",
                border: `1px solid ${borderColor}`,
                borderRadius: "var(--r, 10px)",
                padding: "12px 14px",
                boxShadow: "0 8px 30px rgba(0, 0, 0, 0.8)",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                animation: "toastSlideIn 200ms ease-out forwards",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 13, color: "var(--text, #ffffff)" }}>
                  {t.title}
                </div>
                {t.message && (
                  <div style={{ fontSize: 12, color: "var(--text-2, #9ea6b8)", marginTop: 2 }}>
                    {t.message}
                  </div>
                )}
                {t.signature && (
                  <div style={{ marginTop: 6 }}>
                    <a
                      href={`https://explorer.solana.com/tx/${t.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 11,
                        color: "var(--accent)",
                        textDecoration: "none",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span>View on Explorer</span>
                      <Icon name="external" size={11} />
                    </a>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-3)",
                  cursor: "pointer",
                  padding: 2,
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
