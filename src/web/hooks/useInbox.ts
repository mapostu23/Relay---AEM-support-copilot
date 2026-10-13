import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkItem, DuplicateEmail } from "../../shared/types.js";
import type { Settings, MailScenario } from "../types.js";
import { api } from "../lib/api.js";
interface InboxResponse {
  items: WorkItem[];
  duplicates?: DuplicateEmail[];
  mailbox: { error: string | null };
}
export function useInbox() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateEmail[]>([]);
  const [mailError, setMailError] = useState("");
  const [error, setError] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailScenario, setMailScenario] = useState<MailScenario>("normal");
  const lifetime = useRef<AbortController | null>(null);
  const listRequest = useRef(0);
  const refresh = useCallback(async () => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    const sequence = ++listRequest.current;
    const result = await api<InboxResponse>(
      "/api/items",
      "GET",
      undefined,
      signal,
    );
    if (signal.aborted || sequence !== listRequest.current) return;
    setItems(result.items);
    setDuplicates(result.duplicates || []);
    setMailError(result.mailbox.error || "");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    api<Settings>("/api/config", "GET", undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSettings(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    refresh().catch((e) => {
      if (!controller.signal.aborted) setError(String(e));
    });
    const timer = setInterval(() => {
      refresh().catch((e) => {
        if (!controller.signal.aborted)
          setMailError(`Inbox refresh failed: ${String(e)}`);
      });
    }, 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  const sync = async (): Promise<string | null> => {
    setMailBusy(true);
    setError("");
    try {
      const result = await api<{
        created: number;
        duplicates: number;
        replies: number;
      }>(
        "/api/mailbox/sync",
        "POST",
        { scenario: mailScenario },
        lifetime.current?.signal,
      );
      await refresh();
      return `${result.created} new item${result.created === 1 ? "" : "s"}, ${result.replies} repl${result.replies === 1 ? "y" : "ies"}, ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} ignored.`;
    } catch (e) {
      if (!lifetime.current?.signal.aborted) {
        setMailError(String(e));
        setError(String(e));
      }
      return null;
    } finally {
      if (!lifetime.current?.signal.aborted) setMailBusy(false);
    }
  };
  return {
    settings,
    items,
    duplicates,
    mailError,
    error,
    setError,
    mailBusy,
    mailScenario,
    setMailScenario,
    refresh,
    sync,
  };
}
