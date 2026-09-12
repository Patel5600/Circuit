import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process"],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  define: {
    "process.env.ANCHOR_BROWSER": "true",
  },
  server: {
    watch: {
      /**
       * Required when the dev server runs inside WSL against a project on the
       * Windows filesystem: edits made from the Windows side never generate
       * inotify events under /mnt/c, so the default watcher silently serves
       * stale modules. Polling costs a little CPU and is dev-only.
       */
      usePolling: true,
      interval: 400,
      ignored: ["**/node_modules/**", "**/dist/**", "**/.shots/**"],
    },
  },
  build: {
    target: "esnext",
  },
});
