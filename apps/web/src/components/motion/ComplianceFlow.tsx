import { Fragment } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export interface FlowNode {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface ComplianceFlowProps {
  nodes: FlowNode[];
  activeIndex: number;
  status?: "ok" | "warn" | "critical";
  className?: string;
  ariaLabel?: string;
}

export function ComplianceFlow({
  nodes,
  activeIndex,
  status = "ok",
  className,
  ariaLabel = "Compliance lifecycle",
}: ComplianceFlowProps) {
  return (
    <div className={cn("cf flex items-start w-full", className)} role="list" aria-label={ariaLabel}>
      {nodes.map((node, i) => {
        const Icon = node.icon;
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <Fragment key={node.key}>
            <div className="cf-node flex flex-col items-center gap-2 text-center min-w-0" role="listitem">
              <span
                className={cn(
                  "cf-node__dot relative flex items-center justify-center w-9 h-9 rounded-full border",
                  done && "cf-node-done",
                  active && cn("cf-node-active", status === "warn" && "cf-warn", status === "critical" && "cf-critical"),
                  !done && !active && "border-surface-600 bg-surface-800 text-slate-500"
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {done ? (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                    <Check className="w-2.5 h-2.5 text-slate-950" strokeWidth={3.5} aria-hidden="true" />
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "text-[9px] uppercase tracking-[0.13em] leading-tight",
                  done
                    ? "text-emerald-300"
                    : active
                      ? status === "warn"
                        ? "text-amber-300"
                        : status === "critical"
                          ? "text-red-300"
                          : "text-accent"
                      : "text-slate-500"
                )}
              >
                {node.label}
              </span>
            </div>
            {i < nodes.length - 1 ? (
              <div
                className={cn("cf-connector relative flex-1 h-[2px] mx-2 sm:mx-3 self-start mt-[17px] rounded-full overflow-hidden", i < activeIndex && "filled")}
                aria-hidden="true"
              >
                <span className="cf-connector__fill absolute inset-0" />
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}