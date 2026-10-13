import type { WorkItem, Review } from "../../shared/types.js";
export function reviewFrom(item: WorkItem): Review {
  if (item.review) return { ...item.review, acknowledged: true };
  const a = item.analysis;
  return {
    ticketType: a?.output.ticketType || "investigation_request",
    category: a?.output.category || "unknown",
    program: a?.resolution.program || "unknown",
    affiliate: a?.resolution.affiliate || "Unknown",
    environment: (a?.resolution.environment ||
      "unknown") as Review["environment"],
    priority: a?.policy.priority || "medium",
    severity: a?.policy.severity || "unknown",
    teamId: a?.routing.teamId || "",
    summary: a?.output.summary || item.subject,
    impact: a?.output.impact || "Impact not yet confirmed.",
    actions: a?.output.actions || [
      "Review the reported symptom and confirm affected scope.",
    ],
    missingInformation: a?.output.missingInformation || [
      "Which URL, symptom and impact scope are affected?",
    ],
    notes: "",
    disposition:
      a?.routing.status === "matched" ? "handover" : "needs_information",
    acknowledged: true,
  };
}
