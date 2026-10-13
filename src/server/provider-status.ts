import type { Settings } from "./config.js";
import type { ProviderStatus } from "../shared/types.js";
export async function providerStatus(
  settings: Settings,
  fetcher: typeof fetch = fetch,
): Promise<ProviderStatus[]> {
  const statuses: ProviderStatus[] = settings.providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    state: provider.ready ? "configured" : "unconfigured",
    status: provider.ready ? "Key configured" : "Not configured",
    detail: provider.ready
      ? "API key configured on the server. Account, billing and model access are not verified; no cloud health request is made."
      : provider.readiness,
  }));
  const ollama = statuses.find((p) => p.id === "ollama")!;
  const model = settings.providers.find((p) => p.id === "ollama")!.models[0];
  if (!model) {
    Object.assign(ollama, {
      state: "unconfigured",
      status: "No model",
      detail: "OLLAMA_MODELS does not contain a model.",
    });
    return statuses;
  }
  try {
    const response = await fetcher(`${settings.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("unavailable");
    const body = (await response.json()) as {
      models?: { name?: string; model?: string }[];
    };
    if (!Array.isArray(body.models)) throw new Error("invalid status response");
    const canonical = (name: string) =>
      name.includes(":") ? name : `${name}:latest`;
    const installed = body.models.some(
      (entry) =>
        canonical(entry.name || entry.model || "") === canonical(model),
    );
    Object.assign(
      ollama,
      installed
        ? {
            state: "ready",
            status: "Ready",
            detail: `Local Ollama is reachable and ${model} is installed. Inference was not tested.`,
          }
        : {
            state: "unconfigured",
            status: "Model missing",
            detail: `Ollama is reachable, but the default model ${model} is not installed. Run: ollama pull ${model}`,
          },
    );
  } catch {
    Object.assign(ollama, {
      state: "offline",
      status: "Offline",
      detail:
        "Local Ollama could not be reached or returned an invalid model list. Start Ollama and check OLLAMA_HOST.",
    });
  }
  return statuses;
}
