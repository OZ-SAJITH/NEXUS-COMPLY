import { riskBandLabel, riskColor } from "../utils/cn";
import { CountUp } from "./motion/CountUp";

interface Factors {
  severityFactor: number;
  exposureFactor: number;
  criticalityFactor: number;
  controlImportanceFactor: number;
  exploitabilityFactor: number;
}

export function RiskGauge({ score, factors, explanation }: { score: number; factors?: Factors; explanation?: string }) {
  const band = riskBandLabel(score);
  const color = riskColor(score);
  const pct = Math.max(0, Math.min(100, score));

  return (
    <div className="flex gap-6 items-center">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 326.7} 326.7`}
            className={color.split(" ")[0]}
            style={{ transition: "stroke-dasharray 600ms" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <CountUp to={Math.round(pct)} className="text-3xl font-bold text-slate-100 tabular-nums" />
          <div className={`text-[11px] font-semibold uppercase ${color.split(" ")[0]}`}>{band}</div>
          <div className="text-[10px] text-slate-500">/ 100</div>
        </div>
      </div>
      {factors ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ["Severity", factors.severityFactor],
            ["Exposure", factors.exposureFactor],
            ["Asset Criticality", factors.criticalityFactor],
            ["Control Importance", factors.controlImportanceFactor],
            ["Exploitability", factors.exploitabilityFactor],
          ].map(([label, val]) => (
            <div key={label as string}>
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs">{label}</span>
                <span className="text-slate-200 font-medium">{val}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-800 mt-1 overflow-hidden">
                <div className="h-full bg-accent/70 rounded-full" style={{ width: `${val}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {explanation ? <p className="text-xs text-slate-500 max-w-[260px] leading-relaxed">{explanation}</p> : null}
    </div>
  );
}