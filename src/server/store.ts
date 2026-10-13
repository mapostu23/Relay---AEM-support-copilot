import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AppError,
  MessageSchema,
  type Message,
  type WorkItem,
  type Audit,
  type ActivityEntry,
  type DuplicateEmail,
} from "../shared/types.js";
export class Store {
  db: DatabaseSync;
  constructor(filename = ".runtime/relay.sqlite") {
    if (filename !== ":memory:")
      fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS work_items(id TEXT PRIMARY KEY, provider TEXT NOT NULL, thread_id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(provider,thread_id));
      CREATE TABLE IF NOT EXISTS messages(provider TEXT NOT NULL,message_id TEXT NOT NULL,item_id TEXT NOT NULL,PRIMARY KEY(provider,message_id));
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,item_id TEXT NOT NULL,event TEXT NOT NULL,at TEXT NOT NULL,details TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS duplicate_emails(provider TEXT NOT NULL,message_id TEXT NOT NULL,item_id TEXT NOT NULL,count INTEGER NOT NULL,first_at TEXT NOT NULL,last_at TEXT NOT NULL,PRIMARY KEY(provider,message_id));
      CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
  }
  get(id: string): WorkItem {
    const row = this.db
      .prepare("SELECT payload FROM work_items WHERE id=?")
      .get(id);
    if (!row) throw new AppError("not_found", "Work item not found.", 404);
    return JSON.parse(row.payload as string);
  }
  list(): WorkItem[] {
    return this.db
      .prepare("SELECT payload FROM work_items")
      .all()
      .map((r) => JSON.parse(r.payload as string))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  save(item: WorkItem) {
    this.db
      .prepare(
        "INSERT INTO work_items(id,provider,thread_id,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(item.id, item.provider, item.threadId, JSON.stringify(item));
  }
  state(key: string): string | null {
    return (
      (this.db.prepare("SELECT value FROM state WHERE key=?").get(key)
        ?.value as string) ?? null
    );
  }
  setState(key: string, value: string) {
    this.db
      .prepare(
        "INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  audit(id: string, event: string, details: Record<string, unknown> = {}) {
    this.db
      .prepare("INSERT INTO audit(item_id,event,at,details) VALUES(?,?,?,?)")
      .run(id, event, new Date().toISOString(), JSON.stringify(details));
  }
  history(id: string): Audit[] {
    this.get(id);
    return this.db
      .prepare(
        "SELECT id,event,at,details FROM audit WHERE item_id=? ORDER BY id DESC LIMIT 100",
      )
      .all(id)
      .map((r) => ({
        id: Number(r.id),
        event: r.event as string,
        at: r.at as string,
        details: JSON.parse(r.details as string),
      }));
  }
  activity(options: {
    limit: number;
    before?: number;
    query: string;
    severity: string;
  }) {
    const rows = this.db
      .prepare(
        `
      SELECT id,item_id,event,at,details FROM audit
      WHERE (? IS NULL OR id < ?)
        AND (? = '' OR instr(lower(item_id || ' ' || event || ' ' || details), lower(?)) > 0)
        AND (? = 'all' OR
          CASE WHEN event LIKE '%failed%' THEN 'error'
               WHEN event LIKE '%cancelled%' THEN 'warning' ELSE 'info' END = ?)
      ORDER BY id DESC LIMIT ?
    `,
      )
      .all(
        options.before ?? null,
        options.before ?? null,
        options.query,
        options.query,
        options.severity,
        options.severity,
        options.limit + 1,
      );
    const entries: ActivityEntry[] = rows.slice(0, options.limit).map((r) => ({
      id: Number(r.id),
      itemId: String(r.item_id),
      event: String(r.event),
      at: String(r.at),
      details: JSON.parse(String(r.details)),
    }));
    return {
      entries,
      nextBefore: rows.length > options.limit ? entries.at(-1)!.id : null,
    };
  }
  duplicates(): DuplicateEmail[] {
    return this.db
      .prepare(
        "SELECT * FROM duplicate_emails ORDER BY last_at DESC,provider,message_id",
      )
      .all()
      .map((row) => {
        const item = this.get(String(row.item_id));
        const message = item.messages.find(
          (m) => m.messageId === row.message_id,
        )!;
        return {
          itemId: item.id,
          provider: String(row.provider),
          messageId: String(row.message_id),
          subject: message.subject,
          sender: message.sender,
          count: Number(row.count),
          firstDetectedAt: String(row.first_at),
          lastDetectedAt: String(row.last_at),
        };
      });
  }
  exportActivity(): ActivityEntry[] {
    return this.db
      .prepare("SELECT id,item_id,event,at,details FROM audit ORDER BY id DESC")
      .all()
      .map((row) => ({
        id: Number(row.id),
        itemId: String(row.item_id),
        event: String(row.event),
        at: String(row.at),
        details: JSON.parse(String(row.details)),
      }));
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  update(
    id: string,
    revision: number,
    work: (item: WorkItem) => void,
  ): WorkItem {
    return this.transaction(() => {
      const item = this.get(id);
      if (item.revision !== revision)
        throw new AppError(
          "revision_conflict",
          "New email or review changes arrived. Reload this item before saving.",
          409,
        );
      work(item);
      item.revision++;
      item.updatedAt = new Date().toISOString();
      this.save(item);
      return item;
    });
  }
  ingest(raw: unknown[]): {
    created: number;
    duplicates: number;
    replies: number;
    ids: string[];
  } {
    // Validate the whole bounded batch before committing anything or advancing the cursor.
    if (raw.length > 50)
      throw new AppError("batch_limit", "Maximum 50 messages per batch.", 400);
    const messages = raw
      .map((m) => MessageSchema.parse(m))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    return this.transaction(() => {
      let created = 0,
        duplicates = 0,
        replies = 0;
      const ids: string[] = [];
      for (const message of messages) {
        const duplicate = this.db
          .prepare(
            "SELECT item_id FROM messages WHERE provider=? AND message_id=?",
          )
          .get(message.provider, message.messageId);
        if (duplicate) {
          const detectedAt = new Date().toISOString();
          this.db
            .prepare(
              `INSERT INTO duplicate_emails(provider,message_id,item_id,count,first_at,last_at)
            VALUES(?,?,?,1,?,?) ON CONFLICT(provider,message_id)
            DO UPDATE SET count=count+1,last_at=excluded.last_at`,
            )
            .run(
              message.provider,
              message.messageId,
              duplicate.item_id as string,
              detectedAt,
              detectedAt,
            );
          this.audit(duplicate.item_id as string, "duplicate_received", {
            messageId: message.messageId,
            provider: message.provider,
            originalTicketPreserved: true,
          });
          duplicates++;
          continue;
        }
        const existing = this.db
          .prepare("SELECT id FROM work_items WHERE provider=? AND thread_id=?")
          .get(message.provider, message.threadId);
        let item: WorkItem;
        if (existing) {
          item = this.get(existing.id as string);
          if (item.messages.length >= 30)
            throw new AppError(
              "thread_limit",
              "Thread limit reached; archive or split manually.",
              400,
            );
          item.messages.push(message);
          item.messages.sort((a, b) =>
            a.receivedAt.localeCompare(b.receivedAt),
          );
          item.revision++;
          item.unread = true;
          item.status = "new";
          item.review = null;
          item.draft = null;
          item.updatedAt = new Date().toISOString();
          this.audit(item.id, "reply_received", {
            messageId: message.messageId,
            previousAnalysisRetained: !!item.analysis,
            reviewInvalidated: true,
          });
          replies++;
        } else {
          if (
            (this.db.prepare("SELECT COUNT(*) AS n FROM work_items").get()!
              .n as number) >= 5000
          )
            throw new AppError(
              "capacity",
              "Local work item limit reached.",
              503,
            );
          let newId: string;
          do {
            newId = `AEM-${randomUUID().slice(0, 8).toUpperCase()}`;
          } while (
            this.db.prepare("SELECT id FROM work_items WHERE id=?").get(newId)
          );
          item = {
            id: newId,
            provider: message.provider,
            threadId: message.threadId,
            subject: message.subject,
            sender: message.sender,
            receivedAt: message.receivedAt,
            updatedAt: message.receivedAt,
            status: "new",
            revision: 1,
            unread: true,
            messages: [message],
            analysis: null,
            review: null,
            draft: null,
          };
          created++;
          this.audit(item.id, "email_ingested", {
            messageId: message.messageId,
          });
        }
        this.save(item);
        this.db
          .prepare(
            "INSERT INTO messages(provider,message_id,item_id) VALUES(?,?,?)",
          )
          .run(message.provider, message.messageId, item.id);
        ids.push(item.id);
      }
      return { created, duplicates, replies, ids };
    });
  }
  close() {
    this.db.close();
  }
}
