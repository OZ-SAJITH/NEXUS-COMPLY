import type { GovernanceException } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

const STYLES: Record<GovernanceException["status"], string> = {
  REQUESTED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-red-500/40 bg-red-500/10 text-red-300",
  EXPIRED: "border-slate-500/40 bg-slate-500/10 text-slate-400",
};

export function GovernanceExceptionBadge({ status }: { status: GovernanceException["status"] }) {
  return <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider", STYLES[status])}>{status}</span>;
}