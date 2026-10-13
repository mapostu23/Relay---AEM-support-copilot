import type { Review } from "../../../shared/types.js";
import type { ReviewEditor } from "../../types.js";
export function ReviewDetailsFields({
  review,
  patch,
}: {
  review: ReviewEditor["review"];
  patch: ReviewEditor["patch"];
}) {
  if (!review) return null;
  return (
    <>
      <label>
        Issue summary
        <textarea
          value={review.summary}
          maxLength={1200}
          rows={2}
          onChange={(e) => patch("summary", e.target.value)}
        />
      </label>
      <label>
        Reported business impact
        <textarea
          value={review.impact}
          maxLength={800}
          rows={2}
          onChange={(e) => patch("impact", e.target.value)}
        />
      </label>
      <label>
        Investigation steps · one per line
        <textarea
          rows={4}
          value={review.actions.join("\n")}
          onChange={(e) => patch("actions", e.target.value.split("\n"))}
        />
      </label>
      <label>
        Missing information · one question per line
        <textarea
          rows={3}
          value={review.missingInformation.join("\n")}
          onChange={(e) =>
            patch(
              "missingInformation",
              e.target.value ? e.target.value.split("\n") : [],
            )
          }
        />
      </label>
      <label>
        Reviewer decision note
        <textarea
          rows={3}
          placeholder="What did you verify or change, and why?"
          maxLength={1500}
          value={review.notes}
          onChange={(e) => patch("notes", e.target.value)}
        />
      </label>
      <label>
        Next step
        <select
          value={review.disposition}
          onChange={(e) =>
            patch("disposition", e.target.value as Review["disposition"])
          }
        >
          <option value="handover">Prepare team handover</option>
          <option value="needs_information">
            Ask the sender for information
          </option>
        </select>
      </label>
    </>
  );
}
