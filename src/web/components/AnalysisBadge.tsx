import { hasCurrentAnalysis, type WorkItem } from "../../shared/types.js";
export function AnalysisBadge({ item }: { item: WorkItem }) {
  if (!hasCurrentAnalysis(item) || item.analysis?.meta.provider !== "ollama")
    return null;
  return (
    <span
      className="analysis-badge"
      title="Ollama has analyzed the current conversation. Human review is still required."
    >
      Ollama
    </span>
  );
}
