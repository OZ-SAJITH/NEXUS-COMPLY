import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type {
  ChangeRequest,
  GovernanceAuditEvent,
  TelemetryPoint,
  ChangeSimulation,
  ChangeImpactSummary,
} from "@nexus/shared-types";
import { api } from "../../services/api";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { StatusPill } from "../../components/gov/StatusPill";
import { RiskBandPill } from "../../components/gov/RiskBandPill";
import { ConfidenceMeter } from "../../components/gov/ConfidenceMeter";
import { ConfigDiff } from "../../components/gov/ConfigDiff";
import { ApprovalStrip } from "../../components/gov/ApprovalStrip";
import { SafetyGate } from "../../components/gov/SafetyGate";
import { ExceptionCard } from "../../components/gov/ExceptionCard";
import { TelemetryChart } from "../../components/gov/TelemetryChart";
import { GovernanceTimeline } from "../../components/gov/GovernanceTimeline";
import { currentUser, sessionRole } from "../../session";
import { cn, timeAgo } from "../../utils/cn";
import { AlertTriangle, CheckCircle2, RotateCcw, ClipboardCheck, Cpu, Workflow } from "lucide-react";

interface FreezeState {
  active: boolean;
  reason?: string;
  until?: string;
  triggeredAt?: string;
}

function ImpactSummary({ impact }: { impact: ChangeImpactSummary }) {
  const tiles = [
    { label: "Dependencies", value: impact.dependencyCount },
    { label: "Downstream", value: impact.downstreamCount },
    { label: "Services", value: impact.servicesCount },
    { label: "Critical assets", value: impact.criticalAssets ? impact.criticalAssets.length : 0 },
    { label: "Vendors", value: impact.vendorsCount },
    { label: "Blast radius", value: `${impact.blastRadius}%` },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-surface-800/70 border border-surface-700 p-2 text-center">
            <div className="text-lg font-bold text-slate-200">{t.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-2.5">
          <span className="text-slate-500 block text-[10px] uppercase tracking-wide">Security</span>
          <span className="text-slate-200">{impact.securityImpact || "—"}</span>
        </div>
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-2.5">
          <span className="text-slate-500 block text-[10px] uppercase tracking-wide">Availability</span>
          <span className="text-slate-200">{impact.availabilityImpact || "—"}</span>
        </div>
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-2.5">
          <span className="text-slate-500 block text-[10px] uppercase tracking-wide">Compliance</span>
          <span className="text-slate-200">{impact.complianceImpact || "—"}</span>
        </div>
      </div>
      {impact.potentialEffects.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Potential effects</div>
          <ul className="space-y-1">
            {impact.potentialEffects.map((e, i) => (
              <li key={i} className="text-xs text-slate-400 leading-relaxed">• {e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-slate-500 leading-relaxed">
        <span className="text-slate-400 font-semibold">Recommendation:</span> {impact.recommendation}
      </p>
    </div>
  );
}

function SimulationVerdict({ sim }: { sim: ChangeSimulation }) {
  const statusCls =
    sim.status === "PASSED"
      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
      : sim.status === "CONDITIONAL"
        ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
        : "text-red-400 border-red-500/40 bg-red-500/10";
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-850/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("px-2.5 py-1 rounded-full border text-xs font-bold", statusCls)}>{sim.status}</span>
        <RiskBandPill band={sim.compatibilityRisk} />
        <span className="ml-auto text-[11px] font-mono text-slate-500">risk score {sim.riskScore}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-surface-800/60 border border-surface-700 py-1.5">
          <span className="text-slate-400 block text-[10px] uppercase tracking-wide">compliance</span>
          <span className={cn("font-mono font-semibold", sim.complianceDelta >= 0 ? "text-emerald-400" : "text-red-400")}>{sim.complianceDelta >= 0 ? "+" : ""}{sim.complianceDelta}pp</span>
        </div>
        <div className="rounded-lg bg-surface-800/60 border border-surface-700 py-1.5">
          <span className="text-slate-400 block text-[10px] uppercase tracking-wide">security</span>
          <span className={cn("font-mono font-semibold", sim.securityDelta >= 0 ? "text-emerald-400" : "text-red-400")}>{sim.securityDelta >= 0 ? "+" : ""}{sim.securityDelta}pp</span>
        </div>
        <div className="rounded-lg bg-surface-800/60 border border-surface-700 py-1.5">
          <span className="text-slate-400 block text-[10px] uppercase tracking-wide">blast radius</span>
          <span className="font-mono text-slate-200">{sim.blastRadius}%</span>
        </div>
      </div>
      {sim.failureModes.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Failure modes</div>
          <div className="flex flex-wrap gap-1.5">
            {sim.failureModes.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-200/90">{f}</span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-slate-400 leading-relaxed">{sim.recommendation}</p>
    </div>
  );
}

export default function ChangeDetailPage() {
  const { id = "" } = useParams();
  const [change, setChange] = useState<ChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [freeze, setFreeze] = useState<FreezeState>({ active: false });
  const [events, setEvents] = useState<GovernanceAuditEvent[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const isReviewer = sessionRole() === "reviewer";
  const approverName = currentUser();

  const refreshChange = useCallback(() => {
    api.gov
      .getChange(id)
      .then(setChange)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([api.gov.getChange(id), api.gov.freeze(), api.gov.changeEvents(id), api.gov.telemetry(id)])
      .then(([c, f, ev, tel]) => {
        setChange(c);
        setFreeze({ active: f.active, reason: f.reason, until: f.until, triggeredAt: f.triggeredAt });
        setEvents(ev.items);
        setTelemetry(tel);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadAll();
    const onRefresh = () => refreshChange();
    window.addEventListener("nexus:refresh", onRefresh);
    return () => window.removeEventListener("nexus:refresh", onRefresh);
  }, [loadAll, refreshChange]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
      await loadAll();
      window.dispatchEvent(new CustomEvent("nexus:refresh"));
      setBusy("");
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? messageOf(e) : String(e) });
      setBusy("");
    }
  };

  const messageOf = (e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e);
    return raw.replace(/^GovDemoError:?\s*/i, "");
  };

  const approveRole = change?.requiredApprovers?.[0] ?? "Security Engineer";

  const actions = {
    onAnalyze: () => run("analyze", () => api.gov.analyzeChange(id)),
    onSimulate: () => run("simulate", () => api.gov.simulateChange(id)),
    onRequestApproval: () => run("request approval", () => api.gov.requestApproval(id)),
    onApprove: () =>
      run("approve", () =>
        api.gov.decideApproval(id, { approverName, approverRole: approveRole, decision: "APPROVED", comment: "Approved after simulation review." })
      ),
    onReject: () =>
      run("reject", () =>
        api.gov.decideApproval(id, { approverName, approverRole: approveRole, decision: "REJECTED", comment: "Rejected — see comments." })
      ),
    onRequestChanges: () =>
      run("request changes", () =>
        api.gov.decideApproval(id, {
          approverName,
          approverRole: approveRole,
          decision: "CHANGES_REQUESTED",
          comment: "Changes requested before approval.",
        })
      ),
    onExecute: () => run("execute", () => api.gov.executeChange(id, currentUser())),
    onVerify: () => run("verify", () => api.gov.verifyChange(id, currentUser())),
    onRollback: () => run("rollback", () => api.gov.rollbackChange(id, "Automated rollback after failed verification.")),
    onInvestigate: () => run("investigate", () => api.gov.investigateChange(id)),
    onKeep: () => run("keep change", () => api.gov.keepChange(id)),
    onToggleFreeze: () =>
      run("freeze", async () => {
        const next = !freeze.active;
        const res = await api.gov.setFreeze(next, next ? "Freeze activated from change detail." : undefined);
        setFreeze({ active: res.active, reason: res.reason, until: res.until, triggeredAt: res.triggeredAt });
      }),
  };

  if (loading && !change) return <LoadingState label="Loading change request…" />;
  if (error && !change) return <ErrorState title="Could not load change" detail={error} onRetry={loadAll} />;
  if (!change) return null;

  const sim = change.simulations?.[0];
  const impact = change.impacts?.[0];
  const exceptions = change.exceptions ?? [];
  const openExceptions = exceptions.filter((e) => e.status === "OPEN" || e.status === "UNDER_REVIEW");
  const approved = change.approvals.filter((a) => a.decision === "APPROVED");

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={change.title}
        subtitle={change.description}
        actions={
          <Link to="/app/governance/changes" className="btn-outline text-xs">
            ← All changes
          </Link>
        }
      />

      {notice ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm flex items-center gap-2",
            notice.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" : "border-red-500/30 bg-red-500/5 text-red-200"
          )}
          role="alert"
        >
          {notice.kind === "ok" ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4" aria-hidden="true" />}
          {notice.text}
        </div>
      ) : null}

      <GovTabs />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={change.status} />
        <RiskBandPill band={change.risk} />
        <span className="text-[11px] font-mono text-slate-500">#{change.id}</span>
        {change.fourEyesRequired ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-[10px] uppercase tracking-wide text-violet-300">
            <Workflow className="w-3 h-3" aria-hidden="true" /> four-eyes
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-slate-500">{change.updatedAt ? `updated ${timeAgo(change.updatedAt)}` : ""}</span>
      </div>

      <SafetyGate change={change} freeze={freeze} actions={actions} isReviewer={isReviewer} />

      {change.status === "ROLLBACK_RECOMMENDED" ? (
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-orange-300 mb-3">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Post-change telemetry indicates an anomaly
          </div>
          <p className="text-xs text-orange-200/80 mb-3">Options: investigate the anomaly (keeps telemetry in a rollback record), choose to keep the change, or execute the documented rollback.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline text-xs" onClick={actions.onInvestigate} disabled={busy !== ""}>
              Investigate anomaly
            </button>
            <button className="btn-outline text-xs" onClick={actions.onKeep} disabled={busy !== ""}>
              Keep change (accepted risk)
            </button>
            <button className="btn-danger text-xs" onClick={actions.onRollback} disabled={busy !== "" || freeze.active}>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Execute rollback
            </button>
          </div>
        </div>
      ) : null}

      {openExceptions.length > 0 ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-300 mb-3">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {openExceptions.length} open exception{openExceptions.length > 1 ? "s" : ""} block automated execution
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {openExceptions.map((exc) => (
              <ExceptionCard key={exc.id} exception={exc} highlight={exc.autoRemediationBlocked} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card !p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Cpu className="w-4 h-4 text-accent" aria-hidden="true" /> AI analysis
          </div>
          <ConfidenceMeter value={change.aiConfidence} />
          <p className="text-sm text-slate-300 leading-relaxed">{change.aiSummary || "No AI analysis yet — run analysis from the safety gate."}</p>
          <div className="text-xs text-slate-500 space-y-1">
            <div><span className="text-slate-400 font-medium">Why:</span> {change.reason}</div>
            <div><span className="text-slate-400 font-medium">Expected benefit:</span> {change.expectedBenefit}</div>
            <div><span className="text-slate-400 font-medium">Targets:</span> {change.targetSystems.join(", ")}</div>
          </div>
        </div>

        <div className="card !p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ClipboardCheck className="w-4 h-4 text-violet-400" aria-hidden="true" /> Approvals
          </div>
          <div className="flex flex-wrap gap-1.5">
            {change.requiredApprovers.map((r) => (
              <span
                key={r}
                className={cn(
                  "px-2 py-0.5 rounded-md border text-[11px]",
                  approved.some((a) => a.approverRole === r || a.approverName === r)
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-surface-700 bg-surface-800/60 text-slate-400"
                )}
              >
                {r}
              </span>
            ))}
          </div>
          <ApprovalStrip approvals={change.approvals} />
          <div className="text-xs text-slate-500">
            <span className="text-slate-400 font-medium">Rollback plan:</span> {change.rollbackPlan || "None documented."}
          </div>
        </div>
      </div>

      {impact ? (
        <div className="card !p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">Impact analysis</div>
          <ImpactSummary impact={impact} />
        </div>
      ) : null}

      {sim ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card !p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">Simulation verdict</div>
            <SimulationVerdict sim={sim} />
          </div>
          <div className="card !p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">Configuration diff</div>
            <ConfigDiff change={change} />
          </div>
        </div>
      ) : (
        <div className="card !p-5">
          <div className="text-sm font-semibold text-slate-200 mb-3">Staged configuration</div>
          <ConfigDiff change={change} />
        </div>
      )}

      {telemetry.length > 0 ? (
        <div className="card !p-5">
          <TelemetryChart points={telemetry} title="Post-change telemetry" />
        </div>
      ) : null}

      {change.verifications && change.verifications.length > 0 ? (
        <div className="card !p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" /> Post-change verification
          </div>
          {change.verifications.map((v) => (
            <div key={v.id} className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold">{v.overall}</span>
                <span className="text-slate-300">{v.finalStatus}</span>
                <span className="ml-auto text-slate-500">{v.verifiedBy}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(["compliance", "security", "availability", "dependencies"] as const).map((k) => (
                  <div key={k} className="rounded-md bg-surface-800/60 border border-surface-700 py-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                    {k} <span className={v[k] === "PASS" ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{v[k]}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{v.evidenceNote}</p>
            </div>
          ))}
        </div>
      ) : null}

      {change.rollbacks && change.rollbacks.length > 0 ? (
        <div className="card !p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <RotateCcw className="w-4 h-4 text-red-400" aria-hidden="true" /> Rollback
          </div>
          {change.rollbacks.map((rb) => (
            <div key={rb.id} className="rounded-lg border border-surface-700 bg-surface-850/50 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 font-semibold">{rb.status.replaceAll("_", " ")}</span>
                <span className="text-slate-400">{rb.reason}</span>
                <span className="ml-auto text-slate-500">{rb.initiatedBy}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {rb.metrics.map((m) => (
                  <div key={m.label} className="rounded-md bg-surface-800/60 border border-surface-700 p-2">
                    <div className="text-[10px] text-slate-500">{m.label}</div>
                    <div className={cn("font-mono text-xs font-semibold", Math.abs(m.current - m.expected) > m.expected * 0.5 ? "text-red-400" : "text-emerald-400")}>
                      {m.current}{m.unit} <span className="text-slate-600">/ exp {m.expected}{m.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card !p-5">
        <div className="text-sm font-semibold text-slate-200 mb-3">Governance audit trail</div>
        <GovernanceTimeline events={events} />
      </div>
    </div>
  );
}