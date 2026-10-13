import express from "express";
import path from "node:path";
import { createApp } from "./app.js";
import { loadSettings } from "./config.js";
const settings = loadSettings(),
  app = createApp(settings);
if (import.meta.url.endsWith(".ts")) {
  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
    );
    next();
  });
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const web = path.resolve("dist/web");
  app.use(express.static(web));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(web, "index.html")),
  );
}
const server = app.listen(settings.port, "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      event: "server_started",
      url: `http://localhost:${settings.port}`,
      defaultProvider: "ollama",
    }),
  ),
);
server.requestTimeout = settings.timeoutMs + 10000;
server.headersTimeout = 15000;
