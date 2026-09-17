import { ChevronDown, ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import type { EvidenceRecord, EvidenceWithVerification } from "@nexus/shared-types";
import { StatusBadge } from "../ui";
import { timeAgo } from "../../utils/cn";

/**
 * Normalized evidence row with optional recomputed SHA-256 integrity detail.
 */
export function EvidenceInspector({
  record,
  detail,
  expanded,
  onToggle,
}: {
  record: EvidenceRecord;
  detail?: EvidenceWithVerification;
  expanded: boolean;
  onToggle: () => void;
}) {
  const verified = detail ? detail.verification.verified : undefined;
  return (
    <div className="rounded-lg border border-surface-700 p-3 text-xs">
      <button onClick={onToggle} className="w-full text-left flex flex-wrap items-center gap-2">
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />}
        <span className="font-mono text-accent">{record.controlId}</span>
        <StatusBadge status={record.status} />
        <span className="text-slate-500">{record.evidenceType}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">{verified ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> : <ShieldAlert className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />}{verified === undefined ? "sha256" : verified ? "integrity verified" : "integrity mismatch"}</span>
        <span className="text-slate-500">{timeAgo(record.timestamp)}</span>
      </button>
      {expanded ? (
        <div className="mt-2 grid sm:grid-cols-2 gap-2 text-slate-400">
          <div><div className="text-[10px] uppercase tracking-wider text-slate-600">Observed</div><span className="font-mono break-all">{record.observedValue}</span></div>
          <div><div className="text-[10px] uppercase tracking-wider text-slate-600">Expected</div><span className="font-mono break-all">{record.expectedValue}</span></div>
        </div>
      ) : null}
      <div className="mt-2 space-y-1 text-[11px] text-slate-500">
        <div className="font-mono">source: {record.source} · collector: {record.collector}</div>
        <div className="font-mono">integrity sha256: {record.integrityHash} · confidence {Math.round(record.confidence * 100)}%</div>
      </div>
      {expanded && detail ? (
        <div className="mt-2 rounded-lg border border-surface-700 bg-surface-800/40 p-3 space-y-1.5 text-[11px] font-mono text-slate-400">
          <div className="text-[10px] uppercase tracking-wider text-slate-600">Recomputed SHA-256 integrity (canonical payload)</div>
          <div>{detail.verification.canonical}</div>
          <div className="flex flex-wrap gap-x-4 pt-1 text-slate-300">
            <span>hash <span className="text-slate-200">{detail.verification.hash}</span></span>
            <span className={verified ? "text-emerald-300" : "text-red-300"}>{verified ? "verified" : "mismatch"}</span>
            <span>{detail.verification.verifiedAt.slice(0, 19).replace("T", " ")}</span>
          </div>
        </div>
      ) : null}
      <div className="mt-2 text-emerald-400/80 text-[10px] font-semibold uppercase tracking-wider">simulated evidence — normalized from the NEXUS-COMPLY test marketplace</div>
    </div>
  );
}