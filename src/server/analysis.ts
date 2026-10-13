import { randomUUID } from "node:crypto";
import {
  AnalysisOutputSchema,
  AppError,
  type Analysis,
  type CustomerConfig,
  type WorkItem,
  type Provider,
} from "../shared/types.js";
import { generate, type GenerationContext } from "./providers.js";
import { priorityPolicy, resolveProgram, route } from "./routing.js";
import { type Settings, requireConfigured } from "./config.js";
export function validateEvidence(output: unknown, item: WorkItem) {
  const parsed = AnalysisOutputSchema.safeParse(output);
  if (!parsed.success)
    throw new AppError(
      "invalid_output",
      "AI output failed the classification schema. Review manually or retry.",
      422,
    );
  for (const e of parsed.data.evidence) {
    const m = item.messages.find((m) => m.messageId === e.messageId);
    if (!m || !m.body.includes(e.quote))
      throw new AppError(
        "bad_evidence",
        "AI cited missing or altered evidence. Output was rejected.",
        422,
      );
  }
  return parsed.data;
}
export async function analyze(
  item: WorkItem,
  options: {
    provider: Provider;
    model: string;
    cloudConsent?: boolean;
  },
  settings: Settings,
  customer: CustomerConfig,
  signal: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<Analysis> {
  requireConfigured(
    settings,
    options.provider,
    options.model,
    options.cloudConsent,
  );
  if (
    item.messages.reduce((n, m) => n + m.body.length + m.subject.length, 0) >
    30000
  )
    throw new AppError(
      "context_limit",
      "Conversation exceeds the 30,000 character model limit. Use manual triage.",
      400,
    );
  const started = performance.now(),
    deadline = AbortSignal.any([
      signal,
      AbortSignal.timeout(settings.timeoutMs),
    ]);
  const context: GenerationContext = {
    ...options,
    messages: item.messages,
    settings,
    signal: deadline,
    fetchImpl,
  };
  let result,
    attempts = 0;
  while (true) {
    attempts++;
    try {
      result = await generate(context);
      break;
    } catch (e) {
      if (
        !(e instanceof AppError) ||
        e.code !== "malformed_output" ||
        attempts >= 2 ||
        deadline.aborted
      )
        throw e;
    }
  }
  const output = validateEvidence(result.output, item),
    resolution = resolveProgram(item.messages, customer),
    routing = route(output.category, resolution.program, customer);
  const price = settings.prices[`${options.provider}:${options.model}`];
  const costUsd =
    attempts === 1 &&
    price &&
    result.inputTokens !== null &&
    result.outputTokens !== null
      ? (result.inputTokens * price.input +
          result.outputTokens * price.output) /
        1e6
      : null;
  return {
    output,
    resolution,
    routing,
    policy: priorityPolicy(output, resolution),
    meta: {
      requestId: randomUUID(),
      provider: options.provider,
      model: options.model,
      durationMs: Math.round(performance.now() - started),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      attempts,
    },
    at: new Date().toISOString(),
  };
}
