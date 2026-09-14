import { Link, useLocation } from "react-router-dom";
import type { RemediationStatus } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

export const ENTERPRISE_TABS = [
  { key: "assets", label: "Portfolio", to: "/app/enterprise" },
  { key: "topology", label: "Topology", to: "/app/enterprise/topology" },
  { key: "connectors", label: "Connectors", to: "/app/enterprise/connectors" },
  { key: "remediation", label: "Remediation", to: "/app/enterprise/remediation" },
  { key: "audit", label: "Audit Trail", to: "/app/enterprise/audit" },
] as const;

export function EnterpriseTabs() {
  const location = useLocation();
  return (
    <nav className="flex gap-1 border-b border-surface-700 mb-6 overflow-x-auto" aria-label="Enterprise sections">
      {ENTERPRISE_TABS.map((t) => {
        const active = t.to === "/app/enterprise" ? location.pathname === t.to : location.pathname.startsWith(t.to);
        return (
          <Link
            key={t.key}
            to={t.to}
            className={cn(
              "px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
              active ? "text-accent border-accent font-medium" : "text-slate-400 border-transparent hover:text-slate-200"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const REMEDIATION_STATUS_STYLE: Record<string, string> = {
  PLANNED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  VALIDATED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  VALIDATION_FAILED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  PENDING_APPROVAL: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  APPROVED: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  REJECTED: "border-red-500/40 bg-red-500/10 text-red-300",
  EXECUTING: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  COMPLETED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  FAILED: "border-red-500/40 bg-red-500/10 text-red-300",
  VERIFYING: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  VERIFIED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  ROLLING_BACK: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  ROLLED_BACK: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

export function RemediationStatusBadge({ status }: { status: RemediationStatus | string }) {
  const style = REMEDIATION_STATUS_STYLE[status] ?? REMEDIATION_STATUS_STYLE.PLANNED;
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap", style)}>{status.replaceAll("_", " ")}</span>;
}

export const DISCOVERY_STAGE_STYLE: Record<string, string> = {
  DISCOVERED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  IDENTIFIED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  CONNECTABLE: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  SCANNABLE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export function DiscoveryStageBadge({ stage }: { stage: string }) {
  const style = DISCOVERY_STAGE_STYLE[stage] ?? DISCOVERY_STAGE_STYLE.DISCOVERED;
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap", style)}>{stage}</span>;
}