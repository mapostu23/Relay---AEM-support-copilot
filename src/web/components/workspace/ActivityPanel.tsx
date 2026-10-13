import type { Audit } from "../../../shared/types.js";
import { ActivityFeed } from "../observability/ActivityFeed.js";
export function ActivityPanel({ audit }: { audit: Audit[] }) {
  return (
    <div className="activity">
      <div className="section-heading">
        <span className="eyebrow">TICKET ACTIVITY</span>
        <h3>Follow the conversation from receipt to handover.</h3>
        <p>
          Newest events first. Expand raw details for diagnostics. Times use
          your local timezone.
        </p>
      </div>
      <ActivityFeed entries={audit} />
    </div>
  );
}
