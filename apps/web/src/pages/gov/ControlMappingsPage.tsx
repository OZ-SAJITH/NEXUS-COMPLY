import { useState } from "react";
import type { ControlMappingEntry, FrameworkCoverage, CompliancePassport } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { cn } from "../../utils/cn";

export default function ControlMappingsPage() {
  const { data: mappings, loading, error, refresh } = useAsyncData<ControlMappingEntry[]>(() => api.gov.controlMappings(), []);
  const { data: passport } = useAsyncData<CompliancePassport>(() => api.gov.passport(), []);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  if (loading && !mappings) return <LoadingState label="Loading control mappings…" />;
  if (error && !mappings) return <ErrorState title="Could not load control mappings" detail={error} onRetry={refresh} />;
  if (!mappings) return null;

  const frameworks = passport?.frameworks ?? [];
  const applicableIds = new Set(passport?.frameworks?.filter((f) => f.applicable).map((f) => f.frameworkId) ?? []);
  const frameworkPills = (framework: FrameworkCoverage) => (
    <span
      key={framework.frameworkId}
      className={cn(
        "px-2 py-0.5 rounded-full border text-[10px] font-mono cursor-pointer",
        applicableIds.has(framework.frameworkId) ? "border-accent/40 bg-accent/10 text-accent" : "border-surface-700 bg-surface-800/50 text-slate-500"
      )}
      onClick={() => setFilter(filter === framework.frameworkId ? null : framework.frameworkId)}
    >
      {framework.code}
    </span>
  );

  const visible = mappings.filter((m) => {
    if (filter && !m.frameworks.some((f) => f.id === filter)) return false;
    if (query) {
      const q = query.toLowerCase();
      return m.controlId.toLowerCase().includes(q) || m.controlName.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.coreRequirement.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Control Mapping"
        subtitle="Normalized security controls and their references across every tracked framework. Click a framework chip to filter."
      />
      <GovTabs />

      <div className="card !p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Assessed frameworks:</span>
          {frameworks.map((f) => frameworkPills(f))}
          {filter ? <button className="text-xs text-accent underline ml-auto" onClick={() => setFilter(null)}>Clear filter</button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search control id, name, category…"
            className="input !py-1.5 text-sm flex-1 min-w-[220px]"
            aria-label="Search controls"
          />
          <span className="text-xs text-slate-500">{visible.length} controls</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map((m) => (
          <details key={m.controlId} className="card group !p-4 open:border-accent/30">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-accent">{m.controlId}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">{m.category}</span>
              </div>
              <div className="text-sm font-medium text-slate-100 mt-1">{m.controlName}</div>
            </summary>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">{m.coreRequirement}</p>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Framework references</div>
              <div className="flex flex-wrap gap-1.5">
                {m.frameworks.map((f) => (
                  <span key={f.id} className="px-2 py-0.5 rounded-md border border-surface-700 bg-surface-800/70 text-[10px] text-slate-300">
                    <span className="font-mono text-accent">{f.code}</span> <span className="text-slate-500">{f.refs.join(", ")}</span>
                  </span>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}