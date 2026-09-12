import { Link, useLocation } from "react-router-dom";
import { cn } from "../../utils/cn";

export const GOV_TABS = [
  { key: "passport", label: "Passport", to: "/app/governance" },
  { key: "frameworks", label: "Frameworks", to: "/app/governance/frameworks" },
  { key: "controls", label: "Control Mapping", to: "/app/governance/controls" },
  { key: "regulatory", label: "Regulatory", to: "/app/governance/regulatory" },
  { key: "scenarios", label: "Scenario Lab", to: "/app/governance/scenarios" },
  { key: "changes", label: "Changes", to: "/app/governance/changes" },
  { key: "exceptions", label: "Exceptions", to: "/app/governance/exceptions" },
  { key: "vendors", label: "Vendor Risk", to: "/app/governance/vendors" },
  { key: "audit", label: "Audit Trail", to: "/app/governance/audit-trail" },
  { key: "drift", label: "Drift", to: "/app/governance/drift" },
] as const;

export function GovTabs() {
  const location = useLocation();
  return (
    <nav className="flex gap-1 border-b border-surface-700 mb-6 overflow-x-auto" aria-label="Global compliance sections">
      {GOV_TABS.map((t) => {
        const active = t.to === "/app/governance" ? location.pathname === t.to : location.pathname.startsWith(t.to);
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