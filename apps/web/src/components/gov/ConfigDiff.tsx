import { useMemo, useState } from "react";
import type { ChangeRequest } from "@nexus/shared-types";
import { diffConfigs } from "@nexus/governance-core";
import { cn } from "../../utils/cn";

export function ConfigDiff({ change }: { change: ChangeRequest }) {
  const [filter, setFilter] = useState<"ALL" | "CHANGED" | "ADDED" | "REMOVED">("ALL");
  const items = useMemo(() => diffConfigs(change.configBefore, change.configAfter), [change]);
  const visible = filter === "ALL" ? items : items.filter((i) => i.change === filter);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["ALL", "CHANGED", "ADDED", "REMOVED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors",
              filter === f ? "border-accent/40 bg-accent/10 text-accent" : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200"
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-slate-500">No configuration differences in this category.</p>
      ) : (
        visible.map((d) => (
          <div key={`${d.key}-${d.label}`} className="rounded-lg border border-surface-700 bg-surface-850/50 p-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  d.change === "ADDED" ? "bg-emerald-500/15 text-emerald-400" : d.change === "REMOVED" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                )}
              >
                {d.change}
              </span>
              <span className="text-xs font-mono text-slate-300">{d.label}</span>
              <span className="ml-auto hidden sm:block text-[10px] uppercase tracking-wider text-slate-600">{d.category}</span>
            </div>
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              <div className={cn("rounded-md border px-2.5 py-1.5 font-mono text-xs", d.change === "ADDED" ? "opacity-40 border-surface-700 text-slate-400 line-through" : "border-red-500/25 text-red-300/90")}>
                {d.current || <span className="text-slate-600 italic">— none —</span>}
              </div>
              <div className={cn("rounded-md border px-2.5 py-1.5 font-mono text-xs", d.change === "REMOVED" ? "opacity-40 border-surface-700 text-slate-400" : "border-emerald-500/25 text-emerald-300/90")}>
                {d.proposed}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}