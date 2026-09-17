import { ComplianceBar, ComplianceRing } from "../ComplianceRing";
import { GlassCard } from "../motion/GlassCard";
import { SeverityBadge } from "../ui";
import { cn } from "../../utils/cn";

export interface PostureCategory {
  id: string;
  label: string;
  score: number;
  total: number;
}

/**
 * Global compliance posture panel — AI assessment vs human-verified rings,
 * pending-review chip and per-domain compliance bars.
 */
export function GlobalPosturePanel({
  compliance,
  aiScore,
  humanVerifiedScore,
  pending,
  humanVerifiedCoverage,
  categories,
}: {
  compliance: { score: number; passed: number; failed: number };
  aiScore: number;
  humanVerifiedScore: number;
  pending: number;
  humanVerifiedCoverage: number;
  categories: PostureCategory[];
}) {
  return (
    <GlassCard className="!p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-slate-100">Compliance posture</h2>
        <SeverityBadge severity={compliance.score >= 85 ? "LOW" : compliance.score >= 70 ? "MEDIUM" : "HIGH"} label="risk level" />
      </div>
      {/* AI assessment is kept separate from human-verified compliance — they are different numbers. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center rounded-xl border border-sky-500/20 bg-sky-500/5 px-2 py-4" title={`AI engine score ${aiScore}% · ${compliance.failed} failed of ${compliance.passed + compliance.failed} evaluated`}>
          <ComplianceRing value={compliance.score} size={132} stroke={11} sublabel="AI ASSESSMENT" />
        </div>
        <div className="flex flex-col items-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2 py-4" title={`${humanVerifiedCoverage}% of findings human-verified · pending findings are excluded until reviewed`}>
          <ComplianceRing value={humanVerifiedScore} size={132} stroke={11} sublabel="HUMAN VERIFIED" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className={cn("chip border", pending > 0 ? "border-amber-500/40 bg-status-warn-soft text-amber-300" : "border-emerald-500/40 bg-status-ok-soft text-emerald-300")}>
          {pending > 0 ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot" aria-hidden="true" /> PENDING REVIEW · {pending}</>
          ) : (
            <>✓ ALL FINDINGS VERIFIED</>
          )}
        </span>
      </div>
      <div className="mt-5 space-y-3.5">
        {categories.map((c) => (
          <ComplianceBar key={c.id} label={c.label} value={c.score} hint={c.total ? `${c.total} ctrl` : undefined} />
        ))}
      </div>
      <p className="mt-4 text-[11px] text-slate-600 leading-relaxed">
        The AI assessment reflects raw control pass-rate weighted against live findings. The human-verified score only counts findings a reviewer has approved, rejected or resolved.
      </p>
    </GlassCard>
  );
}