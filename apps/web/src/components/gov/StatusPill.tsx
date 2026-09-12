import type { ChangeStatus, ExceptionStatus } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

const CHANGE_STYLES: Record<ChangeStatus, string> = {
  DRAFT: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  AI_ANALYZED: "border-accent/40 bg-accent/10 text-accent",
  PENDING_REVIEW: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  SIMULATION_REQUIRED: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  APPROVAL_REQUIRED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  APPROVED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  REJECTED: "border-red-500/40 bg-red-500/10 text-red-300",
  CHANGES_REQUESTED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  EXECUTING: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  VERIFICATION: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  SUCCESS: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  FAILED: "border-red-500/40 bg-red-500/10 text-red-300",
  ROLLBACK_RECOMMENDED: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  ROLLED_BACK: "border-red-500/40 bg-red-500/10 text-red-300",
};

export function StatusPill({ status }: { status: ChangeStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap", CHANGE_STYLES[status] ?? CHANGE_STYLES.DRAFT)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

const EXCEPTION_STYLES: Record<ExceptionStatus, string> = {
  OPEN: "border-red-500/40 bg-red-500/10 text-red-300",
  UNDER_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  ACCEPTED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  REMEDIATION_REQUESTED: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  ESCALATED: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  COMPENSATED: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  CLOSED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

export function ExceptionStatusPill({ status }: { status: ExceptionStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap", EXCEPTION_STYLES[status] ?? EXCEPTION_STYLES.CLOSED)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {status.replaceAll("_", " ")}
    </span>
  );
}