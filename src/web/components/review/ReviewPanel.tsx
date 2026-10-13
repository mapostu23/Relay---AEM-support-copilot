import type { CustomerConfig } from "../../../shared/types.js";
import type { ReviewEditor } from "../../types.js";
import { ClassificationFields } from "./ClassificationFields.js";
import { ReviewDetailsFields } from "./ReviewDetailsFields.js";
interface Props {
  editor: ReviewEditor;
  customer: CustomerConfig;
  fieldsDisabled: boolean;
  onSave: () => void;
}
export function ReviewPanel({
  editor,
  customer,
  fieldsDisabled,
  onSave: saveReview,
}: Props) {
  const { review, reviewAck, setReviewAck, dirty, patch } = editor;
  if (!review) return null;
  return (
    <div className="review">
      <div className="section-heading">
        <span className="eyebrow">03 / HUMAN DECISION</span>
        <h3>Confirm the route and the next step.</h3>
        <p>
          AI recommendations remain recorded separately. Save your own decision
          with a review note.
        </p>
      </div>
      <fieldset disabled={fieldsDisabled}>
        <ClassificationFields
          review={review}
          customer={customer}
          patch={patch}
        />
        <ReviewDetailsFields review={review} patch={patch} />
        <label className="check">
          <input
            type="checkbox"
            checked={reviewAck}
            onChange={(e) => setReviewAck(e.target.checked)}
          />
          I reviewed classification, impact, ownership and the open questions.
        </label>
      </fieldset>
      <div className="actions">
        <button
          className="primary"
          disabled={fieldsDisabled || !reviewAck || !review.notes.trim()}
          onClick={saveReview}
        >
          Save review & prepare draft ↗
        </button>
        <span className="muted">
          {dirty ? "Unsaved changes" : "Human review required"}
        </span>
      </div>
      {review.ticketType === "change_request" && (
        <p className="warning">
          Change request scope is provisional. Cost estimation is deferred; the
          bundled illustrative rate card is unapproved. No monetary commitment
          is generated.
        </p>
      )}
    </div>
  );
}
