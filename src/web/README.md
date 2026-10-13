# Frontend structure

`main.tsx` mounts the application and imports the existing stylesheet. `App.tsx` composes the inbox and selected work-item workspace, with lightweight search/filter state. React StrictMode is enabled to exercise effect cleanup in development.

## Component boundaries

- `components/Layout.tsx` and `Feedback.tsx`: application chrome, status filters, notifications and the unsaved-changes dialog.
- `components/inbox/`: inbox list, mailbox controls and a manual email form. The manual form owns its input state and preserves message IDs when a submission fails.
- `components/workspace/`: work-item header/tabs, model controls, conversation, analysis and activity views.
- `components/review/`: review panel, classification fields and narrative/decision fields.
- `components/draft/`: email editing, approval and triage controls.
- `components/Select.tsx`: a reusable select whose option values and callbacks retain their TypeScript literal types.

Components receive typed data and intent callbacks. API routes and request orchestration belong to hooks, rather than button handlers embedded in screen markup. The existing CSS classes and workflow wording are preserved.

## State and requests

- `hooks/useInbox.ts`: configuration loading, inbox polling and simulated mailbox sync. Effect cleanup aborts requests; sequence checks prevent older list responses from replacing newer results.
- `hooks/useWorkItem.ts`: selection, guarded asynchronous work-item operations, analysis cancellation, review saves, draft actions and feedback. Late responses are checked against the current selection/request before installation.
- `hooks/useReviewEditor.ts`: a reducer updates editable review/draft state together with dirty flags and acknowledgments. Program/category changes clear the chosen team; text changes invalidate the relevant acknowledgment. Accepted server results explicitly reset the editor.
- `hooks/useModelSelection.ts`: provider/model selection and cloud-consent reset when providers change.
- `lib/api.ts`: shared JSON request/error handling.
- `lib/review.ts`: derives initial editable review values from the current work item.
- `types.ts`: frontend-only contracts; domain models remain in `src/shared/types.ts`.

Server-side revision checks and approval gates remain authoritative. The frontend request guards complement them rather than replacing them. No new runtime dependencies were added.

## Verification

From the repository root, run `npm run build` and `npm test`. All 31 existing tests pass. A browser walkthrough on an isolated database checked analysis, review, unsaved-edit protection, draft saving/approval, triage and cancellation preserving the approved draft. The temporary verification server was stopped afterward.
