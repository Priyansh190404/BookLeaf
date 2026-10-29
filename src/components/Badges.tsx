import type { Priority, Status } from "@/lib/validation";

export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`badge b-${status.replace(" ", "-")}`}>{status}</span>
);
export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`badge b-${priority}`}>{priority}</span>
);
export const SourceTag = ({ source }: { source: string }) =>
  source === "ai" ? <span className="tag" title="Set by AI">AI</span>
  : source === "admin" ? <span className="tag" title="Set by an admin">manual</span>
  : source === "fallback" ? <span className="tag" title="AI unavailable: keyword rules used. Please review.">auto*</span>
  : null;
