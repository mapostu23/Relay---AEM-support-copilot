import {
  label,
  type Audit,
  type ActivityEntry,
} from "../../../shared/types.js";
const titles: Record<string, string> = {
  duplicate_received: "Duplicate email received",
  email_ingested: "Email received",
  reply_received: "New reply received",
  analysis_started: "Analysis started",
  analysis_completed: "Analysis completed",
  analysis_failed: "Analysis failed",
  analysis_cancelled: "Analysis cancelled",
  human_review_saved: "Human review saved",
  draft_edited: "Handover draft updated",
  draft_approved: "Handover draft approved",
  marked_triaged: "Ticket marked as triaged",
};
const fieldLabels: Record<string, string> = {
  automatic: "Trigger",
  requestId: "Request ID",
  analysisId: "Analysis ID",
  durationMs: "Duration",
  routingStatus: "Routing result",
  ruleId: "Routing rule",
  teamId: "Assigned team",
  messageId: "Message ID",
  code: "Error code",
  outboundSent: "Email sent",
  approvalInvalidated: "Approval invalidated",
  reviewInvalidated: "Review invalidated",
  previousAnalysisRetained: "Previous analysis retained",
  overridden: "AI suggestion changed",
};
export function severity(event: string) {
  return event.includes("failed")
    ? "error"
    : event.includes("cancelled")
      ? "warning"
      : "info";
}
function summary(a: Audit) {
  const automatic =
    a.details.automatic === true ? "Automatic Ollama" : "Requested model";
  switch (a.event) {
    case "duplicate_received":
      return "An email with the same provider and message ID was received again. The original ticket was preserved; no additional analysis ran.";
    case "email_ingested":
      return "A new conversation was added to the inbox.";
    case "reply_received":
      return "The conversation changed. Review and draft must be checked again.";
    case "analysis_started":
      return `${automatic} analysis began. Saved work remains available.`;
    case "analysis_completed":
      return "Suggestions are ready for human review.";
    case "analysis_failed":
      return "No result was saved. Check the error code and request ID below; retry or choose another provider.";
    case "analysis_cancelled":
      return "The model request stopped. Previously saved work was preserved.";
    case "human_review_saved":
      return "The coordinator confirmed classification and routing.";
    case "draft_edited":
      return "The handover changed and needs approval again.";
    case "draft_approved":
      return "The draft is approved for local copy or export. No email was sent.";
    case "marked_triaged":
      return "The coordinator completed triage. No email was sent.";
    default:
      return "A ticket activity was recorded.";
  }
}
function value(key: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v === null) return "—";
  if (key === "durationMs" && typeof v === "number")
    return `${(v / 1000).toFixed(2)} s`;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
export function ActivityFeed({
  entries,
  onTicket,
}: {
  entries: (Audit | ActivityEntry)[];
  onTicket?: (id: string) => void;
}) {
  return (
    <div className="activity-feed">
      {entries.map((a) => {
        const level = severity(a.event);
        return (
          <article className={`activity-card activity-${level}`} key={a.id}>
            <div className="activity-event-header">
              <span className={`log-level log-${level}`}>{level}</span>
              <h3>{titles[a.event] || label(a.event)}</h3>
              <time dateTime={a.at} title={new Date(a.at).toISOString()}>
                {new Date(a.at).toLocaleString()}
              </time>
            </div>
            <p>{summary(a)}</p>
            {"itemId" in a && (
              <button
                className="ticket-link"
                onClick={() => onTicket?.(a.itemId)}
              >
                Open ticket {a.itemId} ↗
              </button>
            )}
            <dl className="activity-fields">
              <div>
                <dt>Event ID</dt>
                <dd>#{a.id}</dd>
              </div>
              {Object.entries(a.details).map(([key, v]) => (
                <div key={key}>
                  <dt>
                    {fieldLabels[key] || label(key.replace(/([A-Z])/g, " $1"))}
                  </dt>
                  <dd>
                    {key === "automatic"
                      ? v
                        ? "Automatic"
                        : "Manual"
                      : value(key, v)}
                  </dd>
                </div>
              ))}
            </dl>
            <details className="raw-event">
              <summary>Raw event details</summary>
              <pre>{JSON.stringify(a, null, 2)}</pre>
            </details>
          </article>
        );
      })}
      {!entries.length && (
        <p className="empty-small">No activity matches this view.</p>
      )}
    </div>
  );
}
