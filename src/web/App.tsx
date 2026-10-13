import { useState } from "react";
import type { InboxFilter } from "../shared/types.js";
import { useInbox } from "./hooks/useInbox.js";
import { useWorkItem } from "./hooks/useWorkItem.js";
import { useModelSelection } from "./hooks/useModelSelection.js";
import { AppHeader, StatusFilters, AppFooter } from "./components/Layout.js";
import { Feedback, DiscardChangesDialog } from "./components/Feedback.js";
import { InboxSidebar } from "./components/inbox/InboxSidebar.js";
import { WorkItemWorkspace } from "./components/workspace/WorkItemWorkspace.js";
import { EmptyWorkspace } from "./components/workspace/EmptyWorkspace.js";
import { DuplicatesPanel } from "./components/inbox/DuplicatesPanel.js";
import { ObservabilityPanel } from "./components/observability/ObservabilityPanel.js";
export function App() {
  const [observing, setObserving] = useState(false);
  const inbox = useInbox();
  const workspace = useWorkItem(inbox.refresh);
  const model = useModelSelection(inbox.settings);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const visible = inbox.items.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      `${item.subject} ${item.sender} ${item.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const latest = inbox.items.find((item) => item.id === workspace.item?.id);
  const stale =
    !!workspace.item && !!latest && latest.revision !== workspace.item.revision;
  const sync = async () => {
    workspace.setError("");
    const notice = await inbox.sync();
    if (notice) workspace.setNotice(notice);
  };
  const analyze = () =>
    void workspace.analyze({
      provider: model.provider,
      model: model.model,
      cloudConsent: model.consent,
    });
  return (
    <div className="app-shell">
      <AppHeader
        items={inbox.items}
        observing={observing}
        onObservability={() => setObserving((v) => !v)}
      />
      <StatusFilters
        items={inbox.items}
        filter={filter}
        duplicateCount={inbox.duplicates.length}
        onChange={(next) => {
          setFilter(next);
          setObserving(false);
        }}
      />
      <Feedback
        error={workspace.error || inbox.error}
        notice={workspace.notice}
        onDismissError={() => {
          workspace.setError("");
          inbox.setError("");
        }}
        onDismissNotice={() => workspace.setNotice("")}
      />
      {observing && (
        <ObservabilityPanel
          onClose={() => setObserving(false)}
          onTicket={(id) => {
            setObserving(false);
            workspace.select(id);
          }}
        />
      )}
      {!observing && filter === "duplicates" && (
        <DuplicatesPanel
          entries={inbox.duplicates}
          onBack={() => setFilter("all")}
          onTicket={(id) => {
            setFilter("all");
            workspace.select(id);
          }}
        />
      )}
      <main className="workspace" hidden={observing || filter === "duplicates"}>
        <InboxSidebar
          visible={visible}
          itemId={workspace.item?.id || null}
          busy={!!workspace.busy}
          search={search}
          setSearch={setSearch}
          mailScenario={inbox.mailScenario}
          setMailScenario={inbox.setMailScenario}
          mailBusy={inbox.mailBusy}
          mailError={inbox.mailError}
          sync={() => void sync()}
          onSelect={workspace.select}
          onManualSubmit={workspace.submitManual}
        />
        <section className="detail">
          {workspace.item ? (
            <WorkItemWorkspace
              item={workspace.item}
              audit={workspace.audit}
              view={workspace.view}
              settings={inbox.settings}
              model={model}
              editor={workspace.editor}
              busy={workspace.busy}
              stale={stale}
              replace={workspace.replace}
              actions={{
                onViewChange: workspace.setView,
                onReload: () => void workspace.open(workspace.item!.id),
                onAnalyze: analyze,
                onCancel: workspace.cancel,
                onKeepReview: () => workspace.setReplace(false),
                onSaveReview: workspace.saveReview,
                onSaveDraft: workspace.saveDraft,
                onApproveDraft: workspace.approveDraft,
              }}
            />
          ) : (
            <EmptyWorkspace />
          )}
        </section>
      </main>
      <AppFooter />
      {workspace.pendingSelection && (
        <DiscardChangesDialog
          onKeep={() => workspace.setPendingSelection(null)}
          onDiscard={workspace.discardAndOpen}
        />
      )}
    </div>
  );
}
