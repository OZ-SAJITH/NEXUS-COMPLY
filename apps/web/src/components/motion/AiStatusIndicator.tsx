import { AlertTriangle } from "lucide-react";
import { cn } from "../../utils/cn";

export type AiStatusState =
  | "IDLE"
  | "ANALYZING"
  | "MAPPING_CONTROLS"
  | "ASSESSING_RISK"
  | "GENERATING_FINDINGS"
  | "COMPLETE"
  | "ERROR";

const META: Record<AiStatusState, { label: string; sub: string; accent: string }> = {
  IDLE: { label: "NEXUS AI · Idle", sub: "Engine ready to analyze configurations", accent: "text-slate-300" },
  ANALYZING: { label: "ANALYZING VENDOR", sub: "Detecting syntax · extracting security intent", accent: "text-cyan-300" },
  MAPPING_CONTROLS: { label: "MAPPING CONTROLS", sub: "Binding intents to control families", accent: "text-sky-300" },
  ASSESSING_RISK: { label: "ASSESSING RISK", sub: "Scoring severity, exposure and criticality", accent: "text-amber-300" },
  GENERATING_FINDINGS: { label: "GENERATING FINDINGS", sub: "Drafting evidence-bound findings", accent: "text-orange-300" },
  COMPLETE: { label: "ANALYSIS COMPLETE", sub: "Findings ready for the Human Review Queue", accent: "text-emerald-300" },
  ERROR: { label: "ANALYSIS ERROR", sub: "The engine could not complete the pass", accent: "text-red-300" },
};

function Core({ state }: { state: AiStatusState }) {
  switch (state) {
    case "ANALYZING":
      return (
        <div className="relative w-10 h-10 overflow-hidden rounded-lg border border-cyan-500/40 bg-cyan-500/10">
          <span className="absolute left-1 top-1 right-1 h-full ai-scanline bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent" />
          <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-cyan-300 ai-node-pulse" />
        </div>
      );
    case "MAPPING_CONTROLS":
      return (
        <div className="grid grid-cols-3 gap-1 p-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10">
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-sky-300/80 ai-node-pulse"
              style={{ animationDelay: `${(i % 3) * 160 + Math.floor(i / 3) * 240}ms` }}
            />
          ))}
        </div>
      );
    case "ASSESSING_RISK":
      return (
        <div className="flex items-end justify-center gap-1 w-10 h-10 p-2 rounded-lg border border-amber-500/40 bg-amber-500/10">
          {[0.5, 0.9, 1.3, 0.8, 1.1].map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-amber-300 ai-wave-bar"
              style={{ height: `${h * 100}%`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      );
    case "GENERATING_FINDINGS":
      return (
        <div className="flex flex-col justify-center gap-1 w-10 h-10 p-2 rounded-lg border border-orange-500/40 bg-orange-500/10">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-0.5 rounded-full bg-orange-300/80 animate-pulse" style={{ width: `${92 - i * 24}%`, animationDelay: `${i * 260}ms` }} />
          ))}
        </div>
      );
    case "COMPLETE":
      return (
        <div className="w-10 h-10 rounded-lg border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path className="check-anim" d="M4 12.5 L9.5 18 L20 6.5" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    case "ERROR":
      return (
        <div className="w-10 h-10 rounded-lg border border-red-500/40 bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-300 warn-anim" aria-hidden="true" />
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 rounded-lg border border-surface-600 bg-surface-800 flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse-dot" />
        </div>
      );
  }
}

interface AiStatusIndicatorProps {
  state: AiStatusState;
  className?: string;
  compact?: boolean;
}

export function AiStatusIndicator({ state, className, compact }: AiStatusIndicatorProps) {
  const meta = META[state];
  return (
    <div className={cn("glass-card glass-card-static !rounded-xl flex items-center gap-3 px-3.5 py-2.5", className)}>
      <Core state={state} />
      <div className="min-w-0">
        <div className={cn("text-[11px] font-bold tracking-[0.14em] uppercase", meta.accent)}>{meta.label}</div>
        {!compact ? <div className="text-[11px] text-slate-500 truncate">{meta.sub}</div> : null}
      </div>
    </div>
  );
}