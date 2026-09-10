import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FileText, ArrowRight, ScanSearch, Gauge, ClipboardCheck, ShieldCheck } from "lucide-react";
import type { AuditRecord, ExposurePath, RemediationSimulation } from "../types";
import { api } from "../services/api";
import { fetchApi } from "../services/apiConfig";
import { Card, SeverityBadge, StatusBadge, Stat, Progress, SectionTitle } from "../components/ui";
import { RiskGauge } from "../components/RiskGauge";
import { ConfigViewer } from "../components/ConfigViewer";
import { ExposurePathView } from "../components/ExposurePathView";
import { FindingCard } from "../components/FindingCard";
import { AiReview } from "../components/AiReview";
import { GlassCard } from "../components/motion/GlassCard";
import { ComplianceFlow, type FlowNode } from "../components/motion/ComplianceFlow";
import { CountUp } from "../components/motion/CountUp";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { cn, formatDate, riskBandLabel, severityColor } from "../utils/cn";

type Tab = "overview" | "findings" | "evidence" | "exposure" | "remediation" | "ai";

const LIFECYCLE: FlowNode[] = [
  { key: "scan", label: "Scan", icon: ScanSearch },
  { key: "assess", label: "Assess", icon: Gauge },
  { key: "review", label: "Human review", icon: ClipboardCheck },
  { key: "verified", label: "Verified", icon: ShieldCheck },
];

export default function AuditResultPage() {
  const { id } = useParams<{ id: string }>();
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [configContent, setConfigContent] = useState("");
  const [exposures, setExposures] = useState<ExposurePath[]>([]);
  const [sim, setSim] = useState<RemediationSimulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const reduced = useReducedMotion();
  const [ringPct, setRingPct] = useState(0);

  useEffect(() => {
    if (!audit || reduced) {
      setRingPct(0);
      return;
    }
    const t = window.setTimeout(() => setRingPct(audit.compliance?.score ?? 0), 200);
    return () => window.clearTimeout(t);
  }, [audit, reduced]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const a = await api.getAudit(id);
      setAudit(a);
      setSelectedFindingId((prev) => prev ?? a.findings.find((f) => f.status === "FAIL")?.id ?? null);

      const cfgs = await fetchApi("/configurations").then((r) => r.json());
      const cfg = (cfgs as Array<{ id: string; content: string }>).find((c) => c.id === a.configurationId);
      if (cfg) setConfigContent(cfg.content);

      api
        .getExposurePaths(id)
        .then(setExposures)
        .catch(() => setExposures([]));

      if (a.remediation) setSim(a.remediation);
    } catch (e) {
      setError(String(e));
    }
  }, [id]);

  useEffect(() => {
    setAudit(null);
    setSim(null);
    setSelectedFindingId(null);
    setTab("overview");
    setError("");
    load();
  }, [load]);

  const selectedFinding = useMemo(
    () => audit?.findings.find((f) => f.id === selectedFindingId) ?? null,
    [audit, selectedFindingId]
  );

  const simulate = async () => {
    if (!id) return;
    setSimulating(true);
    try {
      const result = await api.simulateRemediation(id);
      setSim(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setSimulating(false);
    }
  };

  if (error && !audit) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold text-red-400 mb-2">Could not load audit</h2>
        <p className="text-sm text-slate-400">{error}</p>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="space-y-4">
        <div className="card h-32 shimmer" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-24 shimmer" />
          ))}
        </div>
      </div>
    );
  }

  const failing = audit.findings.filter((f) => f.status === "FAIL");
  const critical = failing.filter((f) => f.severity === "CRITICAL");
  const passing = audit.compliance?.passed ?? 0;
  const warnings = audit.compliance?.warnings ?? 0;
  const compScore = audit.compliance?.score ?? 0;
  const compColor = compScore >= 85 ? "#10b981" : compScore >= 55 ? "#f59e0b" : "#ef4444";
  const pendingAi = audit.aiInterpretations?.find((a) => a.status === "PENDING") ?? audit.aiInterpretations?.[0];
  const flow =
    critical.length > 0
      ? { active: 1, status: "critical" as const, label: "CRITICAL FINDINGS" }
      : failing.length > 0
        ? { active: 2, status: "warn" as const, label: "REVIEW NEEDED" }
        : { active: 3, status: "ok" as const, label: "VERIFIED" };
  const highlights = selectedFinding
    ? selectedFinding.evidence.map((e) => ({ lineStart: e.lineStart, lineEnd: e.lineEnd, color: "fail" as const }))
    : [];

  const tabs: Array<{ key: Tab; label: string; badge?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "findings", label: "Findings", badge: failing.length },
    { key: "evidence", label: "Configuration & Evidence" },
    { key: "exposure", label: "Exposure" },
    { key: "remediation", label: "Safe Simulation", badge: sim ? 1 : 0 },
    { key: "ai", label: "AI Review", badge: pendingAi ? 1 : 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="enter-up flex items-center gap-2">
            <span className="chip border border-emerald-500/40 bg-status-ok-soft text-emerald-300">AUDIT COMPLETED</span>
            {audit.vendorStatus === "unknown" ? (
              <span className="chip border border-amber-500/40 bg-amber-500/10 text-amber-300">ADAPTIVE MODE</span>
            ) : (
              <span className="chip border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">DETERMINISTIC PARSER</span>
            )}
          </div>
          <h1 className="enter-up text-2xl font-bold text-slate-100 mt-2" style={{ ["--d" as never]: "60ms" }}>
            {audit.configurationName}
          </h1>
          <div className="enter-up flex items-center gap-2 mt-2 flex-wrap" style={{ ["--d" as never]: "120ms" }}>
            <span className={cn("chip border", severityColor(audit.risk ? riskBandLabel(audit.risk.overallScore) : "INFO"))}>
              Vendor: {audit.vendor.toUpperCase()} ({audit.vendorStatus})
            </span>
            <span className="chip border border-slate-600 text-slate-400 font-mono">{audit.id}</span>
            <span className="chip border border-slate-600 text-slate-400">{formatDate(audit.completedAt)}</span>
          </div>
        </div>
        <div className="enter-up flex items-center gap-2" style={{ ["--d" as never]: "160ms" }}>
          <Link to="/app/audits/history" className="btn-ghost !px-3 !py-2 text-xs">All audits</Link>
          <a className="btn-outline !px-3 !py-2 text-xs" href={api.reportUrl(audit.id)} target="_blank" rel="noreferrer">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Generate PDF Report
          </a>
        </div>
      </div>

      {/* Lifecycle — where this audit sits in the compliance pipeline */}
      <GlassCard className="enter-up !p-4" style={{ ["--d" as never]: "200ms" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Lifecycle</span>
          <span
            className={cn(
              "chip border text-[10px] font-bold tracking-wider",
              flow.status === "warn"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : flow.status === "critical"
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-emerald-500/40 bg-status-ok-soft text-emerald-300"
            )}
          >
            {flow.label}
          </span>
        </div>
        <ComplianceFlow nodes={LIFECYCLE} activeIndex={flow.active} status={flow.status} ariaLabel="Audit compliance lifecycle" />
      </GlassCard>

      {/* Executive summary */}
      <GlassCard className="enter-up !p-5" style={{ ["--d" as never]: "220ms" }}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <svg width="116" height="116" viewBox="0 0 120 120" className="-rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="11" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={compColor}
                  strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={`${(ringPct / 100) * 314} 314`}
                  style={{ transition: "stroke-dasharray 1000ms cubic-bezier(0.16,1,0.3,1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <CountUp to={compScore} duration={1000} suffix="%" className="text-2xl font-bold text-slate-100 leading-none tabular-nums" />
                <span className="text-[10px] text-slate-500 mt-1">compliance</span>
              </div>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Executive summary</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
                {audit.compliance?.passed ?? 0} controls passed, {failing.length} failed and {warnings} warnings across {audit.findings.length} evaluated control checks on this {audit.vendor.toUpperCase()} device.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 min-w-[240px]">
            <SumStat label="Passed controls" value={passing} tone={passing ? "text-emerald-400" : "text-slate-400"} />
            <SumStat label="Failed controls" value={failing.length} tone={failing.length ? "text-red-400" : "text-slate-400"} />
            <SumStat label="Warnings" value={warnings} tone={warnings ? "text-amber-400" : "text-slate-400"} />
            <SumStat label="Critical findings" value={critical.length} tone={critical.length ? "text-red-400" : "text-slate-400"} />
          </div>
        </div>
      </GlassCard>

      <nav className="enter-up flex flex-wrap gap-1 border-b border-surface-700" style={{ ["--d" as never]: "300ms" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "tab-btn px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors",
              tab === t.key ? "tab-btn-active border-transparent text-slate-100 bg-surface-900" : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {t.label}
            {t.badge ? <span className="ml-1.5 text-[10px] chip border border-red-500/40 bg-red-500/10 text-red-400">{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="enter-up space-y-6" style={{ ["--d" as never]: "80ms" }}>
          <div className="card">
            <SectionTitle sub="Transparent, explainable risk — not a hidden AI number">Overall Risk</SectionTitle>
            <RiskGauge
              score={audit.risk?.overallScore ?? 0}
              factors={audit.risk ? {
                severityFactor: audit.risk.severityFactor,
                exposureFactor: audit.risk.exposureFactor,
                criticalityFactor: audit.risk.criticalityFactor,
                controlImportanceFactor: audit.risk.controlImportanceFactor,
                exploitabilityFactor: audit.risk.exploitabilityFactor,
              } : undefined}
              explanation={audit.risk?.explanation}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Controls passed" value={audit.compliance?.passed ?? 0} tone="good" />
            <Stat label="Controls failed" value={audit.compliance?.failed ?? 0} tone={failing.length ? "danger" : "default"} />
            <Stat label="Compliance score" value={`${audit.compliance?.score ?? 0}%`} />
            <Stat label="Critical findings" value={critical.length} tone={critical.length ? "danger" : "default"} />
            <Stat label="High-risk findings" value={failing.filter((f) => f.severity === "HIGH").length} tone={failing.some((f) => f.severity === "HIGH") ? "warn" : "default"} />
          </div>

          <Card>
            <SectionTitle sub="Vendor-neutral representation of what the configuration is intended to do.">
              Security Intent
            </SectionTitle>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500 border-b border-surface-700">
                    <th className="py-2 pr-3">Intent Type</th>
                    <th className="py-2 pr-3">Protocol</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Logging</th>
                    <th className="py-2">Evidence lines</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.intents.map((i) => (
                    <tr key={i.id} className="border-b border-surface-800 last:border-0">
                      <td className="py-2 pr-3 text-slate-200">{i.intentType.replaceAll("_", " ").toLowerCase()}</td>
                      <td className="py-2 pr-3 uppercase text-slate-400">{i.protocol ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-400">
                        {i.source ? `${i.source.type}: ${i.source.value}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">{i.action ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-400">{i.loggingRequired ? "Required" : "—"}</td>
                      <td className="py-2 text-slate-400 font-mono text-xs">
                        {i.evidence.map((e) => `L${e.lineStart}`).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "findings" ? (
        <div className="enter-up grid md:grid-cols-2 gap-6" style={{ ["--d" as never]: "60ms" }}>
          <div>
            <SectionTitle sub={`${failing.length} failing, ${audit.compliance?.passed ?? 0} passing across ${audit.findings.length} controls`}>
              Findings
            </SectionTitle>
            <div className="space-y-2">
              {audit.findings.map((f) => (
                <FindingCard key={f.id} finding={f} selected={selectedFindingId === f.id} onSelect={() => setSelectedFindingId(f.id)} />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <SectionTitle sub="What · Why · Where · Risk · Fix">Finding Detail</SectionTitle>
            {selectedFinding ? (
              <div className="space-y-3">
                <FindingDetail finding={selectedFinding} />
                <Link to={`/app/findings/${selectedFinding.id}`} className="btn-outline !px-3 !py-2 text-xs w-full justify-center">
                  View full finding & explanation <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a finding.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "evidence" ? (
        <div className="enter-up space-y-4" style={{ ["--d" as never]: "60ms" }}>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <div className="label">Select a finding to highlight evidence</div>
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {audit.findings.filter((f) => f.status === "FAIL").length ? (
                  audit.findings
                    .filter((f) => f.status === "FAIL")
                    .map((f) => (
                      <FindingCard key={f.id} finding={f} selected={selectedFindingId === f.id} onSelect={() => setSelectedFindingId(f.id)} />
                    ))
                ) : (
                  <p className="text-sm text-emerald-400">No failing controls to highlight.</p>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <ConfigViewer
                content={configContent || audit.configurationName}
                highlights={highlights}
                vendorLabel={`${audit.vendor.toUpperCase()} · ${audit.configurationName}`}
              />
            </div>
          </div>
        </div>
      ) : null}

      {tab === "exposure" ? (
        <div className="enter-up">
          <SectionTitle sub="Explainable impact — potential exposure paths for failing findings. Never presented as a confirmed compromise.">
            Potential Exposure Paths
          </SectionTitle>
          {exposures.length === 0 ? (
            <p className="text-sm text-emerald-400">No failing findings, so no potential exposure paths.</p>
          ) : (
            <div className="space-y-4">
              {exposures.map((p) => (
                <ExposurePathView key={p.findingId} path={p} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "remediation" ? (
        <div className="enter-up space-y-6" style={{ ["--d" as never]: "60ms" }}>
          <Card>
            <SectionTitle sub="Simulated remediation — the original configuration is never modified.">
              Safe Remediation Simulation
            </SectionTitle>
            {sim ? (
              <div className="grid md:grid-cols-3 gap-4">
                <Stat label="Compliance score BEFORE" value={`${sim.complianceBefore.score}%`} />
                <Stat label="Compliance score AFTER" value={`${sim.complianceAfter.score}%`} tone="good" />
                <Stat label="Posture BEFORE → AFTER" value={<span>{sim.postureBefore} → {sim.postureAfter}</span>} tone={sim.postureAfter > sim.postureBefore ? "good" : "default"} />
                <Stat label="High-risk findings BEFORE" value={sim.highRiskBefore} />
                <Stat label="High-risk findings AFTER" value={sim.highRiskAfter} tone={sim.highRiskAfter < sim.highRiskBefore ? "good" : "default"} />
              </div>
            ) : (
              <button className="btn-primary" onClick={simulate} disabled={simulating || failing.length === 0}>
                {simulating ? "Simulating…" : failing.length === 0 ? "No failing controls to simulate" : "Simulate fix"}
              </button>
            )}
          </Card>

          {sim ? (
            <Card>
              <SectionTitle sub="What the engine would change (simulated only)">Remediation Steps</SectionTitle>
              <div className="space-y-2">
                {sim.steps.map((s) => (
                  <div key={s.findingId} className="flex items-start gap-3 rounded-lg border border-surface-700 p-3">
                    <div>
                      <div className="text-sm font-medium text-slate-200">{s.controlId}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{s.action}</div>
                    </div>
                    <div className="flex-1" />
                    <span className="chip border border-slate-600 text-slate-400">before: FAIL</span>
                    <span className="chip border border-emerald-500/40 text-emerald-400">after: {s.statusAfter}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "ai" ? (
        <div className="enter-up max-w-3xl space-y-4" style={{ ["--d" as never]: "60ms" }}>
          {pendingAi ? (
            <AiReview auditId={audit.id} ai={pendingAi} onChanged={load} />
          ) : (
            <Card>
              <div className="font-semibold text-slate-100 mb-1">No pending AI interpretation</div>
              <p className="text-sm text-slate-500">This configuration used a known vendor parser, so the adaptive workflow was not triggered.</p>
            </Card>
          )}
          {audit.aiInterpretations && audit.aiInterpretations.length > 1 ? (
            <Card>
              <SectionTitle sub="Other interpretations in this audit">Interpretation history</SectionTitle>
              {audit.aiInterpretations.map((ai) => (
                <div key={ai.id} className="flex items-center gap-3 py-2 border-b border-surface-800 last:border-0">
                  <span className="text-sm text-slate-200">{ai.securityIntent}</span>
                  <span className="chip border border-slate-600 text-slate-400">{Math.round(ai.confidence * 100)}%</span>
                  <span className={cn("chip border")}>{ai.status}</span>
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SumStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-850 px-3 py-2.5">
      <CountUp to={value} duration={950} delay={260} className={cn("text-2xl font-bold tabular-nums", tone)} />
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function FindingDetail({ finding }: { finding: { severity: string; status: string; what: string; why: string; where: string; risk: number; impact: string; recommendedFix: string; evidence: Array<{ file: string; lineStart: number; lineEnd: number; reason?: string }>; controlId: string } }) {
  return (
    <div className="space-y-4">
      <div className="card !p-4">
        <div className="flex items-center justify-between mb-3">
          <SeverityBadge severity={finding.severity} label={`${finding.severity} RISK`} />
          <StatusBadge status={finding.status} />
        </div>
        <div className="text-lg font-semibold text-slate-100">{finding.what}</div>
        <div className="text-xs text-slate-500 mt-0.5">{finding.controlId}</div>

        {finding.status === "FAIL" ? (
          <>
            <div className="mt-3 text-3xl font-bold text-red-400">{finding.risk}<span className="text-sm text-slate-500">/100 risk</span></div>
            <Progress value={finding.risk} className="bg-red-500/60" />
          </>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
          <div>
            <div className="label">Why</div>
            <p className="text-slate-300">{finding.why}</p>
          </div>
          <div>
            <div className="label">Where</div>
            <p className="text-slate-300 font-mono text-xs">{finding.where}</p>
          </div>
          <div>
            <div className="label">Impact</div>
            <p className="text-slate-300">{finding.impact}</p>
          </div>
          <div>
            <div className="label">Recommended Fix</div>
            <p className="text-slate-300">{finding.recommendedFix}</p>
          </div>
        </div>
      </div>

      {finding.status === "FAIL" && finding.evidence.length ? (
        <div className="card !p-4">
          <div className="label">Evidence</div>
          {finding.evidence.map((e, i) => (
            <div key={i} className="mt-2 rounded-lg bg-surface-800 border border-surface-700 p-2.5 text-sm">
              <div className="text-sky-400 font-mono text-xs">
                {e.file} · Lines {e.lineStart}–{e.lineEnd}
              </div>
              {e.reason ? <div className="text-slate-300 mt-1 text-xs">{e.reason}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}