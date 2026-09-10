import { cn } from "../utils/cn";

export const SEVERITY_STYLES: Record<string, { box: string; dot: string; label: string }> = {
  CRITICAL: { box: "text-red-300 border-red-500/40 bg-status-danger-soft sev-critical", dot: "bg-red-500", label: "Critical" },
  HIGH: { box: "text-orange-300 border-orange-500/40 bg-orange-500/10 sev-high", dot: "bg-orange-400", label: "High" },
  MEDIUM: { box: "text-amber-300 border-amber-500/40 bg-status-warn-soft", dot: "bg-amber-400 animate-pulse-dot", label: "Medium" },
  LOW: { box: "text-yellow-200 border-yellow-500/30 bg-yellow-500/10", dot: "bg-yellow-300", label: "Low" },
  INFO: { box: "text-slate-300 border-slate-500/40 bg-slate-500/10", dot: "bg-slate-400", label: "Info" },
};

export function SeverityBadge({ severity, label }: { severity: string; label?: string }) {
  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.INFO;
  return (
    <span className={cn("chip border font-semibold uppercase tracking-wide", s.box)} role="status">
      <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} aria-hidden="true" />
      {label ?? s.label}
    </span>
  );
}

export function FindingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { box: string; label: string }> = {
    PASS: { box: "text-emerald-300 border-emerald-500/40 bg-status-ok-soft", label: "Passed" },
    FAIL: { box: "text-red-300 border-red-500/40 bg-status-danger-soft", label: "Open" },
    WARNING: { box: "text-amber-300 border-amber-500/40 bg-status-warn-soft", label: "Investigating" },
    NOT_APPLICABLE: { box: "text-slate-400 border-slate-500/40 bg-slate-500/10", label: "N/A" },
  };
  const s = map[status] ?? map.NOT_APPLICABLE;
  return <span className={cn("chip border", s.box)}>● {s.label}</span>;
}

export function RiskIndicator({ score }: { score: number }) {
  const band = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 40 ? "MEDIUM" : score >= 20 ? "LOW" : "INFO";
  const s = SEVERITY_STYLES[band];
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 font-mono")} title={`Risk score ${score}/100 (${s.label})`}>
      <span className={cn("text-sm font-bold", s.box.split(" ")[0])}>{score}</span>
      <span className={cn("text-[10px] font-medium", s.dot === "bg-slate-400" ? "text-slate-500" : "")}>{s.label}</span>
    </span>
  );
}