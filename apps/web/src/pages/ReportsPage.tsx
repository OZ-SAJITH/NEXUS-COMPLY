import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileDown } from "lucide-react";
import type { AuditRecord } from "@nexus/shared-types";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { SeverityBadge } from "../components/SeverityBadge";
import { LoadingState, ErrorState, EmptyState } from "../components/states";
import { VENDOR_META } from "../demo/dashboard";
import { GlassCard } from "../components/motion/GlassCard";
import { ReportGenerate } from "../components/motion/ReportGenerate";
import { formatDate, riskBandLabel } from "../utils/cn";

export default function ReportsPage() {
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState<AuditRecord | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .listAudits()
      .then(setAudits)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener("nexus:refresh", onRefresh);
    return () => window.removeEventListener("nexus:refresh", onRefresh);
  }, [refresh]);

  if (loading && !audits.length) return <LoadingState label="Loading reports…" />;
  if (error && !audits.length) return <ErrorState title="Could not load reports" detail={error} onRetry={refresh} />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Compliance Reports"
        subtitle="Every report is generated from actual audit findings — compliance scores, risk, evidence, exposure, simulation and AI approval status."
      />

      {audits.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No reports yet"
            hint="Run an audit and a full HTML report is generated from its real findings."
            action={<Link to="/app/audits/new" className="btn-primary text-xs">Start a security audit</Link>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {audits.map((a, i) => {
            const band = a.risk ? riskBandLabel(a.risk.overallScore) : "INFO";
            const failing = a.findings.filter((f) => f.status === "FAIL").length;
            const meta = VENDOR_META[a.vendor] ?? VENDOR_META.unknown;
            return (
              <div key={a.id} className="row-in" style={{ animationDelay: `${i * 80}ms` }}>
              <GlassCard className="!p-5 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/app/audits/${a.id}`} className="text-base font-semibold text-slate-100 hover:text-accent transition-colors">
                      {a.configurationName}
                    </Link>
                    <div className="text-xs text-slate-500 mt-1 font-mono">{a.id} · {formatDate(a.completedAt)}</div>
                  </div>
                  <SeverityBadge severity={band} label={`risk ${a.risk?.overallScore ?? 0}`} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="chip border border-surface-600 text-slate-300">{meta.name.toUpperCase()}</span>
                  <span className="chip border border-surface-600 text-slate-300">{a.compliance?.passed ?? 0}/{a.compliance ? a.compliance.passed + a.compliance.failed : 0} passed · {failing} failing</span>
                  <span className="chip border border-surface-600 text-slate-300">{a.compliance?.score ?? 0}% compliance</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-surface-800 pt-3">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><FileDown className="w-3.5 h-3.5 text-accent" aria-hidden="true" /> Evidence-linked</span>
                    <span className="inline-flex items-center gap-1.5">
                      {a.vendorStatus === "unknown" ? "Adaptive pipeline" : "Deterministic parser"}
                    </span>
                  </div>
                  <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={() => setGenerating(a)}>
                    <FileDown className="w-3.5 h-3.5" aria-hidden="true" /> Generate report
                  </button>
                </div>
              </GlassCard>
              </div>
            );
          })}
        </div>
      )}

      {generating ? (
        <ReportGenerate
          title={`${(VENDOR_META[generating.vendor] ?? VENDOR_META.unknown).name} — ${generating.configurationName}`}
          onGenerate={async () => {
            const res = await fetch(api.reportUrl(generating.id));
            if (!res.ok) throw new Error(`Report fetch failed (${res.status})`);
          }}
          onPreview={() => window.open(api.reportUrl(generating.id), "_blank", "noopener,noreferrer")}
          onClose={() => setGenerating(null)}
        />
      ) : null}
    </div>
  );
}