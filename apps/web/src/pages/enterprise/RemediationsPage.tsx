import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, ChevronDown, Play, Reply, RotateCcw, ShieldCheck, ShieldX, ThumbsUp, Undo2, Wrench } from "lucide-react";
import type { RemediationRecord, RemediationStatus } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { SectionTitle, Stat } from "../../components/ui";
import { EnterpriseTabs, RemediationStatusBadge } from "./EnterpriseTabs";
import { RiskBandPill } from "../../components/gov/RiskBandPill";
import { cn, formatDate } from "../../utils/cn";

interface WorkflowProps {
  rem: RemediationRecord;
  busy: boolean;
  onAction: (fn: () => Promise<unknown>, label: string) => void;
}

function WorkflowButtons({ rem, busy, onAction }: WorkflowProps) {
  const s = rem.status;
  return (
    <div className="flex flex-wrap gap-2">
      {s === "PLANNED" || s === "VALIDATION_FAILED" ? (
        <button onClick={() => onAction(() => api.enterprise.validateRemediation(rem.id), "Validation")} disabled={busy} className="btn text-xs inline-flex items-center gap-1.5 !py-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Validate in sandbox
        </button>
      ) : null}
      {s === "VALIDATED" ? (
        <button onClick={() => onAction(() => api.enterprise.requestRemediationApproval(rem.id), "Approval request")} disabled={busy} className="btn text-xs inline-flex items-center gap-1.5 !py-1.5">
          <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" /> Submit for approval
        </button>
      ) : null}
      {s === "PENDING_APPROVAL" ? (
        <>
          <button onClick={() => onAction(() => api.enterprise.approveRemediation(rem.id), "Approval")} disabled={busy} className="btn-primary text-xs inline-flex items-center gap-1.5 !py-1.5">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Approve
          </button>
          <button onClick={() => onAction(() => api.enterprise.rejectRemediation(rem.id), "Rejection")} disabled={busy} className="btn !py-1.5 text-xs inline-flex items-center gap-1.5">
            <ShieldX className="w-3.5 h-3.5" aria-hidden="true" /> Reject
          </button>
        </>
      ) : null}
      {s === "APPROVED" ? (
        <button onClick={() => onAction(() => api.enterprise.executeRemediation(rem.id), "Execution")} disabled={busy} className="btn-primary text-xs inline-flex items-center gap-1.5 !py-1.5">
          <Play className="w-3.5 h-3.5" aria-hidden="true" /> Execute
        </button>
      ) : null}
      {s === "COMPLETED" ? (
        <button onClick={() => onAction(() => api.enterprise.verifyRemediation(rem.id), "Verification")} disabled={busy} className="btn text-xs inline-flex items-center gap-1.5 !py-1.5">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Re-scan & verify
        </button>
      ) : null}
      {s === "FAILED" ? (
        <button onClick={() => onAction(() => api.enterprise.rollbackRemediation(rem.id), "Rollback")} disabled={busy} className="btn !py-1.5 text-xs inline-flex items-center gap-1.5">
          <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Roll back to snapshot
        </button>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="text-xs">
      <span className="text-slate-500">{label}: </span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

function RemediationCard({ rem, busy, onAction, expanded, onToggle }: WorkflowProps & { expanded: boolean; onToggle: () => void }) {
  return (
    <div className="card !p-4">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex flex-wrap items-center gap-2">
          <RemediationStatusBadge status={rem.status} />
          <RiskBandPill band={rem.riskBand} />
          <span className="font-mono text-[11px] text-accent">{rem.proposedAction.actionType}</span>
          <span className="ml-auto text-[11px] text-slate-500 inline-flex items-center gap-1">
            {formatDate(rem.createdAt)} <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded ? "rotate-180" : "")} aria-hidden="true" />
          </span>
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-100">{rem.title}</div>
        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{rem.reason}</p>
      </button>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="font-mono">{rem.controlId}</span>
        <span>{rem.assetName}</span>
        <span>{rem.environment}</span>
        <span>impact {rem.proposedAction.impact}</span>
      </div>

      <div className="mt-3">
        <WorkflowButtons rem={rem} busy={busy} onAction={onAction} />
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-surface-700 pt-3">
          <DetailRow label="Proposal" value={rem.proposedAction.displayName} />
          <DetailRow label="Expected result" value={rem.proposedAction.expectedResult} />
          <DetailRow label="Parameters" value={<code className="font-mono text-[11px]">{JSON.stringify(rem.proposedAction.parameters)}</code>} />

          {rem.validation ? (
            <div className="rounded-lg border border-surface-700 p-3 text-xs">
              <div className="font-medium text-slate-200 mb-1 inline-flex items-center gap-2">
                Validation: <RemediationStatusBadge status={rem.validation.status === "PASS" ? "VALIDATED" : "VALIDATION_FAILED"} />
              </div>
              <p className="text-slate-400 mt-1">{rem.validation.message}</p>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">{rem.validation.simulatedOutput}</p>
              <p className="text-[11px] text-slate-600 mt-1">proposed state: <code>{JSON.stringify(rem.validation.proposedState)}</code></p>
            </div>
          ) : null}

          {rem.approval ? (
            <div className="rounded-lg border border-surface-700 p-3 text-xs">
              <div className="font-medium text-slate-200">{rem.approval.status === "APPROVED" ? "Approved" : "Rejected"}</div>
              <p className="text-slate-400 mt-0.5">{rem.approval.approverName} · {rem.approval.approverRole}</p>
              {rem.approval.comment ? <p className="text-slate-500 mt-0.5">{rem.approval.comment}</p> : null}
              <p className="text-[11px] text-slate-600 mt-1">{formatDate(rem.approval.at)}</p>
            </div>
          ) : null}

          {rem.execution ? (
            <div className="rounded-lg border border-surface-700 p-3 text-xs">
              <div className="font-medium text-slate-200">Execution — {rem.execution.status}</div>
              <p className="text-slate-400 mt-1">{rem.execution.message}</p>
              <div className="mt-2 space-y-1">
                {rem.execution.logs.map((l, i) => (
                  <div key={i} className="text-[11px] font-mono text-slate-500">
                    [{l.level}] {l.message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {rem.verification ? (
            <div className="rounded-lg border border-surface-700 p-3 text-xs">
              <div className="font-medium text-slate-200">
                Verification: <span className={rem.verification.status === "PASS" ? "text-emerald-400" : "text-red-400"}>{rem.verification.status}</span>
              </div>
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                <div className="rounded bg-surface-800/60 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Before</div>
                  <div className="text-slate-300 mt-0.5">{rem.verification.before.compliance}</div>
                </div>
                <div className="rounded bg-surface-800/60 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">After</div>
                  <div className="text-slate-300 mt-0.5">{rem.verification.after.compliance}</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">triggered by {rem.verification.triggeredBy} · {formatDate(rem.verification.at)}</p>
            </div>
          ) : null}

          {rem.rollback ? (
            <div className="rounded-lg border border-surface-700 p-3 text-xs">
              <div className="font-medium text-slate-200">Rollback — {rem.rollback.status}</div>
              {rem.rollback.reason ? <p className="text-slate-400 mt-0.5">{rem.rollback.reason}</p> : null}
              {rem.rollback.restoredState ? <p className="text-[11px] text-slate-500 mt-1 font-mono">{JSON.stringify(rem.rollback.restoredState)}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const STATUS_ORDER: Record<string, number> = {
  VERIFIED: 0,
  PLANNED: 1,
  VALIDATED: 2,
  VALIDATION_FAILED: 3,
  PENDING_APPROVAL: 4,
  APPROVED: 5,
  EXECUTING: 6,
  COMPLETED: 7,
  VERIFYING: 8,
  FAILED: 9,
  REJECTED: 10,
  ROLLED_BACK: 11,
};

export default function RemediationsPage() {
  const { data: rems, loading, error, refresh } = useAsyncData<RemediationRecord[]>(() => api.enterprise.remediations(), []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    setNotice("");
    try {
      const r = await fn();
      const rem = r as RemediationRecord;
      setNotice(`${label} complete — status now ${rem.status}.`);
      refresh();
    } catch (e) {
      setNotice(`${label} rejected: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const m = new Map<RemediationStatus, number>();
    for (const r of rems ?? []) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rems]);

  if (loading && !rems) return <LoadingState label="Loading remediations…" />;
  if (error && !rems) return <ErrorState title="Could not load remediations" detail={error} onRetry={refresh} />;
  if (!rems) return null;

  const filtered = rems
    .filter((r) => status === "ALL" || r.status === status)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) || (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Remediation Workflow"
        subtitle="Structured, validated, human-approved remediation with simulation, sandbox validation, audit and automatic verification against re-scanned evidence. Rollback restores the snapshot."
      />
      <EnterpriseTabs />

      {notice ? <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">{notice}</div> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Verified" value={counts.get("VERIFIED") ?? 0} tone="good" />
        <Stat label="In flight" value={(counts.get("PLANNED") ?? 0) + (counts.get("VALIDATED") ?? 0) + (counts.get("PENDING_APPROVAL") ?? 0) + (counts.get("APPROVED") ?? 0)} tone="warn" />
        <Stat label="Executed" value={(counts.get("COMPLETED") ?? 0) + (counts.get("VERIFYING") ?? 0)} />
        <Stat label="Failed / rolled back" value={(counts.get("FAILED") ?? 0) + (counts.get("ROLLED_BACK") ?? 0)} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="w-4 h-4 text-accent" aria-hidden="true" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by status">
          <option value="ALL">All statuses</option>
          {[...counts.keys()].sort().map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")} ({counts.get(s)})</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} of {rems.length} remediations</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="No remediations in this view" hint="Scan an asset and plan a remediation from a failing finding to start the closed loop." />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <RemediationCard
              key={r.id}
              rem={r}
              busy={busy}
              onAction={run}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}

      <section>
        <SectionTitle sub="The loop enforced by every transition">Closed loop</SectionTitle>
        <div className="card !p-4 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
          {["PLANNED", "VALIDATED", "PENDING_APPROVAL", "APPROVED", "EXECUTING", "COMPLETED", "VERIFYING", "VERIFIED"].map((step, i) => (
            <span key={step} className="inline-flex items-center gap-2">
              {i > 0 ? <Reply className="w-3 h-3 rotate-180 text-slate-600" aria-hidden="true" /> : null}
              <span className="px-2 py-0.5 rounded border border-surface-700">{step}</span>
            </span>
          ))}
          <span className="text-slate-600">←</span>
          <span className="px-2 py-0.5 rounded border border-red-500/30 text-red-300">FAILED → ROLLED_BACK</span>
        </div>
      </section>
    </div>
  );
}