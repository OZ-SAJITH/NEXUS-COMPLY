import { useMemo, useState } from "react";
import type { ComplianceFrameworkDef, CompliancePassport, FrameworkApplicability, FrameworkCoverage, GovernanceEvaluation } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { FrameworkBadge } from "../../components/gov/FrameworkBadge";
import { cn } from "../../utils/cn";

const BLOC_LABEL: Record<string, string> = { GLOBAL: "Global", US: "United States", EU: "EU", INDIA: "India", APAC: "APAC", OTHER: "Other" };

const CATEGORY_FILTER: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "GLOBAL_BASELINE", label: "Global Baseline" },
  { key: "REGIONAL", label: "Regional" },
  { key: "INDUSTRY", label: "Industry" },
  { key: "SECURITY_BASELINE", label: "Security Baseline" },
];

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  CONDITIONAL: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  NOT_APPLICABLE: "text-slate-500 border-slate-600/40 bg-slate-600/10",
};

export default function FrameworksPage() {
  const { data: frameworks, loading, error, refresh } = useAsyncData<ComplianceFrameworkDef[]>(() => api.gov.frameworks(), []);
  const { data: passport } = useAsyncData<CompliancePassport>(() => api.gov.passport(), []);
  const { data: evaluation } = useAsyncData<GovernanceEvaluation>(() => api.gov.evaluate(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const statusById = useMemo(() => {
    const map = new Map<string, FrameworkApplicability>();
    for (const fw of evaluation?.frameworks ?? []) map.set(fw.frameworkId, fw);
    return map;
  }, [evaluation]);

  if (loading && !frameworks) return <LoadingState label="Loading regulatory frameworks…" />;
  if (error && !frameworks) return <ErrorState title="Could not load frameworks" detail={error} onRetry={refresh} />;
  if (!frameworks) return null;

  const coverage = new Map<string, FrameworkCoverage>((passport?.frameworks ?? []).map((c) => [c.frameworkId, c]));
  const visible = filter === "ALL" ? frameworks : frameworks.filter((f) => statusById.get(f.id)?.category === filter);
  const open = visible.find((f) => f.id === selected) ?? visible[0] ?? frameworks[0];
  const openStatus = open ? statusById.get(open.id) : undefined;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Compliance Frameworks"
        subtitle="The regulatory universe the policy engine tracks. Apply status and category reflect your organization's region, industry, data types and criticality."
      />
      <GovTabs />

      <div className="flex flex-wrap gap-2">
        {CATEGORY_FILTER.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              filter === c.key ? "border-accent/50 bg-accent/10 text-accent" : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200 hover:border-surface-500"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map((fw) => {
          const cov = coverage.get(fw.id);
          const st = statusById.get(fw.id);
          const active = open?.id === fw.id;
          return (
            <button
              key={fw.id}
              onClick={() => setSelected(fw.id)}
              className={cn("card card-hover !p-4 text-left transition-all", active && "border-accent/40")}
            >
              <div className="flex items-center justify-between gap-2">
                <FrameworkBadge fw={fw} />
                <span className="text-[10px] uppercase tracking-wider text-slate-500">{BLOC_LABEL[fw.bloc] ?? fw.bloc}</span>
              </div>
              <div className="mt-2 font-semibold text-slate-100 text-sm">{fw.name}</div>
              <div className="text-xs text-slate-500 font-mono">{fw.authority} · v{fw.version}</div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">{fw.controlIds.length} mapped controls</span>
                {st ? (
                  <span className={cn("px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide", STATUS_STYLE[st.status])}>{st.status.replaceAll("_", " ")}</span>
                ) : cov ? (
                  <span className={cn("font-mono font-semibold", cov.status === "COMPLIANT" ? "text-emerald-400" : cov.status === "PARTIAL" ? "text-amber-400" : cov.status === "AT_RISK" ? "text-red-400" : "text-slate-500")}>{cov.score}%</span>
                ) : (
                  <span className="text-slate-500">not assessed</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {open ? (() => {
        const cov = coverage.get(open.id);
        const st = openStatus;
        return (
        <div className="card !p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <FrameworkBadge fw={open} />
            <h2 className="text-lg font-semibold text-slate-100">{open.name}</h2>
            <span className="text-xs text-slate-500 font-mono">{open.version}</span>
            {st && (
              <span className={cn("ml-auto px-2.5 py-1 rounded border text-[11px] font-semibold uppercase tracking-wide", STATUS_STYLE[st.status])}>{st.status.replaceAll("_", " ")}</span>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Intent</div>
              <p className="text-slate-300 leading-relaxed text-xs">{open.intent}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">What it governs</div>
              <p className="text-slate-300 leading-relaxed text-xs">{open.whyApplies}</p>
            </div>
          </div>
          {st && (
            <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Why this status</div>
              <ul className="space-y-1.5">
                {st.reasons.map((r) => (
                  <li key={r.key} className="flex items-start gap-2 text-xs leading-relaxed">
                    <span className={cn("mt-0.5 shrink-0", r.matched ? "text-emerald-400" : "text-slate-600")}>{r.matched ? "✓" : "–"}</span>
                    <span className={r.matched ? "text-slate-300" : "text-slate-500"}>{r.text}</span>
                  </li>
                ))}
              </ul>
              {st.condition && <p className="mt-2 text-[11px] text-amber-400/80 bg-amber-500/5 rounded px-2 py-1.5 border border-amber-500/15">{st.condition}</p>}
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Baseline score</div>
              <div className={cn("text-xl font-bold", open.baselineScore ? "text-emerald-400" : "")}>{open.baselineScore}</div>
              <div className="text-[10px] text-slate-500">controls {open.baselineControls.passed}/{open.baselineControls.total}</div>
            </div>
            <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Drivers</div>
              <div className="text-xl font-bold text-slate-200">{open.triggers.map((t) => t.field).join(", ")}</div>
            </div>
            <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Applicability</div>
              <div className="mt-1">
                <span className={cn("text-sm font-medium", st ? (st.status === "ACTIVE" ? "text-emerald-400" : st.status === "CONDITIONAL" ? "text-amber-400" : "text-slate-500") : cov ? (cov.applicable ? "text-emerald-400" : "text-slate-400") : "text-slate-500")}>
                  {st ? st.applicabilityLabel : cov ? (cov.applicable ? "Applicable" : "Not applicable") : "Pending assessment"}
                </span>
              </div>
            </div>
          </div>
          {cov && cov.notes.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Assessment notes</div>
              <ul className="space-y-1">
                {cov.notes.map((n, i) => (
                  <li key={i} className="text-xs text-slate-400 leading-relaxed">• {n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        );
      })() : null}
    </div>
  );
}