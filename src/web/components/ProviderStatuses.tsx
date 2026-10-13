import { useEffect, useState } from "react";
import type { ProviderStatus } from "../../shared/types.js";
import { api } from "../lib/api.js";
const initial: ProviderStatus[] = [
  {
    id: "ollama",
    label: "Ollama",
    state: "unknown",
    status: "Checking",
    detail: "Checking the local service and default model.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    state: "unknown",
    status: "Checking",
    detail: "Checking server configuration.",
  },
  {
    id: "openai",
    label: "OpenAI",
    state: "unknown",
    status: "Checking",
    detail: "Checking server configuration.",
  },
];
export function ProviderStatuses() {
  const [providers, setProviders] = useState(initial);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api<{ providers: ProviderStatus[] }>(
          "/api/providers/status",
          "GET",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setProviders(
            initial.map(
              (p) =>
                result.providers.find((value) => value.id === p.id) || {
                  ...p,
                  status: "Unknown",
                },
            ),
          );
      } catch {
        if (!controller.signal.aborted)
          setProviders(
            initial.map((p) => ({
              ...p,
              status: "Unknown",
              detail:
                "Provider status could not be fetched. Check the backend and restart it after updates.",
            })),
          );
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="provider-statuses" aria-label="Model provider status">
      {providers.map((p) => (
        <span
          className={`provider-status provider-${p.state}`}
          key={p.id}
          title={`${p.status}. ${p.detail}`}
          tabIndex={0}
          aria-label={`${p.label}: ${p.status}. ${p.detail}`}
        >
          <span className="provider-status-dot" aria-hidden="true" />
          <span>{p.label}</span>
          <span className="provider-status-tooltip" role="tooltip">
            <strong>{p.status}</strong>
            <br />
            {p.detail}
          </span>
        </span>
      ))}
    </div>
  );
}
