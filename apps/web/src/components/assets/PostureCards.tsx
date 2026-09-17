import type { FrameworkPosture, RegionalPosture } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

const FRAMEWORK_TONE: Record<string, string> = {
  COMPLIANT: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  PARTIAL: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  AT_RISK: "border-red-500/40 bg-red-500/10 text-red-300",
  NOT_ASSESSED: "border-slate-500/40 bg-slate-500/10 text-slate-400",
};

const FRAMEWORK_BAR: Record<string, string> = {
  COMPLIANT: "#34d399",
  PARTIAL: "#f59e0b",
  AT_RISK: "#ef4444",
  NOT_ASSESSED: "#64748b",
};

/**
 * Shared byRegion / byFramework posture cards used on the enterprise
 * Governance hub and the dashboard's "Regional & framework posture" panel.
 */
export function PostureCards({
  byRegion,
  byFramework,
  showOpenFindings = false,
}: {
  byRegion: RegionalPosture[];
  byFramework: FrameworkPosture[];
  showOpenFindings?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card !p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">By region</div>
        <div className="space-y-3">
          {byRegion.map((r) => {
            const total = r.passed + r.failed + r.warnings;
            const ratio = total ? (r.passed / total) * 100 : 0;
            return (
              <div key={r.region}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300">{r.regionLabel} <span className="text-slate-600">· {r.assetCount} assets</span></span>
                  <span className="font-mono text-slate-300">
                    {r.score}% <span className="text-slate-600">({r.passed} passed · {r.failed} failed{r.warnings ? ` · ${r.warnings} warnings` : ""})</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-800 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400/80 transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }} />
                </div>
                {showOpenFindings && r.findings > 0 ? <div className="text-[10px] text-amber-300/90 mt-0.5">{r.findings} open findings</div> : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="card !p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">By framework</div>
        <div className="space-y-3">
          {byFramework.map((f) => (
            <div key={f.framework}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-300">{f.label}</span>
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-slate-400">{f.score}% · {f.passed}/{f.totalControls}</span>
                  <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wider", FRAMEWORK_TONE[f.status] ?? FRAMEWORK_TONE.NOT_ASSESSED)}>
                    {f.status.replace("_", " ")}
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(0, Math.min(100, f.score))}%`, backgroundColor: FRAMEWORK_BAR[f.status] ?? FRAMEWORK_BAR.NOT_ASSESSED }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}