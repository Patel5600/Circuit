import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";

// Auto-recover from deployment chunk mismatches and preload failures
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const lastReload = Number(sessionStorage.getItem("circuit_preload_reload") || "0");
  if (Date.now() - lastReload > 10000) {
    sessionStorage.setItem("circuit_preload_reload", String(Date.now()));
    window.location.reload();
  }
});

/**
 * The Solana and wallet providers are intentionally NOT mounted here. They are
 * scoped to the /app routes in App.tsx so the landing page does not pay for the
 * wallet adapter bundle.
 */
const container = document.getElementById("root")!;

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// Gracefully finish format-kit-3 preloader once React has mounted
if (typeof (window as any).Loader !== "undefined") {
  (window as any).Loader.finish();
}

// Complete and cleanly remove initial in-app ink bar if present
const initialInkBar = document.getElementById("app-ink-bar");
if (initialInkBar) {
  initialInkBar.style.width = "100%";
  setTimeout(() => {
    initialInkBar.style.opacity = "0";
    setTimeout(() => {
      initialInkBar.remove();
    }, 380);
  }, 120);
}
