import { label, type WorkItem } from "../../../shared/types.js";
import { AnalysisBadge } from "../AnalysisBadge.js";
export function InboxList({
  visible,
  itemId,
  busy,
  onSelect,
}: {
  visible: WorkItem[];
  itemId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mail-list" aria-label="Support work items">
      {visible.map((i) => (
        <button
          className={`mail-item ${itemId === i.id ? "selected" : ""}`}
          key={i.id}
          disabled={!!busy}
          onClick={() => onSelect(i.id)}
        >
          <div>
            <span className={i.unread ? "unread-dot" : "read-dot"} />
            <span className="mail-sender">{i.sender}</span>
            <time>
              {new Date(i.receivedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          <h3>{i.subject}</h3>
          <p>{i.messages.at(-1)?.body.slice(0, 90)}</p>
          <div className="mail-bottom">
            <div className="ticket-badges">
              <span className={`status ${i.status}`}>{label(i.status)}</span>
              <AnalysisBadge item={i} />
            </div>
            <span>
              {i.messages.length > 1 ? `${i.messages.length} messages` : i.id}
            </span>
          </div>
        </button>
      ))}
      {!visible.length && (
        <p className="empty-small">No items match this view.</p>
      )}
    </div>
  );
}
