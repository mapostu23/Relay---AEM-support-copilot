export function Feedback({
  error,
  notice,
  onDismissError,
  onDismissNotice,
}: {
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
}) {
  return (
    <>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={onDismissError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="alert notice" role="status">
          {notice}
          <button onClick={onDismissNotice} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      )}
    </>
  );
}
export function DiscardChangesDialog({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Unsaved changes"
      >
        <h2>Leave unsaved edits?</h2>
        <p>Your current changes have not been saved.</p>
        <button onClick={onKeep}>Keep editing</button>
        <button className="primary" onClick={onDiscard}>
          Discard edits and open email
        </button>
      </div>
    </div>
  );
}
