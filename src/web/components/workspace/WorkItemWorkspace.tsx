import { AnalysisBadge } from "../AnalysisBadge.js";
import {
  hasCurrentAnalysis,
  label,
  type WorkItem,
  type Audit,
} from "../../../shared/types.js";
import type {
  WorkspaceView,
  Settings,
  ModelSelection,
  ReviewEditor,
} from "../../types.js";
import { ModelControls } from "./ModelControls.js";
import { Conversation } from "./Conversation.js";
import { AnalysisPanel } from "./AnalysisPanel.js";
import { ActivityPanel } from "./ActivityPanel.js";
import { ReviewPanel } from "../review/ReviewPanel.js";
import { DraftPanel } from "../draft/DraftPanel.js";
interface Actions {
  onViewChange: (view: WorkspaceView) => void;
  onReload: () => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onKeepReview: () => void;
  onSaveReview: () => void;
  onSaveDraft: () => void;
  onApproveDraft: () => void;
}
interface Props {
  item: WorkItem;
  audit: Audit[];
  view: WorkspaceView;
  settings: Settings | null;
  model: ModelSelection;
  editor: ReviewEditor;
  busy: string;
  stale: boolean;
  replace: boolean;
  actions: Actions;
}
const views: WorkspaceView[] = [
  "email",
  "analysis",
  "review",
  "draft",
  "activity",
];
export function WorkItemWorkspace({
  item,
  audit,
  view,
  settings,
  model,
  editor,
  busy,
  stale,
  replace,
  actions,
}: Props) {
  const fieldsDisabled = !!busy || stale;
  const manualReview = () => actions.onViewChange("review");
  return (
    <>
      <div className="detail-head">
        <div>
          <span className="eyebrow">
            {item.id} <span className="muted">/ REV {item.revision}</span>
          </span>
          <h2>{item.subject}</h2>
        </div>
        <div className="ticket-badges">
          <span className={`status ${item.status}`}>{label(item.status)}</span>
          <AnalysisBadge item={item} />
        </div>
      </div>
      {stale && (
        <div className="alert warning">
          New information or edits arrived. Reload the latest item before
          saving. Unsaved changes will be discarded.
          <button disabled={!!busy} onClick={actions.onReload}>
            Reload latest
          </button>
        </div>
      )}
      {item.analysis && !hasCurrentAnalysis(item) && (
        <p className="warning">
          A reply arrived after the previous analysis. That recommendation is
          retained for reference; review the current conversation again.
        </p>
      )}
      <div className="tabs" role="tablist" aria-label="Work item workspace">
        {views.map((v) => (
          <button
            role="tab"
            key={v}
            disabled={!!busy || (editor.dirty && view !== v)}
            aria-selected={view === v}
            onClick={() => actions.onViewChange(v)}
          >
            {v === "email"
              ? "Original email"
              : v === "draft"
                ? "Email draft"
                : label(v)}
          </button>
        ))}
      </div>
      {(view === "email" || view === "analysis") && (
        <ModelControls
          settings={settings}
          selection={model}
          busy={busy}
          stale={stale}
          hasAnalysis={!!item.analysis}
          replace={replace}
          onAnalyze={actions.onAnalyze}
          onCancel={actions.onCancel}
          onManualReview={manualReview}
          onKeepReview={actions.onKeepReview}
        />
      )}
      {view === "email" && <Conversation item={item} />}
      {view === "analysis" &&
        (item.analysis && settings ? (
          <AnalysisPanel item={item} customer={settings.customer} />
        ) : (
          <div className="empty-small">
            Analyze this conversation or proceed with manual review.
          </div>
        ))}
      {view === "review" &&
        (settings ? (
          <ReviewPanel
            editor={editor}
            customer={settings.customer}
            fieldsDisabled={fieldsDisabled}
            onSave={actions.onSaveReview}
          />
        ) : (
          <p className="warning">
            Customer configuration is not available yet. Review is unavailable
            until it loads.
          </p>
        ))}
      {view === "draft" && (
        <DraftPanel
          item={item}
          editor={editor}
          fieldsDisabled={fieldsDisabled}
          onReview={manualReview}
          onSave={actions.onSaveDraft}
          onApprove={actions.onApproveDraft}
        />
      )}
      {view === "activity" && <ActivityPanel audit={audit} />}
    </>
  );
}
