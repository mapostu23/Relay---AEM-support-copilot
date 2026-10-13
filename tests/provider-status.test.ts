import request from "supertest";
import { createApp } from "../src/server/app.js";
import { Store } from "../src/server/store.js";
import { loadCustomer } from "../src/server/routing.js";
import { it, expect, vi } from "vitest";
import { providerStatus } from "../src/server/provider-status.js";
import { loadSettings } from "../src/server/config.js";
it("checks local model availability without making cloud requests or exposing keys", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ models: [{ name: "qwen2.5:7b" }] })),
  );
  const statuses = await providerStatus(
    loadSettings({ OPENAI_API_KEY: "private-key" }),
    fetcher as typeof fetch,
  );
  expect(statuses.find((s) => s.id === "ollama")?.state).toBe("ready");
  expect(statuses.find((s) => s.id === "openai")?.state).toBe("configured");
  expect(statuses.find((s) => s.id === "anthropic")?.state).toBe(
    "unconfigured",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toContain("http://127.0.0.1:11434/api/tags");
  expect(JSON.stringify(statuses)).not.toContain("private-key");
});
it("distinguishes a missing default model from an unreachable local service", async () => {
  const missing = await providerStatus(
    loadSettings({}),
    (async () => new Response(JSON.stringify({ models: [] }))) as typeof fetch,
  );
  expect(missing[0]).toMatchObject({
    state: "unconfigured",
    status: "Model missing",
  });
  const offline = await providerStatus(loadSettings({}), (async () => {
    throw Error("offline");
  }) as typeof fetch);
  expect(offline[0]).toMatchObject({ state: "offline", status: "Offline" });
});

it("shares cached status probes and keeps loopback API protections", async () => {
  const store = new Store(":memory:");
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ models: [] })),
  );
  const app = createApp(
    loadSettings({}),
    store,
    loadCustomer(),
    fetcher as typeof fetch,
    () => {},
    false,
  );
  try {
    const [first, second] = await Promise.all([
      request(app).get("/api/providers/status"),
      request(app).get("/api/providers/status"),
    ]);
    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (
        await request(app)
          .get("/api/providers/status")
          .set("Host", "external.example")
      ).status,
    ).toBe(403);
  } finally {
    store.close();
  }
});
