import { useState, type ReactNode } from "react";
import { BrainCircuit, ChevronDown, ChevronRight, CircleAlert, FileCheck2, FlaskConical, GitBranch, ListChecks, ShieldAlert, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import type { AiRemediationIntelligence, ChangeRisk } from "@nexus/shared-types";
import { cn } from "../../utils/cn";

const RISK_CLS: Record<ChangeRisk, string> = {
  LOW: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  HIGH: "border-orange-500/50 bg-orange-500/10 text-orange-300",
  CRITICAL: "border-red-500/50 bg-red-500/10 text-red-300",
  REVIEW_REQUIRED: "border-purple-500/50 bg-purple-500/10 text-purple-300",
};

export function ChangeRiskPill({ risk }: { risk: ChangeRisk }) {
  return <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider", RISK_CLS[risk] ?? RISK_CLS.MEDIUM)}>{risk.replace("_", " ")}</span>;
}

const PHASE_LABEL: Record<string, string> = { BEFORE: "Before change", CHANGE: "Change", AFTER: "After change" };

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-500">{icon} {title}</div>
      {children}
    </div>
  );
}

/**
 * PHASE 6 — AI Remediation Intelligence panel (read-only).
 * Every recommended change still flows through validate → approve → execute →
 * verify → rollback; the AI never executes anything itself.
 */
export function AiRemediationIntelligencePanel({ intelligence: intel }: { intelligence: AiRemediationIntelligence }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const baseline = intel.source !== "ai";

  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/[0.04] p-3 space-y-3 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <BrainCircuit className="w-4 h-4 text-accent" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider text-accent">AI Remediation Intelligence</span>
        <span className="px-1.5 py-0.5 rounded border border-surface-700 font-mono text-[9px] text-slate-400">v{intel.version}</span>
        <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider", baseline ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-sky-500/40 bg-sky-500/10 text-sky-300")}>
          {baseline ? "Baseline remediation guidance" : "AI-assisted"}
        </span>
        <ChangeRiskPill risk={intel.changeRisk} />
        <span className="ml-auto text-[10px] text-slate-500">confidence {Math.round(intel.confidence * 100)}%</span>
      </div>

      {baseline ? (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2 py-1.5 text-[10px] text-amber-200/90">
          <CircleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>AI remediation intelligence temporarily unavailable. Showing labeled baseline guidance — the approval workflow stays fully operational.</span>
        </div>
      ) : null}

      <p className="text-slate-300 leading-relaxed">{intel.summary}</p>

      <Section title="Root cause" icon={<Sparkles className="w-3 h-3" aria-hidden="true" />}>
        <p className="text-slate-300">{intel.rootCause}</p>
        <span className={cn("inline-flex px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider", intel.rootCauseCertainty === "EVIDENCE_GROUNDED" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300")}>
          {intel.rootCauseCertainty === "EVIDENCE_GROUNDED" ? "Evidence-grounded" : "Insufficient evidence"}
        </span>
      </Section>

      <Section title={`Evidence used (${intel.evidenceUsed.length})`} icon={<FileCheck2 className="w-3 h-3" aria-hidden="true" />}>
        {intel.evidenceUsed.length === 0 ? (
          <p className="text-slate-500">No evidence records were available — the plan is provisional.</p>
        ) : (
          <div className="space-y-1.5">
            {intel.evidenceUsed.map((e) => (
              <div key={e.evidenceId} className="rounded border border-surface-700 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-accent">{e.controlId}</span>
                  <span className="text-slate-500">{e.evidenceType}</span>
                  <span className={cn("px-1 py-0.5 rounded border text-[9px] uppercase tracking-wider", e.verified ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300")}>{e.verified ? "verified" : "unverified"}</span>
                  <span className="ml-auto font-mono text-[9px] text-slate-600" title={e.hash}>{e.hash.slice(0, 12)}…</span>
                </div>
                <div className="mt-0.5 text-slate-400">
                  <span className="text-slate-500">observed </span><span className="font-mono text-slate-200 break-all">{e.observedValue}</span>
                  <span className="text-slate-500"> · expected </span><span className="font-mono text-slate-300 break-all">{e.expectedValue || "—"}</span>
                  <span className="text-slate-600"> · {e.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recommended actions" icon={<ListChecks className="w-3 h-3" aria-hidden="true" />}>
        <div className="space-y-1.5">
          {intel.recommendedActions.map((a, i) => (
            <div key={`${a.actionType}-${i}`} className="rounded border border-surface-700 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-accent">{a.actionType}</span>
                <ChangeRiskPill risk={a.changeRisk} />
                <span className="px-1 py-0.5 rounded border border-purple-500/40 text-[9px] uppercase tracking-wider text-purple-300">approval required</span>
              </div>
              <div className="mt-0.5 text-slate-200">{a.action}</div>
              <div className="text-slate-500">target <span className="text-slate-300">{a.target}</span> · {a.configArea} · expected <span className="font-mono text-slate-300">{a.expectedState}</span></div>
              <div className="text-[10px] text-slate-500">{a.reason}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Pre-checks" icon={<ShieldAlert className="w-3 h-3" aria-hidden="true" />}>
        <ol className="list-decimal list-inside space-y-1">
          {intel.preChecks.map((p) => (
            <li key={p.id} className="text-slate-300">{p.check} <span className="text-[10px] text-slate-500">— {p.rationale}</span></li>
          ))}
        </ol>
      </Section>

      <Section title="Potential impact / blast radius" icon={<GitBranch className="w-3 h-3" aria-hidden="true" />}>
        <p className="text-slate-300">{intel.potentialImpact}</p>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="px-1.5 py-0.5 rounded border border-slate-500/40 text-slate-300">{intel.blastRadius.affectedAssetCount} assets</span>
          <span className="px-1.5 py-0.5 rounded border border-red-500/40 text-red-300">{intel.blastRadius.criticalAssetsAffected} critical/high</span>
          <span className="px-1.5 py-0.5 rounded border border-sky-500/40 text-sky-300">{intel.blastRadius.servicesAffected} service types</span>
          <span className="px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-300">{intel.blastRadius.regionsAffected.length} region(s)</span>
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-3">
        <Section title="Validation plan" icon={<FlaskConical className="w-3 h-3" aria-hidden="true" />}>
          <div className="space-y-1">
            {intel.validationSteps.map((v, i) => (
              <div key={i} className="text-slate-300">
                <span className="mr-1 px-1 py-0.5 rounded border border-surface-700 text-[9px] uppercase tracking-wider text-slate-400">{PHASE_LABEL[v.phase] ?? v.phase}</span>
                {v.step}
                {v.expectedControl ? <span className="ml-1 font-mono text-[10px] text-accent">{v.expectedControl}</span> : null}
              </div>
            ))}
          </div>
        </Section>
        <Section title="Rollback plan" icon={<Undo2 className="w-3 h-3" aria-hidden="true" />}>
          <span className={cn("inline-flex px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider", intel.rollbackStatus === "AVAILABLE" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-purple-500/50 bg-purple-500/10 text-purple-300")}>
            {intel.rollbackStatus === "AVAILABLE" ? "Rollback available" : "Rollback review required"}
          </span>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            {intel.rollbackSteps.map((r, i) => <li key={i} className="text-slate-300">{r.step}</li>)}
          </ol>
        </Section>
      </div>

      <Section title="Expected result" icon={<ShieldCheck className="w-3 h-3" aria-hidden="true" />}>
        <p className="text-slate-300">{intel.expectedResult}</p>
      </Section>

      <Section title="Change risk" icon={<ShieldAlert className="w-3 h-3" aria-hidden="true" />}>
        <div className="flex items-center gap-2"><ChangeRiskPill risk={intel.changeRisk} /><span className="text-slate-400">{intel.changeRiskReason}</span></div>
      </Section>

      <Section title="Connector capability (vendor-aware)" icon={<GitBranch className="w-3 h-3" aria-hidden="true" />}>
        {intel.connectorCapabilities.length === 0 ? (
          <p className="text-slate-500">No connector capability information is available.</p>
        ) : (
          <ul className="list-disc list-inside space-y-0.5 text-slate-400">{intel.connectorCapabilities.map((c, i) => <li key={i}>{c}</li>)}</ul>
        )}
        {intel.unavailable.length > 0 ? (
          <div className="mt-1 text-[10px] text-amber-300/90">
            Unavailable information: <ul className="list-disc list-inside">{intel.unavailable.map((u, i) => <li key={i}>{u}</li>)}</ul>
          </div>
        ) : null}
      </Section>

      <div>
        <button onClick={() => setWhyOpen((v) => !v)} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 hover:text-accent">
          {whyOpen ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
          Why this remediation?
        </button>
        {whyOpen ? (
          <ol className="mt-1.5 space-y-1 rounded-lg border border-surface-700 bg-surface-800/40 px-3 py-2">
            {intel.whyThisRemediation.map((w, i) => <li key={i} className="text-slate-300">{w}</li>)}
          </ol>
        ) : null}
      </div>

      <p className="text-[10px] text-slate-600">{intel.disclaimer}</p>
    </div>
  );
}
