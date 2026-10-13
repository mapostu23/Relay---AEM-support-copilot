import { it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/server/store.js";
import { createApp } from "../src/server/app.js";
import { loadSettings } from "../src/server/config.js";
import { loadCustomer } from "../src/server/routing.js";
import { demoMessages } from "../data/mailbox.js";
it("groups replayed email receipts separately without changing the original ticket", async () => {
  const store = new Store(":memory:");
  const app = createApp(
    loadSettings({}),
    store,
    loadCustomer(),
    undefined,
    () => {},
    false,
  );
  try {
    const original = store
      .list()
      .find((item) => item.threadId === demoMessages[0].threadId)!;
    const response = await request(app)
      .post("/api/mailbox/sync")
      .send({ scenario: "duplicate" });
    expect(response.body).toMatchObject({
      created: 0,
      duplicates: 2,
      replies: 0,
      ids: [],
    });
    expect(store.get(original.id)).toEqual(original);
    const inbox = await request(app).get("/api/items");
    expect(inbox.body.items).toHaveLength(10);
    expect(inbox.body.duplicates).toHaveLength(1);
    expect(inbox.body.duplicates[0]).toMatchObject({
      itemId: original.id,
      messageId: demoMessages[0].messageId,
      count: 2,
      subject: original.subject,
    });
    expect(
      store
        .history(original.id)
        .filter((a) => a.event === "duplicate_received"),
    ).toHaveLength(2);
  } finally {
    store.close();
  }
});
it("retains duplicate delivery counts across database restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "relay-duplicates-"));
  let store = new Store(join(directory, "test.sqlite"));
  try {
    const first = store.ingest([demoMessages[0]]);
    store.ingest([demoMessages[0], demoMessages[0]]);
    store.close();
    store = new Store(join(directory, "test.sqlite"));
    expect(store.duplicates()).toHaveLength(1);
    expect(store.duplicates()[0]).toMatchObject({
      count: 2,
      itemId: first.ids[0],
    });
    expect(store.list()).toHaveLength(1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
