import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkItem, Audit } from "../../shared/types.js";
import type {
  ItemResult,
  AutomaticStatus,
  WorkspaceView,
  AnalysisOptions,
  ManualEmail,
} from "../types.js";
import { api } from "../lib/api.js";
import { useReviewEditor } from "./useReviewEditor.js";
// Coordinates work-item operations; presentation components only express user intent.
export function useWorkItem(refreshInbox: () => Promise<void>) {
  const [item, setItem] = useState<WorkItem | null>(null),
    [audit, setAudit] = useState<Audit[]>([]);
  const [view, setView] = useState<WorkspaceView>("email");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [replace, setReplace] = useState(false),
    [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [automaticStatus, setAutomaticStatus] =
    useState<AutomaticStatus | null>(null);
  const editor = useReviewEditor();
  const automaticMessage = useRef("");
  const dirty = useRef(false);
  dirty.current = editor.dirty;
  const { reset } = editor;
  const selected = useRef<string | null>(null),
    sequence = useRef(0),
    analysisRun = useRef(0);
  const lifetime = useRef<AbortController | null>(null),
    analysisAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      analysisAbort.current?.abort();
      sequence.current++;
      analysisRun.current++;
    };
  }, []);
  const install = useCallback(
    (result: ItemResult) => {
      setItem(result.item);
      setAudit(result.audit);
      reset(result.item);
      setReplace(false);
    },
    [reset],
  );
  const open = async (id: string) => {
    selected.current = id;
    const n = ++sequence.current;
    setError("");
    setAutomaticStatus(null);
    automaticMessage.current = "";
    setNotice("");
    try {
      await api(
        `/api/items/${id}/auto-analyze`,
        "POST",
        {},
        lifetime.current?.signal,
      );
      const result = await api<ItemResult>(
        `/api/items/${id}`,
        "GET",
        undefined,
        lifetime.current?.signal,
      );
      if (lifetime.current?.signal.aborted || n !== sequence.current) return;
      install(result);
      setAutomaticStatus(result.automaticAnalysis || null);
      automaticMessage.current = result.automaticAnalysis?.message || "";
      setNotice(automaticMessage.current);
      if (result.automaticAnalysis?.phase === "failed")
        setError(
          `${result.automaticAnalysis.message} Retry or choose OpenAI / Anthropic.`,
        );
      setView("email");
      await api(`/api/items/${id}/read`, "POST", {}, lifetime.current?.signal);
      await refreshInbox();
    } catch (e) {
      if (!lifetime.current?.signal.aborted && n === sequence.current)
        setError(String(e));
    }
  };
  // Poll background work without resetting an editor containing unsaved human changes.
  useEffect(() => {
    if (!item?.id) return;
    const id = item.id,
      n = sequence.current;
    const controller = new AbortController();
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api<ItemResult>(
          `/api/items/${id}`,
          "GET",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted || n !== sequence.current) return;
        setAudit(result.audit);
        setAutomaticStatus(result.automaticAnalysis || null);
        const message = result.automaticAnalysis?.message || "";
        const changed = automaticMessage.current !== message;
        if (changed) {
          automaticMessage.current = message;
          setNotice(message);
        }
        if (
          result.item.revision !== item.revision &&
          !dirty.current &&
          !analysisAbort.current
        ) {
          install(result);
          if (result.automaticAnalysis?.phase === "completed")
            setView("analysis");
          await refreshInbox();
        }
        if (changed && result.automaticAnalysis?.phase === "failed")
          setError(
            `${result.automaticAnalysis.message} Retry or choose OpenAI / Anthropic.`,
          );
      } catch (e) {
        if (!controller.signal.aborted)
          setError(`Background analysis refresh failed: ${String(e)}`);
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [item?.id, item?.revision, install, refreshInbox]);
  const select = (id: string) => {
    if (editor.dirty) setPendingSelection(id);
    else void open(id);
  };
  const discardAndOpen = () => {
    if (!pendingSelection) return;
    const id = pendingSelection;
    setPendingSelection(null);
    editor.setDirty(false);
    void open(id);
  };
  const mutate = async (
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    nextView?: WorkspaceView,
  ) => {
    if (!item) return;
    const id = item.id;
    setBusy(path);
    setError("");
    try {
      const result = await api<ItemResult>(
        `/api/items/${id}/${path}`,
        method,
        body,
        lifetime.current?.signal,
      );
      if (!lifetime.current?.signal.aborted && selected.current === id) {
        install(result);
        if (nextView) setView(nextView);
      }
      await refreshInbox();
    } catch (e) {
      if (!lifetime.current?.signal.aborted && selected.current === id)
        setError(String(e));
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy("");
    }
  };
  const analyze = async (options: AnalysisOptions) => {
    if (!item) return;
    if (
      busy ||
      analysisAbort.current ||
      ["queued", "running"].includes(automaticStatus?.phase || "")
    ) {
      setError(
        "Another operation is already running on this ticket. Wait for it to finish, or cancel the current analysis before trying again.",
      );
      return;
    }
    if ((item.review || editor.dirty) && !replace) {
      setReplace(true);
      return;
    }
    const n = ++analysisRun.current,
      id = item.id;
    const controller = new AbortController();
    analysisAbort.current = controller;
    setBusy("analyze");
    setError("");
    setNotice("");
    const signal = AbortSignal.any([
      controller.signal,
      lifetime.current!.signal,
    ]);
    try {
      const result = await api<ItemResult>(
        `/api/items/${id}/analyze`,
        "POST",
        { revision: item.revision, ...options },
        signal,
      );
      if (
        !signal.aborted &&
        analysisRun.current === n &&
        selected.current === id
      ) {
        install(result);
        setView("analysis");
      }
      await refreshInbox();
    } catch (e) {
      if (!lifetime.current?.signal.aborted && analysisRun.current === n)
        setError(
          signal.aborted
            ? "Analysis cancelled. Stored email and previous review are preserved."
            : String(e),
        );
    } finally {
      if (!lifetime.current?.signal.aborted && analysisRun.current === n) {
        analysisAbort.current = null;
        setBusy("");
        setReplace(false);
      }
    }
  };
  const cancel = () => {
    if (
      automaticStatus &&
      ["queued", "running"].includes(automaticStatus.phase)
    ) {
      void api(
        `/api/items/${item!.id}/auto-cancel`,
        "POST",
        {},
        lifetime.current?.signal,
      )
        .then(() =>
          setAutomaticStatus({
            phase: "cancelled",
            message:
              "Cancellation requested. You can retry or choose another provider.",
          }),
        )
        .catch((e) => setError(String(e)));
    }
    analysisAbort.current?.abort();
    analysisAbort.current = null;
    analysisRun.current++;
    setBusy("");
    setReplace(false);
    setNotice(
      "Cancellation requested. Reload the item if the server completed just before cancellation.",
    );
  };
  const saveReview = () => {
    if (item && editor.review)
      void mutate(
        "review",
        "PATCH",
        {
          revision: item.revision,
          review: {
            ...editor.review,
            actions: editor.review.actions.map((s) => s.trim()).filter(Boolean),
            missingInformation: editor.review.missingInformation
              .map((s) => s.trim())
              .filter(Boolean),
            acknowledged: true,
          },
        },
        "draft",
      );
  };
  const saveDraft = () => {
    if (item)
      void mutate(
        "draft",
        "PATCH",
        {
          revision: item.revision,
          subject: editor.draftSubject,
          body: editor.draftBody,
        },
        "draft",
      );
  };
  const approveDraft = () => {
    if (item)
      void mutate(
        "draft/approve",
        "POST",
        { revision: item.revision, acknowledged: true },
        "draft",
      );
  };
  const submitManual = async (email: ManualEmail): Promise<boolean> => {
    setBusy("manual");
    setError("");
    try {
      const result = await api<{ ids: string[] }>(
        "/api/mailbox/manual",
        "POST",
        {
          ...email,
          provider: "manual",
          receivedAt: new Date().toISOString(),
          attachments: [],
        },
        lifetime.current?.signal,
      );
      await refreshInbox();
      if (result.ids[0]) await open(result.ids[0]);
      return true;
    } catch (e) {
      if (!lifetime.current?.signal.aborted) setError(String(e));
      return false;
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy("");
    }
  };
  return {
    item,
    audit,
    view,
    setView,
    busy:
      busy ||
      (automaticStatus && ["queued", "running"].includes(automaticStatus.phase)
        ? "analyze"
        : ""),
    automaticStatus,
    error,
    setError,
    notice,
    setNotice,
    replace,
    setReplace,
    pendingSelection,
    setPendingSelection,
    editor,
    open,
    select,
    discardAndOpen,
    analyze,
    cancel,
    saveReview,
    saveDraft,
    approveDraft,
    submitManual,
  };
}
