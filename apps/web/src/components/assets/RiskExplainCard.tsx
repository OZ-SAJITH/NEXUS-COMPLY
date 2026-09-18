import { useState } from "react";
import { AlignLeft, BrainCircuit, ChevronDown, ChevronRight, Crosshair, Sparkles } from "lucide-react";
import type { AssetFinding, FindingRiskContext } from "@nexus/shared-types";
import { SeverityBadge, StatusBadge } from "../ui";
import { cn } from "../../utils/cn";
import { RiskContextPanel } from "./RiskContextPanel";

function LifecycleBadge({ lifecycle }: { lifecycle?: AssetFinding["lifecycle"] }) {
  const lc = lifecycle ?? "OPEN";
  const styles: Record<string, string> = {
    OPEN: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    ACKNOWLEDGED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    REMEDIATION_PLANNED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    REMEDIATED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    VERIFIED: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
    EXCEPTED: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  };
  return <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider", styles[lc])}>{lc}</span>;
}

/**
 * Finding card with expandable evidence-grounded risk explanation.
 */
export function RiskExplainCard({
  finding,
  assetId,
  onAnalyze,
  onRemediate,
  onRemediationIntelligence,
  onLifecycle,
  context,
}: {
  finding: AssetFinding;
  assetId: string;
  onAnalyze: () => void;
  onRemediate: () => void;
  onRemediationIntelligence?: () => void;
  onLifecycle: (assetId: string, findingId: string, lifecycle: "ACKNOWLEDGED" | "EXCEPTED" | "OPEN") => void;
  context?: FindingRiskContext;
}) {
  const [open, setOpen] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const humanStates: Array<"ACKNOWLEDGED" | "EXCEPTED" | "OPEN"> = ["ACKNOWLEDGED", "EXCEPTED", "OPEN"];
  const viewGraph = () => {
    document.getElementById("impact")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className={cn("rounded-lg border p-3 text-sm", finding.status === "FAIL" ? "border-red-500/30 bg-red-500/[0.04]" : "border-amber-500/30 bg-amber-500/[0.04]")}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <StatusBadge status={finding.status} />
        <LifecycleBadge lifecycle={finding.lifecycle} />
        <span className="font-mono text-[11px] text-accent">{finding.controlId}</span>
        <span className="ml-auto text-[11px] text-slate-400">risk {finding.risk}/100</span>
      </div>
      <div className="mt-2 font-medium text-slate-100">{finding.controlName}</div>
      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{finding.why}</p>
      {finding.riskExplanation ? (
        <p className="text-[11px] text-slate-500 mt-1">{finding.riskExplanation.summary}</p>
      ) : null}
      <button onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-accent">
        {open ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
        Why is this a finding?
      </button>
      {open ? (
        <div className="mt-2 rounded-lg border border-surface-700 bg-surface-800/40 p-3 space-y-2 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
            <span>severity <span className="text-slate-200">{finding.severity}</span></span>
            <span>status <span className="text-slate-200">{finding.status}</span></span>
            {finding.controlId ? <span>control <span className="font-mono text-accent">{finding.controlId}</span></span> : null}
          </div>
          {finding.observedValue ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Observed</div>
              <span className="font-mono break-all text-slate-300">{finding.observedValue}</span>
            </div>
          ) : null}
          {finding.expectedValue ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Expected</div>
              <span className="font-mono break-all text-slate-300">{finding.expectedValue}</span>
            </div>
          ) : null}
          {finding.remediationGuidance ?? finding.recommendedFix ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Recommended fix</div>
              <span className="text-slate-300">{finding.remediationGuidance ?? finding.recommendedFix}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {context ? (
        <>
          <button onClick={() => setImpactOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-accent">
            {impactOpen ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
            <Crosshair className="w-3 h-3" aria-hidden="true" />
            Potential impact / blast radius
            <span className="ml-1 px-1 py-0.5 rounded border border-surface-700 text-[9px] font-semibold text-slate-400">{context.impactScore}/100</span>
          </button>
          {impactOpen ? <div className="mt-2"><RiskContextPanel context={context} onViewGraph={viewGraph} /></div> : null}
        </>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onAnalyze} className="btn !py-1.5 text-xs inline-flex items-center gap-1.5">
          <BrainCircuit className="w-3.5 h-3.5" aria-hidden="true" /> Analyze
        </button>
        <button onClick={onRemediate} className="btn-primary !py-1.5 text-xs inline-flex items-center gap-1.5">
          <AlignLeft className="w-3.5 h-3.5" aria-hidden="true" /> Plan remediation
        </button>
        {onRemediationIntelligence ? (
          <button onClick={onRemediationIntelligence} className="btn !py-1.5 text-xs inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> AI remediation plan
          </button>
        ) : null}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
          lifecycle
          <select
            value={finding.lifecycle ?? "OPEN"}
            onChange={(e) => onLifecycle(assetId, finding.id, e.target.value as "ACKNOWLEDGED" | "EXCEPTED" | "OPEN")}
            className="rounded-md border border-surface-700 bg-surface-800 px-2 py-1 text-[11px] font-mono text-slate-200 uppercase"
          >
            {humanStates.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}