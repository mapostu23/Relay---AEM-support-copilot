import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { Store } from "../src/server/store.js";
import { loadSettings } from "../src/server/config.js";
import { loadCustomer } from "../src/server/routing.js";
function setup() {
  const store = new Store(":memory:");
  const app = createApp(
    loadSettings(),
    store,
    loadCustomer(),
    undefined,
    () => {},
    false,
  );
  return { app, store };
}
describe("centralized activity", () => {
  it("exports every stored event rather than only the displayed page or filters", async () => {
    const a = setup();
    try {
      const id = a.store.list()[0].id;
      for (let n = 0; n < 115; n++)
        a.store.audit(id, "analysis_started", { requestId: `export-${n}` });
      const download = await request(a.app).get("/api/activity/export");
      expect(download.status).toBe(200);
      expect(download.headers["content-disposition"]).toContain("attachment;");
      expect(download.headers["content-disposition"]).toContain(".json");
      expect(download.body.entries).toHaveLength(125);
      expect(download.body.entries[0].details.requestId).toBe("export-114");
      expect(download.body.entries.at(-1).event).toBe("email_ingested");
      expect(download.text).not.toContain(a.store.list()[0].messages[0].body);
    } finally {
      a.store.close();
    }
  });
  it("paginates across tickets without duplicates when new events arrive", async () => {
    const a = setup();
    try {
      const first = await request(a.app).get("/api/activity?limit=4");
      expect(first.status).toBe(200);
      expect(
        new Set(first.body.entries.map((e: { itemId: string }) => e.itemId))
          .size,
      ).toBe(4);
      a.store.audit(a.store.list()[0].id, "analysis_started", {
        requestId: "new-request",
      });
      const next = await request(a.app).get(
        `/api/activity?limit=4&before=${first.body.nextBefore}`,
      );
      expect(
        next.body.entries.every(
          (e: { id: number }) => e.id < first.body.nextBefore,
        ),
      ).toBe(true);
      expect(next.body.entries).toHaveLength(4);
      expect(JSON.stringify(first.body)).not.toContain(
        a.store.list()[0].messages[0].body,
      );
    } finally {
      a.store.close();
    }
  });
  it("filters diagnostic codes and ticket IDs by severity with literal search", async () => {
    const a = setup();
    try {
      const id = a.store.list()[0].id;
      a.store.audit(id, "analysis_failed", {
        code: "timeout",
        requestId: "diagnostic-123",
      });
      a.store.audit(id, "analysis_cancelled", { code: "cancelled" });
      const errors = await request(a.app).get(
        "/api/activity?severity=error&query=diagnostic-123",
      );
      expect(errors.body.entries).toHaveLength(1);
      expect(errors.body.entries[0]).toMatchObject({
        itemId: id,
        event: "analysis_failed",
        details: { code: "timeout" },
      });
      const warnings = await request(a.app).get(
        `/api/activity?severity=warning&query=${id}`,
      );
      expect(warnings.body.entries).toHaveLength(1);
      const literal = await request(a.app).get(
        "/api/activity?query=%27%20OR%201=1%20--",
      );
      expect(literal.body.entries).toEqual([]);
      for (const query of ["limit=101", "before=-1", "severity=unknown"]) {
        expect(
          (await request(a.app).get(`/api/activity?${query}`)).status,
        ).toBe(400);
      }
    } finally {
      a.store.close();
    }
  });
});
