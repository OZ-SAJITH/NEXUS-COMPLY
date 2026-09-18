import { ArrowRight, Globe, Route, ShieldAlert } from "lucide-react";
import type { AssetExposurePath } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

/**
 * PHASE 5 — bounded "potential exposure path" from the internet/edge boundary
 * through firewalls/proxies to the asset and its key downstream dependents.
 * Precautionary labeling only — never a confirmed attack path.
 */
export function ExposurePathList({ path }: { path: AssetExposurePath }) {
  if (!path || path.path.length === 0) return null;
  return (
    <div className="card !p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Route className="w-4 h-4 text-accent" aria-hidden="true" />
        <span className="font-medium text-slate-200">{path.label}</span>
        <span className="px-1.5 py-0.5 rounded border border-surface-700 text-[9px] uppercase tracking-wider text-slate-500">bounded · depth {path.depth}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
        {path.path.map((hop, i) => (
          <div key={`${hop.id}-${i}`} className="flex items-center gap-1.5 shrink-0">
            <div
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[11px]",
                hop.kind === "internet"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                  : hop.kind === "edge"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-surface-600 bg-surface-800 text-slate-200",
              )}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {hop.kind === "internet" ? <Globe className="w-3 h-3" aria-hidden="true" /> : null}
                {hop.name}
                {hop.criticality === "CRITICAL" ? <span className="text-[9px] font-semibold text-red-300">· critical</span> : null}
                {hop.exposure ? <span className="text-[9px] uppercase tracking-wider text-slate-500">· {hop.exposure}</span> : null}
              </div>
              {hop.protocol || hop.port ? (
                <div className="text-[9px] text-slate-500">
                  {hop.relation ?? ""} {hop.protocol ? `${hop.protocol}` : ""}
                  {hop.port ? `:${hop.port}` : ""}
                </div>
              ) : null}
            </div>
            {i < path.path.length - 1 ? <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2 text-[10px] text-slate-500 border-t border-surface-700 pt-2">
        <ShieldAlert className="w-3 h-3 text-slate-600 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{path.disclaimer}</span>
      </div>
    </div>
  );
}