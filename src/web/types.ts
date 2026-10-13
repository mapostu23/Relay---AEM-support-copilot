import type {
  Config,
  CustomerConfig,
  WorkItem,
  Audit,
  Review,
  Provider,
} from "../shared/types.js";
export type Settings = Config & { customer: CustomerConfig };
export type WorkspaceView =
  "email" | "analysis" | "review" | "draft" | "activity";
export interface AutomaticStatus {
  phase: "queued" | "running" | "completed" | "failed" | "cancelled";
  message: string;
}
export type ItemResult = {
  item: WorkItem;
  audit: Audit[];
  automaticAnalysis?: AutomaticStatus | null;
};
export type MailScenario = "normal" | "reply" | "duplicate" | "unavailable";
export interface ManualEmail {
  sender: string;
  subject: string;
  body: string;
  affectedUrl: string;
  messageId: string;
  threadId: string;
}
export interface AnalysisOptions {
  provider: Provider;
  model: string;
  cloudConsent: boolean;
}
export interface ModelSelection {
  provider: Provider;
  model: string;
  consent: boolean;
  selectProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  setConsent: (consent: boolean) => void;
}
export type PatchReview = <K extends keyof Review>(
  key: K,
  value: Review[K],
) => void;
export interface ReviewEditor {
  review: Review | null;
  reviewAck: boolean;
  dirty: boolean;
  draftSubject: string;
  draftBody: string;
  draftAck: boolean;
  patch: PatchReview;
  setReviewAck: (v: boolean) => void;
  setDraftSubject: (v: string) => void;
  setDraftBody: (v: string) => void;
  setDraftAck: (v: boolean) => void;
  setDirty: (v: boolean) => void;
}
