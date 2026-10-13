import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { Store } from "../src/server/store.js";
import { loadSettings } from "../src/server/config.js";
import { loadCustomer } from "../src/server/routing.js";
import { demoMessages } from "../data/mailbox.js";
import { mockModelOutputs } from "./model-responses.js";
import { hasCurrentAnalysis } from "../src/shared/types.js";
import type { AutomaticAnalysis } from "../src/server/automatic-analysis.js";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const settings = loadSettings({
  OPENAI_API_KEY: "test-key",
  MODEL_TIMEOUT_MS: "1000",
});
const respond = (url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  const prompt = JSON.parse(body.input || body.messages.at(-1).content);
  const message = prompt.messages[0];
  const output = {
    ...mockModelOutputs["demo-01"],
    evidence: [{ messageId: message.messageId, quote: message.body }],
  };
  return new Response(
    JSON.stringify(
      url.includes("openai")
        ? {
            status: "completed",
            output: [
              {
                content: [
                  { type: "output_text", text: JSON.stringify(output) },
                ],
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          }
        : {
            done: true,
            message: { content: JSON.stringify(output) },
            prompt_eval_count: 1,
            eval_count: 1,
          },
    ),
  );
};
function setup(
  fetcher: typeof fetch = async (url, init) => respond(String(url), init),
  recoverAutomaticBacklog = false,
) {
  const store = new Store(":memory:");
  const app = createApp(
    settings,
    store,
    loadCustomer(),
    fetcher,
    () => {},
    true,
    recoverAutomaticBacklog,
  );
  const automatic = app.locals.automatic as AutomaticAnalysis;
  return {
    app,
    store,
    automatic,
    close: async () => {
      automatic.stop();
      await automatic.idle();
      store.close();
    },
  };
}
describe("automatic Ollama analysis", () => {
  it("invalidates current-analysis freshness when a reply is received", async () => {
    const a = setup();
    try {
      const item = a.store.list().find((i) => i.threadId === "thread-02")!;
      a.automatic.enqueue(item.id);
      await a.automatic.idle();
      expect(hasCurrentAnalysis(a.store.get(item.id))).toBe(true);
      a.store.ingest([
        {
          ...demoMessages[1],
          messageId: "freshness-reply",
          body: "Additional details",
          receivedAt: "2026-10-13T13:00:00Z",
        },
      ]);
      expect(hasCurrentAnalysis(a.store.get(item.id))).toBe(false);
      a.automatic.enqueue(item.id);
      await a.automatic.idle();
      expect(hasCurrentAnalysis(a.store.get(item.id))).toBe(true);
      expect(a.store.get(item.id).status).toBe("new");
    } finally {
      await a.close();
    }
  });
  it("analyzes the initial inbox without any browser requests", async () => {
    const fetcher = vi.fn(async (url, init) =>
      respond(String(url), init),
    ) as unknown as typeof fetch;
    const a = setup(fetcher, true);
    try {
      await a.automatic.idle();
      expect(a.store.list()).toHaveLength(10);
      expect(fetcher).toHaveBeenCalledTimes(10);
      for (const item of a.store.list()) {
        expect(item.analysis?.meta.provider).toBe("ollama");
        expect(item.status).toBe("new");
        expect(hasCurrentAnalysis(item)).toBe(true);
        expect(item.unread).toBe(true);
        expect(item.review).toBeNull();
        expect(item.draft).toBeNull();
      }
    } finally {
      await a.close();
    }
  });
  it("recovers unfinished mail after restart while retaining current analyses", async () => {
    const fetcher = vi.fn(async (url, init) =>
      respond(String(url), init),
    ) as unknown as typeof fetch;
    const a = setup(fetcher, true);
    let restarted: AutomaticAnalysis | undefined;
    try {
      await a.automatic.idle();
      a.automatic.stop();
      const item = a.store.list()[0];
      a.store.update(item.id, item.revision, (current) => {
        current.analysis = null;
        current.status = "new";
      });
      const app = createApp(
        settings,
        a.store,
        loadCustomer(),
        fetcher,
        () => {},
      );
      restarted = app.locals.automatic as AutomaticAnalysis;
      await restarted.idle();
      expect(fetcher).toHaveBeenCalledTimes(11);
      expect(a.store.get(item.id).analysis?.meta.provider).toBe("ollama");
    } finally {
      restarted?.stop();
      await restarted?.idle();
      await a.close();
    }
  });
  it("preserves saved reviews and analyzes new replies once", async () => {
    const fetcher = vi.fn(async (url, init) =>
      respond(String(url), init),
    ) as unknown as typeof fetch;
    const a = setup(fetcher);
    try {
      const item = a.store.list().find((i) => i.threadId === "thread-02")!;
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await a.automatic.idle();
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await a.automatic.idle();
      expect(fetcher).toHaveBeenCalledTimes(1);
      const current = a.store.get(item.id);
      const output = current.analysis!.output;
      const review = {
        ticketType: output.ticketType,
        category: output.category,
        affiliate: output.affiliate,
        environment: output.environment,
        summary: output.summary,
        impact: output.impact,
        priority: output.priority,
        severity: output.severity,
        actions: output.actions,
        missingInformation: output.missingInformation,
        program: "patient",
        teamId: "patient-dev",
        notes: "Reviewed against the conversation.",
        disposition: "handover",
        acknowledged: true,
      };
      expect(
        (
          await request(a.app)
            .patch(`/api/items/${item.id}/review`)
            .send({ revision: current.revision, review })
        ).status,
      ).toBe(200);
      const saved = a.store.get(item.id);
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await a.automatic.idle();
      expect(a.store.get(item.id)).toEqual(saved);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await request(a.app)
        .post("/api/mailbox/sync")
        .send({ scenario: "reply" });
      await a.automatic.idle();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(a.store.get(item.id).review).toBeNull();
      expect(a.store.get(item.id).analysis?.meta.provider).toBe("ollama");
      await request(a.app)
        .post("/api/mailbox/sync")
        .send({ scenario: "reply" });
      await a.automatic.idle();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await a.close();
    }
  });
  it("analyzes received messages without opening them and deduplicates repeated ingestion", async () => {
    const fetcher = vi.fn(async (url, init) =>
      respond(String(url), init),
    ) as unknown as typeof fetch;
    const a = setup(fetcher);
    try {
      const body = {
        ...demoMessages[0],
        provider: "manual",
        messageId: "new-manual",
        threadId: "new-manual-thread",
      };
      const first = await request(a.app).post("/api/mailbox/manual").send(body);
      await a.automatic.idle();
      const item = a.store.get(first.body.ids[0]);
      expect(item.analysis?.meta.provider).toBe("ollama");
      expect(item.status).toBe("new");
      expect(hasCurrentAnalysis(item)).toBe(true);
      expect(item.review).toBeNull();
      expect(item.draft).toBeNull();
      await request(a.app).post("/api/mailbox/manual").send(body);
      await a.automatic.idle();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      await a.close();
    }
  });
  it("queues mailbox sync and opening an item, then reuses current results", async () => {
    const fetcher = vi.fn(async (url, init) =>
      respond(String(url), init),
    ) as unknown as typeof fetch;
    const a = setup(fetcher);
    try {
      const sync = await request(a.app)
        .post("/api/mailbox/sync")
        .send({ scenario: "normal" });
      await a.automatic.idle();
      expect(a.store.get(sync.body.ids[0]).analysis?.meta.provider).toBe(
        "ollama",
      );
      const item = a.store.list().find((i) => !i.analysis)!;
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await a.automatic.idle();
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await a.automatic.idle();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(
        (await request(a.app).get(`/api/items/${item.id}`)).body
          .automaticAnalysis.phase,
      ).toBe("completed");
    } finally {
      await a.close();
    }
  });
  it("shows failure without polling retries and allows explicit cloud re-analysis", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation((url, init) =>
        Promise.resolve(respond(String(url), init)),
      );
    const a = setup(fetcher as typeof fetch);
    try {
      const item = a.store.list()[0];
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await a.automatic.idle();
      for (let n = 0; n < 3; n++)
        expect(
          (await request(a.app).get(`/api/items/${item.id}`)).body
            .automaticAnalysis.phase,
        ).toBe("failed");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const result = await request(a.app)
        .post(`/api/items/${item.id}/analyze`)
        .send({
          revision: item.revision,
          provider: "openai",
          model: "gpt-4.1-mini",
          cloudConsent: true,
        });
      expect(result.status).toBe(200);
      expect(result.body.item.analysis.meta.provider).toBe("openai");
      expect(a.automatic.status(item.id)).toBeNull();
    } finally {
      await a.close();
    }
  });
  it("rejects a late result after a human changes the revision", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = deferred();
    const a = setup((async (url, init) => {
      started.resolve();
      await gate;
      return respond(String(url), init);
    }) as typeof fetch);
    try {
      const item = a.store.list()[0];
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await started.promise;
      a.store.update(item.id, item.revision, (current) => {
        current.status = "needs_information";
      });
      release();
      await a.automatic.idle();
      expect(a.store.get(item.id).analysis).toBeNull();
      expect(a.store.get(item.id).status).toBe("needs_information");
      expect(a.automatic.status(item.id)?.phase).toBe("failed");
      expect(
        a.store
          .history(item.id)
          .find((event) => event.event === "analysis_failed")?.details,
      ).toMatchObject({ automatic: true, code: "revision_conflict" });
    } finally {
      release();
      await a.close();
    }
  });
  it("cancels automatic requests and prevents duplicate in-flight jobs", async () => {
    const started = deferred();
    const fetcher = vi.fn(async (_url, init) => {
      started.resolve();
      return new Promise<Response>((_resolve, reject) =>
        init!.signal!.addEventListener(
          "abort",
          () => reject(new Error("cancelled")),
          { once: true },
        ),
      );
    });
    const a = setup(fetcher as typeof fetch);
    try {
      const item = a.store.list()[0];
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      await started.promise;
      await request(a.app).post(`/api/items/${item.id}/auto-analyze`).send({});
      expect(fetcher).toHaveBeenCalledTimes(1);
      await request(a.app).post(`/api/items/${item.id}/auto-cancel`).send({});
      await a.automatic.idle();
      expect(a.automatic.status(item.id)?.phase).toBe("cancelled");
      expect(a.store.get(item.id).analysis).toBeNull();
    } finally {
      await a.close();
    }
  });
});
