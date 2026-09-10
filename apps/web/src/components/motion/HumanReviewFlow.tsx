import { Bot, Wand2, ClipboardCheck, ShieldCheck } from "lucide-react";
import { cn } from "../../utils/cn";

type StepState = "done" | "active" | "pending";

interface HumanReviewFlowProps {
  aiGenerated: number;
  accessible: number;
  pending: number;
  approved: number;
  resolved: number;
  className?: string;
}

/**
 * Human-in-the-loop concept visualization — driven exclusively by the real review
 * queue aggregates. No fabricated stages.
 */
export function HumanReviewFlow({ aiGenerated, accessible, pending, approved, resolved, className }: HumanReviewFlowProps) {
  const hasVerified = resolved > 0 || approved > 0;
  const steps: Array<{ id: string; icon: typeof Bot; label: string; state: StepState; accent: string }> = [
    {
      id: "detect",
      icon: Bot,
      label: "AI DETECTS",
      state: aiGenerated > 0 ? "done" : "pending",
      accent: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
    },
    {
      id: "recommend",
      icon: Wand2,
      label: "AI RECOMMENDS",
      state: accessible > 0 ? "done" : "pending",
      accent: "text-sky-300 border-sky-500/40 bg-sky-500/10",
    },
    {
      id: "human",
      icon: ClipboardCheck,
      label: "HUMAN REVIEW",
      state: pending > 0 ? "active" : hasVerified ? "done" : "pending",
      accent: pending > 0 ? "text-amber-300 border-amber-500/50 bg-amber-500/10" : "text-emerald-300 border-emerald-500/40 bg-status-ok-soft",
    },
    {
      id: "verified",
      icon: ShieldCheck,
      label: "HUMAN VERIFIED",
      state: pending === 0 && hasVerified ? "active" : "pending",
      accent: "text-emerald-300 border-emerald-500/40 bg-status-ok-soft",
    },
  ];

  return (
    <div className={cn("glass !rounded-2xl !p-5", className)} role="img" aria-label="Human-in-the-loop review pipeline">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 lg:gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.state === "active";
          const isDone = s.state === "done";
          const connectorAlive = (i < steps.length - 1 ? steps[i + 1].state !== "pending" : false) || isDone;
          return (
            <div key={s.id} className="flex flex-col lg:flex-row flex-1 items-center gap-3 lg:gap-2">
              <div className={cn("flex flex-col items-center text-center gap-1.5 w-full lg:w-auto")}>
                <span
                  className={cn(
                    "relative w-11 h-11 rounded-2xl border flex items-center justify-center transition-all duration-300",
                    s.accent,
                    isActive && "scale-105 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                  )}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {isActive ? (
                    <span className="absolute -inset-1.5 rounded-2xl border border-amber-500/50 ai-ring-pulse" aria-hidden="true" />
                  ) : null}
                  {isDone ? (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-surface-900 flex items-center justify-center">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path className="check-anim" d="M4 12.5 L9.5 18 L20 6.5" stroke="#052e1b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-[9px] font-bold tracking-[0.16em] uppercase",
                    isActive ? "text-amber-300" : isDone ? "text-emerald-300" : "text-slate-600"
                  )}
                >
                  {s.label}
                </span>
                {s.id === "detect" ? (
                  <span className="text-[10px] text-slate-500 -mt-0.5">{aiGenerated} finding{aiGenerated === 1 ? "" : "s"}</span>
                ) : null}
                {s.id === "human" ? (
                  <span className="flex items-center gap-1 -mt-0.5">
                    <span className="text-[9px] rounded border border-surface-700 px-1.5 py-0.5 text-slate-500 uppercase tracking-wider">Approve</span>
                    <span className="text-[9px] rounded border border-surface-700 px-1.5 py-0.5 text-slate-500 uppercase tracking-wider">Reject</span>
                    <span className="text-[9px] rounded border border-surface-700 px-1.5 py-0.5 text-slate-500 uppercase tracking-wider">Changes</span>
                  </span>
                ) : null}
                {s.id === "verified" ? (
                  <span className="text-[10px] text-slate-500 -mt-0.5">{approved + resolved} human decision{approved + resolved === 1 ? "" : "s"}</span>
                ) : null}
              </div>
              {/* connector */}
              {i < steps.length - 1 ? (
                <div className="flex-1 flex items-center justify-center" aria-hidden="true">
                  <div className="relative h-px w-8 lg:w-full max-w-[60px] bg-surface-700 transition-colors duration-300">
                    <div className={cn("absolute inset-y-0 left-0 bg-gradient-to-r from-accent/60 to-accent transition-all duration-500", connectorAlive ? "w-full" : "w-0")} />
                    <span className={cn("absolute -top-[3px] left-1/2 w-[7px] h-[7px] rounded-full bg-accent transition-opacity duration-300", connectorAlive ? "opacity-100 ai-node-pulse" : "opacity-0")} />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}