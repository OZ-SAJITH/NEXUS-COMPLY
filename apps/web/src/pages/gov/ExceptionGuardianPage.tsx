import { useState } from "react";
import type { ComplianceDriftItem, ComplianceException } from "@nexus/shared-types";
import { ShieldCheck, Flag, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { ExceptionCard } from "../../components/gov/ExceptionCard";
import { RiskBandPill } from "../../components/gov/RiskBandPill";
import { cn, formatDate } from "../../utils/cn";

const RESOLVE_ACTIONS = [
  { action: "ACCEPT_OVERRIDE" as const, label: "Accept risk" },
  { action: "REQUEST_REMEDIATION" as const, label: "Request remediation" },
  { action: "ESCALATE" as const, label: "Escalate" },
  { action: "COMPENSATING_CONTROL" as const, label: "Compensating control" },
];

export default function ExceptionGuardianPage() {
  const { data: exceptions, loading, error, refresh } = useAsyncData<ComplianceException[]>(() => api.gov.exceptions(), []);
  const { data: drift } = useAsyncData<ComplianceDriftItem[]>(() => api.gov.drift(), []);
  const [filter, setFilter] = useState("OPEN");
  const [busy, setBusy] = useState("");

  if (loading && !exceptions) return <LoadingState label="Checking exception posture…" />;
  if (error && !exceptions) return <ErrorState title="Could not load exceptions" detail={error} onRetry={refresh} />;
  if (!exceptions) return null;

  const visible = filter === "ALL" ? exceptions : exceptions.filter((e) => e.status === filter);
  const open = exceptions.filter((e) => e.status === "OPEN");
  const autoBlocked = exceptions.filter((e) => e.autoRemediationBlocked && e.status === "OPEN");

  const resolve = async (exc: ComplianceException, action: (typeof RESOLVE_ACTIONS)[number]["action"]) => {
    setBusy(exc.id);
    try {
      await api.gov.resolveException(exc.id, action);
      refresh();
      window.dispatchEvent(new CustomEvent("nexus:refresh"));
    } catch {
      /* surface nothing */
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Exception Guardian"
        subtitle="Where automated remediation is blocked — legacy systems, low AI confidence, destructive actions, regional conflicts — a human decision is recorded with full accountability."
      />
      <GovTabs />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{open.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">open exceptions</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">{autoBlocked.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">blocking auto-remediation</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{exceptions.filter((e) => ["ACCEPTED", "COMPENSATED", "CLOSED"].includes(e.status)).length}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">resolved</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-accent">{drift?.filter((d) => d.status === "OPEN").length ?? 0}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">active drift</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["OPEN", "UNDER_REVIEW", "ACCEPTED", "REMEDIATION_REQUESTED", "ESCALATED", "COMPENSATED", "CLOSED", "ALL"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors",
              filter === s ? "border-accent/40 bg-accent/10 text-accent" : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200"
            )}
          >
            {s.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {visible.map((exc) => (
          <ExceptionCard
            key={exc.id}
            exception={exc}
            highlight={exc.autoRemediationBlocked && (exc.status === "OPEN" || exc.status === "UNDER_REVIEW")}
            actions={
              <>
                {exc.status === "OPEN" || exc.status === "UNDER_REVIEW" ? (
                  RESOLVE_ACTIONS.map((a) => (
                    <button
                      key={a.action}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50",
                        a.action === "ACCEPT_OVERRIDE"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                          : a.action === "ESCALATE"
                            ? "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                            : "border-surface-700 bg-surface-800/60 text-slate-300 hover:border-surface-500"
                      )}
                      disabled={busy !== ""}
                      onClick={() => resolve(exc, a.action)}
                    >
                      {a.label}
                    </button>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    {exc.resolvedBy ? `resolved by ${exc.resolvedBy}` : `${exc.action?.replaceAll("_", " ") ?? "resolved"}`}
                  </span>
                )}
              </>
            }
          />
        ))}
      </div>

      {visible.length === 0 ? <p className="text-sm text-slate-500">No exceptions in this state.</p> : null}

      <div className="card !p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Flag className="w-4 h-4 text-amber-400" aria-hidden="true" /> Compliance drift
        </div>
        {(drift ?? []).map((d) => (
          <div key={d.id} className="rounded-lg border border-surface-700 bg-surface-850/50 p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-200">{d.title}</span>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wide",
                    d.status === "OPEN"
                      ? "border-red-500/40 bg-red-500/10 text-red-300"
                      : d.status === "VERIFIED"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-500/40 bg-slate-500/10 text-slate-400"
                  )}
                >
                  {d.status}
                </span>
                <RiskBandPill band={d.risk} />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                <span className="text-slate-500">expected:</span> {d.expected} · <span className="text-red-400/80">observed: {d.observed}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{d.controlId} · {d.system} · detected {formatDate(d.detectedAt)}</div>
            </div>
            {d.status === "OPEN" ? (
              <button
                className="btn-outline text-xs"
                disabled={busy !== ""}
                onClick={async () => {
                  setBusy(`drift-${d.id}`);
                  await api.gov.suppressDrift(d.id).catch(() => undefined);
                  setBusy("");
                  refresh();
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Suppress
              </button>
            ) : (
              <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {d.status.toLowerCase()}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="card !p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Exceptions raised during change simulation are auto-blocking: the safety gate refuses execution until the exception is resolved with an auditable decision.
        </p>
      </div>
    </div>
  );
}