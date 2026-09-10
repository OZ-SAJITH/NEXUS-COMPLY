import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { AuditRecord } from "@nexus/shared-types";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { AIInsightCard } from "../components/AIInsightCard";
import { SeverityBadge } from "../components/SeverityBadge";
import { LoadingState, ErrorState } from "../components/states";
import { buildInsights, recommendationsFor } from "../demo/dashboard";
import { VENDOR_META } from "../demo/dashboard";
import { cn } from "../utils/cn";

const TABS = [
  { key: "insights", label: "AI Insights", to: "/app/intelligence" },
  { key: "risk", label: "Risk Analysis", to: "/app/intelligence/risk" },
  { key: "recommendations", label: "Recommendations", to: "/app/intelligence/recommendations" },
] as const;

const SEV = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const SEV_COLOR: Record<string, string> = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b", LOW: "#eab308", INFO: "#64748b" };

export default function IntelligencePage() {
  const location = useLocation();
  const tab = TABS.find((t) => t.to === location.pathname)?.key ?? "insights";
  const navigate = useNavigate();
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [approved, setApproved] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .listAudits()
      .then(setAudits)
      .then(() => api.getDashboard())
      .then((d) => setApproved(d.adaptive.approvedMappings))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener("nexus:refresh", onRefresh);
    return () => window.removeEventListener("nexus:refresh", onRefresh);
  }, [refresh]);

  if (loading && !audits.length) return <LoadingState label="Loading intelligence…" />;
  if (error && !audits.length) return <ErrorState title="Could not load intelligence" detail={error} onRetry={refresh} />;

  const insights = buildInsights(audits, approved);
  const recs = recommendationsFor(audits);
  const failing = audits.flatMap((a) => a.findings.filter((f) => f.status === "FAIL"));
  const counts = SEV.map((s) => ({ sev: s, n: failing.filter((f) => f.severity === s).length })).filter((c) => c.n > 0);
  const max = Math.max(...counts.map((c) => c.n), 1);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Intelligence"
        subtitle="Explainable AI insights, risk analysis and prioritized remediation guidance driven by real findings."
      />
      <nav className="flex gap-1 border-b border-surface-700 mb-6" aria-label="Intelligence sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors",
              tab === t.key ? "border-accent text-slate-100 bg-surface-900" : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "insights" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {insights.map((ins, i) => (
            <div key={ins.id} className="row-in" style={{ animationDelay: `${i * 90}ms` }}>
            <AIInsightCard
              insight={{
                id: ins.id,
                title: ins.title,
                narrative: ins.narrative,
                risk: ins.risk,
                affected: ins.affected,
                action: ins.action,
                primaryAction: ins.findingId
                  ? { label: "Investigate", onClick: () => navigate(`/app/findings/${ins.findingId}`) }
                  : { label: "Open audits", onClick: () => navigate("/app/audits/history") },
                secondaryAction: ins.auditId
                  ? { label: "View evidence", onClick: () => navigate(`/app/audits/${ins.auditId}`) }
                  : undefined,
              }}
            />
            </div>
          ))}
          <div className="card !p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-slate-100 mb-1">What the engine learned</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Adaptive interpretations are only promoted into permanent mapping after human approval. The approved-mapping store ({approved} mapping{approved === 1 ? "" : "s"}) feeds the normalization layer so that unfamiliar vendor syntax inherits validated Security Intent — no silent automation.
            </p>
          </div>
        </div>
      ) : null}

      {tab === "risk" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card !p-5 lg:col-span-1">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Failing findings by severity</h2>
            <div className="space-y-4">
              {counts.map((c) => (
                <div key={c.sev}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <SeverityBadge severity={c.sev} />
                    <span className="font-mono text-slate-300">{c.n}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.n / max) * 100}%`, backgroundColor: SEV_COLOR[c.sev] }} />
                  </div>
                </div>
              ))}
              {counts.length === 0 ? <p className="text-sm text-emerald-400">No failing findings.</p> : null}
            </div>
          </div>
          <div className="card !p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Top exposure map</h2>
            {failing.length === 0 ? (
              <p className="text-sm text-emerald-400">No failing findings — no exposure paths.</p>
            ) : (
              <div className="divide-y divide-surface-800">
                {failing
                  .slice()
                  .sort((a, b) => b.risk - a.risk)
                  .slice(0, 8)
                  .map((f) => {
                    const a = audits.find((x) => x.id === f.auditId);
                    const meta = a ? VENDOR_META[a.vendor] ?? VENDOR_META.unknown : VENDOR_META.unknown;
                    return (
                      <Link key={f.id} to={`/app/findings/${f.id}`} className="flex items-center gap-3 py-2.5 hover:bg-surface-850/60 rounded-md px-2 -mx-2 transition-colors">
                        <span className="w-7 h-7 rounded-md border flex items-center justify-center text-[9px] font-bold shrink-0" style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }}>
                          {meta.monogram}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-200 truncate">{f.what || f.controlName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{f.controlId} · {f.auditId}</div>
                        </div>
                        <SeverityBadge severity={f.severity} label={`risk ${f.risk}`} />
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "recommendations" ? (
        <div className="space-y-3">
          {recs.map((r) => (
            <div key={r.findingId ?? r.title} className="card !p-4 flex items-start gap-3">
              <SeverityBadge severity={r.priority} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-200">{r.title}</div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">{r.detail}</div>
              </div>
              {r.findingId ? (
                <Link to={`/app/findings/${r.findingId}`} className="btn-outline !px-3 !py-1.5 text-xs shrink-0">Open finding</Link>
              ) : null}
            </div>
          ))}
          {recs.length === 0 ? <div className="card"><p className="text-sm text-emerald-400">No recommendations — your fleet is compliant.</p></div> : null}
        </div>
      ) : null}
    </div>
  );
}