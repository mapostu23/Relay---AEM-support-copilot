# Architecture and review invariants

The single Node process serves a React application and JSON API on loopback. SQLite records normalized messages, one work item per provider/thread, the current interpretation/review/draft and a metadata audit. No AEM URL, attachment or production service is contacted.

```mermaid
sequenceDiagram
  participant Mail as Demo mailbox
  participant API as API
  participant DB as SQLite
  participant Model as Chosen provider
  participant Human as Support coordinator
  Mail->>API: Message batch + cursor
  API->>DB: Transactional validate/deduplicate/associate
  API->>DB: Advance cursor after durable commit
  Human->>API: Analyze item at revision N
  API->>Model: One bounded structured request
  Model-->>API: Interpretation with quotations
  API->>API: Schema/evidence and configured routing
  API->>DB: Save only if revision still N
  Human->>API: Reviewed decision + rationale
  API->>DB: Save review and unapproved template draft
  Human->>API: Send (local approval of saved draft and recipient)
  API->>DB: Record approval and Triaged; no email transmitted
  API-->>Human: Read-only completed draft; no follow-up actions
```

Invariants enforced by code:

1. A provider/message ID is ingested at most once. Provider/thread IDs define association; matching subjects do not.
2. Configuration provides ownership and contact authority. Unknown/conflicting domains or categories return manual routing. Model program suggestions never silently override domain resolution.
3. Every accepted model response satisfies the strict output schema and cites exact body text from the supplied conversation. Entailment is outside this validator's capability.
4. A saved human handover requires a confirmed program, configured owner and explicit acknowledgment. A clarification requires a question and uses the original sender.
5. Draft edits and new replies invalidate approval. Replies reopen the item; analysis finishing after a reply is discarded by revision check.
6. Export requires current draft approval. No outbound send endpoint exists. Triaged does not claim delivery or resolution.
7. Failures preserve the current durable work item. No fallback silently changes provider/privacy/cost. One malformed-JSON retry shares the original deadline.

Ingestion IDs and minimal audit events are indexed SQL records; work item contents are JSON payloads for implementation speed. All mutation helpers execute synchronous SQLite transactions. The sync lock and analysis concurrency cap are process-local. A real adapter would validate webhook signatures, fetch authorized full messages, paginate/advance durable cursors, implement backoff, distinguish transient and permanent ingestion failures and verify thread identity from provider metadata. A production deployment also needs identity, role/tenant boundaries and retention controls before processing customer mail.

Current information history preserves messages and event metadata. It retains the latest model analysis separately from current reviewed values, but re-analysis is not a full immutable model-output version archive. This intentional limitation should be extended if compliance/audit requirements demand historical snapshots.
