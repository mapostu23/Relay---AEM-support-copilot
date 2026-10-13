import { demoMessages } from "../../data/mailbox.js";
import { AppError, type Message } from "../shared/types.js";
import { Store } from "./store.js";
export interface MailboxAdapter {
  fetch(cursor: number): Promise<{ messages: Message[]; nextCursor: number }>;
}
export class DemoMailbox implements MailboxAdapter {
  constructor(private mode = "normal") {}
  async fetch(cursor: number) {
    if (this.mode === "unavailable")
      throw new AppError(
        "mailbox_unavailable",
        "Demo mailbox outage. Stored messages remain available; retry sync.",
        503,
      );
    if (this.mode === "duplicate")
      return {
        messages: [demoMessages[0], demoMessages[0]],
        nextCursor: cursor,
      };
    if (this.mode === "reply")
      return {
        messages: [
          {
            ...demoMessages[1],
            messageId: "demo-reply-safari",
            subject: "Re: Registration fails on iPhone Safari",
            body: "Update: Safari 18.1 on iOS 18 is affected. Around 40 users reported failure. We have no workaround yet.",
            receivedAt: "2026-10-08T12:30:00Z",
            attachments: [],
          },
        ],
        nextCursor: cursor,
      };
    return {
      messages: demoMessages.slice(cursor, cursor + 1),
      nextCursor: Math.min(cursor + 1, demoMessages.length),
    };
  }
}
export function seedMailbox(store: Store) {
  if (store.state("seeded") === "yes") return;
  store.ingest(demoMessages.slice(0, 10));
  store.setState("cursor", "10");
  store.setState("seeded", "yes");
}
export async function syncMailbox(store: Store, adapter: MailboxAdapter) {
  const cursor = Number(store.state("cursor") || 0),
    batch = await adapter.fetch(cursor);
  const result = store.ingest(batch.messages);
  // The next cursor is written after the durable message transaction. A crash in between
  // replays the same page safely through the provider+message ID unique constraint.
  store.setState("cursor", String(batch.nextCursor));
  return result;
}
