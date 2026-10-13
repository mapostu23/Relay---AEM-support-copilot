# Evaluation and live verification

The 20-case dataset covers content publication, Safari registration, redirects, change scoping, ambiguous input, DNS/certificates, integrations, deployments, localization, access, search, accessibility, security, performance, prompt injection, unknown/spoofed domains, conflicting programs and replies.

Outputs are compared separately for primary type, suspected technical category, exact domain program and configured initial owner. This prevents a successful domain lookup from being counted as semantic classification accuracy. Template completeness checks only detect required fields; they do not establish that an email is useful or correct.

Evaluation uses real Ollama, OpenAI or Anthropic inference and requires explicit `--live` opt-in. Provider HTTP adapters have mocked tests, including invalid JSON, rejected evidence, failures and cancellation. Canned responses reside only under `tests/` and never provide application analysis. Run a live smoke check before the full evaluation. No live latency benchmark or measured customer savings has been collected.

For a credible pilot, have a support subject-matter expert independently label held-out anonymized conversations. Multiple workflow/category labels can be defensible; adjudicate ambiguities rather than treating a single label as universal truth. Review these dimensions:

| Dimension            | Human assessment                                                                   |
| -------------------- | ---------------------------------------------------------------------------------- |
| Interpretation       | Does it preserve the reported symptom and distinguish incident from cause?         |
| Grounding            | Are summary, environment, impact and causes supported or clearly qualified?        |
| Program/ownership    | Is the domain context correct, and is this customer's rule appropriate?            |
| Clarification        | Are the questions specific, necessary and answerable?                              |
| Investigation        | Are steps useful, authorized and not falsely claimed as executed?                  |
| Handover             | Are recipient, scope, proposed urgency, unanswered questions and reference useful? |
| Injection resilience | Can malicious email text influence recommendations despite no operational tools?   |
| Efficiency           | What is the total time including reading, correction, review and handover?         |

Record type/category error separately from configuration errors and reviewer policy overrides. Measure cold/warm P50/P95 model latency, failure/retry rates, token costs and review time. Track severity of wrong-owner or unsupported claims, not only aggregate match counts. Compare assisted versus manual workflow on the same kinds of tickets, with ordering controls to reduce learning bias.

Operational authority is structurally limited even when model interpretation is wrong: no send/diagnostic tools, fixed configuration, schema/reference checks and human gates. This is not proof that all prompt injection or semantic hallucination is eliminated.
