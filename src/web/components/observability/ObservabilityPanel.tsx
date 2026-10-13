import { useEffect, useState } from "react";
import type { ActivityEntry } from "../../../shared/types.js";
import { api } from "../../lib/api.js";
import { ActivityFeed } from "./ActivityFeed.js";
interface ActivityPage {
  entries: ActivityEntry[];
  nextBefore: number | null;
}
export function ObservabilityPanel({
  onClose,
  onTicket,
}: {
  onClose: () => void;
  onTicket: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [pages, setPages] = useState<(number | undefined)[]>([undefined]);
  const [data, setData] = useState<ActivityPage>({
    entries: [],
    nextBefore: null,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const before = pages.at(-1);
  useEffect(() => {
    let alive = true;
    let controller: AbortController | undefined;
    setLoading(true);
    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const params = new URLSearchParams({
          query,
          severity: level,
          limit: "50",
        });
        if (before !== undefined) params.set("before", String(before));
        const result = await api<ActivityPage>(
          `/api/activity?${params}`,
          "GET",
          undefined,
          request.signal,
        );
        if (alive && !request.signal.aborted) {
          setData(result);
          setError("");
          setLoading(false);
        }
      } catch (e) {
        if (alive && !request.signal.aborted) {
          setError(String(e));
          setLoading(false);
        }
      }
    };
    const debounce = setTimeout(() => void load(), 250);
    const timer =
      before === undefined ? setInterval(() => void load(), 5000) : undefined;
    return () => {
      alive = false;
      controller?.abort();
      clearTimeout(debounce);
      clearInterval(timer);
    };
  }, [query, level, before, refresh]);
  return (
    <section
      className="observability-panel"
      aria-label="Centralized activity logs"
    >
      <div className="observability-heading">
        <div>
          <span className="eyebrow">LOGS / ALL TICKETS</span>
          <h2>Activity log</h2>
          <p>
            Trace email receipt, model requests and human decisions across the
            inbox.
          </p>
        </div>
        <div className="log-page-actions">
          <a className="button" href="/api/activity/export" download>
            Download all logs
          </a>
          <button onClick={onClose}>Back to inbox</button>
        </div>
      </div>
      <div className="log-toolbar">
        <label>
          Search logs
          <input
            maxLength={200}
            value={query}
            placeholder="Ticket ID, request ID, model or event…"
            onChange={(e) => {
              setQuery(e.target.value);
              setPages([undefined]);
            }}
          />
        </label>
        <label>
          Severity
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPages([undefined]);
            }}
          >
            <option value="all">All events</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Information</option>
          </select>
        </label>
        <button onClick={() => setRefresh((n) => n + 1)}>Refresh logs</button>
      </div>
      <div className="log-caption">
        <span>
          {before === undefined
            ? "Latest events · refreshes every 5 seconds"
            : "Earlier events · automatic refresh paused"}
        </span>
        <span>Newest first · local time · saved in SQLite</span>
      </div>
      {error && (
        <p className="log-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading activity…</p>
      ) : (
        <ActivityFeed entries={data.entries} onTicket={onTicket} />
      )}
      <div className="log-pagination">
        <button
          disabled={loading || pages.length === 1}
          onClick={() => setPages((p) => p.slice(0, -1))}
        >
          Newer events
        </button>
        <span>Page {pages.length}</span>
        <button
          disabled={loading || data.nextBefore === null}
          onClick={() => setPages((p) => [...p, data.nextBefore!])}
        >
          Older events
        </button>
      </div>
      <p className="log-caption">
        Ticket events persist across restarts. HTTP/server logs remain in the
        terminal. Email bodies, API keys and reviewer notes are excluded.
      </p>
    </section>
  );
}
