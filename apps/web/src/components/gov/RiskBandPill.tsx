import type { RiskBand } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

export function RiskBandPill({ band, className }: { band: RiskBand | string; className?: string }) {
  const style =
    band === "CRITICAL"
      ? "text-red-400 border-red-500/40 bg-red-500/10"
      : band === "HIGH"
        ? "text-orange-400 border-orange-500/40 bg-orange-500/10"
        : band === "MEDIUM"
          ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
          : "text-slate-400 border-slate-500/40 bg-slate-500/10";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap", style, className)}>
      {band}
    </span>
  );
}