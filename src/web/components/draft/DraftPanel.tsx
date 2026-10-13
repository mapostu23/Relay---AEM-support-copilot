import type { WorkItem } from "../../../shared/types.js";
import type { ReviewEditor } from "../../types.js";
interface Props {
  item: WorkItem;
  editor: ReviewEditor;
  fieldsDisabled: boolean;
  onReview: () => void;
  onSave: () => void;
  onApprove: () => void;
}
export function DraftPanel({
  item,
  editor,
  fieldsDisabled,
  onReview,
  onSave: saveDraft,
  onApprove,
}: Props) {
  const {
    draftSubject,
    setDraftSubject,
    draftBody,
    setDraftBody,
    dirty,
    setDirty,
    draftAck,
    setDraftAck,
  } = editor;
  return !item.draft ? (
    <div className="empty-small">
      <h3>Start with a reviewed decision.</h3>
      <p>Confirm the program, owner and next step before preparing an email.</p>
      <button className="primary" onClick={onReview}>
        Review decision
      </button>
    </div>
  ) : (
    <div className="draft">
      <div className="section-heading">
        <span className="eyebrow">04 / HANDOVER</span>
        <h3>
          {item.review?.disposition === "needs_information"
            ? "Request the missing information."
            : "Give the next team a useful starting point."}
        </h3>
        {!item.draft.approved && (
          <p>
            Review the text and recipient. Send completes local triage; no email
            is transmitted.
          </p>
        )}
      </div>
      <div className="recipient">
        <span>TO</span>
        <strong>{item.draft.to}</strong>
        <small>
          Resolved from{" "}
          {item.review?.disposition === "needs_information"
            ? "the original sender"
            : "the configured team registry"}
        </small>
      </div>
      <fieldset disabled={fieldsDisabled || item.draft.approved}>
        <label>
          Email subject
          <input
            value={draftSubject}
            maxLength={300}
            onChange={(e) => {
              setDraftSubject(e.target.value);
              setDirty(true);
              setDraftAck(false);
            }}
          />
        </label>
        <label>
          Email body
          <textarea
            className="draft-body"
            rows={19}
            maxLength={12000}
            value={draftBody}
            onChange={(e) => {
              setDraftBody(e.target.value);
              setDirty(true);
              setDraftAck(false);
            }}
          />
        </label>
      </fieldset>
      {dirty && !item.draft.approved && (
        <button
          className="secondary"
          disabled={fieldsDisabled}
          onClick={saveDraft}
        >
          Save draft changes
        </button>
      )}
      {!item.draft.approved && (
        <>
          <label className="check">
            <input
              type="checkbox"
              disabled={dirty || fieldsDisabled}
              checked={draftAck}
              onChange={(e) => setDraftAck(e.target.checked)}
            />
            I checked the recipient and the current saved email text.
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={fieldsDisabled || dirty || !draftAck}
              onClick={onApprove}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
