import { Boxes, Crosshair, GitBranch, Globe2, Shield, ShieldAlert, Sparkles } from "lucide-react";
import type { FindingRiskContext } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

const EXPOSURE_CLS: Record<string, string> = {
  INTERNET_FACING: "border-red-500/50 bg-red-500/10 text-red-300",
  DMZ: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  PARTNER: "border-sky-500/50 bg-sky-500/10 text-sky-300",
  RESTRICTED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  INTERNAL: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800/40 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
      {sub ? <div className="text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function ContributorRow({ label, points, pct }: { label: string; points: number; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-[11px] text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-surface-700/60 overflow-hidden">
        <div className="h-full rounded-full bg-accent/80" style={{ width: `${Math.min(100, pct * 3)}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-slate-300">+{points}</span>
    </div>
  );
}

/**
 * PHASE 5 — "Potential impact" risk context for a single finding: deterministic
 * risk score, level, exposure, asset criticality, blast radius and the
 * contributor detail behind "why this risk".
 */
export function RiskContextPanel({ context, onViewGraph }: { context: FindingRiskContext; onViewGraph?: () => void }) {
  const b = context.blastRadius;
  const contributors = context.contributors;
  const maxPoints = Math.max(
    1,
    contributors.severityContribution,
    contributors.exposureContribution,
    contributors.criticalityContribution,
    contributors.importanceContribution,
    contributors.exploitabilityContribution,
  );
  const pct = (v: number) => Math.round((v / maxPoints) * 100);

  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3 space-y-3 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <Crosshair className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Potential impact / blast radius</span>
        <span className="ml-auto font-mono text-lg font-bold text-slate-100">{context.impactScore}<span className="text-[10px] text-slate-500">/100</span></span>
      </div>

      <div className="h-1.5 rounded-full bg-surface-700/60 overflow-hidden">
        <div className={cn("h-full rounded-full", context.impactScore >= 60 ? "bg-red-500" : context.impactScore >= 30 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${context.impactScore}%` }} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Metric label="Risk score" value={`${context.riskScore}/100`} sub={context.riskLevel} />
        <Metric label="Severity" value={context.severity} sub={context.assetType} />
        <Metric label="Asset criticality" value={context.assetCriticality} sub={context.assetName} />
        <Metric label="Exposure" value={context.exposure} sub="derived from zone / tier / tags" />
        <Metric label="Evidence confidence" value={`${Math.round(context.evidenceConfidence * 100)}%`} sub="sha-256 verified evidence" />
        <Metric label="Affected regions" value={b.regionsAffected.length ? b.regionsAffected.join(", ") : "—"} sub={b.crossRegion ? "cross-region impact" : "single region"} />
      </div>

      <div className="rounded-lg border border-surface-700 bg-surface-800/40 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-500">
          <Boxes className="w-3 h-3" aria-hidden="true" /> Blast radius
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-500/40 text-slate-300"><Boxes className="w-3 h-3" /> {b.affectedAssetCount} assets</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/40 text-red-300"><ShieldAlert className="w-3 h-3" /> {b.criticalAssetsAffected} critical/high</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/40 text-sky-300"><GitBranch className="w-3 h-3" /> {b.servicesAffected} service types</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-300"><Globe2 className="w-3 h-3" /> {b.regionsAffected.length} region{b.regionsAffected.length === 1 ? "" : "s"}</span>
        </div>
        {b.affectedServices.length > 0 ? <div className="text-[10px] text-slate-500">Services: {b.affectedServices.join(", ")}</div> : null}
        {onViewGraph ? (
          <button onClick={onViewGraph} className="mt-1 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent hover:underline">
            View impact graph <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-500">
          <Shield className="w-3 h-3" aria-hidden="true" /> Why this risk?
        </div>
        <ContributorRow label="Control severity" points={contributors.severityContribution} pct={pct(contributors.severityContribution)} />
        <ContributorRow label="Exposure" points={contributors.exposureContribution} pct={pct(contributors.exposureContribution)} />
        <ContributorRow label="Asset criticality" points={contributors.criticalityContribution} pct={pct(contributors.criticalityContribution)} />
        <ContributorRow label="Business importance" points={contributors.importanceContribution} pct={pct(contributors.importanceContribution)} />
        <ContributorRow label="Exploitability" points={contributors.exploitabilityContribution} pct={pct(contributors.exploitabilityContribution)} />
        <div className="flex items-start gap-1.5 pt-1 text-[11px] text-slate-400">
          <Sparkles className="w-3 h-3 text-accent mt-0.5 shrink-0" aria-hidden="true" />
          <span>{context.explanation}</span>
        </div>
      </div>
    </div>
  );
}

export function ExposureBadge({ exposure }: { exposure: string }) {
  return <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider", EXPOSURE_CLS[exposure] ?? EXPOSURE_CLS.INTERNAL)}>{exposure}</span>;
}