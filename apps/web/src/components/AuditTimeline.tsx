import { cn } from "../utils/cn";

export type TimelineStageState = "done" | "active" | "pending";

export interface TimelineStage {
  key: string;
  label: string;
  state: TimelineStageState;
}

export function AuditTimeline({ stages }: { stages: TimelineStage[] }) {
  return (
    <ol className="flex flex-wrap items-start gap-y-3">
      {stages.map((s, i) => (
        <li key={s.key} className="flex items-start">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-semibold transition-colors",
                s.state === "done" && "border-status-ok/50 bg-status-ok/15 text-emerald-300",
                s.state === "active" && "border-accent/60 bg-accent/15 text-accent animate-pulse-dot",
                s.state === "pending" && "border-surface-600 bg-surface-800 text-slate-500"
              )}
              aria-current={s.state === "active" ? "step" : undefined}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "text-xs whitespace-nowrap",
                s.state === "done" && "text-slate-300",
                s.state === "active" && "text-accent font-medium",
                s.state === "pending" && "text-slate-500"
              )}
            >
              {s.label}
            </span>
          </div>
          {i < stages.length - 1 ? (
            <span className="mx-2.5 mt-3 hidden md:block h-px w-6 bg-surface-600" aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}