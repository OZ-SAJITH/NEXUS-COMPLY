import { regionOf } from "@nexus/governance-core";
import { cn } from "../../utils/cn";

export function RegionChip({ code, className }: { code: string; className?: string }) {
  const r = regionOf(code);
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-surface-700 bg-surface-800/70 text-xs text-slate-300", className)}>
      <span aria-hidden="true">{r.flag}</span>
      {r.label}
    </span>
  );
}