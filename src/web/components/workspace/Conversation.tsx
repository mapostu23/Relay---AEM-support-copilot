import type { WorkItem } from "../../../shared/types.js";
export function Conversation({ item }: { item: WorkItem }) {
  return (
    <div className="conversation">
      {item.messages.map((m, index) => (
        <article className="message" key={`${m.provider}:${m.messageId}`}>
          <div className="message-heading">
            <span className="avatar">{m.sender[0].toUpperCase()}</span>
            <div>
              <strong>{m.sender}</strong>
              <p>{m.subject}</p>
            </div>
            <time>{new Date(m.receivedAt).toLocaleString()}</time>
          </div>
          <pre>{m.body}</pre>
          {m.affectedUrl && (
            <div className="source-url">
              Affected URL <code>{m.affectedUrl}</code>
              <small>
                Shown as text; the application does not fetch this URL.
              </small>
            </div>
          )}
          {m.attachments.length > 0 && (
            <div className="attachments">
              {m.attachments.map((a) => (
                <span key={a.name}>
                  ▧ {a.name} · {Math.round(a.size / 1024)} KB
                </span>
              ))}
              <small>
                Metadata only · attachments are not opened or analyzed
              </small>
            </div>
          )}
          <footer>
            {index === 0 ? "Original incoming email" : "Thread reply"} ·{" "}
            {m.messageId}
          </footer>
        </article>
      ))}
    </div>
  );
}
