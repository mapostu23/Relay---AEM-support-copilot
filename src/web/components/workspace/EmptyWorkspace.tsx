export function EmptyWorkspace() {
  return (
    <div className="empty">
      <span className="empty-icon">↗</span>
      <span className="eyebrow">TRIAGE WITH CONTEXT</span>
      <h2>
        One inbox.
        <br />A more useful next step.
      </h2>
      <p>
        Select an email to review the conversation, analyze the issue and
        prepare a handover.
      </p>
      <div className="empty-steps">
        <span>01 Read</span>
        <span>02 Analyze</span>
        <span>03 Review</span>
        <span>04 Handover</span>
      </div>
      <div className="local-note">
        15 authored examples · SQLite persistence · No outbound sending
        <br />
        Ollama is the default. Cloud providers require an API key and consent.
      </div>
    </div>
  );
}
