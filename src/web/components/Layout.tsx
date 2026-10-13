import { ProviderStatuses } from "./ProviderStatuses.js";
import {
  label,
  statuses,
  type WorkItem,
  type InboxFilter,
} from "../../shared/types.js";
export function AppHeader({
  items,
  observing,
  onObservability,
}: {
  items: WorkItem[];
  observing: boolean;
  onObservability: () => void;
}) {
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Relay home">
          <span className="brand-mark">r↗</span>
          <span>
            relay<small>AEM SUPPORT COPILOT</small>
          </span>
        </a>
        <div className="top-meta">
          <button
            className={`observability-nav ${observing ? "active" : ""}`}
            aria-pressed={observing}
            onClick={onObservability}
          >
            Logs
          </button>
          <span className="divider" />
          <ProviderStatuses />
          <span className="divider" />
          <span className="mailbox-status">
            <span className="mailbox-status-dot" aria-hidden="true" />
            Mailbox
          </span>
        </div>
      </header>
      <section className="intro">
        <div>
          <span className="eyebrow">
            FROM INCOMING EMAIL TO THE RIGHT OWNER
          </span>
          <h1>A clearer handover starts here.</h1>
          <p>
            Understand the request. Confirm the route. Keep a human in control.
          </p>
        </div>
        <div className="intro-count">
          <strong>
            {items
              .filter((i) => i.unread)
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <span>UNREAD EMAIL ITEMS</span>
        </div>
      </section>
    </>
  );
}
export function StatusFilters({
  items,
  filter,
  duplicateCount,
  onChange: setFilter,
}: {
  items: WorkItem[];
  filter: InboxFilter;
  duplicateCount: number;
  onChange: (s: InboxFilter) => void;
}) {
  const counts = [
    "new",
    "duplicates",
    ...statuses.filter((s) => s !== "new"),
  ].map((status) => ({
    status: status as Exclude<InboxFilter, "all">,
    count:
      status === "duplicates"
        ? duplicateCount
        : items.filter((i) => i.status === status).length,
  }));
  return (
    <div className="status-strip">
      <button
        className={filter === "all" ? "active" : ""}
        onClick={() => setFilter("all")}
      >
        All mail <b>{items.length}</b>
      </button>
      {counts.map((c) => (
        <button
          key={c.status}
          className={filter === c.status ? "active" : ""}
          onClick={() => setFilter(c.status)}
        >
          {label(c.status)} <b>{c.count}</b>
        </button>
      ))}
    </div>
  );
}
export function AppFooter() {
  return (
    <footer className="page-footer">
      <span>Relay / AEM Support Triage & Routing Copilot</span>
      <span>
        Local prototype · Suggestions require review · No production connections
      </span>
    </footer>
  );
}
