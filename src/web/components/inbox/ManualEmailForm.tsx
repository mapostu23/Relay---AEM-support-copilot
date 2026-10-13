import { useState } from "react";
import type { ManualEmail } from "../../types.js";
const newEmail = (): ManualEmail => ({
  sender: "demo-affiliate@example.com",
  subject: "",
  body: "",
  affectedUrl: "",
  messageId: crypto.randomUUID(),
  threadId: crypto.randomUUID(),
});
export function ManualEmailForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (email: ManualEmail) => Promise<boolean>;
}) {
  const [manual, setManual] = useState(newEmail);
  const submitManual = async () => {
    if (await onSubmit(manual)) setManual(newEmail());
  };
  return (
    <form
      className="manual"
      onSubmit={(e) => {
        e.preventDefault();
        void submitManual();
      }}
    >
      <p>
        Manual intake stays local until you choose a model. Use fictional or
        sanitized text.
      </p>
      <label>
        Sender
        <input
          type="email"
          required
          value={manual.sender}
          onChange={(e) => setManual({ ...manual, sender: e.target.value })}
        />
      </label>
      <label>
        Subject
        <input
          required
          maxLength={200}
          value={manual.subject}
          onChange={(e) => setManual({ ...manual, subject: e.target.value })}
        />
      </label>
      <label>
        Affected URL
        <input
          type="url"
          value={manual.affectedUrl}
          onChange={(e) =>
            setManual({ ...manual, affectedUrl: e.target.value })
          }
        />
      </label>
      <label>
        Email body
        <textarea
          required
          maxLength={12000}
          rows={5}
          value={manual.body}
          onChange={(e) => setManual({ ...manual, body: e.target.value })}
        />
      </label>
      <button className="primary" disabled={busy}>
        Save local email
      </button>
    </form>
  );
}
