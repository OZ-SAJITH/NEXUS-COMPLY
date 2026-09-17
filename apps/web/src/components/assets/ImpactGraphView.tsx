import { AppWindow, ArrowRight, Boxes, Briefcase, ChevronRight, Database, Server } from "lucide-react";
import type { AssetImpactGraph, AssetCriticality, ImpactNode } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

const KIND_META: Record<ImpactNode["kind"], { label: string; icon: typeof Boxes; cls: string }> = {
  asset: { label: "Managed asset", icon: Boxes, cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  service: { label: "Service", icon: Server, cls: "border-slate-500/40 bg-slate-500/10 text-slate-300" },
  application: { label: "Application", icon: AppWindow, cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  database: { label: "Database", icon: Database, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  business: { label: "Business impact", icon: Briefcase, cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  data: { label: "Data", icon: Database, cls: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300" },
};

const CRITICALITY_STYLE: Record<AssetCriticality, string> = {
  CRITICAL: "border-red-500/40 bg-red-500/10 text-red-300",
  HIGH: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  LOW: "border-slate-500/40 bg-slate-500/10 text-slate-400",
};

function ImpactNodeCard({ node, isRoot }: { node: ImpactNode; isRoot: boolean }) {
  const meta = KIND_META[node.kind] ?? KIND_META.service;
  const Icon = meta.icon;
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", meta.cls)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-100">
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {node.label}
        {isRoot ? <span className="ml-auto px-1.5 py-0.5 rounded border border-accent/40 bg-accent/10 text-[9px] font-semibold uppercase tracking-wider text-accent">managed</span> : null}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{node.detail}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="px-1 py-0.5 rounded border border-slate-500/30 bg-slate-500/5 text-[9px] uppercase tracking-wider text-slate-400">{meta.label}</span>
        {node.criticality ? <span className={cn("px-1 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider", CRITICALITY_STYLE[node.criticality])}>{node.criticality}</span> : null}
      </div>
    </div>
  );
}

/**
 * Impact cascade — how a finding on the root asset propagates across dependent
 * services, applications, databases and business data (from the simulated graph).
 */
export function ImpactGraphView({ graph }: { graph: AssetImpactGraph }) {
  const dist = new Map<string, number>([[graph.rootAssetId, 0]]);
  const queue: string[] = [graph.rootAssetId];
  while (queue.length > 0) {
    const from = queue.shift()!;
    const fromDist = dist.get(from) ?? 0;
    for (const edge of graph.edges) {
      if (edge.from !== from) continue;
      if (dist.has(edge.to)) continue;
      dist.set(edge.to, fromDist + 1);
      queue.push(edge.to);
    }
  }

  const layers: ImpactNode[][] = [];
  for (const node of graph.nodes) {
    const depth = dist.get(node.id) ?? Math.max(0, ...dist.values()) + 1;
    if (!layers[depth]) layers[depth] = [];
    layers[depth].push(node);
  }

  const boundaryRels: string[][] = [];
  for (let i = 0; i < layers.length - 1; i++) {
    const set = new Set<string>();
    for (const edge of graph.edges) {
      const fd = dist.get(edge.from);
      const td = dist.get(edge.to);
      if (fd !== undefined && td !== undefined && td === fd + 1 && td === i + 1) set.add(edge.relation);
    }
    boundaryRels[i] = [...set];
  }

  return (
    <div className="card !p-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 overflow-x-auto pb-1">
        {layers.map((layer, i) => (
          <div key={i} className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 shrink-0">
            <div className="grid gap-2 min-w-[12rem]">
              {layer.map((node) => (
                <ImpactNodeCard key={node.id} node={node} isRoot={node.id === graph.rootAssetId} />
              ))}
            </div>
            {i < layers.length - 1 ? (
              <div className="flex flex-row lg:flex-col items-center gap-1 px-2 lg:px-0 text-[10px] text-slate-500">
                <ChevronRight className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span className="whitespace-nowrap text-[9px] uppercase tracking-wider text-slate-500">{boundaryRels[i]?.join(" · ") || "depends"}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1 border-t border-surface-700 pt-3">
        {graph.summary.map((line, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
            <ArrowRight className="w-3 h-3 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <span>{line}</span>
          </div>
        ))}
        <div className="text-[10px] text-slate-600">simulated cascade from the NEXUS-COMPLY asset graph · generated {graph.generatedAt.slice(0, 19).replace("T", " ")} UTC</div>
      </div>
    </div>
  );
}