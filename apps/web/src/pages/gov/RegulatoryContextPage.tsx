import { useMemo, useState } from "react";
import type { RegionPolicyConflict, RegulatoryUpdate } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { RegionChip } from "../../components/gov/RegionChip";
import { RiskBandPill } from "../../components/gov/RiskBandPill";
import { cn, formatDate } from "../../utils/cn";
import { AlertTriangle, Globe2, Search } from "lucide-react";

export default function RegulatoryContextPage() {
  const { data: updates, loading, error, refresh } = useAsyncData<RegulatoryUpdate[]>(() => api.gov.regulatoryUpdates(), []);
  const { data: conflicts } = useAsyncData<RegionPolicyConflict[]>(() => api.gov.regionConflicts(), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");

  const q = query.trim().toLowerCase();
  const statuses = useMemo(
    () => (updates ? [...new Set(updates.map((u) => u.status))] : []),
    [updates]
  );

  const sorted = useMemo(
    () =>
      (updates ?? [])
        .filter((u) => (status === "ALL" ? true : u.status === status))
        .filter((u) => !q || `${u.title} ${u.summary} ${u.frameworkCode}`.toLowerCase().includes(q))
        .sort((a, b) => (a.status === "NEW" ? -1 : 1) - (b.status === "NEW" ? -1 : 1)),
    [updates, q, status]
  );

  if (loading && !updates) return <LoadingState label="Scanning regulatory landscape…" />;
  if (error && !updates) return <ErrorState title="Could not load regulatory context" detail={error} onRetry={refresh} />;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Regulatory Context"
        subtitle="Live regulatory updates and region-to-region policy conflicts detected for your operating footprint."
      />
      <GovTabs />

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Globe2 className="w-4 h-4 text-accent" aria-hidden="true" /> Regulatory updates
            </div>
            <span className="text-[10px] text-slate-500 font-mono ml-auto">{sorted.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search updates…" className="input !pl-8 !py-1.5 text-xs" aria-label="Search regulatory updates" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !py-1.5 text-xs" aria-label="Filter updates by status">
              <option value="ALL">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          {sorted.length === 0 ? (
            <div className="card">
              <EmptyState title="No updates match" hint="Adjust the search or status filter." />
            </div>
          ) : sorted.map((u) => (
            <div key={u.id} className="card !p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-accent">{u.frameworkCode}</span>
                <RiskBandPill band={u.impact} />
              </div>
              <div className="text-sm font-semibold text-slate-100 mt-1">{u.title}</div>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">{u.summary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={cn("px-2 py-0.5 rounded border text-[10px] uppercase tracking-wide font-semibold",
                  u.status === "NEW" ? "border-red-500/40 bg-red-500/10 text-red-400" : u.status === "ASSESSING" ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400")}>
                  {u.status.replaceAll("_", " ")}
                </span>
                <span className="text-[10px] text-slate-500">effective {formatDate(u.effective)}</span>
              </div>
              {u.affectedControls.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {u.affectedControls.map((c) => (
                    <span key={c} className="px-1.5 py-0.5 rounded bg-surface-800 border border-surface-700 text-[10px] font-mono text-slate-400">{c}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" /> Region policy conflicts
            <span className="text-[10px] text-slate-500 font-mono ml-auto">{(conflicts ?? []).length}</span>
          </div>
          {(conflicts ?? []).length === 0 ? (
            <div className="card">
              <EmptyState title="No region conflicts" hint="No conflicting obligations detected across your operating regions." />
            </div>
          ) : (conflicts ?? []).map((c) => (
            <div key={c.id} className={cn("card !p-4", c.status === "DETECTED" ? "border-amber-500/30" : "border-emerald-500/30")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-100">{c.topic}</span>
                <RiskBandPill band={c.risk} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">{c.description}</p>
              <div className="mt-3 space-y-2">
                {c.regionRequirements.map((r) => (
                  <div key={r.region} className="rounded-lg bg-surface-800/70 border border-surface-700 p-2.5">
                    <div className="flex items-center justify-between">
                      <RegionChip code={r.region} className="!py-0.5 !text-[10px]" />
                      <span className="text-[9px] uppercase text-slate-500 font-mono">{r.frameworks.join(", ")}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5">{r.requirement}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className={cn("text-[10px] uppercase tracking-wide", c.status === "DETECTED" ? "text-amber-400" : "text-emerald-400")}>{c.status.replaceAll("_", " ")}</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">{c.recommendation}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}