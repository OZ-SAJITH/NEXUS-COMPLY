import { cn } from "../utils/cn";

const STYLES: Record<string, { box: string; label: string }> = {
  AI_GENERATED: { box: "text-slate-400 border-slate-500/40 bg-slate-500/10", label: "AI Generated" },
  PENDING_REVIEW: { box: "text-amber-300 border-amber-500/40 bg-status-warn-soft", label: "Pending Human Review" },
  CHANGES_REQUESTED: { box: "text-pink-300 border-pink-500/40 bg-pink-500/10", label: "Changes Requested" },
  APPROVED: { box: "text-emerald-300 border-emerald-500/40 bg-status-ok-soft", label: "Human Approved" },
  REJECTED: { box: "text-red-300 border-red-500/40 bg-status-danger-soft", label: "Human Rejected" },
  RESOLVED: { box: "text-teal-300 border-teal-500/40 bg-teal-500/10", label: "Resolved" },
};

export function ReviewStatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STYLES[status] ?? { box: "text-slate-400 border-slate-500/40 bg-slate-500/10", label: status.replaceAll("_", " ") };
  return <span className={cn("chip border font-medium uppercase tracking-wide", s.box)}>{label ?? s.label}</span>;
}