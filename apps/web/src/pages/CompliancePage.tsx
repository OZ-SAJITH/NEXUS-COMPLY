import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { AuditRecord } from "@nexus/shared-types";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { FrameworkCard } from "../components/FrameworkCard";
import { FindingsTable, type FindingsRow } from "../components/FindingsTable";
import { LoadingState, ErrorState } from "../components/states";
import { ComplianceBar } from "../components/ComplianceRing";
import { GUIDANCE_FRAMEWORKS, frameworkStats, categoryBreakdown } from "../demo/dashboard";
import { GlassCard } from "../components/motion/GlassCard";
import { cn } from "../utils/cn";

const TABS = [
  { key: "overview", label: "Overview", to: "/app/compliance" },
  { key: "frameworks", label: "Frameworks", to: "/app/compliance/frameworks" },
  { key: "controls", label: "Controls", to: "/app/compliance/controls" },
  { key: "findings", label: "Findings", to: "/app/compliance/findings" },
] as const;

export default function CompliancePage() {
  const location = useLocation();
  const tab = (TABS.find((t) => t.to === location.pathname)?.key ?? "overview");
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading && !audits.length) return <LoadingState label="Loading compliance data…" />;
  if (error && !audits.length) return <ErrorState title="Could not load compliance data" detail={error} onRetry={refresh} />;

  const frameworks = frameworkStats(audits, GUIDANCE_FRAMEWORKS);
  const categories = categoryBreakdown(audits);
  const rows: FindingsRow[] = audits
    .flatMap((a) => a.findings.filter((f) => f.status === "FAIL" || f.status === "WARNING").map((f) => ({ id: f.id, auditId: a.id, vendor: a.vendor, finding: f, detectedAt: a.completedAt })))
    .sort((a, b) => b.finding.risk - a.finding.risk);

  const controlAgg = new Map<string, { name: string; pass: number; fail: number; warn: number; by: string[] }>();
  audits.forEach((a) =>
    a.findings.forEach((f) => {
      const entry = controlAgg.get(f.controlId) ?? { name: f.controlName, pass: 0, fail: 0, warn: 0, by: [] };
      if (f.status === "PASS" || f.status === "NOT_APPLICABLE") entry.pass += 1;
      else if (f.status === "FAIL") entry.fail += 1;
      else if (f.status === "WARNING") entry.warn += 1;
      if (!entry.by.includes(a.id)) entry.by.push(a.id);
      controlAgg.set(f.controlId, entry);
    })
  );
  const controls = [...controlAgg.entries()]
    .map(([id, v]) => ({ id, ...v, rate: v.pass + v.fail + v.warn ? Math.round((v.pass / (v.pass + v.fail + v.warn)) * 100) : 100 }))
    .sort((a, b) => a.rate - b.rate);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Compliance"
        subtitle="Policy posture mapped to frameworks, controls and live findings across all audited configurations."
      />
      <nav className="flex gap-1 border-b border-surface-700 mb-6" aria-label="Compliance sections">
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

      {tab === "overview" ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <GlassCard className="!p-5">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Posture by policy domain</h2>
            <div className="space-y-4">
              {categories.map((c, i) => (
                <div key={c.id} className="row-in" style={{ animationDelay: `${i * 70}ms` }}>
                  <ComplianceBar label={c.label} value={c.score} hint={c.total ? `${c.total} control checks` : "no findings yet"} />
                </div>
              ))}
            </div>
            <p className="mt-5 text-[11px] text-slate-600">Derived from live control findings mapped to policy domains (replaceable in src/demo).</p>
          </GlassCard>
          <GlassCard className="!p-5">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Framework readiness</h2>
            <div className="space-y-3">
              {frameworks.map((fw, i) => (
                <Link key={fw.id} to="/app/compliance/frameworks" className="group flex items-center gap-3 rounded-lg border border-surface-700 hover:border-accent/40 hover:bg-accent/5 px-3 py-2.5 transition-all duration-200 hover:translate-x-0.5 row-in" style={{ animationDelay: `${300 + i * 70}ms` }}>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200">{fw.name}</div>
                    <ComplianceBar label={""} value={fw.score} />
                  </div>
                  <span className="font-mono text-accent">{fw.score}%</span>
                </Link>
              ))}
            </div>
          </GlassCard>
        </div>
      ) : null}

      {tab === "frameworks" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {frameworks.map((fw, i) => (
            <div key={fw.id} className="row-in" style={{ animationDelay: `${i * 80}ms` }}>
              <FrameworkCard fw={fw} />
            </div>
          ))}
        </div>
      ) : null}

      {tab === "controls" ? (
        <div className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-surface-700">
                  <th scope="col" className="py-3 px-4 font-medium">Control</th>
                  <th scope="col" className="py-3 px-2 font-medium">Pass rate</th>
                  <th scope="col" className="py-3 px-2 font-medium">Pass</th>
                  <th scope="col" className="py-3 px-2 font-medium">Fail</th>
                  <th scope="col" className="py-3 px-2 font-medium">Warn</th>
                  <th scope="col" className="py-3 px-4 font-medium">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c, i) => (
                  <tr key={c.id} className="border-b border-surface-800/70 last:border-0 hover:bg-surface-850/50 transition-colors row-in" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                    <td className="py-2.5 px-4">
                      <div className="text-slate-200 font-medium">{c.id}</div>
                      <div className="text-[11px] text-slate-500">{c.name}</div>
                    </td>
                    <td className="py-2.5 px-2"><span className={cn("font-mono", c.rate >= 85 ? "text-emerald-400" : c.rate >= 55 ? "text-amber-400" : "text-red-400")}>{c.rate}%</span></td>
                    <td className="py-2.5 px-2 text-emerald-400 font-mono">{c.pass}</td>
                    <td className="py-2.5 px-2 text-red-400 font-mono">{c.fail}</td>
                    <td className="py-2.5 px-2 text-amber-400 font-mono">{c.warn}</td>
                    <td className="py-2.5 px-4 text-slate-500">{c.by.length} device{c.by.length === 1 ? "" : "s"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "findings" ? (
        <GlassCard className="!p-5">
          <FindingsTable rows={rows} />
        </GlassCard>
      ) : null}
    </div>
  );
}