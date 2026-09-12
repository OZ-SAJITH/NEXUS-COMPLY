import type { TelemetryPoint } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

export function TelemetryChart({ points, title = "Post-change telemetry" }: { points: TelemetryPoint[]; title?: string }) {
  const grouped = points.reduce<Record<string, TelemetryPoint[]>>((acc, p) => {
    (acc[p.metric] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</div>
      {Object.entries(grouped).map(([metric, series]) => {
        const max = Math.max(...series.map((p) => p.value), ...series.map((p) => p.expected), 1);
        const title = series[0]?.label ?? metric;
        return (
          <div key={metric}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400">{title}</span>
              <span className="text-slate-500 font-mono">
                {series[series.length - 1]?.value}
                {series[0]?.unit ?? ""}
              </span>
            </div>
            <div className="flex items-end gap-1 h-16">
              {series.map((p) => {
                const h = (p.value / max) * 100;
                const expectedH = (p.expected / max) * 100;
                const bad = Math.abs(p.value - p.expected) > p.expected * 0.5 || (p.value > p.expected && expectedH > 0);
                return (
                  <div key={p.t} className="flex-1 flex flex-col items-center gap-0.5" title={`${title}: ${p.value}${p.unit ?? ""} (expected ${p.expected}${p.unit ?? ""})`}>
                    <div className="relative w-full h-14 rounded-sm bg-surface-800/70 overflow-hidden">
                      <div className="absolute bottom-0 left-0 right-0 bg-slate-700/60" style={{ height: `${expectedH}%` }} aria-hidden="true" />
                      <div
                        className={cn("absolute bottom-0 left-0 right-0 rounded-sm transition-all", bad ? "bg-red-500/80" : "bg-emerald-500/80")}
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-600 font-mono">{new Date(p.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}