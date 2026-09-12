import type { ChangeRequest } from "@nexus/shared-types";
import { ScanSearch, FlaskConical, ShieldCheck, Play, RotateCcw, Snowflake, UserCheck, Lock } from "lucide-react";
import { cn } from "../../utils/cn";

export interface SafetyGateActions {
  onAnalyze?: () => void;
  onSimulate?: () => void;
  onRequestApproval?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestChanges?: () => void;
  onExecute?: () => void;
  onRollback?: () => void;
  onVerify?: () => void;
  onToggleFreeze?: () => void;
  busy?: boolean;
}

export function SafetyGate({ change, freeze, actions, isReviewer }: { change: ChangeRequest; freeze: { active: boolean; reason?: string }; actions: SafetyGateActions; isReviewer: boolean }) {
  const step = (label: string, done: boolean, current: boolean, index: number) => (
    <div className={cn("flex items-center gap-2", !done && !current && "opacity-40")}>
      <span
        className={cn(
          "w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0",
          done ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : current ? "border-accent bg-accent/10 text-accent animate-pulse-dot" : "border-surface-700 text-slate-600"
        )}
      >
        {done ? "✓" : index + 1}
      </span>
      <span className={cn("text-xs font-medium", done ? "text-slate-300" : current ? "text-accent" : "text-slate-600")}>{label}</span>
    </div>
  );

  const indexOf = (s: ChangeRequest["status"]) => {
    const order: ChangeRequest["status"][] = [
      "DRAFT",
      "AI_ANALYZED",
      "PENDING_REVIEW",
      "SIMULATION_REQUIRED",
      "APPROVAL_REQUIRED",
      "APPROVED",
      "EXECUTING",
      "VERIFICATION",
      "SUCCESS",
    ];
    const i = order.indexOf(s);
    return i === -1 ? order.length : i;
  };
  const cur = indexOf(change.status);
  const labels = ["Draft", "AI analysis", "Review", "Simulation", "Approval", "Execute", "Verify", "Done"];

  const blocksafety = freeze.active && !["SUCCESS", "REJECTED", "ROLLED_BACK", "ROLLBACK_RECOMMENDED"].includes(change.status);

  return (
    <div className="rounded-xl border border-surface-700 bg-surface-850/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Lock className="w-4 h-4 text-accent" aria-hidden="true" />
          Safety gate
        </div>
        <button
          onClick={actions.onToggleFreeze}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
            freeze.active ? "border-sky-500/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20" : "border-surface-700 bg-surface-800/60 text-slate-400 hover:text-slate-200"
          )}
        >
          <Snowflake className="w-3.5 h-3.5" aria-hidden="true" />
          {freeze.active ? "Freeze active — disable" : "Activate change freeze"}
        </button>
      </div>

      {freeze.active ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-200/90">
          <Snowflake className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold">Change freeze is active.</span> {freeze.reason ?? "No executing, approving or rolling back of changes is permitted."}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {labels.map((l, i) => step(l, i < cur, i === cur, i))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {change.status === "DRAFT" && actions.onAnalyze ? (
          <button className="btn-primary text-xs" onClick={actions.onAnalyze} disabled={actions.busy}>
            <ScanSearch className="w-3.5 h-3.5" aria-hidden="true" /> Run AI analysis
          </button>
        ) : null}
        {["AI_ANALYZED", "PENDING_REVIEW", "SIMULATION_REQUIRED"].includes(change.status) && actions.onSimulate ? (
          <button className="btn-primary text-xs" onClick={actions.onSimulate} disabled={actions.busy}>
            <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" /> Run simulation
          </button>
        ) : null}
        {["AI_ANALYZED", "PENDING_REVIEW", "SIMULATION_REQUIRED", "APPROVAL_REQUIRED"].includes(change.status) && actions.onRequestApproval ? (
          <button className="btn-outline text-xs" onClick={actions.onRequestApproval} disabled={actions.busy}>
            <UserCheck className="w-3.5 h-3.5" aria-hidden="true" /> Request approval
          </button>
        ) : null}
        {change.status === "APPROVAL_REQUIRED" && isReviewer ? (
          <>
            <button className="btn-primary text-xs" onClick={actions.onApprove} disabled={actions.busy || blocksafety}>
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Approve
            </button>
            <button className="btn-danger text-xs" onClick={actions.onReject} disabled={actions.busy || blocksafety}>
              Reject
            </button>
          </>
        ) : null}
        {change.status === "APPROVED" && actions.onExecute ? (
          <button className="btn-primary text-xs" onClick={actions.onExecute} disabled={actions.busy || blocksafety}>
            <Play className="w-3.5 h-3.5" aria-hidden="true" /> Execute change
          </button>
        ) : null}
        {change.status === "VERIFICATION" && actions.onVerify ? (
          <button className="btn-primary text-xs" onClick={actions.onVerify} disabled={actions.busy}>
            Verify & close
          </button>
        ) : null}
        {["FAILED", "ROLLBACK_RECOMMENDED"].includes(change.status) && actions.onRollback ? (
          <button className="btn-danger text-xs" onClick={actions.onRollback} disabled={actions.busy || blocksafety}>
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Execute rollback
          </button>
        ) : null}
      </div>
    </div>
  );
}