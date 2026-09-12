import type { ComplianceFrameworkDef, FrameworkCoverage } from "@nexus/shared-types";
import { frameworkMeta, frameworkDisplayCode } from "@nexus/governance-core";
import { cn } from "../../utils/cn";

export function FrameworkBadge({ fw, small }: { fw: Pick<ComplianceFrameworkDef, "id" | "region">; small?: boolean }) {
  const meta = frameworkMeta(fw.region);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap", meta.chip, small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs")}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} aria-hidden="true" />
      {frameworkDisplayCode(fw.id)}
    </span>
  );
}

export function FrameworkCoveragePill({ coverage }: { coverage: FrameworkCoverage }) {
  const meta = frameworkMeta(coverage.region);
  const statusStyle =
    coverage.status === "COMPLIANT"
      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
      : coverage.status === "PARTIAL"
        ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
        : coverage.status === "AT_RISK"
          ? "text-red-400 border-red-500/40 bg-red-500/10"
          : "text-slate-400 border-slate-500/40 bg-slate-500/10";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} aria-hidden="true" />
        <span className="text-slate-200 text-sm font-medium truncate">{coverage.name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 rounded-full bg-surface-800 overflow-hidden" aria-hidden="true">
            <div
              className={cn(
                "h-full rounded-full",
                coverage.status === "COMPLIANT" ? "bg-emerald-500" : coverage.status === "PARTIAL" ? "bg-amber-500" : coverage.status === "AT_RISK" ? "bg-red-500" : "bg-slate-600"
              )}
              style={{ width: `${Math.max(0, Math.min(100, coverage.score))}%` }}
            />
          </div>
          <span className="font-mono text-xs text-slate-400 tabular-nums">{coverage.score}%</span>
        </div>
        <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide", statusStyle)}>{coverage.status.replaceAll("_", " ")}</span>
      </div>
    </div>
  );
}