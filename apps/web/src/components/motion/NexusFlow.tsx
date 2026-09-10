import { Check } from "lucide-react";
import { cn } from "../../utils/cn";

export type FlowState = "idle" | "running" | "complete" | "error";

export const FLOW_STAGES = ["Vendor data", "AI engine", "Controls", "Risk", "Findings", "Human", "Verified"];

interface NexusFlowProps {
  state?: FlowState;
  stages?: string[];
  className?: string;
  step?: number;
}

export function NexusFlow({ state = "idle", stages = FLOW_STAGES, className, step }: NexusFlowProps) {
  const activeIndex =
    typeof step === "number" ? Math.max(0, Math.min(stages.length - 1, step)) : state === "complete" || state === "error" ? stages.length - 1 : -1;

  return (
    <div className={cn("relative", className)} role={state === "complete" || state === "error" ? "status" : "progressbar"} aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={state === "complete" ? stages.length : Math.max(0, activeIndex + 1)}>
      {/* track */}
      <div className="absolute left-0 right-0 top-[13px] h-px bg-surface-700 overflow-visible" aria-hidden="true">
        <div
          className={cn("nexus-flow-progress absolute inset-y-0 left-0", state === "running" && "block", state !== "running" && (state === "complete" ? "w-full" : "w-0") && "hidden")}
          style={{ background: "linear-gradient(90deg, rgba(56,189,248,0.25), #38bdf8)" }}
        >
          <span
            className="absolute -right-[4px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-accent"
            style={{ boxShadow: "0 0 12px 2px rgba(56,189,248,0.8)" }}
          />
        </div>
        {state === "running" ? <span className="nexus-flow-particle" aria-hidden="true" /> : null}
      </div>

      {/* nodes */}
      <ol className="relative flex items-start justify-between">
        {stages.map((label, i) => {
          const done = state === "complete" || i < activeIndex;
          const on = state === "running" && i === activeIndex;
          const paused = state === "idle" || (state === "error" && i === stages.length - 1);
          const isErrorNode = state === "error" && i === stages.length - 1;
          return (
            <li key={label} className="flex flex-col items-center gap-1.5 w-[62px] text-center">
              <span
                className={cn(
                  "nexus-flow-node relative w-[26px] h-[26px] rounded-full border flex items-center justify-center transition-colors",
                  on && "run-on",
                  done && "run-done",
                  isErrorNode ? "border-red-500/60 bg-red-500/15 text-red-300" : "border-surface-600 bg-surface-900 text-slate-400"
                )}
                style={{
                  animationDelay: on || done ? `${i * 430}ms` : undefined,
                  boxShadow: done && !isErrorNode ? "0 0 14px rgba(56,189,248,0.25)" : undefined,
                }}
              >
                {done ? <Check className={cn("w-3.5 h-3.5", isErrorNode ? "text-red-300" : "text-accent")} aria-hidden="true" /> : null}
                {!done && !on ? <span className="w-1.5 h-1.5 rounded-full bg-slate-600" aria-hidden="true" /> : null}
                {!done && on ? (
                  <span className="w-3 h-3 rounded-full bg-accent ai-ring-pulse" aria-hidden="true" />
                ) : null}
              </span>
              <span
                className={cn(
                  "text-[9px] font-semibold uppercase tracking-[0.12em] leading-tight",
                  paused ? "text-slate-600" : done ? "text-accent" : on ? "text-accent" : isErrorNode ? "text-red-400" : "text-slate-500"
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}