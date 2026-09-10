import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { GlassCard } from "./GlassCard";

export type NexusCoreState =
  | "IDLE"
  | "SCANNING"
  | "ANALYZING"
  | "REVIEW_REQUIRED"
  | "CRITICAL"
  | "VERIFIED";

const STATE_META: Record<NexusCoreState, { label: string; chip: string; core: string }> = {
  IDLE: { label: "NOMINAL", chip: "text-slate-300 border-slate-500/40", core: "nexus-core--idle" },
  SCANNING: { label: "SCANNING", chip: "text-accent border-accent/40", core: "nexus-core--idle" },
  ANALYZING: { label: "ANALYZING", chip: "text-cyan-300 border-cyan-500/40", core: "nexus-core--idle" },
  REVIEW_REQUIRED: { label: "REVIEW REQUIRED", chip: "text-amber-300 border-amber-500/40", core: "nexus-core--review" },
  CRITICAL: { label: "CRITICAL RISK", chip: "text-red-300 border-red-500/40", core: "nexus-core--critical" },
  VERIFIED: { label: "VERIFIED", chip: "text-emerald-300 border-emerald-500/40", core: "nexus-core--verified" },
};

interface Arm {
  id: string;
  label: string;
  value: ReactNode;
  tone?: string;
}

interface NexusCoreProps {
  state?: NexusCoreState;
  title?: string;
  subtitle?: string;
  arms?: Arm[];
  className?: string;
}

export function NexusCore({
  state = "IDLE",
  title = "NEXUS CORE",
  subtitle = "AI SECURITY ENGINE",
  arms = [],
  className,
}: NexusCoreProps) {
  const meta = STATE_META[state];
  const orb = STATE_META[state].core;
  return (
    <GlassCard className={cn("nexus-core !p-5", STATE_META[state].core, className)}>
      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Core orb */}
        <div className="relative shrink-0 flex flex-col items-center gap-2.5">
          <div className={cn("relative w-20 h-20", orb)}>
            <span className="nexus-core__radar absolute inset-0" aria-hidden="true" />
            <span className="nexus-core__sweep" aria-hidden="true" />
            <span className={cn("nexus-core__ring")} aria-hidden="true" />
            <span className="nexus-core__orb w-full h-full flex items-center justify-center text-slate-950 text-2xl font-black" aria-hidden="true">N</span>
          </div>
          <div className="text-center leading-tight">
            <div className="text-[10px] font-extrabold tracking-[0.24em] text-slate-200">{title}</div>
            <div className="text-[9px] tracking-[0.3em] text-slate-500 mt-0.5">{subtitle}</div>
          </div>
          <span className={cn("chip border text-[10px] font-bold tracking-[0.18em]", meta.chip)}>
            {meta.label}
          </span>
        </div>

        {/* Arms */}
        {arms.length ? (
          <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
            {arms.map((arm, i) => (
              <div key={arm.id} className="row-in flex items-center gap-3 rounded-xl border border-surface-700/70 bg-surface-900/50 px-4 py-3.5" style={{ animationDelay: `${220 + i * 90}ms` }}>
                <span className="relative shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent ai-node-pulse" aria-hidden="true" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-accent/40 ai-ring-pulse" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className={cn("text-xl font-bold leading-none tabular-nums", arm.tone ?? "text-slate-100")}>{arm.value}</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mt-1 truncate">{arm.label}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}