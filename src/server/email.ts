import {
  type WorkItem,
  type Review,
  type CustomerConfig,
  type Draft,
} from "../shared/types.js";
import { label } from "../shared/types.js";
export function emailTemplate(
  item: WorkItem,
  r: Review,
  c: CustomerConfig,
): Draft {
  const clarification = r.disposition === "needs_information",
    team = c.teams.find((t) => t.id === r.teamId),
    program = c.programs.find((p) => p.id === r.program);
  const subject = `[${r.priority.toUpperCase()}] [${program?.name || "Program to confirm"} / ${r.affiliate}] ${item.subject}`;
  const body = clarification
    ? `Hello,\n\nThank you for contacting support. Before we can route this request, please confirm:\n${r.missingInformation.map((q) => `• ${q}`).join("\n")}\n\nOur current understanding: ${r.summary}\n\nReference: ${item.id}\nThank you,\nSupport Team`
    : `Hello ${team?.name},\n\nPlease investigate the following support request.\n\nSummary: ${r.summary}\nProgram: ${program?.name} | Affiliate: ${r.affiliate} | Environment: ${r.environment}\nClassification: ${label(r.ticketType)} — ${label(r.category)} (suspected category, not confirmed root cause)\nProposed priority: ${label(r.priority)} | Severity: ${label(r.severity)}\nReported impact: ${r.impact}\nAffected URL(s): ${[...new Set(item.messages.map((m) => m.affectedUrl).filter(Boolean))].join(", ") || "Not supplied"}\n\nSuggested investigation (not executed):\n${r.actions.map((a) => `• ${a}`).join("\n")}\n\nOpen questions:\n${r.missingInformation.map((q) => `• ${q}`).join("\n") || "None recorded; verify scope during investigation."}\n\nReviewer notes: ${r.notes}\n\nPlease confirm ownership and next steps. No resolution time or cost is committed.\nReference: ${item.id}\nThank you,\nSupport Team`;
  return {
    to: clarification ? item.sender : team!.email,
    subject: subject.slice(0, 300),
    body,
    approved: false,
    updatedAt: new Date().toISOString(),
  };
}
// Deliberately separate financial authority from model suggestions.
export function estimateCost(
  hours: number,
  rateCard: {
    approved: boolean;
    hourlyRate: number;
    contingencyPercent: number;
    currency: string;
  } | null,
) {
  if (!rateCard?.approved)
    return {
      available: false as const,
      reason: "No approved rate card. Monetary estimates are blocked.",
    };
  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > 10000 ||
    !Number.isFinite(rateCard.hourlyRate) ||
    rateCard.hourlyRate <= 0 ||
    !Number.isFinite(rateCard.contingencyPercent) ||
    rateCard.contingencyPercent < 0 ||
    rateCard.contingencyPercent > 100
  )
    throw new Error("Invalid reviewed effort or rate");
  return {
    available: true as const,
    currency: rateCard.currency,
    total:
      Math.round(
        hours *
          rateCard.hourlyRate *
          (1 + rateCard.contingencyPercent / 100) *
          100,
      ) / 100,
    provisional: true,
  };
}
