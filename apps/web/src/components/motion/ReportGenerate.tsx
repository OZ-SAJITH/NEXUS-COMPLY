import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileDown, X } from "lucide-react";
import { Modal } from "./Modal";
import { cn } from "../../utils/cn";

const STEPS = [
  { key: "collect", label: "COLLECTING EVIDENCE" },
  { key: "validate", label: "VALIDATING CONTROLS" },
  { key: "human", label: "APPLYING HUMAN DECISIONS" },
  { key: "build", label: "BUILDING REPORT" },
];

interface ReportGenerateProps {
  title: string;
  onGenerate: () => Promise<void>;
  onPreview: () => void;
  onClose: () => void;
}

/**
 * Report generation process animation. Exact backend progress is not exposed, so the
 * stages use an indeterminate shimmer (spec: never fake percentages), and "REPORT
 * READY" only fires after the real generation request resolves.
 */
export function ReportGenerate({ title, onGenerate, onPreview, onClose }: ReportGenerateProps) {
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const opened = useRef(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep(1), 480),
      window.setTimeout(() => setStep(2), 980),
      window.setTimeout(() => setStep(3), 1480),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => {
      onGenerate()
        .then(() => {
          if (!alive) return;
          setError(false);
          window.setTimeout(() => {
            if (!alive) return;
            setReady(true);
            if (!opened.current) {
              opened.current = true;
              window.setTimeout(() => {
                onPreview();
              }, 450);
            }
          }, 400);
        })
        .catch(() => {
          if (alive) setError(true);
        });
    };
    run();
    return () => {
      alive = false;
    };
  }, [onGenerate, onPreview]);

  const curLabel = STEPS[step]?.label ?? "FINALIZING REPORT";

  return (
    <Modal title="Generating compliance report" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl border border-accent/40 bg-accent/10 flex items-center justify-center">
            {ready ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 status-flash" aria-hidden="true" />
            ) : (
              <FileDown className="w-5 h-5 text-accent" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">{title}</div>
            <div className={cn("text-[11px] font-bold tracking-[0.14em] uppercase mt-0.5", error ? "text-red-300" : ready ? "text-emerald-300" : "text-accent")}>
              {error ? "GENERATION FAILED" : ready ? "REPORT READY" : curLabel}
            </div>
          </div>
        </div>

        {/* indeterminate progress */}
        <div className="h-1 w-full rounded-full bg-surface-800 overflow-hidden">
          {error ? (
            <div className="h-full w-full bg-status-danger/70" />
          ) : (
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-accent-dim to-accent animate-shimmer" />
          )}
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((s, i) => {
            const done = ready || i < step;
            const active = !ready && !error && i === step;
            const failed = error && i === step;
            return (
              <li key={s.key} className={cn("rg-step flex items-center gap-3 text-xs", !done && !active && !failed && "rg-step-pending")} style={{ animationDelay: `${i * 60}ms` }}>
                <span
                  className={cn(
                    "w-5 h-5 rounded-full border flex items-center justify-center shrink-0",
                    failed
                      ? "border-red-500/50 bg-red-500/15 text-red-300"
                      : done
                        ? "border-emerald-500/40 bg-status-ok-soft text-emerald-300"
                        : active
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-surface-600 text-slate-600"
                  )}
                  aria-hidden="true"
                >
                  {done ? <CheckCircle2 className="w-3 h-3" /> : active ? <span className="w-1.5 h-1.5 rounded-full bg-accent ai-node-pulse" /> : null}
                </span>
                <span className={cn("font-medium tracking-[0.08em]", failed ? "text-red-300" : done ? "text-slate-300" : active ? "text-slate-100" : "text-slate-600")}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {error ? (
          <p className="text-xs text-red-300">The report could not be generated right now. Please try again.</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          {error ? (
            <button className="btn-outline !px-3 !py-2 text-xs" onClick={onClose}>Close</button>
          ) : ready ? (
            <>
              <button className="btn-outline !px-3 !py-2 text-xs" onClick={onClose}><X className="w-3.5 h-3.5" aria-hidden="true" /> Done</button>
              <button className="btn-primary !px-3 !py-2 text-xs" onClick={onPreview}><FileDown className="w-3.5 h-3.5" aria-hidden="true" /> Open report</button>
            </>
          ) : (
            <button className="btn-outline !px-3 !py-2 text-xs" onClick={onClose}>Cancel</button>
          )}
        </div>
      </div>
    </Modal>
  );
}