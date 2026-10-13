import { z } from "zod";
export const ticketTypes = [
  "incident",
  "production_defect",
  "change_request",
  "service_request",
  "content_request",
  "investigation_request",
  "information_request",
] as const;
export const categories = [
  "content_authoring",
  "component_defect",
  "application_config",
  "dispatcher_cdn",
  "dns",
  "redirects",
  "iam",
  "integrations",
  "analytics",
  "seo",
  "performance",
  "accessibility",
  "security",
  "localization",
  "deployments",
  "unknown",
] as const;
export const programs = ["corporate", "patient", "hcp", "campaigns"] as const;
export const priorities = ["critical", "high", "medium", "low"] as const;
export const severities = ["critical", "major", "minor", "unknown"] as const;
export const statuses = [
  "new",
  "needs_information",
  "in_review",
  "ready_for_handover",
  "triaged",
] as const;
export type Status = (typeof statuses)[number];
export type Program = (typeof programs)[number];
export type Category = (typeof categories)[number];
export type Provider = "ollama" | "openai" | "anthropic";
const text = (max = 1000) => z.string().trim().min(1).max(max);
export const MessageSchema = z
  .object({
    provider: z.enum(["demo", "manual"]),
    messageId: text(120),
    threadId: text(120),
    sender: z.email().max(200),
    subject: text(200),
    body: text(12000),
    receivedAt: z.iso.datetime(),
    affectedUrl: z.union([z.literal(""), z.url().max(1000)]),
    attachments: z
      .array(
        z
          .object({
            name: text(150),
            size: z.number().int().min(0).max(100000000),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type Message = z.infer<typeof MessageSchema>;
const EvidenceSchema = z
  .object({ messageId: text(120), quote: text(500) })
  .strict();
export const AnalysisOutputSchema = z
  .object({
    ticketType: z.enum(ticketTypes),
    category: z.enum(categories),
    programSuggestion: z.enum([...programs, "unknown"]),
    affiliate: text(80),
    environment: z.enum(["production", "stage", "development", "unknown"]),
    summary: text(1200),
    impact: text(800),
    priority: z.enum(priorities),
    severity: z.enum(severities),
    rationale: text(1000),
    evidence: z.array(EvidenceSchema).min(1).max(8),
    possibleCauses: z.array(text(400)).max(5),
    actions: z.array(text(400)).min(1).max(8),
    missingInformation: z.array(text(400)).max(8),
  })
  .strict();
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
export interface ProviderConfig {
  id: Provider;
  label: string;
  models: string[];
  ready: boolean;
  readiness: string;
  cloud: boolean;
}
export interface Config {
  defaultProvider: Provider;
  providers: ProviderConfig[];
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export interface Team {
  id: string;
  name: string;
  email: string;
}
export interface ProgramConfig {
  id: Program;
  name: string;
  developmentTeam: string;
  domains: { host: string; affiliate: string; environment: string }[];
}
export interface CustomerConfig {
  programs: ProgramConfig[];
  teams: Team[];
  rules: {
    id: string;
    category: Category;
    team?: string;
    teamFromProgram?: boolean;
    candidates?: string[];
    reason: string;
  }[];
  version: string;
}
export interface Resolution {
  program: Program | null;
  affiliate: string;
  environment: string;
  status: "matched" | "unknown" | "conflict";
  hosts: string[];
  reason: string;
}
export interface Routing {
  status: "matched" | "manual";
  teamId: string | null;
  candidates: string[];
  ruleId: string | null;
  reason: string;
}
export interface Analysis {
  output: AnalysisOutput;
  resolution: Resolution;
  routing: Routing;
  policy: {
    priority: (typeof priorities)[number];
    severity: (typeof severities)[number];
    reason: string;
    escalation: boolean;
  };
  meta: {
    requestId: string;
    provider: Provider;
    model: string;
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    attempts: number;
  };
  at: string;
}
export const ReviewSchema = z
  .object({
    ticketType: z.enum(ticketTypes),
    category: z.enum(categories),
    program: z.enum([...programs, "unknown"]),
    affiliate: text(80),
    environment: z.enum(["production", "stage", "development", "unknown"]),
    priority: z.enum(priorities),
    severity: z.enum(severities),
    teamId: z.string().max(80),
    summary: text(1200),
    impact: text(800),
    actions: z.array(text(400)).min(1).max(8),
    missingInformation: z.array(text(400)).max(8),
    notes: text(1500),
    disposition: z.enum(["handover", "needs_information"]),
    acknowledged: z.literal(true),
  })
  .strict();
export type Review = z.infer<typeof ReviewSchema>;
export interface Draft {
  to: string;
  subject: string;
  body: string;
  approved: boolean;
  updatedAt: string;
}
export interface WorkItem {
  id: string;
  provider: string;
  threadId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  updatedAt: string;
  status: Status;
  revision: number;
  unread: boolean;
  messages: Message[];
  analysis: Analysis | null;
  analysisMessageIds?: string[];
  review: Review | null;
  draft: Draft | null;
}
export interface Audit {
  id: number;
  event: string;
  at: string;
  details: Record<string, unknown>;
}
export interface ActivityEntry extends Audit {
  itemId: string;
}
export const AnalyzeRequestSchema = z
  .object({
    revision: z.number().int().positive(),
    provider: z.enum(["ollama", "openai", "anthropic"]),
    model: text(120),
    cloudConsent: z.boolean().optional(),
  })
  .strict();
export interface Metrics {
  analyses: number;
  analysisFailures: number;
  ingested: number;
  duplicates: number;
  replies: number;
  overrides: number;
  reviews: number;
  latencies: number[];
}
export const label = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());

export interface ProviderStatus {
  id: Provider;
  label: string;
  state: "ready" | "configured" | "unconfigured" | "offline" | "unknown";
  status: string;
  detail: string;
}

export function hasCurrentAnalysis(item: WorkItem): boolean {
  if (!item.analysis) return false;
  if (!item.analysisMessageIds) return item.status !== "new";
  return (
    item.analysisMessageIds.length === item.messages.length &&
    item.messages.every(
      (message, index) => item.analysisMessageIds![index] === message.messageId,
    )
  );
}

export type InboxFilter = "all" | "duplicates" | Status;
export interface DuplicateEmail {
  itemId: string;
  provider: string;
  messageId: string;
  subject: string;
  sender: string;
  count: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
}
