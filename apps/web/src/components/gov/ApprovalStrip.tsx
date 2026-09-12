import type { ApprovalDecision, ApprovalRecord } from "@nexus/shared-types";
import { ShieldCheck, ShieldX, RefreshCcw, Clock } from "lucide-react";
import { formatDate } from "../../utils/cn";

const DECISION_META: Record<ApprovalDecision, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
  REJECTED: { label: "Rejected", cls: "text-red-400 border-red-500/40 bg-red-500/10" },
  CHANGES_REQUESTED: { label: "Changes requested", cls: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
};

export function ApprovalStrip({ approvals, compact }: { approvals: ApprovalRecord[]; compact?: boolean }) {
  if (approvals.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        No approvals recorded yet.
      </div>
    );
  }
  const icon = (d: ApprovalDecision) =>
    d === "APPROVED" ? <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> : d === "REJECTED" ? <ShieldX className="w-3.5 h-3.5" aria-hidden="true" /> : <RefreshCcw className="w-3.5 h-3.5" aria-hidden="true" />;

  return (
    <ul className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {approvals.map((a) => {
        const meta = DECISION_META[a.decision];
        return (
          <li key={a.id} className="flex items-start gap-2.5 text-sm">
            <span className={compact ? "" : "mt-0.5"}>
              <span className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-medium gap-1 ${meta.cls}`}>
                {icon(a.decision)}
                {meta.label}
              </span>
            </span>
            <div className="min-w-0">
              <div className="text-slate-200">
                <span className="font-medium">{a.approverName}</span>
                <span className="text-slate-500 text-xs"> · {a.approverRole}</span>
                {a.isEmergency ? <span className="ml-1.5 text-[10px] uppercase tracking-wide text-orange-400 border border-orange-500/40 rounded px-1">emergency</span> : null}
              </div>
              {a.comment ? <p className="text-xs text-slate-400 leading-relaxed">{a.comment}</p> : null}
              <div className="text-[10px] text-slate-600 font-mono">{formatDate(a.at)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}