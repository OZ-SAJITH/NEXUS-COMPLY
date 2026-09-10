import type { ExposurePath } from "../types";
import { cn } from "../utils/cn";

const typeIcon: Record<string, string> = {
  external: "🌐",
  network: "🛡️",
  service: "🔌",
  device: "🖥️",
  asset: "🔓",
};

export function ExposurePathView({ path }: { path: ExposurePath }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-red-400 text-lg">⚠</span>
        <h3 className="font-semibold text-slate-100">{path.title}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">{path.warning}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {path.path.map((node, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={cn("rounded-lg border px-3 py-2 min-w-[110px]")}>
              <div className="text-lg leading-none mb-1">{typeIcon[node.type] ?? "•"}</div>
              <div className="text-xs font-semibold text-slate-200">{node.label}</div>
              {node.detail ? <div className="text-[10px] text-slate-500 mt-0.5">{node.detail}</div> : null}
            </div>
            {i < path.path.length - 1 ? <span className="text-slate-600 text-sm">→</span> : null}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-600 mt-4">
        This is a <strong>potential</strong> exposure path for explainability and prioritization — it is not a claim that a real compromise occurred.
      </p>
    </div>
  );
}