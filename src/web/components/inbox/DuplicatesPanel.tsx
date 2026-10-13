import { useState } from "react";
import type { DuplicateEmail } from "../../../shared/types.js";
export function DuplicatesPanel({
  entries,
  onBack,
  onTicket,
}: {
  entries: DuplicateEmail[];
  onBack: () => void;
  onTicket: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = entries.filter((entry) =>
    `${entry.subject} ${entry.sender} ${entry.itemId} ${entry.messageId}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="observability-panel" aria-label="Duplicate emails">
      <div className="observability-heading">
        <div>
          <span className="eyebrow">INBOX / DUPLICATES</span>
          <h2>Duplicate emails</h2>
          <p>
            Repeated deliveries are grouped here. The original ticket and its
            saved work are preserved.
          </p>
        </div>
        <button onClick={onBack}>Back to inbox</button>
      </div>
      <div className="log-toolbar">
        <label>
          Search duplicate emails
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Subject, sender, ticket or message ID…"
          />
        </label>
      </div>
      <p className="log-caption">
        {entries.length} duplicate email{entries.length === 1 ? "" : "s"} ·{" "}
        {entries.reduce((sum, entry) => sum + entry.count, 0)} repeated
        deliveries · newest detection first
      </p>
      <div className="activity-feed">
        {visible.map((entry) => (
          <article
            className="activity-card"
            key={`${entry.provider}:${entry.messageId}`}
          >
            <div className="activity-event-header">
              <span className="log-level log-warning">Duplicate</span>
              <h3>{entry.subject}</h3>
              <time dateTime={entry.lastDetectedAt}>
                {new Date(entry.lastDetectedAt).toLocaleString()}
              </time>
            </div>
            <p>
              From {entry.sender} · Original ticket {entry.itemId}
            </p>
            <dl className="activity-fields">
              <div>
                <dt>Repeated deliveries</dt>
                <dd>{entry.count}</dd>
              </div>
              <div>
                <dt>Message ID</dt>
                <dd>{entry.messageId}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{entry.provider}</dd>
              </div>
              <div>
                <dt>First detected</dt>
                <dd>{new Date(entry.firstDetectedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <button onClick={() => onTicket(entry.itemId)}>
              Open original ticket ↗
            </button>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="empty-small">
          {entries.length
            ? "No duplicate emails match your search."
            : "No duplicate emails received yet. To demonstrate this, return to the inbox, choose Replay duplicate messages and click Refresh mailbox."}
        </p>
      )}
      <p className="log-caption">
        Duplicates match the same source and message ID. Similar subjects or
        bodies are not treated as duplicates. Duplicate receipts do not create
        tickets or trigger AI analysis.
      </p>
    </section>
  );
}
