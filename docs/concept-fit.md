# Assignment fit and scope

The supplied email-first AEM concept fits the FDE brief because it translates a concrete customer's operational problem into a small workflow with useful AI assistance and explicit human authority. The broad proposal is a roadmap; the interview deliverable is the inbox-to-reviewed-handover slice.

| Assignment expectation          | Implementation and evidence                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Specific non-technical workflow | Support coordinators read email, confirm classification/owner, and prepare a handover; specialists retain diagnosis              |
| Customer assumptions and value  | Four fictional AEM portfolios, shared mailbox, roughly 30 emails/day; savings are hypotheses for a pilot                         |
| End-to-end software             | Simulated ingestion → persistent inbox → model interpretation → configured routing → review → approved local draft               |
| Realistic failure behavior      | Duplicate/reply handling, stale revision protection, provider/mailbox outage, timeout/cancellation, malformed/unsupported output |
| Tests and reliability           | Focused deterministic, native-adapter and API lifecycle tests; 20 labeled synthetic evaluation cases                             |
| Observability                   | Metadata logs/request IDs, basic process metrics, durable decision audit                                                         |
| Trade-offs                      | One model call, bounded retry, unknown cost handling, local/cloud choice, explicit semantic validation limits                    |
| Runnable submission             | One Git repository, pinned lockfile, dev/production commands, CI, documented model configuration                                 |
| AI transparency                 | README identifies implementation assistance, mocked tests versus real inference, and deterministic authority                     |

The email-first appendix governs intake in this prototype. Manual pasted emails are a supplementary path. A simulated adapter is a meaningful integration boundary, but it must be demonstrated honestly as simulation. To show genuine AI use during the interview, configure a live model and evaluate its output. Mocked tests verify software behavior without establishing model accuracy.

Scope choices: use React/Express with the verified local tooling instead of introducing a new framework; retain SQLite; do not spend the assignment on OAuth, live AEM diagnostics or email sending. The core does not expose the optional CR estimator. These choices align with depth over breadth, rather than claiming the full enterprise proposal can be delivered in 9.5 hours. Actual authoring time is not certified; you should timebox your own review and preparation.

The 77-hours/month saving and low illustrative inference cost from the proposal are unvalidated assumptions. The README preserves that distinction. Initial ownership is customer policy, not a universal statement about AEM responsibility. The root-cause category remains suspected, and engineers must verify it.

Source concept: the user's Word proposal titled “AI AEM Support Triage & Routing Copilot,” including the shared-mailbox appendix. The original Word file is not bundled with the repository; all implementation examples are fictional.
