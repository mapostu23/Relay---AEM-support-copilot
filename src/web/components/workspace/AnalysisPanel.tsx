import {
  label,
  type WorkItem,
  type CustomerConfig,
} from "../../../shared/types.js";
export function AnalysisPanel({
  item,
  customer,
}: {
  item: WorkItem;
  customer: CustomerConfig;
}) {
  const a = item.analysis!;
  return (
    <div className="analysis">
      <div className="section-heading">
        <span className="eyebrow">02 / RECOMMENDATION</span>
        <h3>{a.output.summary}</h3>
        <p>
          Interpretation, not a confirmed diagnosis. Evidence links are checked
          for exact quotation, not semantic correctness.
        </p>
      </div>
      <div className="analysis-grid">
        <div>
          <span>Workflow type</span>
          <strong>{label(a.output.ticketType)}</strong>
        </div>
        <div>
          <span>Suspected category</span>
          <strong>{label(a.output.category)}</strong>
        </div>
        <div>
          <span>Suggested priority / severity</span>
          <strong>
            {label(a.policy.priority)} / {label(a.policy.severity)}
          </strong>
        </div>
        <div>
          <span>Domain-resolved program</span>
          <strong>
            {a.resolution.program
              ? label(a.resolution.program)
              : "Confirm manually"}
          </strong>
        </div>
      </div>
      <div
        className={`routing-panel ${a.routing.status === "manual" ? "warning" : ""}`}
      >
        <span className="eyebrow">CONFIGURATION-CONTROLLED ROUTING</span>
        <h3>
          {customer.teams.find((t) => t.id === a.routing.teamId)?.name ||
            "Owner needs confirmation"}
        </h3>
        <p>{a.routing.reason}</p>
        <small>
          Rule: {a.routing.ruleId || "No unique rule"} · Program:{" "}
          {a.resolution.status} · {a.resolution.affiliate}
        </small>
        {a.routing.candidates.length > 0 && (
          <p>
            Configured candidates:{" "}
            {a.routing.candidates
              .map((id) => customer.teams.find((t) => t.id === id)?.name || id)
              .join(", ")}
          </p>
        )}
      </div>
      <p className="muted">
        {a.resolution.reason} AI suggested program: {a.output.programSuggestion}
        . Registry values take precedence.
      </p>
      <div className="analysis-section">
        <h4>Reported impact</h4>
        <p>{a.output.impact}</p>
        <p className="muted">{a.output.rationale}</p>
        {a.policy.escalation && (
          <p className="warning">Escalation flag · {a.policy.reason}</p>
        )}
      </div>
      <div className="analysis-section">
        <h4>
          Possible causes <span>HYPOTHESES</span>
        </h4>
        <ul>
          {a.output.possibleCauses.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="analysis-section">
        <h4>
          Suggested investigation <span>NOT EXECUTED</span>
        </h4>
        <ol>
          {a.output.actions.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      </div>
      <div className="analysis-section questions">
        <h4>Questions before handover</h4>
        <ul>
          {a.output.missingInformation.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="analysis-section">
        <h4>Source evidence</h4>
        {a.output.evidence.map((e, i) => (
          <blockquote key={i}>
            <p>{e.quote}</p>
            <cite>{e.messageId}</cite>
          </blockquote>
        ))}
      </div>
      <div className="model-meta">
        <strong>{`${a.meta.provider} / ${a.meta.model}`}</strong>
        <span>
          {a.meta.durationMs} ms · {a.meta.attempts} attempt(s) ·{" "}
          {a.meta.inputTokens ?? "Unknown"} input /{" "}
          {a.meta.outputTokens ?? "Unknown"} output tokens ·{" "}
          {a.meta.costUsd === null
            ? "Cost unknown"
            : `$${a.meta.costUsd.toFixed(6)} estimated`}
        </span>
        <small>Reference {a.meta.requestId}</small>
      </div>
    </div>
  );
}
