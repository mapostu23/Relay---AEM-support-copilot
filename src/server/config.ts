import {
  AppError,
  type Config,
  type Provider,
  type ProviderConfig,
} from "../shared/types.js";
export interface Settings {
  port: number;
  timeoutMs: number;
  ollamaHost: string;
  providers: ProviderConfig[];
  keys: { openai: string; anthropic: string };
  prices: Record<string, { input: number; output: number }>;
}
const models = (value: string | undefined, fallback: string) => [
  ...new Set(
    (value ?? fallback)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const ollamaHost = env.OLLAMA_HOST || "http://127.0.0.1:11434";
  let url: URL;
  try {
    url = new URL(ollamaHost);
  } catch {
    throw new Error("OLLAMA_HOST must be a valid loopback HTTP URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "OLLAMA_HOST must be a loopback origin without credentials or paths.",
    );
  const timeoutMs = Number(env.MODEL_TIMEOUT_MS || 60000),
    port = Number(env.PORT || 3003);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000)
    throw new Error("MODEL_TIMEOUT_MS must be 100–300000.");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be 1–65535.");
  let prices: Settings["prices"] = {};
  try {
    const raw = JSON.parse(env.MODEL_PRICES_JSON || "{}");
    if (raw === null || Array.isArray(raw) || typeof raw !== "object")
      throw Error();
    for (const [id, p] of Object.entries(raw)) {
      const value = p as { input: unknown; output: unknown };
      if (
        typeof value?.input !== "number" ||
        typeof value.output !== "number" ||
        !Number.isFinite(value.input) ||
        !Number.isFinite(value.output) ||
        value.input < 0 ||
        value.output < 0
      )
        throw Error();
      prices[id] = { input: value.input, output: value.output };
    }
  } catch {
    throw new Error(
      "MODEL_PRICES_JSON must contain non-negative numeric input/output prices.",
    );
  }
  const keys = {
    openai: env.OPENAI_API_KEY || "",
    anthropic: env.ANTHROPIC_API_KEY || "",
  };
  const providers: ProviderConfig[] = [
    {
      id: "ollama",
      label: "Ollama",
      models: models(env.OLLAMA_MODELS, "qwen2.5:7b"),
      ready: true,
      readiness:
        "Local endpoint configured; model installation and reachability are not verified.",
      cloud: false,
    },
    {
      id: "openai",
      label: "OpenAI",
      models: models(env.OPENAI_MODELS, "gpt-4.1-mini"),
      ready: !!keys.openai,
      readiness: keys.openai
        ? "Key configured; account/model access has not been verified."
        : "OPENAI_API_KEY is missing on the server.",
      cloud: true,
    },
    {
      id: "anthropic",
      label: "Anthropic",
      models: models(env.ANTHROPIC_MODELS, "claude-sonnet-4-5-20250929"),
      ready: !!keys.anthropic,
      readiness: keys.anthropic
        ? "Key configured; account/model access has not been verified."
        : "ANTHROPIC_API_KEY is missing on the server.",
      cloud: true,
    },
  ];
  for (const p of providers) if (!p.models.length) p.ready = false;
  return { port, timeoutMs, ollamaHost: url.origin, providers, keys, prices };
}
export function publicConfig(settings: Settings): Config {
  return { defaultProvider: "ollama", providers: settings.providers };
}
export function requireConfigured(
  settings: Settings,
  provider: Provider,
  model: string,
  cloudConsent?: boolean,
) {
  const config = settings.providers.find((p) => p.id === provider);
  if (!config || !config.models.includes(model))
    throw new AppError(
      "unsupported_model",
      "Choose a model from this server’s configured provider list.",
      400,
    );
  if (!config.ready)
    throw new AppError("missing_configuration", config.readiness, 503);
  if (config.cloud && cloudConsent !== true)
    throw new AppError(
      "cloud_consent_required",
      "Confirm that the email content and conversation history can be sent to this selected cloud provider.",
      400,
    );
}
