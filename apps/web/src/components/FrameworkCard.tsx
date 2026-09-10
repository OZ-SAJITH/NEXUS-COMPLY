import { ComplianceRing } from "./ComplianceRing";
import { SeverityBadge } from "./SeverityBadge";

export interface FrameworkCardData {
  id: string;
  name: string;
  version: string;
  description: string;
  score: number;
  passed: number;
  failed: number;
  openFindings: number;
}

export function FrameworkCard({ fw }: { fw: FrameworkCardData }) {
  return (
    <div className="card card-hover !p-5">
      <div className="flex items-center gap-4">
        <ComplianceRing value={fw.score} size={92} stroke={9} label={`${fw.score}`} sublabel="% ready" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-100">{fw.name}</div>
          <div className="text-xs text-slate-500 font-mono">{fw.version}</div>
          <div className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">{fw.description}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 px-2 py-1.5 text-center">
          <div className="text-sm font-bold text-emerald-400">{fw.passed}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">passed</div>
        </div>
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 px-2 py-1.5 text-center">
          <div className="text-sm font-bold text-red-400">{fw.failed}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">failed</div>
        </div>
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 px-2 py-1.5 text-center">
          <div className="text-sm font-bold text-amber-400">{fw.openFindings}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">open</div>
        </div>
      </div>
      {fw.openFindings > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          <SeverityBadge severity={fw.openFindings > 5 ? "HIGH" : "MEDIUM"} label={`${fw.openFindings} open finding${fw.openFindings === 1 ? "" : "s"}`} />
        </div>
      ) : null}
    </div>
  );
}