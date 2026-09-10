import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { SeverityBadge } from "./SeverityBadge";

export interface InsightData {
  id: string;
  title: string;
  narrative: string;
  risk: string;
  affected: number;
  action: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

export function AIInsightCard({ insight }: { insight: InsightData }) {
  return (
    <div className="card !p-5 border-l-2 border-l-accent/60">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" aria-hidden="true" />
          AI Security Intelligence
        </div>
        <SeverityBadge severity={insight.risk} />
      </div>
      <h3 className="text-[15px] font-semibold text-slate-100 mt-3 leading-snug">{insight.title}</h3>
      <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{insight.narrative}</p>
      <div className="grid grid-cols-2 gap-2 mt-4 rounded-lg border border-surface-700 bg-surface-850 p-2">
        <div className="text-center">
          <div className="text-sm font-bold text-slate-100">{insight.affected}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">affected assets</div>
        </div>
        <div className="text-start px-3 border-l border-surface-700">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">recommended action</div>
          <div className="text-xs text-slate-300 mt-0.5 leading-snug">{insight.action}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        {insight.primaryAction ? (
          <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={insight.primaryAction.onClick}>
            {insight.primaryAction.label}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {insight.secondaryAction ? (
          <button className="btn-outline !px-3 !py-1.5 text-xs" onClick={insight.secondaryAction.onClick}>
            {insight.secondaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function HowDetermined({ nodes }: { nodes: ReactNode }) {
  return <div className="rounded-lg border border-surface-700 bg-surface-850 p-4">{nodes}</div>;
}