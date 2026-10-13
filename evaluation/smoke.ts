import { loadSettings } from "../src/server/config.js";
import { loadCustomer } from "../src/server/routing.js";
import { analyze } from "../src/server/analysis.js";
import { Store } from "../src/server/store.js";
import { demoMessages } from "../data/mailbox.js";
import type { Provider } from "../src/shared/types.js";
const provider = (process.argv[2] || "ollama") as Provider;
if (
  !["ollama", "openai", "anthropic"].includes(provider) ||
  !process.argv.includes("--live")
)
  throw Error(
    "Usage: npm run smoke -- ollama|openai|anthropic --live. Uses one fictional email; cloud may incur charges.",
  );
const settings = loadSettings(),
  store = new Store(":memory:");
const { ids } = store.ingest([demoMessages[1]]);
try {
  const result = await analyze(
    store.get(ids[0]),
    {
      provider,
      model:
        process.env.EVAL_MODEL ||
        settings.providers.find((p) => p.id === provider)!.models[0],
      cloudConsent: true,
    },
    settings,
    loadCustomer(),
    new AbortController().signal,
  );
  console.log(
    JSON.stringify(
      {
        status: "validated",
        category: result.output.category,
        route: result.routing,
        metadata: result.meta,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : "Provider failed");
  process.exitCode = 1;
} finally {
  store.close();
}
