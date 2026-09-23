import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import fs from "node:fs";
import path from "node:path";

function loadEnvFiles() {
  const candidates = [
    path.resolve(__dirname, "../.env.local"),
    path.resolve(__dirname, ".env.local"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, ".env"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const content = fs.readFileSync(c, "utf8");
      for (const line of content.split("\n")) {
        const m = line.trim().match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (m) {
          const k = m[1];
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k] && v) {
            process.env[k] = v;
          }
        }
      }
    }
  }
}
loadEnvFiles();

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
              const apiFile = path.resolve(__dirname, "api/market-data.ts");
              const mod = await server.ssrLoadModule(apiFile);
              const handler = mod.default;
              await handler(mockReq, mockRes);
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
            }
          }

          if (req.url?.startsWith("/api/faucet")) {
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
              const mockRes = {
                statusCode: 200,
                status(c: number) {
                  this.statusCode = c;
                  res.statusCode = c;
                  return this;
                },
                setHeader(k: string, v: string) {
                  res.setHeader(k, v);
                  return this;
                },
                json(payload: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(payload));
                },
                end(payload?: any) {
                  res.statusCode = this.statusCode;
                  res.end(payload);
                },
              };
              const apiFile = path.resolve(__dirname, "api/faucet.ts");
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

          if (req.url?.startsWith("/api/agent/credit")) {
            try {
              let bodyStr = "";
              for await (const chunk of req) {
                bodyStr += chunk;
              }
              const parsedBody = bodyStr ? JSON.parse(bodyStr) : {};
              const urlObj = new URL(req.url, "http://localhost");
              const query: Record<string, string> = {};
              urlObj.searchParams.forEach((val, key) => {
                query[key] = val;
              });
              const mockReq = {
                method: req.method,
                headers: req.headers,
                body: parsedBody,
                query,
              };
              const mockRes = {
                statusCode: 200,
                status(c: number) {
                  this.statusCode = c;
                  res.statusCode = c;
                  return this;
                },
                setHeader(k: string, v: string) {
                  res.setHeader(k, v);
                  return this;
                },
                json(payload: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(payload));
                },
                send(payload: any) {
                  res.statusCode = this.statusCode;
                  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
                },
              };
              const apiFile = path.resolve(__dirname, "api/agent/credit.ts");
              const mod = await server.ssrLoadModule(apiFile);
              const handler = mod.default;
              await handler(mockReq, mockRes);
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: err?.message || "Internal server error", stack: err?.stack }));
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
                socket: req.socket,
              };
              const mockRes = {
                statusCode: 200,
                status(c: number) {
                  this.statusCode = c;
                  res.statusCode = c;
                  return this;
                },
                setHeader(k: string, v: string) {
                  res.setHeader(k, v);
                  return this;
                },
                json(payload: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(payload));
                },
                send(payload: any) {
                  res.statusCode = this.statusCode;
                  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
                },
                write(chunk: any) {
                  return res.write(chunk);
                },
                end(chunk?: any) {
                  return res.end(chunk);
                },
              };
              const apiFile = path.resolve(__dirname, "api/agent/chat.ts");
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
  ssr: {
    external: ["node:crypto", "crypto", "node:buffer", "buffer", "node:fs", "fs", "node:path", "path"],
  },
  build: {
    target: "esnext",
    cssCodeSplit: false,
  },
});
