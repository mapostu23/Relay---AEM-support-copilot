import { type Provider } from "../../../shared/types.js";
import type { Settings, ModelSelection } from "../../types.js";
interface Props {
  settings: Settings | null;
  selection: ModelSelection;
  busy: string;
  stale: boolean;
  hasAnalysis: boolean;
  replace: boolean;
  onAnalyze: () => void;
  onCancel: () => void;
  onManualReview: () => void;
  onKeepReview: () => void;
}
export function ModelControls({
  settings,
  selection,
  busy,
  hasAnalysis,
  replace,
  onAnalyze: analyze,
  onCancel: cancel,
  onManualReview,
  onKeepReview,
}: Props) {
  const { provider, model, consent, selectProvider, setModel, setConsent } =
    selection;
  const config = settings?.providers.find((p) => p.id === provider);
  return (
    <div className="model-controls">
      <div className="model-row">
        <label>
          Model provider
          <select
            value={provider}
            onChange={(e) => selectProvider(e.target.value as Provider)}
            disabled={!!busy}
          >
            {settings?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Configured model
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!!busy}
          >
            {config?.models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="provider-note">{config?.readiness}</p>
      {config?.cloud && (
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I approve sending sanitized subject, body, URL and conversation
          history to {config.label}.
        </label>
      )}
      <div className="actions">
        <button className="primary" onClick={analyze}>
          {busy === "analyze"
            ? "Analyzing…"
            : hasAnalysis
              ? "Analyze again ↗"
              : "Analyze with AI ↗"}
        </button>
        {busy === "analyze" ? (
          <button onClick={cancel}>Cancel analysis</button>
        ) : (
          <button
            className="text-button"
            disabled={!!busy}
            onClick={onManualReview}
          >
            Continue with manual review
          </button>
        )}
      </div>
      {replace && (
        <div className="warning confirmation">
          Successful analysis will replace the saved review and draft. Failure
          preserves them.{" "}
          <button disabled={!!busy} onClick={analyze}>
            Replace on success
          </button>
          <button onClick={onKeepReview}>Keep current review</button>
        </div>
      )}
    </div>
  );
}
