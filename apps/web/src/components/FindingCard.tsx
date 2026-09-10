import type { Finding } from "../types";
import { SeverityBadge, StatusBadge } from "./ui";
import { cn } from "../utils/cn";

interface Props {
  finding: Finding;
  selected: boolean;
  onSelect: () => void;
}

export function FindingCard({ finding, selected, onSelect }: Props) {
  const failed = finding.status === "FAIL";
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-colors",
        selected ? "border-accent/60 bg-surface-800" : "border-surface-700 hover:border-slate-500 bg-surface-900"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-100">{finding.controlName}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SeverityBadge severity={finding.severity} />
          <StatusBadge status={finding.status} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-slate-500">{finding.controlId}</span>
        <span className={cn("text-[11px] font-semibold", failed ? "text-red-400" : "text-slate-500")}>
          {failed ? `Risk ${finding.risk}/100` : "—"}
        </span>
      </div>
    </button>
  );
}