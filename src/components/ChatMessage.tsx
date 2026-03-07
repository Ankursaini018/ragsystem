import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Citation } from "@/lib/rag-api";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidenceScore?: number;
  latencyMs?: number;
}

export function ChatMessage({
  role,
  content,
  citations,
  confidenceScore,
  latencyMs,
}: ChatMessageProps) {
  const [showSources, setShowSources] = useState(false);
  const isUser = role === "user";

  const getConfidenceLabel = (score: number) => {
    if (score >= 0.7) return { label: "High", className: "metric-badge-success" };
    if (score >= 0.4) return { label: "Medium", className: "metric-badge-warning" };
    return { label: "Low", className: "" };
  };

  return (
    <div
      className={cn(
        "flex gap-4 animate-fade-in",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Message content */}
      <div className={cn("flex flex-col gap-2 max-w-[80%]", isUser && "items-end")}>
        <div
          className={cn(
            "px-4 py-3",
            isUser ? "message-user" : "message-assistant"
          )}
        >
          <p className="whitespace-pre-wrap leading-relaxed">
            {content}
          </p>
        </div>

        {/* Metrics and citations for assistant messages */}
        {!isUser && (confidenceScore !== undefined || citations?.length) && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            {confidenceScore !== undefined && (
              <span
                className={cn(
                  "metric-badge",
                  getConfidenceLabel(confidenceScore).className
                )}
              >
                {getConfidenceLabel(confidenceScore).label} confidence (
                {Math.round(confidenceScore * 100)}%)
              </span>
            )}
            {latencyMs !== undefined && (
              <span className="metric-badge">{latencyMs}ms</span>
            )}
            {citations && citations.length > 0 && (
              <button
                onClick={() => setShowSources(!showSources)}
                className="citation-link"
              >
                <FileText className="w-3 h-3" />
                {citations.length} source{citations.length > 1 ? "s" : ""}
                {showSources ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Expanded sources */}
        {showSources && citations && citations.length > 0 && (
          <div className="w-full space-y-2 animate-fade-in">
            {citations.map((citation, idx) => (
              <div key={citation.chunkId} className="source-card">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-primary">
                    Source {idx + 1}: {citation.metadata.title || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {Math.round(citation.similarity * 100)}% match
                  </span>
                </div>
                <div className="rounded-md bg-muted/50 p-3 border border-border/30">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {citation.content}
                  </p>
                </div>
                {citation.metadata.sourceUrl && (
                  <a
                    href={citation.metadata.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View source
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
