import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/server/store.js";
import {
  loadCustomer,
  resolveProgram,
  route,
  priorityPolicy,
  validateReview,
} from "../src/server/routing.js";
import {
  loadSettings,
  requireConfigured,
  publicConfig,
} from "../src/server/config.js";
import { demoMessages } from "../data/mailbox.js";
import { mockModelOutputs } from "./model-responses.js";
import { DemoMailbox, syncMailbox } from "../src/server/mailbox.js";
import { createApp } from "../src/server/app.js";
import { analyze, validateEvidence } from "../src/server/analysis.js";
import {
  buildNativeRequest,
  normalize,
  generate,
  type GenerationContext,
} from "../src/server/providers.js";
import { emailTemplate, estimateCost } from "../src/server/email.js";
import {
  type Review,
  type WorkItem,
  AppError,
  AnalyzeRequestSchema,
} from "../src/shared/types.js";
const customer = loadCustomer(),
  settings = loadSettings({
    PORT: "3003",
    MODEL_TIMEOUT_MS: "1000",
    OPENAI_API_KEY: "fake-test-key",
    ANTHROPIC_API_KEY: "fake-test-key",
  });
const memory = () => new Store(":memory:");
function itemFor(index = 0) {
  const s = memory();
  const result = s.ingest([demoMessages[index]]);
  const item = s.get(result.ids[0]);
  s.close();
  return item;
}
const validReview = (overrides: Partial<Review> = {}): Review => ({
  ticketType: "incident",
  category: "component_defect",
  program: "patient",
  affiliate: "Brazil",
  environment: "production",
  priority: "high",
  severity: "major",
  teamId: "patient-dev",
  summary: "Registration fails on Safari.",
  impact: "Reported registration failure; impact not confirmed.",
  actions: ["Reproduce on the reported Safari version."],
  missingInformation: ["What is the affected-user scope?"],
  notes:
    "Reviewed the reported browser difference and selected the configured owner.",
  disposition: "handover",
  acknowledged: true,
  ...overrides,
});
const nativeResponse = (
  provider = "openai",
  output: unknown = mockModelOutputs["demo-01"],
) =>
  new Response(
    JSON.stringify(
      provider === "openai"
        ? {
            status: "completed",
            output: [
              {
                content: [
                  { type: "output_text", text: JSON.stringify(output) },
                ],
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          }
        : provider === "anthropic"
          ? {
              stop_reason: "end_turn",
              content: [{ type: "text", text: JSON.stringify(output) }],
              usage: { input_tokens: 100, output_tokens: 50 },
            }
          : {
              done: true,
              message: { content: JSON.stringify(output) },
              prompt_eval_count: 100,
              eval_count: 50,
            },
    ),
    { status: 200 },
  );
const context = (
  provider: GenerationContext["provider"] = "openai",
): GenerationContext => ({
  provider,
  model: settings.providers.find((p) => p.id === provider)!.models[0],
  cloudConsent: true,
  messages: [demoMessages[0]],
  settings,
  signal: new AbortController().signal,
});
describe("durable email ingestion", () => {
  it("deduplicates by provider/message ID and associates replies only by provider/thread ID", () => {
    const s = memory();
    const one = s.ingest([demoMessages[0], demoMessages[0]]);
    expect(one).toMatchObject({ created: 1, duplicates: 1, replies: 0 });
    const reply = {
      ...demoMessages[0],
      messageId: "reply-1",
      body: "New impact information",
      receivedAt: "2026-10-08T13:00:00Z",
    };
    expect(s.ingest([reply])).toMatchObject({ created: 0, replies: 1 });
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0].messages).toHaveLength(2);
    expect(s.ingest([{ ...reply, provider: "manual" }])).toMatchObject({
      created: 1,
    });
    s.close();
  });
  it("persists messages, review and audit across restart", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-test-")),
      file = path.join(dir, "test.sqlite");
    let s = new Store(file);
    const { ids } = s.ingest([demoMessages[0]]);
    s.update(ids[0], 1, (i) => {
      i.review = validReview();
      s.audit(i.id, "human_review_saved", { manual: true });
    });
    s.close();
    s = new Store(file);
    expect(s.get(ids[0]).review?.teamId).toBe("patient-dev");
    expect(s.history(ids[0])[0].event).toBe("human_review_saved");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    s.close();
    fs.rmSync(dir, { recursive: true });
  });
  it("reopens approved items on any new reply and preserves earlier analysis", async () => {
    const s = memory();
    const { ids } = s.ingest([demoMessages[1]]);
    const a = await analyze(
      s.get(ids[0]),
      { provider: "ollama", model: "qwen2.5:7b" },
      settings,
      customer,
      new AbortController().signal,
      (async () =>
        nativeResponse("ollama", mockModelOutputs["demo-02"])) as typeof fetch,
    );
    s.update(ids[0], 1, (i) => {
      i.analysis = a;
      i.review = validReview();
      i.draft = { ...emailTemplate(i, i.review, customer), approved: true };
      i.status = "triaged";
    });
    s.ingest([
      {
        ...demoMessages[1],
        messageId: "old-but-new-id",
        receivedAt: "2026-10-07T08:00:00Z",
      },
    ]);
    const i = s.get(ids[0]);
    expect(i.status).toBe("new");
    expect(i.review).toBeNull();
    expect(i.draft).toBeNull();
    expect(i.analysis).toEqual(a);
    expect(i.messages[0].messageId).toBe("old-but-new-id");
    s.close();
  });
  it("rejects stale writes and rolls back failed changes and audit entries", () => {
    const s = memory();
    const { ids } = s.ingest([demoMessages[0]]);
    expect(() => s.update(ids[0], 99, () => {})).toThrow(AppError);
    expect(() =>
      s.update(ids[0], 1, (i) => {
        s.audit(i.id, "should_rollback");
        i.status = "triaged";
        throw Error("fail");
      }),
    ).toThrow("fail");
    expect(s.get(ids[0]).status).toBe("new");
    expect(s.history(ids[0]).some((a) => a.event === "should_rollback")).toBe(
      false,
    );
    s.close();
  });
  it("validates whole batches before inserting", () => {
    const s = memory();
    expect(() =>
      s.ingest([demoMessages[0], { ...demoMessages[1], sender: "invalid" }]),
    ).toThrow();
    expect(s.list()).toHaveLength(0);
    s.close();
  });
  it("preserves cursor/items on mailbox failure and safely retries duplicate pages", async () => {
    const s = memory();
    s.setState("cursor", "0");
    await expect(
      syncMailbox(s, new DemoMailbox("unavailable")),
    ).rejects.toMatchObject({ code: "mailbox_unavailable" });
    expect(s.state("cursor")).toBe("0");
    expect(s.list()).toHaveLength(0);
    await syncMailbox(s, new DemoMailbox());
    s.setState("cursor", "0");
    expect(await syncMailbox(s, new DemoMailbox())).toMatchObject({
      created: 0,
      duplicates: 1,
    });
    expect(s.list()).toHaveLength(1);
    s.close();
  });
});
describe("customer-governed routing", () => {
  it("resolves all portfolios through exact case-normalized hosts", () => {
    for (const p of customer.programs) {
      const m = {
        ...demoMessages[0],
        affectedUrl: `https://${p.domains[0].host.toUpperCase()}/path?x=1`,
      };
      expect(resolveProgram([m], customer).program).toBe(p.id);
    }
  });
  it("rejects spoofed suffixes, userinfo and unknown domains", () => {
    for (const url of [
      "https://patient.example.com.evil.example/",
      "https://patient.example.com@evil.example/",
      "https://unknown.example/",
    ])
      expect(
        resolveProgram([{ ...demoMessages[0], affectedUrl: url }], customer)
          .status,
      ).toBe("unknown");
  });
  it("flags different-program and duplicate-domain configuration conflicts", () => {
    const m = {
      ...demoMessages[0],
      body: "See https://hcp.example.com/",
      affectedUrl: "https://patient.example.com/",
    };
    expect(resolveProgram([m], customer).status).toBe("conflict");
    const c = structuredClone(customer);
    c.programs[1].domains.push(c.programs[0].domains[0]);
    expect(resolveProgram([demoMessages[0]], c).status).toBe("conflict");
  });
  it("does not let an incidental known URL resolve an unmapped affected domain", () => {
    const message = {
      ...demoMessages[0],
      affectedUrl: "https://unknown.example/",
      body: "This fails; for comparison see https://corporate.example.com/.",
    };
    expect(resolveProgram([message], customer)).toMatchObject({
      status: "conflict",
      program: null,
    });
  });
  it("routes program development separately from shared teams", () => {
    expect(route("component_defect", "patient", customer).teamId).toBe(
      "patient-dev",
    );
    expect(route("component_defect", "hcp", customer).teamId).toBe("hcp-dev");
    expect(route("content_authoring", "corporate", customer).teamId).toBe(
      "content",
    );
    expect(route("dns", "corporate", customer).teamId).toBe("infrastructure");
  });
  it("requires review for redirects, missing programs and conflicting rules", () => {
    expect(route("redirects", "corporate", customer)).toMatchObject({
      status: "manual",
      teamId: null,
      candidates: ["operations", "corp-dev", "content"],
    });
    expect(route("dns", null, customer).status).toBe("manual");
    const c = structuredClone(customer);
    c.rules.push(c.rules[0]);
    expect(route("content_authoring", "corporate", c).status).toBe("manual");
  });
  it("applies security priority floor and rejects unconfirmed handovers", () => {
    const a = { ...mockModelOutputs["demo-13"], priority: "low" as const };
    expect(
      priorityPolicy(a, resolveProgram([demoMessages[12]], customer)),
    ).toMatchObject({ priority: "high", escalation: true });
    expect(() =>
      validateReview(
        validReview({ category: "security", priority: "low" }),
        customer,
      ),
    ).toThrow();
    expect(() =>
      validateReview(validReview({ program: "unknown" }), customer),
    ).toThrow();
    expect(() =>
      validateReview(validReview({ teamId: "attacker" }), customer),
    ).toThrow();
    expect(() =>
      validateReview(
        validReview({
          disposition: "needs_information",
          program: "unknown",
          teamId: "",
          missingInformation: ["Which URL?"],
        }),
        customer,
      ),
    ).not.toThrow();
  });
  it("blocks unapproved financial estimates and computes reviewed numbers deterministically", () => {
    expect(estimateCost(24, null).available).toBe(false);
    expect(
      estimateCost(24, {
        approved: false,
        hourlyRate: 85,
        contingencyPercent: 20,
        currency: "EUR",
      }).available,
    ).toBe(false);
    expect(
      estimateCost(24, {
        approved: true,
        hourlyRate: 85,
        contingencyPercent: 20,
        currency: "EUR",
      }),
    ).toMatchObject({ total: 2448, provisional: true });
    expect(() =>
      estimateCost(-1, {
        approved: true,
        hourlyRate: 85,
        contingencyPercent: 20,
        currency: "EUR",
      }),
    ).toThrow();
  });
});
describe("bounded AI boundary", () => {
  it("accepts exact evidence but rejects fabricated quotations and extra ownership fields", () => {
    const i = itemFor();
    expect(validateEvidence(mockModelOutputs["demo-01"], i).category).toBe(
      "content_authoring",
    );
    expect(() =>
      validateEvidence(
        {
          ...mockModelOutputs["demo-01"],
          evidence: [
            { messageId: "demo-01", quote: "I ran diagnostics and fixed it." },
          ],
        },
        i,
      ),
    ).toThrow();
    expect(() =>
      validateEvidence(
        { ...mockModelOutputs["demo-01"], assignedTeam: "attacker" },
        i,
      ),
    ).toThrow();
    expect(() =>
      validateEvidence(
        { ...mockModelOutputs["demo-01"], category: "not-a-category" },
        i,
      ),
    ).toThrow();
  });
  it("defaults to Ollama and exposes only the three real providers", () => {
    expect(publicConfig(settings).defaultProvider).toBe("ollama");
    expect(settings.providers.map((p) => p.id)).toEqual([
      "ollama",
      "openai",
      "anthropic",
    ]);
    expect(
      AnalyzeRequestSchema.safeParse({
        revision: 1,
        provider: "unsupported",
        model: "mock",
      }).success,
    ).toBe(false);
    expect(
      AnalyzeRequestSchema.safeParse({
        revision: 1,
        provider: "ollama",
        model: "qwen2.5:7b",
        scenario: "slow",
      }).success,
    ).toBe(false);
  });
  it("keeps cloud consent and model allowlists server-side", () => {
    expect(() =>
      requireConfigured(settings, "openai", "not-allowed", true),
    ).toThrow();
    expect(() =>
      requireConfigured(
        settings,
        "openai",
        settings.providers[1].models[0],
        false,
      ),
    ).toThrow();
    expect(() =>
      loadSettings({ OLLAMA_HOST: "https://external.example" }),
    ).toThrow();
    expect(() =>
      loadSettings({ MODEL_PRICES_JSON: '{"a":{"input":-1,"output":0}}' }),
    ).toThrow();
  });
  it.each(["ollama", "openai", "anthropic"] as const)(
    "uses native %s schemas and normalizes reported usage",
    async (provider) => {
      const c = context(provider),
        native = buildNativeRequest(c);
      expect(JSON.stringify(native.body)).toContain("evidence");
      const mock = vi.fn(async () => nativeResponse(provider));
      const r = await generate({ ...c, fetchImpl: mock as typeof fetch });
      expect(r.inputTokens).toBe(100);
      expect(r.outputTokens).toBe(50);
      expect(r.output).toEqual(mockModelOutputs["demo-01"]);
      expect(mock).toHaveBeenCalledTimes(1);
      if (provider === "openai") expect(native.body.store).toBe(false);
    },
  );
  it("rejects refusal, incomplete output, huge response and provider errors without fallback", async () => {
    expect(() =>
      normalize("openai", {
        status: "completed",
        output: [{ content: [{ type: "refusal" }] }],
      }),
    ).toThrow();
    expect(() => normalize("ollama", { done: false })).toThrow();
    await expect(
      generate({
        ...context(),
        fetchImpl: (async () =>
          new Response("x".repeat(210000))) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "oversized_output" });
    const mock = vi.fn(async () => new Response("", { status: 429 }));
    await expect(
      generate({ ...context(), fetchImpl: mock as typeof fetch }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("retries malformed JSON exactly once under the original deadline, never retries schema/evidence", async () => {
    const bad = vi.fn(async () => new Response("bad"));
    await expect(
      analyze(
        itemFor(),
        {
          provider: "openai",
          model: settings.providers[1].models[0],
          cloudConsent: true,
        },
        settings,
        customer,
        new AbortController().signal,
        bad as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "malformed_output" });
    expect(bad).toHaveBeenCalledTimes(2);
    const invalid = vi.fn(async () =>
      nativeResponse("openai", {
        ...mockModelOutputs["demo-01"],
        evidence: [{ messageId: "invented", quote: "bad" }],
      }),
    );
    await expect(
      analyze(
        itemFor(),
        {
          provider: "openai",
          model: settings.providers[1].models[0],
          cloudConsent: true,
        },
        settings,
        customer,
        new AbortController().signal,
        invalid as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "bad_evidence" });
    expect(invalid).toHaveBeenCalledTimes(1);
  });
  it("reports retry cost as unknown rather than undercounting and stops on timeout/cancel", async () => {
    let n = 0;
    const fetcher = vi.fn(async () =>
      ++n === 1 ? new Response("bad") : nativeResponse(),
    );
    const s = {
      ...settings,
      prices: {
        [`openai:${settings.providers[1].models[0]}`]: { input: 1, output: 1 },
      },
    };
    const result = await analyze(
      itemFor(),
      {
        provider: "openai",
        model: settings.providers[1].models[0],
        cloudConsent: true,
      },
      s,
      customer,
      new AbortController().signal,
      fetcher as typeof fetch,
    );
    expect(result.meta.attempts).toBe(2);
    expect(result.meta.costUsd).toBeNull();
    await expect(
      analyze(
        itemFor(),
        { provider: "ollama", model: "qwen2.5:7b" },
        { ...settings, timeoutMs: 100 },
        customer,
        new AbortController().signal,
        (async (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = init!.signal!;
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          })) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "timeout" });
    const c = new AbortController();
    c.abort();
    await expect(
      analyze(
        itemFor(),
        { provider: "ollama", model: "qwen2.5:7b" },
        settings,
        customer,
        c.signal,
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});
describe("API lifecycle and privacy", () => {
  function app(
    fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const prompt = JSON.parse(body.messages.at(-1).content);
      return nativeResponse(
        "ollama",
        mockModelOutputs[prompt.messages[0].messageId],
      );
    },
  ) {
    const store = memory(),
      logs: Record<string, unknown>[] = [];
    return {
      store,
      logs,
      app: createApp(
        settings,
        store,
        customer,
        fetcher,
        (e) => logs.push(e),
        false,
      ),
    };
  }
  it("runs analyze → review → local Send and automatically triages, requiring each gate", async () => {
    const a = app(),
      item = a.store.list().find((i) => i.threadId === "thread-02")!;
    let r = await request(a.app)
      .post(`/api/items/${item.id}/triaged`)
      .send({ revision: 1 });
    expect(r.status).toBe(400);
    r = await request(a.app)
      .post(`/api/items/${item.id}/analyze`)
      .send({ revision: 1, provider: "ollama", model: "qwen2.5:7b" });
    expect(r.status).toBe(200);
    expect(r.body.item.analysis.routing.teamId).toBe("patient-dev");
    r = await request(a.app)
      .patch(`/api/items/${item.id}/review`)
      .send({ revision: 2, review: validReview() });
    expect(r.status).toBe(200);
    expect(r.body.item.draft.to).toBe("patient-dev@example.com");
    expect(
      (await request(a.app).get(`/api/items/${item.id}/export`)).status,
    ).toBe(400);
    r = await request(a.app)
      .post(`/api/items/${item.id}/draft/approve`)
      .send({ revision: 3, acknowledged: true });
    expect(r.status).toBe(200);
    expect(
      (await request(a.app).get(`/api/items/${item.id}/export`)).text,
    ).toContain("Suggested investigation (not executed)");
    expect(r.body.item.status).toBe("triaged");
    expect(r.body.item.draft.approved).toBe(true);
    expect(a.store.history(item.id)[0]).toMatchObject({
      event: "marked_triaged",
      details: { outboundSent: false, automatic: true },
    });
    expect(JSON.stringify(a.logs)).not.toContain(demoMessages[1].body);
    expect(JSON.stringify(a.logs)).not.toContain("fake-test-key");
    a.store.close();
  });
  it("supports manual triage without AI; edit invalidates approval and replies block stale exports", async () => {
    const a = app(),
      item = a.store.list().find((i) => i.threadId === "thread-02")!;
    let r = await request(a.app)
      .patch(`/api/items/${item.id}/review`)
      .send({ revision: 1, review: validReview() });
    expect(r.status).toBe(200);
    await request(a.app)
      .post(`/api/items/${item.id}/draft/approve`)
      .send({ revision: 2, acknowledged: true });
    r = await request(a.app).patch(`/api/items/${item.id}/draft`).send({
      revision: 3,
      subject: "Reviewed subject",
      body: "Please investigate; no fix promised.",
    });
    expect(r.body.item.draft.approved).toBe(false);
    await request(a.app).post("/api/mailbox/sync").send({ scenario: "reply" });
    expect(
      (await request(a.app).get(`/api/items/${item.id}/export`)).status,
    ).toBe(400);
    expect(
      (
        await request(a.app)
          .post(`/api/items/${item.id}/draft/approve`)
          .send({ revision: 4, acknowledged: true })
      ).status,
    ).toBe(409);
    a.store.close();
  });
  it("preserves previous review/draft on AI or mailbox failures", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(new Response("bad JSON"))
      .mockResolvedValueOnce(new Response("bad JSON"))
      .mockResolvedValueOnce(
        nativeResponse("ollama", {
          ...mockModelOutputs["demo-01"],
          evidence: [{ messageId: "INVENTED", quote: "bad" }],
        }),
      );
    const a = app(fetcher as typeof fetch),
      item = a.store.list()[0];
    await request(a.app)
      .patch(`/api/items/${item.id}/review`)
      .send({ revision: 1, review: validReview() });
    const before = a.store.get(item.id);
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await request(a.app)
        .post(`/api/items/${item.id}/analyze`)
        .send({
          revision: 2,
          provider: "ollama",
          model: "qwen2.5:7b",
        });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(a.store.get(item.id)).toEqual(before);
    }
    const n = a.store.list().length;
    expect(
      (
        await request(a.app)
          .post("/api/mailbox/sync")
          .send({ scenario: "unavailable" })
      ).status,
    ).toBe(503);
    expect(a.store.list()).toHaveLength(n);
    expect(a.store.get(item.id)).toEqual(before);
    a.store.close();
  });
  it("completes local triage for a reviewed clarification without transmitting email", async () => {
    const a = app(),
      item = a.store.list().find((i) => i.threadId === "thread-05")!;
    let r = await request(a.app)
      .patch(`/api/items/${item.id}/review`)
      .send({
        revision: 1,
        review: validReview({
          program: "unknown",
          teamId: "",
          disposition: "needs_information",
        }),
      });
    expect(r.body.item.draft.to).toBe(item.sender);
    r = await request(a.app)
      .post(`/api/items/${item.id}/draft/approve`)
      .send({ revision: 2, acknowledged: true });
    expect(r.status).toBe(200);
    expect(a.store.get(item.id).status).toBe("triaged");
    a.store.close();
  });
  it("has no send endpoint and injection cannot invent teams, bypass approval or mutate configuration", async () => {
    const a = app();
    a.store.ingest([demoMessages[14]]);
    const item = a.store.list().find((i) => i.threadId === "thread-15")!;
    const r = await request(a.app)
      .post(`/api/items/${item.id}/analyze`)
      .send({ revision: 1, provider: "ollama", model: "qwen2.5:7b" });
    expect(r.body.item.analysis.routing.teamId).toBe("content");
    expect(r.body.item.draft).toBeNull();
    expect(
      (await request(a.app).post(`/api/items/${item.id}/send`).send({})).status,
    ).toBe(404);
    expect(
      customer.teams.some((t) => t.email === "attacker@evil.example"),
    ).toBe(false);
    a.store.close();
  });
  it("rejects invalid intake, unknown origin and rebinding host, and health never calls model", async () => {
    const a = app();
    expect(
      (
        await request(a.app)
          .post("/api/mailbox/manual")
          .send({ sender: "invalid" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(a.app)
          .post("/api/mailbox/sync")
          .set("Origin", "http://evil.example")
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (await request(a.app).get("/api/health").set("Host", "evil.example:3003"))
        .status,
    ).toBe(403);
    expect((await request(a.app).get("/api/health")).body.inference).toContain(
      "no live model",
    );
    a.store.close();
  });
  it("discards completed model results when a reply arrives during inference", async () => {
    const store = memory();
    const fetcher = (async () => {
      await new Promise((r) => setTimeout(r, 70));
      return nativeResponse("openai", mockModelOutputs["demo-02"]);
    }) as typeof fetch;
    const app = createApp(settings, store, customer, fetcher, () => {}, false),
      item = store.list().find((i) => i.threadId === "thread-02")!;
    const running = request(app)
      .post(`/api/items/${item.id}/analyze`)
      .send({
        revision: 1,
        provider: "openai",
        model: settings.providers[1].models[0],
        cloudConsent: true,
      })
      .then((r) => r);
    await new Promise((r) => setTimeout(r, 25));
    store.ingest([{ ...demoMessages[1], messageId: "during-generation" }]);
    const result = await running;
    expect(result.status).toBe(409);
    expect(store.get(item.id).analysis).toBeNull();
    expect(store.get(item.id).status).toBe("new");
    store.close();
  });
  it("enforces two concurrent analyses and recovers after completion", async () => {
    const store = memory();
    const fetcher = (async (_url, init) => {
      await new Promise((r) => setTimeout(r, 100));
      const prompt = JSON.parse(JSON.parse(String(init?.body)).input);
      return nativeResponse(
        "openai",
        mockModelOutputs[prompt.messages[0].messageId],
      );
    }) as typeof fetch;
    const app = createApp(settings, store, customer, fetcher, () => {}, false),
      items = store.list(),
      body = {
        revision: 1,
        provider: "openai",
        model: settings.providers[1].models[0],
        cloudConsent: true,
      };
    const jobs = [0, 1].map((n) =>
      request(app)
        .post(`/api/items/${items[n].id}/analyze`)
        .send(body)
        .then((r) => r),
    );
    await new Promise((r) => setTimeout(r, 25));
    expect(
      (await request(app).post(`/api/items/${items[0].id}/analyze`).send(body))
        .status,
    ).toBe(429);
    expect(
      (await request(app).post(`/api/items/${items[2].id}/analyze`).send(body))
        .status,
    ).toBe(429);
    expect((await Promise.all(jobs)).map((r) => r.status)).toEqual([200, 200]);
    expect((await request(app).get("/api/health")).body.activeAnalyses).toBe(0);
    const r = await request(app)
      .post(`/api/items/${items[2].id}/analyze`)
      .send(body);
    expect(r.status).toBe(200);
    store.close();
  });
});
