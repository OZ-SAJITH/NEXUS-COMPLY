import type { AssetCriticality } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

const CRITICALITY_STYLE: Record<AssetCriticality, string> = {
  CRITICAL: "text-red-400 border-red-500/40 bg-red-500/10",
  HIGH: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  MEDIUM: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  LOW: "text-slate-400 border-slate-500/40 bg-slate-500/10",
};

const SIZE_STYLE: Record<"md" | "sm", string> = {
  md: "px-2 py-0.5 rounded-md text-[11px] tracking-wide",
  sm: "px-1 py-0.5 rounded text-[9px] tracking-wider",
};

interface AssetStatusChipProps {
  criticality: AssetCriticality;
  /** md = inventory/table chips · sm = dense graph node chips. */
  size?: "md" | "sm";
  className?: string;
}

/** Criticality chip for an asset — shared by the inventory table and graph nodes. */
export function AssetStatusChip({ criticality, size = "md", className }: AssetStatusChipProps) {
  return (
    <span className={cn("inline-flex items-center border font-semibold uppercase", SIZE_STYLE[size], CRITICALITY_STYLE[criticality], className)}>
      {criticality}
    </span>
  );
}