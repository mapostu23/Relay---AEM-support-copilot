import { useState } from "react";
import type { Provider } from "../../shared/types.js";
import type { Settings, ModelSelection } from "../types.js";
export function useModelSelection(settings: Settings | null): ModelSelection {
  const [provider, setProvider] = useState<Provider>("ollama");
  const [model, setModel] = useState("");
  const [consent, setConsent] = useState(false);
  const selectProvider = (provider: Provider) => {
    const configured = settings?.providers.find((p) => p.id === provider);
    if (!configured) return;
    setProvider(provider);
    setModel(configured.models[0] || "");
    setConsent(false);
  };
  return {
    provider,
    model:
      model ||
      settings?.providers.find((p) => p.id === provider)?.models[0] ||
      "",
    consent,
    selectProvider,
    setModel,
    setConsent,
  };
}
