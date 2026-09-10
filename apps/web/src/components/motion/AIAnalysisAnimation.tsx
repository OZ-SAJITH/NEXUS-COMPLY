import { useEffect, useState, type CSSProperties } from "react";
import { Check, FileSearch, Gauge, Layers, Loader2, ScanLine } from "lucide-react";
import { AnimatedNexusLogo, type NexusLogoState } from "./AnimatedNexusLogo";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../utils/cn";

export type AIAnalysisStatus = "ANALYZING" | "COMPLETE" | "ERROR";

interface Stage {
  key: string;
  label: string;
  detail: string;
  Icon: typeof ScanLine;
}

const STAGES: Stage[] = [
  {
    key: "scan",
    label: "Scanning configuration",
    detail: "Parsing the vendor file through the deterministic / adaptive engine",
    Icon: ScanLine,
  },
  {
    key: "map",
    label: "Mapping controls to frameworks",
    detail: "Aligning findings to the selected compliance framework",
    Icon: Layers,
  },
  {
    key: "score",
    label: "Scoring risk",
    detail: "Weighing severity, exposure and criticality",
    Icon: Gauge,
  },
  {
    key: "findings",
    label: "Synthesizing findings",
    detail: "Explaining hard failures with reproducible evidence",
    Icon: FileSearch,
  },
];

interface AIAnalysisAnimationProps {
  /** Real pipeline status driven by the audit run (never faked). */
  status: AIAnalysisStatus;
  /** Config filename being audited (real audit input). */
  filename?: string;
  className?: string;
  /** Interval between pipeline steps while ANALYZING (visual pacing only). */
  stepInterval?: number;
}

export function AIAnalysisAnimation({ status, filename, className, stepInterval = 850 }: AIAnalysisAnimationProps) {
  const reduced = useReducedMotion();
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (status !== "ANALYZING" || reduced) return;
    setCursor(0);
    const id = window.setInterval(() => {
      setCursor((c) => Math.min(STAGES.length, c + 1));
    }, stepInterval);
    return () => window.clearInterval(id);
  }, [status, reduced, stepInterval]);

  const done = status === "COMPLETE";
  const failed = status === "ERROR";
  const logoState: NexusLogoState = done ? "SUCCESS" : failed ? "ERROR" : "AI_ANALYZING";

  return (
    <div role="status" aria-live="polite" className={cn("w-full text-center", className)}>
      <div className="flex justify-center">
        <AnimatedNexusLogo state={logoState} size={72} />
      </div>
      <h3 className="text-base font-semibold text-slate-100 mt-4">Nexus engine active</h3>
      <p className="text-xs text-slate-500 mt-1 truncate">{filename ?? "Auditing configuration…"}</p>

      <ul className="mt-6 text-left space-y-4">
        {STAGES.map((s, i) => {
          const stepDone = done || (!failed && i < cursor);
          const stepRun = !done && !failed && i === cursor && cursor < STAGES.length;
          return (
            <li
              key={s.key}
              className={cn("ai-stage flex items-start gap-3", stepRun && "ai-stage-run", stepDone && "ai-stage-done")}
              style={{ "--i": i } as CSSProperties}
            >
              <span className="ai-node" aria-hidden="true">
                {stepDone ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" strokeWidth={3} />
                ) : stepRun ? (
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" strokeWidth={2.6} />
                ) : (
                  <s.Icon className="w-3.5 h-3.5 text-slate-500" strokeWidth={2.2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium truncate",
                      stepDone ? "text-slate-200" : stepRun ? "text-accent" : "text-slate-400"
                    )}
                  >
                    {s.label}
                  </span>
                  {stepRun ? (
                    <span className="text-[10px] font-mono text-accent ai-blink shrink-0">WORKING</span>
                  ) : stepDone ? (
                    <span className="text-[10px] font-mono text-emerald-400 shrink-0">DONE</span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-600 shrink-0">QUEUED</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{s.detail}</p>
                <div className="ai-bar mt-1.5">
                  <span aria-hidden="true" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 text-xs font-medium">
        {failed ? (
          <span className="text-red-400">Analysis interrupted — the engine returned an error. Check the engine logs and re-run.</span>
        ) : done ? (
          <span className="text-emerald-400">Analysis complete — risk scored, remediation synthesized.</span>
        ) : (
          <span className="text-accent">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-2 align-middle animate-pulse-dot" aria-hidden="true" />
            Nexus engine parsing configuration…
          </span>
        )}
      </div>
    </div>
  );
}