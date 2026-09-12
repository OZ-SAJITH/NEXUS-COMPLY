import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Search } from "lucide-react";
import type { AuditRecord } from "@nexus/shared-types";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { SeverityBadge } from "../components/SeverityBadge";
import { LoadingState, ErrorState, EmptyState } from "../components/states";
import { VENDOR_META } from "../demo/dashboard";
import { formatDate, timeAgo, riskBandLabel } from "../utils/cn";

export default function AuditHistoryPage() {
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("ALL");

  const vendors = useMemo(() => [...new Set(audits.map((a) => a.vendor))].sort(), [audits]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audits
      .filter((a) => (vendor === "ALL" ? true : a.vendor === vendor))
      .filter((a) => !q || `${a.configurationName} ${a.id} ${a.vendor}`.toLowerCase().includes(q))
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }, [audits, query, vendor]);

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

  if (loading && !audits.length) return <LoadingState label="Loading audit history…" />;
  if (error && !audits.length) return <ErrorState title="Could not load audits" detail={error} onRetry={refresh} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Audit History" subtitle="Every configuration analyzed by the engine, with outcome and evidence linkage." />

      {audits.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No audits yet"
            hint="Run your first audit to populate history and live posture."
            action={
              <Link to="/app/audits/new" className="btn-primary text-xs">Start a security audit</Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search configuration, ID or vendor…"
                className="input !pl-9 !py-2 text-sm"
                aria-label="Search audits"
              />
            </div>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by vendor">
              <option value="ALL">All vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>{VENDOR_META[v]?.name ?? v}</option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500 ml-auto">{visible.length} audit{visible.length === 1 ? "" : "s"}</span>
          </div>

          <div className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-surface-700">
                  <th scope="col" className="py-3 px-4 font-medium">Configuration</th>
                  <th scope="col" className="py-3 px-2 font-medium">Vendor</th>
                  <th scope="col" className="py-3 px-2 font-medium">Compliance</th>
                  <th scope="col" className="py-3 px-2 font-medium">Risk</th>
                  <th scope="col" className="py-3 px-2 font-medium">Findings</th>
                  <th scope="col" className="py-3 px-2 font-medium">Detected</th>
                  <th scope="col" className="py-3 px-4 font-medium text-right">Report</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">No audits match the current filters.</td></tr>
                ) : (
                visible.map((a, i) => {
                  const failing = a.findings.filter((f) => f.status === "FAIL");
                  const band = a.risk ? riskBandLabel(a.risk.overallScore) : "INFO";
                  const meta = VENDOR_META[a.vendor] ?? VENDOR_META.unknown;
                  return (
                    <tr key={a.id} className="border-b border-surface-800/70 last:border-0 hover:bg-surface-850/50 transition-colors row-in" style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}>
                      <td className="py-3 px-4">
                        <Link to={`/app/audits/${a.id}`} className="font-medium text-slate-200 hover:text-accent transition-colors">
                          {a.configurationName}
                        </Link>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">{a.id} · {formatDate(a.completedAt)}</div>
                      </td>
                      <td className="py-3 px-2">
                        <span className="chip border border-surface-600 text-slate-300">{meta.name.toUpperCase()}</span>
                      </td>
                      <td className="py-3 px-2 font-mono">
                        {a.compliance ? <span className={a.compliance.score >= 85 ? "text-emerald-400" : a.compliance.score >= 55 ? "text-amber-400" : "text-red-400"}>{a.compliance.score}%</span> : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-2"><SeverityBadge severity={band} label={`${a.risk?.overallScore ?? 0}`} /></td>
                      <td className="py-3 px-2 text-slate-400">{failing.length}</td>
                      <td className="py-3 px-2 text-slate-500">{timeAgo(a.completedAt)}</td>
                      <td className="py-3 px-4 text-right">
                        <a className="text-xs text-accent hover:underline inline-flex items-center gap-1" href={api.reportUrl(a.id)} target="_blank" rel="noreferrer">
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" /> PDF
                        </a>
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}
    </div>
  );
}