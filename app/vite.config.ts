import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "node:path";

export default defineConfig({
  server: {
    watch: {
      usePolling: true,
      interval: 400,
      ignored: ["**/node_modules/**", "**/dist/**", "**/.shots/**"],
    },
    proxy: {
      // If external proxy needed, can be placed here
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process"],
      globals: { Buffer: true, global: true, process: true },
    }),
    {
      name: "dev-api-middleware",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/market-data")) {
            try {
              // Dynamic import of serverless handler
              const urlObj = new URL(req.url, "http://localhost");
              const query: Record<string, string> = {};
              urlObj.searchParams.forEach((val, key) => {
                query[key] = val;
              });
              const mockReq = { method: req.method, query, body: {} };
              const mockRes = {
                statusCode: 200,
                status(c: number) {
                  this.statusCode = c;
                  return this;
                },
                setHeader(k: string, v: string) {
                  res.setHeader(k, v);
                },
                json(payload: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(payload));
                },
              };
              const apiFile = path.resolve(__dirname, "../api/market-data.ts");
              const mod = await server.ssrLoadModule(apiFile);
              const handler = mod.default;
              await handler(mockReq, mockRes);
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
              return;
            }
          }

          if (req.url?.startsWith("/api/agent/chat")) {
            try {
              let bodyStr = "";
              for await (const chunk of req) {
                bodyStr += chunk;
              }
              const parsedBody = bodyStr ? JSON.parse(bodyStr) : {};
              const mockReq = {
                method: req.method,
                headers: req.headers,
                body: parsedBody,
                query: {},
              };
              const mockRes = res as any;
              mockRes.status = function (c: number) {
                this.statusCode = c;
                return this;
              };
              mockRes.json = function (payload: any) {
                this.setHeader("Content-Type", "application/json");
                this.end(JSON.stringify(payload));
              };
              const apiFile = path.resolve(__dirname, "../api/agent/chat.ts");
              const mod = await server.ssrLoadModule(apiFile);
              const handler = mod.default;
              await handler(mockReq, mockRes);
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
              return;
            }
          }
          next();
        });
      },
    },
  ],
  build: {
    target: "esnext",
  },
});
