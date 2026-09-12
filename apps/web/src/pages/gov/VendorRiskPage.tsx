import { useMemo, useState } from "react";
import type { DependencyNode, VendorRiskSummary } from "@nexus/shared-types";
import { graphForVendor } from "@nexus/governance-core";
import { Boxes, ShieldAlert } from "lucide-react";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { RiskBandPill } from "../../components/gov/RiskBandPill";
import { DependencyGraphView } from "../../components/gov/DependencyGraphView";
import { cn } from "../../utils/cn";

export default function VendorRiskPage() {
  const { data: vendors, loading, error, refresh } = useAsyncData<VendorRiskSummary[]>(() => api.gov.vendors(), []);
  const { data: graph } = useAsyncData<DependencyNode[]>(() => api.gov.dependencyGraph(), []);
  const [focus, setFocus] = useState<string | null>(null);

  const graphNodes = useMemo(() => {
    if (!graph) return [];
    if (!focus) return graph;
    const frag = graphForVendor(focus);
    const ids = new Set(frag.map((n) => n.id));
    return graph.filter((n) => ids.has(n.id));
  }, [graph, focus]);

  if (loading && !vendors) return <LoadingState label="Loading vendor risk…" />;
  if (error && !vendors) return <ErrorState title="Could not load vendor risk" detail={error} onRetry={refresh} />;
  if (!vendors) return null;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Vendor Risk & Dependency Graph"
        subtitle="Who supplies your security posture, how concentrated the risk is, and what happens downstream when a change touches a dependency."
      />
      <GovTabs />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {vendors.map((v) => {
          const highRisk = ["HIGH", "CRITICAL"].includes(v.risk);
          return (
            <button
              key={v.id}
              onClick={() => setFocus(v.id)}
              className={cn("card card-hover !p-4 text-left", focus === v.id && "border-accent/40")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={cn("w-9 h-9 rounded-lg border flex items-center justify-center", highRisk ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400")}>
                    <Boxes className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="font-semibold text-slate-100 text-sm">{v.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{v.tier}</div>
                  </div>
                </div>
                <RiskBandPill band={v.risk} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[10px] text-slate-500 font-mono">{v.openFindings} findings</span>
                <span className="text-[10px] text-slate-500 font-mono">{v.affectedSystems} systems</span>
                <span className="text-[10px] text-slate-500 font-mono">{v.subvendors.length} sub-vendors</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5 line-clamp-2">{v.provideServices.join(", ")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {v.subvendors.map((s) => (
                  <span key={s} className="px-1.5 py-0.5 rounded bg-surface-800 border border-surface-700 text-[10px] text-slate-500">{s}</span>
                ))}
              </div>
              {v.concentrationRisk !== "LOW" || v.changeIncoming ? (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300/90">
                  <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                  {v.concentrationRisk !== "LOW" ? "concentration risk" : null}
                  {v.concentrationRisk !== "LOW" && v.changeIncoming ? " · " : null}
                  {v.changeIncoming ? "incoming change" : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-200">Dependency graph{focus ? ` — focusing ${vendors.find((v) => v.id === focus)?.name ?? focus}` : ""}</div>
          {focus ? (
            <button className="btn-outline text-xs" onClick={() => setFocus(null)}>
              Show full graph
            </button>
          ) : null}
        </div>
        <DependencyGraphView nodes={graphNodes} />
      </div>
    </div>
  );
}