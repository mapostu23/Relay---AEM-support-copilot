import fs from "node:fs";
import { cases } from "./cases.js";
import { loadSettings } from "../src/server/config.js";
import { loadCustomer } from "../src/server/routing.js";
import { Store } from "../src/server/store.js";
import { analyze } from "../src/server/analysis.js";
import { emailTemplate } from "../src/server/email.js";
import type { Provider, Review } from "../src/shared/types.js";
const provider = (process.argv[2] || "ollama") as Provider;
if (!["ollama", "openai", "anthropic"].includes(provider))
  throw Error("Choose ollama, openai or anthropic.");
if (!process.argv.includes("--live"))
  throw Error(
    "Add --live to explicitly authorize model calls on fictional evaluation emails. Cloud calls may incur charges.",
  );
const settings = loadSettings(),
  customer = loadCustomer(),
  model =
    process.env.EVAL_MODEL ||
    settings.providers.find((p) => p.id === provider)!.models[0],
  results = [];
for (const c of cases) {
  const store = new Store(":memory:");
  const { ids } = store.ingest(c.messages);
  const item = store.get(ids[0]);
  try {
    const a = await analyze(
      item,
      {
        provider,
        model,
        cloudConsent: provider === "openai" || provider === "anthropic",
      },
      settings,
      customer,
      new AbortController().signal,
    );
    const checks = {
      schemaAndEvidenceValid: true,
      typeMatch: a.output.ticketType === c.expected.ticketType,
      categoryMatch: a.output.category === c.expected.category,
      programMatch: a.resolution.program === c.expected.program,
      ownerMatch: a.routing.teamId === c.expected.teamId,
      clarificationPresent: a.output.missingInformation.length > 0,
    };
    let draftComplete: boolean | null = null;
    if (a.resolution.program && a.routing.teamId) {
      const r: Review = {
        ...a.output,
        program: a.resolution.program,
        affiliate: a.resolution.affiliate,
        environment: a.resolution.environment as Review["environment"],
        priority: a.policy.priority,
        severity: a.policy.severity,
        teamId: a.routing.teamId,
        notes:
          "Synthetic evaluation template only; no human approval recorded.",
        disposition: "handover",
        acknowledged: true,
      };
      const draft = emailTemplate(item, r, customer);
      draftComplete = [
        "Summary:",
        "Program:",
        "Suggested investigation",
        "Open questions:",
        "Reference:",
      ].every((s) => draft.body.includes(s));
    }
    results.push({
      name: c.name,
      checks,
      draftComplete,
      analysis: a,
    });
    console.log(JSON.stringify({ case: c.name, ...checks, draftComplete }));
  } catch (e) {
    results.push({
      name: c.name,
      error: e instanceof Error ? e.message : "Analysis failed",
    });
    console.log(
      JSON.stringify({
        case: c.name,
        error: "Analysis failed; see local report",
      }),
    );
  } finally {
    store.close();
  }
}
fs.mkdirSync("evaluation/results", { recursive: true });
const file = `evaluation/results/${provider}-${Date.now()}.json`;
fs.writeFileSync(
  file,
  JSON.stringify(
    {
      provider,
      model,
      at: new Date().toISOString(),
      warning:
        "Small synthetic dataset; independent human review and live customer pilot still required.",
      results,
    },
    null,
    2,
  ),
);
console.log(`Saved ${results.length} cases to ${file}.`);
