import { useCallback, useReducer } from "react";
import type { WorkItem, Review } from "../../shared/types.js";
import type { ReviewEditor, PatchReview } from "../types.js";
import { reviewFrom } from "../lib/review.js";
interface EditorState {
  review: Review | null;
  reviewAck: boolean;
  dirty: boolean;
  draftSubject: string;
  draftBody: string;
  draftAck: boolean;
}
type Action =
  | { type: "reset"; item: WorkItem }
  | { type: "review"; patch: Partial<Review> }
  | { type: "reviewAck" | "draftAck" | "dirty"; value: boolean }
  | { type: "draftSubject" | "draftBody"; value: string };
const initial: EditorState = {
  review: null,
  reviewAck: false,
  dirty: false,
  draftSubject: "",
  draftBody: "",
  draftAck: false,
};
function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "reset":
      return {
        ...initial,
        review: reviewFrom(action.item),
        draftSubject: action.item.draft?.subject || "",
        draftBody: action.item.draft?.body || "",
      };
    case "review":
      return {
        ...state,
        review: state.review ? { ...state.review, ...action.patch } : null,
        dirty: true,
        reviewAck: false,
      };
    case "draftSubject":
    case "draftBody":
      return {
        ...state,
        [action.type]: action.value,
        dirty: true,
        draftAck: false,
      };
    case "reviewAck":
    case "draftAck":
      return { ...state, [action.type]: action.value };
    case "dirty":
      return { ...state, dirty: action.value };
  }
}
export function useReviewEditor(): ReviewEditor & {
  reset: (item: WorkItem) => void;
} {
  const [state, dispatch] = useReducer(reducer, initial);
  const reset = useCallback(
    (item: WorkItem) => dispatch({ type: "reset", item }),
    [],
  );
  const patch: PatchReview = useCallback(
    <K extends keyof Review>(key: K, value: Review[K]) => {
      dispatch({
        type: "review",
        patch: {
          [key]: value,
          ...(key === "program" || key === "category" ? { teamId: "" } : {}),
        },
      });
    },
    [],
  );
  return {
    ...state,
    reset,
    patch,
    setReviewAck: (value) => dispatch({ type: "reviewAck", value }),
    setDraftAck: (value) => dispatch({ type: "draftAck", value }),
    setDirty: (value) => dispatch({ type: "dirty", value }),
    setDraftSubject: (value) => dispatch({ type: "draftSubject", value }),
    setDraftBody: (value) => dispatch({ type: "draftBody", value }),
  };
}
