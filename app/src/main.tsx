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

// The static boot message in index.html is only a fallback for "JS never ran".
// Clear it before mounting so it cannot linger behind the app.
container.innerHTML = "";

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
