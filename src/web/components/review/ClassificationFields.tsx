import type { ReviewEditor } from "../../types.js";
import {
  categories,
  ticketTypes,
  programs,
  priorities,
  severities,
  type CustomerConfig,
} from "../../../shared/types.js";
import { Select } from "../Select.js";
export function ClassificationFields({
  review,
  customer,
  patch,
}: {
  review: ReviewEditor["review"];
  customer: CustomerConfig;
  patch: ReviewEditor["patch"];
}) {
  if (!review) return null;
  return (
    <div className="form-grid">
      <Select
        name="Ticket type"
        value={review.ticketType}
        values={ticketTypes}
        onChange={(v) => patch("ticketType", v)}
      />
      <Select
        name="Technical category"
        value={review.category}
        values={categories}
        onChange={(v) => patch("category", v)}
      />
      <Select
        name="Confirmed program"
        value={review.program}
        values={[...programs, "unknown"]}
        onChange={(v) => patch("program", v)}
      />
      <label>
        Affiliate
        <input
          value={review.affiliate}
          maxLength={80}
          onChange={(e) => patch("affiliate", e.target.value)}
        />
      </label>
      <Select
        name="Environment"
        value={review.environment}
        values={["production", "stage", "development", "unknown"]}
        onChange={(v) => patch("environment", v)}
      />
      <label>
        Responsible team
        <select
          value={review.teamId}
          onChange={(e) => patch("teamId", e.target.value)}
        >
          <option value="">Select a configured team</option>
          {customer.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <Select
        name="Priority"
        value={review.priority}
        values={priorities}
        onChange={(v) => patch("priority", v)}
      />
      <Select
        name="Severity"
        value={review.severity}
        values={severities}
        onChange={(v) => patch("severity", v)}
      />
    </div>
  );
}
