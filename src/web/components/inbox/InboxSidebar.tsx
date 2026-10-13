import { useState } from "react";
import type { WorkItem } from "../../../shared/types.js";
import type { ManualEmail, MailScenario } from "../../types.js";
import { ManualEmailForm } from "./ManualEmailForm.js";
import { InboxList } from "./InboxList.js";
interface Props {
  visible: WorkItem[];
  itemId: string | null;
  busy: boolean;
  search: string;
  setSearch: (s: string) => void;
  mailScenario: MailScenario;
  setMailScenario: (s: MailScenario) => void;
  mailBusy: boolean;
  mailError: string;
  sync: () => void;
  onSelect: (id: string) => void;
  onManualSubmit: (email: ManualEmail) => Promise<boolean>;
}
export function InboxSidebar({
  visible,
  itemId,
  busy,
  search,
  setSearch,
  mailScenario,
  setMailScenario,
  mailBusy,
  mailError,
  sync,
  onSelect,
  onManualSubmit,
}: Props) {
  const [showManual, setShowManual] = useState(false);
  const submitManual = async (email: ManualEmail) => {
    const ok = await onManualSubmit(email);
    if (ok) setShowManual(false);
    return ok;
  };
  return (
    <aside className="inbox">
      <div className="inbox-head">
        <div>
          <span className="eyebrow">01 / INTAKE</span>
          <h2>Support inbox</h2>
        </div>
        <span className="pill">DEMO MAILBOX</span>
      </div>
      <label className="search">
        <span className="sr-only">Search inbox</span>
        <input
          placeholder="Search subject or sender…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="mail-controls">
        <label>
          Mailbox demonstration
          <select
            aria-label="Mailbox demonstration"
            value={mailScenario}
            onChange={(e) => setMailScenario(e.target.value as MailScenario)}
          >
            <option value="normal">Receive next demo email</option>
            <option value="reply">Receive Safari reply</option>
            <option value="duplicate">Replay duplicate messages</option>
            <option value="unavailable">Simulate mailbox outage</option>
          </select>
        </label>
        <button className="secondary" disabled={mailBusy} onClick={sync}>
          {mailBusy ? "Refreshing…" : "Refresh mailbox ↻"}
        </button>
      </div>
      {mailError && (
        <p className="warning" role="status">
          Connection warning: {mailError} Existing items remain available.
        </p>
      )}
      <InboxList
        visible={visible}
        itemId={itemId}
        busy={!!busy}
        onSelect={onSelect}
      />
      <button
        className="text-button"
        disabled={!!busy}
        onClick={() => setShowManual((v) => !v)}
      >
        + Add a pasted email
      </button>
      {showManual && <ManualEmailForm busy={!!busy} onSubmit={submitManual} />}
    </aside>
  );
}
