import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, AlertOctagon, FileWarning, Boxes, RefreshCw, Download, Plus, ClipboardCheck, ScanSearch, Gauge as GaugeIcon, Globe2, GitPullRequest, LifeBuoy, Scale, Snowflake } from "lucide-react";
import type { AuditRecord, DashboardStats, GovernanceDashboardStats, GovernanceEvaluation } from "@nexus/shared-types";
import { api, describeApiError } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { MetricCard } from "../components/MetricCard";
import { ComplianceRing, ComplianceBar } from "../components/ComplianceRing";
import { SeverityBadge } from "../components/SeverityBadge";
import { VendorCard } from "../components/VendorCard";
import { FrameworkCard } from "../components/FrameworkCard";
import { FindingsTable, type FindingsRow } from "../components/FindingsTable";
import { AIInsightCard } from "../components/AIInsightCard";
import { NetworkGraph } from "../components/NetworkGraph";
import { LoadingState, ErrorState } from "../components/states";
import { CountUp } from "../components/motion/CountUp";
import { GlassCard } from "../components/motion/GlassCard";
import { Reveal } from "../components/motion/Reveal";
import { NexusCore, type NexusCoreState } from "../components/motion/NexusCore";
import { ComplianceFlow, type FlowNode } from "../components/motion/ComplianceFlow";
import { RiskGauge } from "../components/RiskGauge";
import { cn, timeAgo } from "../utils/cn";
import { buildInsights, categoryBreakdown, computeVendors, frameworkStats, GUIDANCE_FRAMEWORKS, KPI_INSIGHTS } from "../demo/dashboard";
import { VENDOR_META } from "../demo/dashboard";

const SEV_WEIGHTS: Record<string, number> = { CRITICAL: 95, HIGH: 75, MEDIUM: 55, LOW: 30, INFO: 5 };

const SEV_COLORS: Record<string, string> = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b", LOW: "#eab308", INFO: "#64748b" };
const SEV_TEXT: Record<string, string> = { CRITICAL: "text-red-400", HIGH: "text-orange-400", MEDIUM: "text-amber-400", LOW: "text-yellow-300", INFO: "text-slate-500" };
const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

const LIFECYCLE_NODES: FlowNode[] = [
  { key: "scan", label: "Scan", icon: ScanSearch },
  { key: "assess", label: "Assess", icon: GaugeIcon },
  { key: "review", label: "Human review", icon: ClipboardCheck },
  { key: "verified", label: "Verified", icon: ShieldCheck },
];

function riskScore(stats: DashboardStats): number {
  const counts = stats.risk;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const weighted = Object.entries(counts).reduce((acc, [sev, n]) => acc + (SEV_WEIGHTS[sev] ?? 20) * n, 0);
  return Math.round(weighted / total);
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [gov, setGov] = useState<GovernanceDashboardStats | null>(null);
  const [govEval, setGovEval] = useState<GovernanceEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const navigate = useNavigate();
  const auditById = useMemo(() => new Map(audits.map((a) => [a.id, a])), [audits]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      api.getDashboard(),
      api.listAudits().catch(() => [] as AuditRecord[]),
      api.gov.dashboard().catch(() => null as GovernanceDashboardStats | null),
      api.gov.evaluate().catch(() => null as GovernanceEvaluation | null),
    ])
      .then(([d, a, g, ge]) => {
        setStats(d);
        setAudits(a);
        setGov(g);
        setGovEval(ge);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener("nexus:refresh", onRefresh);
    return () => window.removeEventListener("nexus:refresh", onRefresh);
  }, [refresh]);

  const lifecycle = useMemo(() => {
    if (!stats) return { active: 1, status: "ok" as const, label: "Monitoring posture" };
    if (stats.review.pending > 0) return { active: 2, status: "warn" as const, label: "Awaiting human review" };
    if (stats.risk.CRITICAL > 0) return { active: 1, status: "critical" as const, label: "Critical findings detected" };
    if (stats.review.humanVerifiedCoverage >= 90) return { active: 3, status: "ok" as const, label: "All findings verified" };
    return { active: 1, status: "ok" as const, label: "Monitoring posture" };
  }, [stats]);

  const activityItems = useMemo(() => {
    if (!audits.length) return [];
    return [...audits]
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
      .slice(0, 4)
      .map((a) => {
        const score = a.compliance?.score ?? 100;
        const tone: "ok" | "amber" | "red" =
          score >= 85 ? "ok" : a.findings.some((f) => f.severity === "CRITICAL") ? "red" : "amber";
        return {
          id: a.id,
          auditId: a.id,
          at: a.completedAt,
          vendor: (VENDOR_META[a.vendor]?.name ?? a.vendor).toUpperCase(),
          body: `Audit completed · compliance ${score}% — ${a.configurationName}`,
          tone,
        };
      });
  }, [audits]);

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 rounded-lg shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl shimmer" />
          ))}
        </div>
        <div className="h-80 rounded-xl shimmer" />
      </div>
    );
  }

  if (error && !stats) {
    const { title, detail } = describeApiError(error);
    return <ErrorState title={title} detail={detail} onRetry={refresh} />;
  }

  if (!stats) return <LoadingState />;

  const score = riskScore(stats);
  const riskBand = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  const activeFindings = (Object.values(stats.risk) as number[]).reduce((a, b) => a + b, 0);
  const vendors = computeVendors(audits);
  const vendorCount = new Set(audits.map((a) => a.vendor)).size;
  const frameworks = frameworkStats(audits, GUIDANCE_FRAMEWORKS);
  const categories = categoryBreakdown(audits);
  const insights = buildInsights(audits, stats.adaptive.approvedMappings);
  const rows: FindingsRow[] = audits
    .flatMap((a) =>
      a.findings
        .filter((f) => f.status === "FAIL" || f.status === "WARNING")
        .map((f) => ({ id: f.id, auditId: a.id, vendor: a.vendor, finding: f, detectedAt: a.completedAt }))
    )
    .sort((a, b) => b.finding.risk - a.finding.risk);
  const topRisks = stats.topRisks;
  const coreState: NexusCoreState =
    stats.review.pending > 0 ? "REVIEW_REQUIRED" : stats.risk.CRITICAL > 0 ? "CRITICAL" : stats.review.humanVerifiedCoverage >= 90 ? "VERIFIED" : "IDLE";

  return (
    <div className="space-y-6">
      <Reveal y={10} delay={0}>
        <PageHeader
          title="Security Compliance Overview"
          subtitle="Real-time visibility across your multi-vendor infrastructure."
          actions={
            <>
              <Link to="/app/reports" className="btn-outline !px-3 !py-2 text-xs">
                <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export Report
              </Link>
              <Link to="/app/audits/new" className="btn-primary !px-3 !py-2 text-xs">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New Audit
              </Link>
              <button className="btn-ghost !px-3 !py-2 text-xs" onClick={refresh} aria-label="Refresh dashboard">
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          }
        />
      </Reveal>

      {/* Lifecycle — where the compliance signal currently sits */}
      <Reveal delay={20}>
        <GlassCard className="!p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Compliance lifecycle</h2>
            <span
              className={cn(
                "chip border text-[10px] font-bold tracking-wider",
                lifecycle.status === "warn"
                  ? "border-amber-500/40 bg-status-warn-soft text-amber-300"
                  : lifecycle.status === "critical"
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-emerald-500/40 bg-status-ok-soft text-emerald-300"
              )}
            >
              {lifecycle.label}
            </span>
          </div>
          <ComplianceFlow nodes={LIFECYCLE_NODES} activeIndex={lifecycle.active} status={lifecycle.status} ariaLabel="Compliance lifecycle" />
        </GlassCard>
      </Reveal>

      {/* Nexus Core — system status */}
      <Reveal delay={40}>
        <NexusCore
          state={coreState}
          title="NEXUS CORE"
          subtitle="AI SECURITY ENGINE"
          arms={[
            { id: "vendors", label: "Vendor platforms", value: vendorCount, tone: "text-slate-100" },
            { id: "controls", label: "Controls passed", value: stats.compliance.passed, tone: "text-emerald-300" },
            { id: "risks", label: "Active findings", value: activeFindings, tone: activeFindings > 0 ? "text-amber-300" : "text-slate-100" },
          ]}
        />
      </Reveal>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Reveal delay={60}><MetricCard
          icon={<ShieldCheck className="w-[18px] h-[18px]" aria-hidden="true" />}
          label="Overall compliance"
          value={<><CountUp to={stats.compliance.score} /><span className="text-lg text-slate-500">%</span></>}
          context={`${stats.compliance.passed} controls passed of ${stats.compliance.passed + stats.compliance.failed} evaluated`}
          trend={{ text: `+${KPI_INSIGHTS.complianceDelta}% vs prior audit`, direction: "up", positive: true }}
          accent="ok"
        /></Reveal>
        <Reveal delay={140}><MetricCard
          icon={<AlertOctagon className="w-[18px] h-[18px]" aria-hidden="true" />}
          label="Risk score"
          value={score}
          context={`${riskBand} across ${stats.adaptive.totalAudits} audited configurations`}
          trend={{ text: `${Math.abs(KPI_INSIGHTS.riskDeltaPct)}% improvement over 30 days`, direction: "down", positive: true }}
          accent={riskBand === "HIGH" || riskBand === "CRITICAL" ? "danger" : riskBand === "MEDIUM" ? "warn" : "accent"}
        /></Reveal>
        <Reveal delay={220}><MetricCard
          icon={<FileWarning className="w-[18px] h-[18px]" aria-hidden="true" />}
          label="Active findings"
          value={activeFindings}
          context={`${stats.risk.CRITICAL} critical · ${stats.risk.HIGH} high · ${stats.risk.MEDIUM} medium`}
          trend={{ text: "3 critical require attention", direction: "up", positive: false }}
          accent="danger"
        /></Reveal>
        <Reveal delay={300}><MetricCard
          icon={<Boxes className="w-[18px] h-[18px]" aria-hidden="true" />}
          label="Assets audited"
          value={stats.adaptive.totalAudits}
          context={`Across ${vendorCount} vendor platform${vendorCount === 1 ? "" : "s"}`}
          trend={{ text: "Continuous monitoring active", direction: "flat", positive: true }}
          accent="accent"
        /></Reveal>
      </div>

      {/* Global governance */}
      {gov ? (
        <Reveal delay={90}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-100">Global compliance governance</h2>
              <Link to="/app/governance" className="text-xs text-accent hover:underline">Open governance →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
              <MetricCard
                icon={<Globe2 className="w-[18px] h-[18px]" aria-hidden="true" />}
                label="Passport score"
                value={<><CountUp to={gov.passport.globalScore} /><span className="text-lg text-slate-500">%</span></>}
                context={`${gov.passport.posture} posture · ${gov.passport.frameworks.filter((f) => f.applicable).length} applicable frameworks`}
                accent={gov.passport.globalScore >= 85 ? "ok" : gov.passport.globalScore >= 70 ? "accent" : gov.passport.globalScore >= 55 ? "warn" : "danger"}
                link={{ to: "/app/governance", label: "View passport" }}
              />
              <MetricCard
                icon={<GitPullRequest className="w-[18px] h-[18px]" aria-hidden="true" />}
                label="Pending approvals"
                value={gov.pendingApprovals}
                context={`${gov.highRiskChanges} high-risk changes in flight`}
                accent={gov.pendingApprovals > 0 ? "warn" : "ok"}
                link={{ to: "/app/governance/changes", label: "Change governance" }}
              />
              <MetricCard
                icon={<LifeBuoy className="w-[18px] h-[18px]" aria-hidden="true" />}
                label="Open exceptions"
                value={gov.openExceptions}
                context="blocking automated remediation"
                accent={gov.openExceptions > 0 ? "danger" : "ok"}
                link={{ to: "/app/governance/exceptions", label: "Exception Guardian" }}
              />
              <MetricCard
                icon={<Scale className="w-[18px] h-[18px]" aria-hidden="true" />}
                label="Drift & conflicts"
                value={gov.activeDrift + gov.regionConflicts}
                context={`${gov.activeDrift} drift · ${gov.regionConflicts} regional conflicts`}
                accent={gov.activeDrift + gov.regionConflicts > 0 ? "warn" : "ok"}
                link={{ to: "/app/governance/regulatory", label: "Regulatory context" }}
              />
              <MetricCard
                icon={gov.freezeActive ? <Snowflake className="w-[18px] h-[18px]" aria-hidden="true" /> : <GitPullRequest className="w-[18px] h-[18px] text-sky-300" aria-hidden="true" />}
                label="Change freeze"
                value={gov.freezeActive ? "ACTIVE" : "OFF"}
                context={`${gov.regulatoryUpdates} regulatory updates pending`}
                accent={gov.freezeActive ? "warn" : "ok"}
                link={{ to: "/app/governance/changes", label: "Safety gate" }}
              />
              {govEval ? (
                <MetricCard
                  icon={<Scale className="w-[18px] h-[18px]" aria-hidden="true" />}
                  label="Policy engine"
                  value={`${govEval.activeCount} · ${govEval.conditionalCount}`}
                  context={`${govEval.activeCount} active · ${govEval.conditionalCount} conditional frameworks · ${govEval.conflicts.length} policy conflicts`}
                  accent={govEval.conflicts.length > 0 ? "warn" : "ok"}
                  link={{ to: "/app/governance", label: "Active governance" }}
                />
              ) : null}
            </div>
          </div>
        </Reveal>
      ) : null}

      {/* Human-in-the-loop */}
      <Reveal delay={120}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MetricCard
          icon={<ClipboardCheck className="w-[18px] h-[18px]" aria-hidden="true" />}
          label="Pending human review"
          value={stats.review.pending}
          context={`${stats.review.changesRequested} awaiting changes · ${stats.review.aiGenerated} AI-generated`}
          accent={stats.review.pending > 0 ? "warn" : "ok"}
          link={{ to: "/app/reviews", label: "Open queue →" }}
        />
        <MetricCard
          icon={<ScanSearch className="w-[18px] h-[18px]" aria-hidden="true" />}
          label="Verified compliance score"
          value={<><CountUp to={stats.review.humanVerifiedScore} /><span className="text-lg text-slate-500">%</span></>}
          context={`AI engine score ${stats.review.aiScore}% · ${stats.review.humanVerifiedCoverage}% of findings human-verified`}
          accent={stats.review.humanVerifiedCoverage >= 90 ? "ok" : stats.review.pending > 0 ? "warn" : "accent"}
        />
        <GlassCard className="!p-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Human decisions</div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { label: "Approved", value: stats.review.approved, cls: "text-emerald-300" },
              { label: "Rejected", value: stats.review.rejected, cls: "text-red-300" },
              { label: "Changes", value: stats.review.changesRequested, cls: "text-pink-300" },
              { label: "Resolved", value: stats.review.resolved, cls: "text-teal-300" },
              { label: "Audits done", value: stats.review.finalizedAudits, cls: "text-slate-300" },
            ].map((d) => (
              <div key={d.label} className="rounded-lg border border-surface-700 bg-surface-850 px-1 py-2.5">
                <div className={cn("text-xl font-bold", d.cls)}><CountUp to={d.value} /></div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5">{d.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2.5">
            {[
              { label: "AI engine assessment", value: stats.review.aiScore, bar: "bg-cyan-400", num: "text-accent" },
              { label: "Human-verified score", value: stats.review.humanVerifiedScore, bar: "bg-emerald-400", num: "text-emerald-300" },
            ].map((b) => (
              <div key={b.label}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400">{b.label}</span>
                  <span className={cn("font-mono font-bold tabular-nums", b.num)}>
                    <CountUp to={b.value} />%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", b.bar)}
                    style={{ width: `${Math.max(0, Math.min(100, b.value))}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-[10px] text-slate-600 leading-relaxed">
              The human-verified score only counts findings a reviewer has approved, rejected or resolved — pending items are excluded until decided.
            </p>
          </div>
        </GlassCard>
      </div>
      </Reveal>

      {/* Compliance + vendors + risk */}
      <Reveal delay={160}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="!p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-slate-100">Compliance posture</h2>
            <SeverityBadge severity={stats.compliance.score >= 85 ? "LOW" : stats.compliance.score >= 70 ? "MEDIUM" : "HIGH"} label="risk level" />
          </div>
          {/* AI assessment is kept separate from human-verified compliance — they are different numbers. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center rounded-xl border border-sky-500/20 bg-sky-500/5 px-2 py-4" title={`AI engine score ${stats.review.aiScore}% · ${stats.compliance.failed} failed of ${stats.compliance.passed + stats.compliance.failed} evaluated`}>
              <ComplianceRing value={stats.compliance.score} size={132} stroke={11} sublabel="AI ASSESSMENT" />
            </div>
            <div className="flex flex-col items-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-2 py-4" title={`${stats.review.humanVerifiedCoverage}% of findings human-verified · pending findings are excluded until reviewed`}>
              <ComplianceRing value={stats.review.humanVerifiedScore} size={132} stroke={11} sublabel="HUMAN VERIFIED" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className={cn("chip border", stats.review.pending > 0 ? "border-amber-500/40 bg-status-warn-soft text-amber-300" : "border-emerald-500/40 bg-status-ok-soft text-emerald-300")}>
              {stats.review.pending > 0 ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot" aria-hidden="true" /> PENDING REVIEW · {stats.review.pending}</>
              ) : (
                <>✓ ALL FINDINGS VERIFIED</>
              )}
            </span>
          </div>
          <div className="mt-5 space-y-3.5">
            {categories.map((c) => (
              <ComplianceBar key={c.id} label={c.label} value={c.score} hint={c.total ? `${c.total} ctrl` : undefined} />
            ))}
          </div>
          <p className="mt-4 text-[11px] text-slate-600 leading-relaxed">
            The AI assessment reflects raw control pass-rate weighted against live findings. The human-verified score only counts findings a reviewer has approved, rejected or resolved.
          </p>
        </GlassCard>

        <GlassCard className="!p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-100">Multi-Vendor Compliance</h2>
            <Link to="/app/infrastructure" className="text-xs text-accent hover:underline">All vendors →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {vendors.map((v) => (
              <VendorCard key={v.vendor} row={v} />
            ))}
            {vendors.length === 0 ? <p className="col-span-2 text-sm text-slate-500">No audits yet — start one to see vendor coverage.</p> : null}
          </div>
        </GlassCard>

        <GlassCard className="!p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-slate-100">Risk distribution</h2>
            <Link to="/app/intelligence/risk" className="text-xs text-accent hover:underline">Analyze →</Link>
          </div>
          <div className="mb-4 flex items-center justify-center rounded-xl border border-surface-700/80 bg-surface-900/60 px-2 py-3">
            <RiskGauge score={score} />
          </div>
          {SEV_ORDER.map((sev) => {
            const n = stats.risk[sev] ?? 0;
            const max = Math.max(...(Object.values(stats.risk) as number[]), 1);
            return (
              <div key={sev}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <SeverityBadge severity={sev} />
                  <span className="font-mono text-slate-300">{n}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(n / max) * 100}%`,
                      backgroundColor: SEV_COLORS[sev],
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div className="rounded-lg border border-surface-700 bg-surface-850 p-3">
            <div className="text-xs text-slate-400 mb-2">Adaptive intelligence</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <span className="text-slate-500">Known vendors</span><span className="text-right font-mono text-slate-200">{stats.adaptive.knownAnalyzed}</span>
              <span className="text-slate-500">Unknown detected</span><span className="text-right font-mono text-amber-300">{stats.adaptive.unknownDetected}</span>
              <span className="text-slate-500">AI interpretations</span><span className="text-right font-mono text-slate-200">{stats.adaptive.aiInterpretations}</span>
              <span className="text-slate-500">Approved mappings</span><span className="text-right font-mono text-emerald-300">{stats.adaptive.approvedMappings}</span>
            </div>
          </div>
        </GlassCard>
      </div>
      </Reveal>

      {/* Frameworks */}
      <Reveal delay={200}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-100">Compliance frameworks</h2>
          <Link to="/app/compliance/frameworks" className="text-xs text-accent hover:underline">View mapping →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {frameworks.map((fw, i) => (
            <div key={fw.id} className="row-in" style={{ animationDelay: `${300 + i * 80}ms` }}>
              <FrameworkCard fw={fw} />
            </div>
          ))}
        </div>
      </div>
      </Reveal>

      {/* Findings */}
      <Reveal delay={240}>
      <GlassCard className="!p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-100">Active findings</h2>
          <Link to="/app/compliance/findings" className="text-xs text-accent hover:underline">All findings →</Link>
        </div>
        {activeFindings > 0 ? (
          <div className="mb-4">
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-surface-800">
              {SEV_ORDER.map((sev) => {
                const n = stats.risk[sev] ?? 0;
                if (!n) return null;
                return (
                  <div
                    key={sev}
                    className="h-full transition-all duration-700"
                    style={{ width: `${(n / activeFindings) * 100}%`, backgroundColor: SEV_COLORS[sev] }}
                    title={`${n} ${sev}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
              {SEV_ORDER.map((sev) => {
                const n = stats.risk[sev] ?? 0;
                if (!n) return null;
                return (
                  <span key={sev} className={cn("inline-flex items-center gap-1 font-mono", SEV_TEXT[sev])}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SEV_COLORS[sev] }} aria-hidden="true" />
                    {n} {sev}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
        {topRisks.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
            {topRisks.slice(0, 3).map((f) => {
              const a = auditById.get((f as { auditId: string }).auditId);
              return (
                <Link key={f.id} to={`/app/audits/${(f as { auditId: string }).auditId}`} className="group flex items-center gap-2.5 rounded-lg border border-surface-700 hover:border-accent/40 hover:bg-accent/5 px-3 py-2 transition-all duration-200 hover:translate-x-0.5">
                  <SeverityBadge severity={f.severity} label={`${f.severity} · ${f.risk}`} />
                  <span className="text-xs text-slate-300 truncate">{f.what || f.controlName}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{(a ? VENDOR_META[a.vendor]?.name ?? a.vendor : f.auditId).toUpperCase()}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
        <FindingsTable rows={rows} limit={8} />
      </GlassCard>
      </Reveal>

      {/* AI + Network */}
      <Reveal delay={280}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-base font-semibold text-slate-100">AI Security Intelligence</h2>
          {insights.slice(0, 2).map((ins, i) => (
            <div key={ins.id} className="row-in" style={{ animationDelay: `${360 + i * 90}ms` }}>
              <AIInsightCard
                insight={{
                  id: ins.id,
                  title: ins.title,
                  narrative: ins.narrative,
                  risk: ins.risk,
                  affected: ins.affected,
                  action: ins.action,
                  primaryAction: ins.findingId
                    ? { label: "Investigate", onClick: () => navigate(`/app/findings/${ins.findingId}`) }
                    : { label: "Open audits", onClick: () => navigate("/app/audits/history") },
                  secondaryAction: ins.auditId
                    ? { label: "View evidence", onClick: () => navigate(`/app/audits/${ins.auditId}`) }
                    : undefined,
                }}
              />
            </div>
          ))}

          <GlassCard className="!p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-100">Live compliance activity</h2>
              <Link to="/app/audits/history" className="text-xs text-accent hover:underline">History →</Link>
            </div>
            {activityItems.length ? (
              <ul className="space-y-2.5">
                {activityItems.map((ev, i) => (
                  <li key={ev.id} className="row-in flex items-center gap-3" style={{ animationDelay: `${420 + i * 90}ms` }}>
                    <span className={cn("relative flex shrink-0 w-2 h-2 rounded-full", ev.tone === "red" ? "bg-red-400" : ev.tone === "amber" ? "bg-amber-400" : "bg-emerald-400")} aria-hidden="true">
                      <span className={cn("absolute inset-0 rounded-full animate-ping", ev.tone === "red" ? "bg-red-400/60" : ev.tone === "amber" ? "bg-amber-400/60" : "bg-emerald-400/60")} />
                    </span>
                    <Link to={`/app/audits/${ev.auditId}`} className="block flex-1 min-w-0">
                      <span className="block text-xs text-slate-200 truncate">{ev.body}</span>
                      <span className="block text-[10px] text-slate-500 mt-0.5">{ev.vendor} · {timeAgo(ev.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No audits yet — run one to see live compliance activity.</p>
            )}
          </GlassCard>
        </div>
        <div className="lg:col-span-2">
          <GlassCard className="!p-5 h-full">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-100">Infrastructure topology</h2>
              <Link to="/app/infrastructure/networks" className="text-xs text-accent hover:underline">Open map →</Link>
            </div>
            <NetworkGraph audits={audits} onOpen={(d) => navigate(`/app/audits/${d.auditId}`)} />
          </GlassCard>
        </div>
      </div>
      </Reveal>
    </div>
  );
}