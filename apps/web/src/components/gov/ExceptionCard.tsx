import type { ComplianceException } from "@nexus/shared-types";
import { ShieldAlert, Ban, FileWarning, CircleX } from "lucide-react";
import type { ReactNode } from "react";
import { RiskBandPill } from "./RiskBandPill";
import { ExceptionStatusPill } from "./StatusPill";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { cn } from "../../utils/cn";

const TYPE_LABEL: Record<string, string> = {
  LEGACY_SYSTEM: "Legacy system",
  DESTRUCTIVE_REMEDIATION: "Destructive remediation",
  LOW_AI_CONFIDENCE: "Low AI confidence",
  REGIONAL_CONFLICT: "Regional conflict",
  CRITICAL_DEPENDENCY: "Critical dependency",
  UNSUPPORTED_CONFIGURATION: "Unsupported configuration",
  CONFLICTING_CONTROLS: "Conflicting controls",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  REGULATORY_AMBIGUITY: "Regulatory ambiguity",
};

export function ExceptionCard({
  exception,
  actions,
  highlight,
}: {
  exception: ComplianceException;
  actions?: ReactNode;
  highlight?: boolean;
}) {
  const icon =
    exception.issueType === "LOW_AI_CONFIDENCE" ? (
      <FileWarning className="w-4 h-4" aria-hidden="true" />
    ) : exception.issueType === "DESTRUCTIVE_REMEDIATION" ? (
      <CircleX className="w-4 h-4" aria-hidden="true" />
    ) : (
      <ShieldAlert className="w-4 h-4" aria-hidden="true" />
    );

  return (
    <div className={cn("rounded-xl border p-4 space-y-3", highlight ? "border-red-500/40 bg-red-500/5" : "border-surface-700 bg-surface-850/50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className={cn("p-2 rounded-lg border", exception.autoRemediationBlocked ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-amber-500/40 bg-amber-500/10 text-amber-400")}>{icon}</span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">{exception.code}</span>
              <ExceptionStatusPill status={exception.status} />
              <RiskBandPill band={exception.risk} />
            </div>
            <div className="text-xs text-slate-300 mt-0.5 font-medium">{TYPE_LABEL[exception.issueType] ?? exception.issueType}</div>
            <div className="text-xs text-slate-500">{exception.controlId} · {exception.controlName}</div>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed">{exception.title}</p>
      <p className="text-xs text-slate-400 leading-relaxed">{exception.observed}</p>

      {exception.reasons.length > 0 ? (
        <ul className="space-y-1">
          {exception.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
              <Ban className="w-3 h-3 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
      ) : null}

      {exception.compensatingControls.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Compensating controls</div>
          <div className="flex flex-wrap gap-1.5">
            {exception.compensatingControls.map((c) => (
              <span key={c} className="px-2 py-0.5 rounded-md border border-surface-700 bg-surface-800/70 text-[11px] text-slate-300">
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        <ConfidenceMeter value={exception.aiConfidence} label="AI confidence" />
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}