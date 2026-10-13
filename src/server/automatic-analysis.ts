import { randomUUID } from "node:crypto";
import { analyze } from "./analysis.js";
import { Store } from "./store.js";
import type { Settings } from "./config.js";
import {
  AppError,
  hasCurrentAnalysis,
  type CustomerConfig,
  type Metrics,
  type WorkItem,
} from "../shared/types.js";
export interface AutomaticStatus {
  phase: "queued" | "running" | "completed" | "failed" | "cancelled";
  message: string;
}
// A single-process queue. Revisions protect saved human work and late model results.
export class AutomaticAnalysis {
  private jobs = new Map<
    string,
    { key: string; status: AutomaticStatus; controller: AbortController }
  >();
  private queue: string[] = [];
  private running = false;
  private stopped = false;
  constructor(
    private store: Store,
    private settings: Settings,
    private customer: CustomerConfig,
    private active: Set<string>,
    private metrics: Metrics,
    private logger: (event: Record<string, unknown>) => void,
    private fetchImpl?: typeof fetch,
  ) {}
  status(id: string) {
    return this.jobs.get(id)?.status || null;
  }
  forget(id: string) {
    this.cancel(id);
    this.jobs.delete(id);
    this.queue = this.queue.filter((queued) => queued !== id);
  }
  private key(item: WorkItem) {
    return item.messages.map((m) => m.messageId).join("\n");
  }
  private eligible(item: WorkItem) {
    return !item.review && !item.draft && !hasCurrentAnalysis(item);
  }
  enqueue(id: string, retry = false) {
    if (this.stopped) return;
    const item = this.store.get(id),
      previous = this.jobs.get(id),
      key = this.key(item);
    if (!this.eligible(item)) return;
    if (
      previous?.key === key &&
      (!retry || ["queued", "running"].includes(previous.status.phase))
    )
      return;
    previous?.controller.abort();
    this.jobs.set(id, {
      key,
      status: { phase: "queued", message: "Ollama analysis queued." },
      controller: new AbortController(),
    });
    if (!this.queue.includes(id)) this.queue.push(id);
    // Ingestion responds immediately; inference runs outside the mailbox request.
    setImmediate(() => void this.pump());
  }
  cancel(id: string) {
    const job = this.jobs.get(id);
    if (job && ["queued", "running"].includes(job.status.phase)) {
      job.controller.abort();
      job.status = {
        phase: "cancelled",
        message: "Automatic analysis cancelled. Saved work is preserved.",
      };
    }
  }
  stop() {
    this.stopped = true;
    this.queue = [];
    for (const id of this.jobs.keys()) this.cancel(id);
  }
  async idle() {
    while (this.running || this.queue.length)
      await new Promise((resolve) => setTimeout(resolve, 5));
  }
  async pump() {
    if (this.running || this.stopped || this.active.size >= 2) return;
    const index = this.queue.findIndex((id) => !this.active.has(id));
    if (index === -1) return;
    const [id] = this.queue.splice(index, 1),
      job = this.jobs.get(id)!;
    if (job.controller.signal.aborted) {
      void this.pump();
      return;
    }
    const item = this.store.get(id);
    if (!this.eligible(item)) {
      job.status = {
        phase: "cancelled",
        message: "Saved review or current analysis retained.",
      };
      void this.pump();
      return;
    }
    this.running = true;
    this.active.add(id);
    this.metrics.analyses++;
    const requestId = randomUUID();
    const model =
      this.settings.providers.find((p) => p.id === "ollama")?.models[0] || "";
    job.status = {
      phase: "running",
      message: "Ollama is analyzing this conversation automatically.",
    };
    const started = performance.now();
    this.store.audit(id, "analysis_started", {
      automatic: true,
      provider: "ollama",
      model,
      requestId,
    });
    this.logger({
      event: "automatic_analysis_started",
      itemId: id,
      requestId,
      provider: "ollama",
      model,
    });
    try {
      const result = await analyze(
        item,
        { provider: "ollama", model },
        this.settings,
        this.customer,
        job.controller.signal,
        this.fetchImpl,
      );
      if (job.controller.signal.aborted)
        throw new AppError("cancelled", "Automatic analysis cancelled.", 499);
      this.store.update(id, item.revision, (current) => {
        if (current.review || current.draft)
          throw new AppError(
            "revision_conflict",
            "Saved review retained.",
            409,
          );
        current.analysis = result;
        current.analysisMessageIds = item.messages.map(
          (message) => message.messageId,
        );
        this.store.audit(id, "analysis_completed", {
          automatic: true,
          provider: "ollama",
          model,
          requestId,
          analysisId: result.meta.requestId,
          durationMs: result.meta.durationMs,
          attempts: result.meta.attempts,
          routingStatus: result.routing.status,
        });
      });
      job.status = {
        phase: "completed",
        message:
          "Automatic Ollama analysis is ready. Review it or choose another provider.",
      };
      this.metrics.latencies.push(result.meta.durationMs);
      if (this.metrics.latencies.length > 100) this.metrics.latencies.shift();
      this.logger({
        event: "automatic_analysis_completed",
        itemId: id,
        ...result.meta,
        requestId,
      });
    } catch (error) {
      this.metrics.analysisFailures++;
      this.store.audit(
        id,
        job.controller.signal.aborted
          ? "analysis_cancelled"
          : "analysis_failed",
        {
          automatic: true,
          provider: "ollama",
          model,
          requestId,
          code: error instanceof AppError ? error.code : "internal",
          durationMs: Math.round(performance.now() - started),
        },
      );
      job.status = {
        phase: job.controller.signal.aborted ? "cancelled" : "failed",
        message: job.controller.signal.aborted
          ? "Automatic analysis cancelled. Saved work is preserved."
          : error instanceof AppError
            ? error.message
            : "Automatic analysis failed. Retry manually or choose another provider.",
      };
      this.logger({
        event: "automatic_analysis_failed",
        itemId: id,
        requestId,
        code: error instanceof AppError ? error.code : "internal",
      });
    } finally {
      this.active.delete(id);
      this.running = false;
      if (!this.stopped) void this.pump();
    }
  }
}
