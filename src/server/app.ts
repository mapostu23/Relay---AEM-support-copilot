import express from "express";
import { providerStatus } from "./provider-status.js";
import { AutomaticAnalysis } from "./automatic-analysis.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  AnalyzeRequestSchema,
  ReviewSchema,
  MessageSchema,
  AppError,
  type CustomerConfig,
  type Metrics,
} from "../shared/types.js";
import { Store } from "./store.js";
import { loadCustomer, validateReview } from "./routing.js";
import { loadSettings, publicConfig, type Settings } from "./config.js";
import { analyze } from "./analysis.js";
import { DemoMailbox, seedMailbox, syncMailbox } from "./mailbox.js";
import { emailTemplate } from "./email.js";
const RevisionSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
const DraftSchema = z
  .object({
    revision: z.number().int().positive(),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(12000),
  })
  .strict();
const approveSchema = z
  .object({
    revision: z.number().int().positive(),
    acknowledged: z.literal(true),
  })
  .strict();
export function createApp(
  settings: Settings = loadSettings(),
  store = new Store(process.env.DATABASE_PATH),
  customer: CustomerConfig = loadCustomer(),
  fetchImpl?: typeof fetch,
  logger: (entry: Record<string, unknown>) => void = (e) =>
    console.log(JSON.stringify(e)),
  automaticEnabled = true,
  recoverAutomaticBacklog = true,
) {
  seedMailbox(store);
  const app = express();
  app.disable("x-powered-by");
  const active = new Set<string>();
  let syncActive = false;
  const metrics: Metrics = {
    analyses: 0,
    analysisFailures: 0,
    ingested: 0,
    duplicates: 0,
    replies: 0,
    overrides: 0,
    reviews: 0,
    latencies: [],
  };
  const automatic = new AutomaticAnalysis(
    store,
    settings,
    customer,
    active,
    metrics,
    logger,
    fetchImpl,
  );
  let statusCheck: ReturnType<typeof providerStatus> | undefined;
  let statusCheckedAt = 0;
  app.locals.automatic = automatic;
  app.locals.store = store;
  // Seeded mail and interrupted work must not depend on a browser opening an item.
  if (automaticEnabled && recoverAutomaticBacklog)
    for (const item of store.list()) automatic.enqueue(item.id);
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const host = req.headers.host?.split(":")[0];
    if (host && !["localhost", "127.0.0.1"].includes(host))
      return next(
        new AppError("host_rejected", "Only loopback hosts are accepted.", 403),
      );
    const origin = req.headers.origin;
    if (
      origin &&
      !new RegExp(
        `^http:\\/\\/(localhost|127\\.0\\.0\\.1):${settings.port}$`,
      ).test(origin)
    )
      return next(
        new AppError(
          "origin_rejected",
          "This local service accepts same-origin requests only.",
          403,
        ),
      );
    if (req.method !== "GET" && !req.is("application/json"))
      return next(new AppError("content_type", "Use application/json.", 415));
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  const id = (req: express.Request) => String(req.params.id);
  app.get("/api/providers/status", async (_req, res) => {
    if (!statusCheck || Date.now() - statusCheckedAt >= 15000) {
      statusCheckedAt = Date.now();
      statusCheck = providerStatus(settings, fetchImpl);
    }
    res.json({
      providers: await statusCheck,
      checkedAt: new Date(statusCheckedAt).toISOString(),
    });
  });
  app.get("/api/config", (_req, res) =>
    res.json({ ...publicConfig(settings), customer }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      mailbox: "simulated",
      activeAnalyses: active.size,
      inference: "Configuration only; no live model call.",
    }),
  );
  app.get("/api/items", (_req, res) =>
    res.json({
      items: store.list(),
      duplicates: store.duplicates(),
      mailbox: {
        mode: "simulated",
        cursor: Number(store.state("cursor")),
        totalDemoMessages: 15,
        lastSync: store.state("last_sync"),
        error: store.state("sync_error"),
      },
    }),
  );
  app.get("/api/activity/export", (_req, res) => {
    res.attachment(
      `relay-activity-${new Date().toISOString().slice(0, 10)}.json`,
    );
    res.type("application/json").send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          scope:
            "All persisted ticket activity; newest first. Terminal logs are not included.",
          entries: store.exportActivity(),
        },
        null,
        2,
      ),
    );
  });
  app.get("/api/activity", (req, res) => {
    const options = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z.coerce.number().int().positive().optional(),
        query: z.string().trim().max(200).default(""),
        severity: z.enum(["all", "info", "warning", "error"]).default("all"),
      })
      .strict()
      .parse(req.query);
    res.json(store.activity(options));
  });
  app.get("/api/items/:id", (req, res) =>
    res.json({
      item: store.get(id(req)),
      audit: store.history(id(req)),
      automaticAnalysis: automatic.status(id(req)),
    }),
  );
  app.post("/api/items/:id/auto-analyze", (req, res) => {
    z.object({}).strict().parse(req.body);
    store.get(id(req));
    if (automaticEnabled) automatic.enqueue(id(req), true);
    res.json({ automaticAnalysis: automatic.status(id(req)) });
  });
  app.post("/api/items/:id/auto-cancel", (req, res) => {
    z.object({}).strict().parse(req.body);
    store.get(id(req));
    automatic.cancel(id(req));
    res.json({ automaticAnalysis: automatic.status(id(req)) });
  });
  app.post("/api/items/:id/read", (req, res) => {
    const item = store.get(id(req));
    item.unread = false;
    store.save(item);
    res.json({ item });
  });
  app.post("/api/mailbox/sync", async (req, res) => {
    const { scenario } = z
      .object({
        scenario: z
          .enum(["normal", "unavailable", "duplicate", "reply"])
          .default("normal"),
      })
      .strict()
      .parse(req.body);
    if (syncActive)
      throw new AppError("sync_busy", "Mailbox sync is already running.", 429);
    syncActive = true;
    try {
      const result = await syncMailbox(store, new DemoMailbox(scenario));
      store.setState("last_sync", new Date().toISOString());
      store.setState("sync_error", "");
      metrics.ingested += result.created;
      metrics.duplicates += result.duplicates;
      metrics.replies += result.replies;
      logger({
        event: "mailbox_synced",
        requestId: res.locals.requestId,
        ...result,
        ids: undefined,
      });
      if (automaticEnabled)
        for (const itemId of result.ids) automatic.enqueue(itemId);
      res.json(result);
    } catch (e) {
      store.setState(
        "sync_error",
        e instanceof AppError
          ? e.message
          : "Mailbox processing failed. Retry safely.",
      );
      throw e;
    } finally {
      syncActive = false;
    }
  });
  app.post("/api/mailbox/manual", (req, res) => {
    const message = MessageSchema.parse(req.body);
    if (message.provider !== "manual")
      throw new AppError(
        "invalid_input",
        "Manual messages must use the manual provider namespace.",
        400,
      );
    const result = store.ingest([message]);
    logger({
      event: "manual_ingestion",
      requestId: res.locals.requestId,
      created: result.created,
      replies: result.replies,
      duplicates: result.duplicates,
    });
    if (automaticEnabled)
      for (const itemId of result.ids) automatic.enqueue(itemId);
    res.status(result.created ? 201 : 200).json(result);
  });
  app.post("/api/items/:id/analyze", async (req, res) => {
    const options = AnalyzeRequestSchema.parse(req.body),
      item = store.get(id(req));
    if (item.revision !== options.revision)
      throw new AppError(
        "revision_conflict",
        "Reload the latest conversation before analyzing.",
        409,
      );
    if (active.size >= 2 || active.has(item.id))
      throw new AppError(
        "busy",
        "At most two model analyses can run, one per item. Retry shortly.",
        429,
      );
    automatic.forget(item.id);
    active.add(item.id);
    metrics.analyses++;
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", cancel);
    const started = performance.now();
    store.audit(item.id, "analysis_started", {
      automatic: false,
      provider: options.provider,
      model: options.model,
      requestId: res.locals.requestId,
    });
    logger({
      event: "analysis_started",
      requestId: res.locals.requestId,
      itemId: item.id,
      provider: options.provider,
      model: options.model,
    });
    try {
      const result = await analyze(
        item,
        options,
        settings,
        customer,
        controller.signal,
        fetchImpl,
      );
      if (controller.signal.aborted)
        throw new AppError("cancelled", "Analysis cancelled.", 499);
      const updated = store.update(item.id, options.revision, (current) => {
        current.analysis = result;
        current.analysisMessageIds = item.messages.map(
          (message) => message.messageId,
        );
        current.review = null;
        current.draft = null;
        current.status = "in_review";
        store.audit(item.id, "analysis_completed", {
          automatic: false,
          durationMs: result.meta.durationMs,
          provider: options.provider,
          model: options.model,
          routingStatus: result.routing.status,
          ruleId: result.routing.ruleId,
          attempts: result.meta.attempts,
          requestId: res.locals.requestId,
          analysisId: result.meta.requestId,
        });
      });
      metrics.latencies.push(result.meta.durationMs);
      if (metrics.latencies.length > 100) metrics.latencies.shift();
      logger({
        event: "analysis_completed",
        ...result.meta,
        analysisId: result.meta.requestId,
        requestId: res.locals.requestId,
        itemId: item.id,
        category: result.output.category,
        routingStatus: result.routing.status,
      });
      res.json({ item: updated, audit: store.history(item.id) });
    } catch (e) {
      metrics.analysisFailures++;
      store.audit(
        item.id,
        controller.signal.aborted ? "analysis_cancelled" : "analysis_failed",
        {
          automatic: false,
          provider: options.provider,
          model: options.model,
          requestId: res.locals.requestId,
          code: e instanceof AppError ? e.code : "internal",
          durationMs: Math.round(performance.now() - started),
        },
      );
      logger({
        event: "analysis_failed",
        requestId: res.locals.requestId,
        itemId: item.id,
        code: e instanceof AppError ? e.code : "internal",
        durationMs: Math.round(performance.now() - started),
      });
      throw e;
    } finally {
      active.delete(item.id);
      void automatic.pump();
      res.off("close", cancel);
    }
  });
  app.patch("/api/items/:id/review", (req, res) => {
    const { revision, review } = z
      .object({ revision: z.number().int().positive(), review: ReviewSchema })
      .strict()
      .parse(req.body);
    validateReview(review, customer);
    const item = store.update(id(req), revision, (current) => {
      const a = current.analysis;
      const overridden =
        !!a &&
        (review.ticketType !== a.output.ticketType ||
          review.category !== a.output.category ||
          review.program !== (a.resolution.program || "unknown") ||
          review.teamId !== (a.routing.teamId || "") ||
          review.priority !== a.policy.priority ||
          review.severity !== a.policy.severity);
      current.review = review;
      current.draft = emailTemplate(current, review, customer);
      current.status =
        review.disposition === "needs_information"
          ? "needs_information"
          : "ready_for_handover";
      store.audit(current.id, "human_review_saved", {
        overridden,
        manual: !a,
        program: review.program,
        teamId: review.teamId,
        priority: review.priority,
        disposition: review.disposition,
      });
    });
    metrics.reviews++;
    const latest = store.history(item.id)[0];
    if (latest.details.overridden) metrics.overrides++;
    res.json({ item, audit: store.history(item.id) });
  });
  app.patch("/api/items/:id/draft", (req, res) => {
    const input = DraftSchema.parse(req.body),
      item = store.update(id(req), input.revision, (current) => {
        if (!current.review || !current.draft)
          throw new AppError(
            "review_required",
            "Save human review before editing a draft.",
            400,
          );
        current.draft = {
          ...current.draft,
          subject: input.subject,
          body: input.body,
          approved: false,
          updatedAt: new Date().toISOString(),
        };
        current.status =
          current.review.disposition === "needs_information"
            ? "needs_information"
            : "ready_for_handover";
        store.audit(current.id, "draft_edited", { approvalInvalidated: true });
      });
    res.json({ item, audit: store.history(item.id) });
  });
  app.post("/api/items/:id/draft/approve", (req, res) => {
    const input = approveSchema.parse(req.body),
      item = store.update(id(req), input.revision, (current) => {
        if (!current.review || !current.draft)
          throw new AppError(
            "review_required",
            "Save human review first.",
            400,
          );
        validateReview(current.review, customer);
        const expected =
          current.review.disposition === "needs_information"
            ? current.sender
            : customer.teams.find((t) => t.id === current.review!.teamId)!
                .email;
        if (current.draft.to !== expected)
          throw new AppError(
            "recipient_invalid",
            "Draft recipient does not match the configured routing.",
            400,
          );
        current.draft.approved = true;
        current.status = "triaged";
        store.audit(current.id, "draft_approved", { outboundSent: false });
        store.audit(current.id, "marked_triaged", {
          outboundSent: false,
          automatic: true,
        });
      });
    res.json({ item, audit: store.history(item.id) });
  });
  app.post("/api/items/:id/triaged", (req, res) => {
    const input = RevisionSchema.parse(req.body),
      item = store.update(id(req), input.revision, (current) => {
        if (!current.draft?.approved || !current.review)
          throw new AppError(
            "approval_required",
            "Approve the reviewed draft before marking triaged.",
            400,
          );
        if (current.review.disposition === "needs_information")
          throw new AppError(
            "awaiting_information",
            "Clarification drafts stay in Needs information until a reply is reviewed.",
            400,
          );
        current.status = "triaged";
        store.audit(current.id, "marked_triaged", { outboundSent: false });
      });
    res.json({ item, audit: store.history(item.id) });
  });
  app.get("/api/items/:id/export", (req, res) => {
    const item = store.get(id(req));
    if (!item.draft?.approved)
      throw new AppError(
        "approval_required",
        "Approve the current draft before exporting.",
        400,
      );
    const content = `To: ${item.draft.to}\nSubject: ${item.draft.subject}\n\n${item.draft.body}`;
    res.attachment(`${item.id}-handover.txt`).type("text/plain").send(content);
  });
  app.get("/api/metrics", (_req, res) => {
    const ordered = [...metrics.latencies].sort((a, b) => a - b),
      percentile = (n: number) =>
        ordered.length
          ? ordered[
              Math.min(ordered.length - 1, Math.ceil(ordered.length * n) - 1)
            ]
          : null;
    res.json({
      ...metrics,
      latencies: undefined,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      sampleSize: ordered.length,
      scope:
        "Since server start; latest 100 successful analyses. SQLite audit persists separately.",
    });
  });
  app.use("/api", (_req, _res, next) =>
    next(new AppError("not_found", "API route not found.", 404)),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const syntax = err instanceof SyntaxError,
        zod = err instanceof z.ZodError,
        large =
          typeof err === "object" &&
          err !== null &&
          "type" in err &&
          err.type === "entity.too.large";
      const safe =
        err instanceof AppError
          ? err
          : new AppError(
              large
                ? "input_too_large"
                : syntax || zod
                  ? "invalid_input"
                  : "internal",
              large
                ? "Request exceeds 64 KB."
                : syntax || zod
                  ? "Request has missing or invalid fields."
                  : "Unexpected server error. Your stored email remains available.",
              large ? 413 : syntax || zod ? 400 : 500,
            );
      logger({
        event: "request_failed",
        requestId: res.locals.requestId,
        code: safe.code,
      });
      if (!res.headersSent && !res.destroyed)
        res.status(safe.status).json({
          error: {
            code: safe.code,
            message: safe.message,
            requestId: res.locals.requestId,
          },
        });
    },
  );
  return app;
}
