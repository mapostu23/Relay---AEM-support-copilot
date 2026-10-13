import fs from "node:fs";
import { z } from "zod";
import {
  AppError,
  categories,
  programs,
  type CustomerConfig,
  type Resolution,
  type Routing,
  type AnalysisOutput,
  type Message,
  type Review,
} from "../shared/types.js";
const ConfigurationSchema = z.object({
  version: z.string(),
  programs: z.array(
    z.object({
      id: z.enum(programs),
      name: z.string(),
      developmentTeam: z.string(),
      domains: z.array(
        z.object({
          host: z.string(),
          affiliate: z.string(),
          environment: z.enum([
            "production",
            "stage",
            "development",
            "unknown",
          ]),
        }),
      ),
    }),
  ),
  teams: z.array(
    z.object({ id: z.string(), name: z.string(), email: z.email() }),
  ),
  rules: z.array(
    z.object({
      id: z.string(),
      category: z.enum(categories),
      team: z.string().optional(),
      teamFromProgram: z.boolean().optional(),
      candidates: z.array(z.string()).optional(),
      reason: z.string(),
    }),
  ),
});
export function loadCustomer(root = "config"): CustomerConfig {
  const read = (name: string) =>
    JSON.parse(fs.readFileSync(`${root}/${name}.json`, "utf8"));
  const c = ConfigurationSchema.parse({
    version: "synthetic-v1",
    programs: read("programs"),
    teams: read("teams"),
    rules: read("routing-rules"),
  });
  const teamIds = new Set(c.teams.map((t) => t.id));
  if (
    teamIds.size !== c.teams.length ||
    new Set(c.programs.map((p) => p.id)).size !== c.programs.length ||
    new Set(c.rules.map((r) => r.id)).size !== c.rules.length
  )
    throw Error("Duplicate configuration IDs");
  for (const p of c.programs) {
    if (!teamIds.has(p.developmentTeam))
      throw Error("Unknown program development team");
    for (const d of p.domains)
      if (d.host !== d.host.toLowerCase() || /[^a-z0-9.-]/.test(d.host))
        throw Error("Invalid configured hostname");
  }
  for (const r of c.rules) {
    if (
      [!!r.team, !!r.teamFromProgram, !!r.candidates].filter(Boolean).length !==
      1
    )
      throw Error("Routing rule must have exactly one target strategy");
    for (const t of [r.team, ...(r.candidates || [])])
      if (t && t !== "PROGRAM" && !teamIds.has(t))
        throw Error("Unknown routing team");
  }
  return c;
}
export function resolveProgram(
  messages: Message[],
  c: CustomerConfig,
): Resolution {
  const urls = messages
    .flatMap((m) => [
      m.affectedUrl,
      ...(m.body.match(/https?:\/\/[^\s<>"']+/g) || []),
    ])
    .filter(Boolean);
  const hosts = [
    ...new Set(
      urls.flatMap((raw) => {
        try {
          const u = new URL(raw.replace(/[),.;]+$/, ""));
          return ["https:", "http:"].includes(u.protocol) &&
            !u.username &&
            !u.password
            ? [u.hostname.toLowerCase().replace(/\.$/, "")]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
  const hits = hosts.flatMap((host) =>
    c.programs.flatMap((p) =>
      p.domains
        .filter((d) => d.host === host)
        .map((d) => ({ program: p.id, ...d })),
    ),
  );
  // Exact host matching only: never suffix-match attacker-controlled names or trust AI ownership.
  const ids = [...new Set(hits.map((h) => h.program))];
  const conflict =
    ids.length > 1 ||
    (ids.length > 0 &&
      hosts.some((host) => !hits.some((hit) => hit.host === host))) ||
    hosts.some((h) => hits.filter((x) => x.host === h).length > 1);
  if (conflict)
    return {
      program: null,
      affiliate: "Unknown",
      environment: "unknown",
      status: "conflict",
      hosts,
      reason:
        "The conversation includes conflicting or partly unmapped domains, or duplicate registry entries. Confirm the affected program manually.",
    };
  if (!ids.length)
    return {
      program: null,
      affiliate: "Unknown",
      environment: "unknown",
      status: "unknown",
      hosts,
      reason:
        "No exact domain registry match. AI program suggestions require human confirmation.",
    };
  const affiliates = [...new Set(hits.map((h) => h.affiliate))],
    envs = [...new Set(hits.map((h) => h.environment))];
  return {
    program: ids[0],
    affiliate: affiliates.length === 1 ? affiliates[0] : "Multiple / confirm",
    environment: envs.length === 1 ? envs[0] : "unknown",
    status: "matched",
    hosts,
    reason:
      "Exact hostname matched the customer-owned registry. This does not verify site health.",
  };
}
export function route(
  category: AnalysisOutput["category"],
  program: Resolution["program"],
  c: CustomerConfig,
): Routing {
  if (!program)
    return {
      status: "manual",
      teamId: null,
      candidates: [],
      ruleId: null,
      reason: "Confirm the program before ownership is finalized.",
    };
  const matches = c.rules.filter((r) => r.category === category),
    p = c.programs.find((p) => p.id === program)!;
  if (matches.length !== 1)
    return {
      status: "manual",
      teamId: null,
      candidates: [],
      ruleId: null,
      reason: matches.length
        ? "Conflicting routing rules. Select a team."
        : "No configured rule. Select a team.",
    };
  const r = matches[0];
  if (r.candidates)
    return {
      status: "manual",
      teamId: null,
      candidates: [
        ...new Set(
          r.candidates.map((t) => (t === "PROGRAM" ? p.developmentTeam : t)),
        ),
      ],
      ruleId: r.id,
      reason: r.reason,
    };
  return {
    status: "matched",
    teamId: r.teamFromProgram ? p.developmentTeam : r.team!,
    candidates: [],
    ruleId: r.id,
    reason: r.reason,
  };
}
export function priorityPolicy(a: AnalysisOutput, resolution: Resolution) {
  const security = a.category === "security";
  return {
    priority:
      security && !["critical", "high"].includes(a.priority)
        ? ("high" as const)
        : a.priority,
    severity: a.severity,
    reason: security
      ? "Suspected security issue: configured minimum high priority and expedited human escalation. Unverified diagnosis."
      : `Model proposal requires human confirmation. ${resolution.environment === "production" ? "Registry indicates production." : "Environment/impact may need confirmation."}`,
    escalation: security || a.priority === "critical",
  };
}
export function validateReview(r: Review, c: CustomerConfig) {
  if (r.teamId && !c.teams.some((t) => t.id === r.teamId))
    throw new AppError("invalid_team", "Select a configured team.", 400);
  if (r.disposition === "handover" && (r.program === "unknown" || !r.teamId))
    throw new AppError(
      "unresolved_routing",
      "Confirm a program and configured team before handover.",
      400,
    );
  if (r.disposition === "needs_information" && !r.missingInformation.length)
    throw new AppError(
      "missing_questions",
      "Add a specific clarification question.",
      400,
    );
  if (r.category === "security" && !["critical", "high"].includes(r.priority))
    throw new AppError(
      "priority_policy",
      "Security triage requires at least high priority.",
      400,
    );
}
