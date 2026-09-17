import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ScanSearch, BrainCircuit, AlignLeft, PlugZap, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, Scale } from "lucide-react";
import type { ApplicableControlsResult, AssetConnectorProfile, AssetFinding, AssetRecord, AssetScanRecord, EvidenceRecord, EvidenceWithVerification, FindingAnalysis, GovernanceDecisionTrace, GovernanceException, PolicySelection, RemediationRecord } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { SeverityBadge, StatusBadge, Card, SectionTitle } from "../../components/ui";
import { RiskGauge } from "../../components/RiskGauge";
import { RemediationStatusBadge } from "./EnterpriseTabs";
import { cn, timeAgo, formatDate } from "../../utils/cn";
import { currentUser } from "../../session";

function LifecycleBadge({ lifecycle }: { lifecycle?: AssetFinding["lifecycle"] }) {
  const lc = lifecycle ?? "OPEN";
  const styles: Record<string, string> = {
    OPEN: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    ACKNOWLEDGED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    REMEDIATION_PLANNED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    REMEDIATED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    VERIFIED: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
    EXCEPTED: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  };
  return <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider", styles[lc])}>{lc}</span>;
}

function FindingRow({ finding, assetId, onAnalyze, onRemediate, onLifecycle }: { finding: AssetFinding; assetId: string; onAnalyze: () => void; onRemediate: () => void; onLifecycle: (assetId: string, findingId: string, lifecycle: "ACKNOWLEDGED" | "EXCEPTED" | "OPEN") => void }) {
  const [open, setOpen] = useState(false);
  const humanStates: Array<"ACKNOWLEDGED" | "EXCEPTED" | "OPEN"> = ["ACKNOWLEDGED", "EXCEPTED", "OPEN"];
  return (
    <div className={cn("rounded-lg border p-3 text-sm", finding.status === "FAIL" ? "border-red-500/30 bg-red-500/[0.04]" : "border-amber-500/30 bg-amber-500/[0.04]")}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <StatusBadge status={finding.status} />
        <LifecycleBadge lifecycle={finding.lifecycle} />
        <span className="font-mono text-[11px] text-accent">{finding.controlId}</span>
        <span className="ml-auto text-[11px] text-slate-400">risk {finding.risk}/100</span>
      </div>
      <div className="mt-2 font-medium text-slate-100">{finding.controlName}</div>
      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{finding.why}</p>
      {finding.riskExplanation ? (
        <p className="text-[11px] text-slate-500 mt-1">{finding.riskExplanation.summary}</p>
      ) : null}
      <button onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-accent">
        {open ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
        Why is this a finding?
      </button>
      {open ? (
        <div className="mt-2 rounded-lg border border-surface-700 bg-surface-800/40 p-3 space-y-2 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
            <span>severity <span className="text-slate-200">{finding.severity}</span></span>
            <span>status <span className="text-slate-200">{finding.status}</span></span>
            {finding.controlId ? <span>control <span className="font-mono text-accent">{finding.controlId}</span></span> : null}
          </div>
          {finding.observedValue ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Observed</div>
              <span className="font-mono break-all text-slate-300">{finding.observedValue}</span>
            </div>
          ) : null}
          {finding.expectedValue ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Expected</div>
              <span className="font-mono break-all text-slate-300">{finding.expectedValue}</span>
            </div>
          ) : null}
          {finding.remediationGuidance ?? finding.recommendedFix ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Recommended fix</div>
              <span className="text-slate-300">{finding.remediationGuidance ?? finding.recommendedFix}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onAnalyze} className="btn !py-1.5 text-xs inline-flex items-center gap-1.5">
          <BrainCircuit className="w-3.5 h-3.5" aria-hidden="true" /> Analyze
        </button>
        <button onClick={onRemediate} className="btn-primary !py-1.5 text-xs inline-flex items-center gap-1.5">
          <AlignLeft className="w-3.5 h-3.5" aria-hidden="true" /> Plan remediation
        </button>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
          lifecycle
          <select
            value={finding.lifecycle ?? "OPEN"}
            onChange={(e) => onLifecycle(assetId, finding.id, e.target.value as "ACKNOWLEDGED" | "EXCEPTED" | "OPEN")}
            className="rounded-md border border-surface-700 bg-surface-800 px-2 py-1 text-[11px] font-mono text-slate-200 uppercase"
          >
            {humanStates.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function EvidenceRow({ record, detail, expanded, onToggle }: { record: EvidenceRecord; detail?: EvidenceWithVerification; expanded: boolean; onToggle: () => void }) {
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

function ConnectorPanel({ profile, onTest, busy }: { profile?: AssetConnectorProfile; onTest: () => void; busy: boolean }) {
  if (!profile) return null;
  const c = profile.connector;
  const ok = profile.online;
  return (
    <div className="card !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PlugZap className="w-4 h-4 text-accent" aria-hidden="true" />
        <SectionTitle sub={ok ? "Connector ONLINE — scanning and remediation enabled" : "Connector unavailable — resolve connectivity to scan"}>Managing connector</SectionTitle>
        <span className={cn("ml-auto px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide", ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300")}>
          {ok ? "ONLINE" : "BLOCKED"}
        </span>
      </div>
      {c ? (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-slate-100">{c.name}</span>
            <span className="text-slate-500">v{c.version} · {c.vendor}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>Transport <span className="font-mono text-slate-300">{c.transportType ?? "SIMULATED"}</span></span>
            {c.protocol ? <span>Protocol <span className="font-mono text-slate-300">{c.protocol}</span></span> : null}
            <span>Latency <span className="font-mono text-slate-300">{profile.latencyMs}ms</span></span>
            {c.lastContactAt ? <span>last contact {timeAgo(c.lastContactAt)}</span> : null}
          </div>
          {profile.fromCapabilities.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Declared capabilities</div>
              <div className="flex flex-wrap gap-1">
                {profile.fromCapabilities.map((cap) => (
                  <span key={cap} className="px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 text-[10px] font-mono text-accent">{cap}</span>
                ))}
              </div>
            </div>
          ) : null}
          {c.connectError ? <div className="text-amber-300 text-[11px]">{c.connectError}</div> : null}
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-500">No connector is deployed for this asset class — deploy and connect an adapter to scan.</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={onTest} disabled={busy} className="btn text-xs inline-flex items-center gap-1.5 !py-1.5">
          <PlugZap className="w-3.5 h-3.5" aria-hidden="true" /> {busy ? "Testing…" : "Test connection"}
        </button>
        <span className="text-[10px] text-slate-600">simulated connector</span>
      </div>
    </div>
  );
}

function ExceptionBadge({ status }: { status: GovernanceException["status"] }) {
  const styles: Record<string, string> = {
    REQUESTED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    REJECTED: "border-red-500/40 bg-red-500/10 text-red-300",
    EXPIRED: "border-slate-500/40 bg-slate-500/10 text-slate-400",
  };
  return <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider", styles[status] ?? styles.REQUESTED)}>{status}</span>;
}

function GovernancePanel({ assetId, findingControls }: { assetId: string; findingControls: Array<{ controlId: string; controlName: string }> }) {
  const [evalState, setEvalState] = useState<{ policy: PolicySelection; applicableControls: ApplicableControlsResult; trace: GovernanceDecisionTrace; exceptions: GovernanceException[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [controlId, setControlId] = useState(findingControls[0]?.controlId ?? "");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [showAllControls, setShowAllControls] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      setEvalState(await api.enterprise.evaluateGovernance(assetId));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load governance context.");
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestEx = async () => {
    setSubmitting(true);
    setNotice("");
    try {
      await api.enterprise.requestGovernanceException({
        controlId,
        assetId,
        reason: reason.trim() || "No reason provided.",
        requestedBy: currentUser(),
        expiresInDays: Number(days) || 30,
      });
      setReason("");
      await load();
      setNotice("Exception requested and logged to the enterprise audit trail.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not request exception");
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (exc: GovernanceException, decision: "APPROVED" | "REJECTED") => {
    setSubmitting(true);
    setNotice("");
    try {
      const decided = await api.enterprise.decideGovernanceException(exc.id, { exceptionId: exc.id, decision, decidedBy: currentUser() });
      setNotice(
        decided.status === "APPROVED"
          ? `Exception approved — ${exc.controlId} renders FAIL + EXCEPTION APPROVED until ${new Date(decided.expiresAt).toLocaleDateString()}.`
          : "Exception rejected — the control remains FAIL."
      );
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not decide exception");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !evalState) {
    return <div className="card !p-4 h-32 flex items-center justify-center"><span className="text-xs text-slate-500">Loading governance context…</span></div>;
  }
  if (!evalState) {
    return (
      <div className="card !p-4">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-accent" aria-hidden="true" />
          <SectionTitle sub="Adaptive governance is available for managed estate">Adaptive governance</SectionTitle>
        </div>
        <p className="mt-2 text-xs text-slate-500">{notice || "Governance context unavailable for this asset."}</p>
      </div>
    );
  }

  const { policy, applicableControls, exceptions } = evalState;
  const assetExceptions = exceptions.filter((e) => e.assetId === assetId);
  const controls = applicableControls.applicable;
  const visibleControls = showAllControls ? controls : controls.slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="w-4 h-4 text-accent" aria-hidden="true" />
        <SectionTitle sub="Regional policy, applicable frameworks/controls and governed exceptions">Adaptive governance</SectionTitle>
      </div>
      {notice ? <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">{notice}</div> : null}

      <div className="card !p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Policy selection</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-semibold text-slate-100">{policy.policyProfileName}</span>
          <span className="font-mono text-accent">{policy.policyProfileId}</span>
          <span className="text-slate-500">{policy.regionLabel} · {policy.environment} · {policy.criticality}</span>
        </div>
        {policy.explanation.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {policy.explanation.map((x) => (
              <li key={x} className="px-1.5 py-0.5 rounded border border-surface-700 bg-surface-800/50 text-[10px] text-slate-400">{x}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {policy.frameworks.map((f) => (
            <span key={f.id} title={`${f.name} ${f.version} — ${f.status}`} className="px-2 py-0.5 rounded-md border border-accent/30 bg-accent/5 text-[10px] font-mono text-accent">
              {f.id}
            </span>
          ))}
          <span className="text-[10px] text-slate-600">· {policy.organizationPolicy}</span>
        </div>
        <p className="mt-2 text-[10px] text-slate-600 leading-relaxed">{policy.disclaimer}</p>
      </div>

      <div className="card !p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Applicable controls</div>
          <span className="text-[10px] text-slate-500">{controls.length} applicable · {applicableControls.total} evaluated</span>
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {visibleControls.map((c) => (
            <div key={c.controlId} className="rounded-lg border border-surface-700 bg-surface-800/40 p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <SeverityBadge severity={c.severity} />
                <span className="font-mono text-accent">{c.controlId}</span>
                <span className="truncate text-slate-300">{c.controlName}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{c.whyApplicable}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.frameworkMembership.map((fr) => (
                  <span key={fr} className="px-1.5 py-0.5 rounded border border-surface-700 text-[9px] font-mono text-slate-500">{fr}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {controls.length > 6 ? (
          <button onClick={() => setShowAllControls((v) => !v)} className="mt-2 text-[11px] text-accent hover:underline">
            {showAllControls ? "Show fewer" : `Show all ${controls.length} controls`}
          </button>
        ) : null}
      </div>

      <div className="card !p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Governance exceptions</div>
          <span className="text-[10px] text-slate-500">{assetExceptions.length} on this asset</span>
        </div>
        {assetExceptions.length > 0 ? (
          <ul className="space-y-2">
            {assetExceptions.map((exc) => (
              <li key={exc.id} className="rounded-lg border border-surface-700 bg-surface-800/40 p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <ExceptionBadge status={exc.status} />
                  <span className="font-mono text-accent">{exc.controlId}</span>
                  <span className="text-slate-500">requested by {exc.requestedBy}</span>
                  <span className="ml-auto text-[10px] text-slate-500">expires {new Date(exc.expiresAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{exc.reason}</p>
                {exc.status === "REQUESTED" ? (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => decide(exc, "APPROVED")} disabled={submitting} className="btn !py-1 text-xs inline-flex items-center gap-1">Approve</button>
                    <button onClick={() => decide(exc, "REJECTED")} disabled={submitting} className="btn !py-1 text-xs inline-flex items-center gap-1">Reject</button>
                  </div>
                ) : exc.status === "APPROVED" ? (
                  <div className="mt-1 text-[10px] text-amber-300/90">Renders <span className="font-semibold">FAIL + EXCEPTION APPROVED</span> — never a silent PASS.</div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-slate-500">No exceptions. Outstanding findings can be governed below.</p>
        )}
        <div className="mt-3 rounded-lg border border-surface-700 bg-surface-850 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Request governance exception</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-slate-500">Control</span>
              <select value={controlId} onChange={(e) => setControlId(e.target.value)} className="input !py-1.5 text-xs mt-0.5" disabled={findingControls.length === 0}>
                {findingControls.map((f) => (
                  <option key={f.controlId} value={f.controlId}>{f.controlId} — {f.controlName}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-500">Expires in (days)</span>
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="input !py-1.5 text-xs mt-0.5" />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] text-slate-500">Reason</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Business justification for the exception…" className="input text-xs mt-0.5" />
          </label>
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] text-slate-600">simulated governance — every decision is audited</span>
            <button onClick={requestEx} disabled={submitting || !controlId} className="btn-primary !py-1.5 text-xs">
              {submitting ? "Requesting…" : "Request exception"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssetDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: asset, loading, error, refresh } = useAsyncData<AssetRecord>(() => api.enterprise.asset(id), [id]);
  const { data: scans, refresh: refreshScans } = useAsyncData<AssetScanRecord[]>(() => api.enterprise.assetScans(id), [id]);
  const { data: evidence, refresh: refreshEvidence } = useAsyncData<EvidenceRecord[]>(() => api.enterprise.assetEvidence(id), [id]);
  const { data: connectorProfile, refresh: refreshConnector } = useAsyncData<AssetConnectorProfile>(() => api.enterprise.assetConnector(id), [id]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [analysis, setAnalysis] = useState<FindingAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [verifiedDetails, setVerifiedDetails] = useState<Record<string, EvidenceWithVerification>>({});

  const testConnection = useCallback(async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await api.enterprise.testAssetConnector(id);
      setNotice(result.ok ? `Connection test OK — ${result.connector} v${result.connectorVersion} via ${result.transportType ?? "SIMULATED"}${result.protocol ? `/${result.protocol}` : ""}, ${result.latencyMs}ms, ${result.capabilities.length} capabilities negotiated.` : `Connection test failed — no ONLINE connector is available for this asset.`);
      refreshConnector();
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setBusy(false);
    }
  }, [id, refresh, refreshConnector]);

  const toggleEvidence = useCallback(
    async (recordId: string) => {
      setExpanded((prev) => ({ ...prev, [recordId]: !prev[recordId] }));
      if (!verifiedDetails[recordId]) {
        try {
          const detail = await api.enterprise.assetEvidenceDetail(id, recordId);
          setVerifiedDetails((prev) => ({ ...prev, [recordId]: detail }));
        } catch {
          setNotice("Could not verify evidence record.");
        }
      }
    },
    [id, verifiedDetails]
  );

  const scanNow = useCallback(async () => {
    setBusy(true);
    setNotice("");
    try {
      const s = await api.enterprise.scan(id, "manual");
      setNotice(s.status === "ERROR" ? `Scan failed: ${s.error ?? "unknown error"}` : `Scan ${s.id} complete — ${s.findings.length} findings, risk ${s.risk?.overallScore}/100.`);
      refresh();
      refreshScans();
      refreshEvidence();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }, [id, refresh, refreshScans, refreshEvidence]);

  const analyze = useCallback(
    async (findingId: string) => {
      setAnalyzing(true);
      setNotice("");
      try {
        setAnalysis(await api.enterprise.analyzeFinding(findingId));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setAnalyzing(false);
      }
    },
    []
  );

  const remediate = useCallback(
    async (findingId: string) => {
      setBusy(true);
      setNotice("");
      try {
        const r: RemediationRecord = await api.enterprise.createRemediation(findingId);
        setNotice(`Remediation ${r.id} planned — ${r.proposedAction.displayName}.`);
        navigate("/app/enterprise/remediation");
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Could not plan remediation");
      } finally {
        setBusy(false);
      }
    },
    [navigate]
  );

  const setLifecycle = useCallback(
    async (assetId: string, findingId: string, lifecycle: "ACKNOWLEDGED" | "EXCEPTED" | "OPEN") => {
      setBusy(true);
      setNotice("");
      try {
        const f = await api.enterprise.setFindingLifecycle(assetId, findingId, { lifecycle });
        setNotice(`Finding ${f.controlId} marked ${lifecycle}.`);
        refreshScans();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Could not update finding lifecycle");
      } finally {
        setBusy(false);
      }
    },
    [refreshScans]
  );

  if (loading && !asset) return <LoadingState label="Loading asset…" />;
  if (error && !asset) return <ErrorState title="Could not load asset" detail={error} onRetry={refresh} />;
  if (!asset) return null;

  const latest = scans?.[0];
  const findings = latest?.findings ?? [];
  const failing = findings.filter((f) => f.status === "FAIL").length;
  const warningCount = findings.filter((f) => f.status === "WARNING").length;
  const risk = latest?.risk;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <button onClick={() => navigate("/app/enterprise")} className="text-xs text-slate-500 hover:text-accent inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Portfolio
        </button>
        <PageHeader
          title={asset.name}
          subtitle={`${asset.assetType} · ${asset.vendor} ${asset.technology} · ${asset.siteLabel} (${asset.regionLabel}) · ${asset.location.networkZone} zone / ${asset.location.tier} · ${asset.hostname} (${asset.ipAddress})`}
          actions={
            <button onClick={scanNow} disabled={busy} className="btn-primary text-sm inline-flex items-center gap-2">
              <ScanSearch className="w-4 h-4" aria-hidden="true" /> {busy ? "Scanning…" : "Scan now"}
            </button>
          }
        />
      </div>

      {notice ? <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">{notice}</div> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-slate-100">{asset.criticality}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">criticality</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-slate-100">{failing}</div>
          <div className="text-[10px] uppercase tracking-wider text-red-400">failing controls</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-slate-100">{warningCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-amber-400">warnings</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-slate-100">{asset.complianceScore ?? "—"}{asset.complianceScore !== undefined ? "%" : ""}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">compliance score</div>
        </div>
      </div>

      <section>
        <ConnectorPanel profile={connectorProfile ?? undefined} onTest={testConnection} busy={busy} />
      </section>

      <section>
        <GovernancePanel assetId={id} findingControls={findings.map((f) => ({ controlId: f.controlId, controlName: f.controlName }))} />
      </section>

      {risk ? (
        <Card className="!p-5 flex flex-wrap items-center gap-6">
          <SectionTitle sub="Evidence-grounded risk from the latest simulated scan">Risk posture</SectionTitle>
          <RiskGauge
            score={risk.overallScore}
            factors={{
              severityFactor: risk.severityFactor,
              exposureFactor: risk.exposureFactor,
              criticalityFactor: risk.criticalityFactor,
              controlImportanceFactor: risk.controlImportanceFactor,
              exploitabilityFactor: risk.exploitabilityFactor,
            }}
            explanation={risk.explanation}
          />
        </Card>
      ) : (
        <div className="card !p-5 text-sm text-slate-400">
          No scan on record — run a scan to generate findings, evidence and risk.
        </div>
      )}

      {findings.length > 0 ? (
        <section>
          <SectionTitle sub={`From scan ${latest?.id ?? ""}`}>Findings ({findings.length})</SectionTitle>
          <div className="grid md:grid-cols-2 gap-3">
            {findings.map((f) => (
              <FindingRow key={f.id} finding={f} assetId={id} onAnalyze={() => analyze(f.id)} onRemediate={() => remediate(f.id)} onLifecycle={setLifecycle} />
            ))}
          </div>
        </section>
      ) : null}

      {evidence && evidence.length > 0 ? (
        <section>
          <SectionTitle sub="Normalized, SHA-256 integrity-hashed machine evidence — expand to re-verify">Evidence ({evidence.length})</SectionTitle>
          <div className="grid md:grid-cols-2 gap-3">
            {evidence.map((e) => (
              <EvidenceRow key={e.id} record={e} detail={verifiedDetails[e.id]} expanded={!!expanded[e.id]} onToggle={() => toggleEvidence(e.id)} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <SectionTitle sub="Every scan is retained and audited">Scan history</SectionTitle>
          {!scans || scans.length === 0 ? (
            <div className="card"><EmptyState title="No scans yet" hint="Run a scan to start collecting evidence." /></div>
          ) : (
            <div className="space-y-2">
              {scans.map((s) => (
                <div key={s.id} className="card !p-3 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={s.status === "COMPLETED" ? "PASS" : "FAIL"} />
                  <span className="font-mono text-slate-400">{s.id}</span>
                  <span className="text-slate-500">{s.trigger}</span>
                  {s.status === "COMPLETED" ? <span className="text-slate-400">risk {s.risk?.overallScore}/100 · {s.findings.length} findings</span> : <span className="text-red-400">{s.error}</span>}
                  <span className="ml-auto text-slate-500">{formatDate(s.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle sub="Observed configuration state, change history and rollback snapshots">Asset state</SectionTitle>
          <div className="card !p-4 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Observed state</div>
              <pre className="text-xs text-slate-300 font-mono bg-surface-800/60 rounded-lg p-3 overflow-x-auto">{JSON.stringify(asset.observedState, null, 2)}</pre>
            </div>
            {asset.stateHistory.length > 0 ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">State history</div>
                <div className="space-y-1">
                  {[...asset.stateHistory].reverse().map((h, i) => (
                    <div key={i} className="text-[11px] text-slate-400 flex justify-between gap-2">
                      <span>{h.label}</span>
                      <span className="text-slate-600 whitespace-nowrap">{formatDate(h.at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {asset.history.length > 0 ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Activity</div>
                <div className="space-y-1">
                  {[...asset.history].reverse().slice(0, 8).map((h, i) => (
                    <div key={i} className="text-[11px] text-slate-400 flex justify-between gap-2">
                      <span>{h.action}</span>
                      <span className="text-slate-600 whitespace-nowrap">{timeAgo(h.at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div>
        <SectionTitle sub="Remediations targeting this asset">Associated remediations</SectionTitle>
        <RemediationsForAsset assetId={asset.id} />
      </div>

      {analysis ? (
        <AnalysisModal analysis={analysis} onClose={() => setAnalysis(null)} />
      ) : null}
      {analyzing ? <LoadingState label="Analyzing finding against evidence…" /> : null}
    </div>
  );
}

function RemediationsForAsset({ assetId }: { assetId: string }) {
  const { data: rems, loading, error } = useAsyncData<RemediationRecord[]>(() => api.enterprise.remediations(), []);
  if (loading && !rems) return <LoadingState label="Loading remediations…" />;
  if (error && !rems) return <ErrorState title="Could not load remediations" detail={error} />;
  const list = (rems ?? []).filter((r) => r.assetId === assetId);
  if (list.length === 0) return <div className="card"><EmptyState title="No remediations yet" hint="Plan a remediation from a failing finding above." /></div>;
  return (
    <div className="space-y-2">
      {list.map((r) => (
        <div key={r.id} className="card !p-3 text-xs flex flex-wrap items-center gap-2">
          <RemediationStatusBadge status={r.status} />
          <span className="font-medium text-slate-200">{r.title}</span>
          <span className="font-mono text-accent">{r.id}</span>
          <span className="ml-auto text-slate-500">{formatDate(r.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function AnalysisModal({ analysis, onClose }: { analysis: FindingAnalysis; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto !p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <BrainCircuit className="w-5 h-5 text-accent" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-100">AI finding analysis</h2>
        </div>
        <div className="text-xs text-slate-500 mb-3">Evidence-grounded narrative · {analysis.provider} model {analysis.model ?? "nexus-evidence-grounded-v1"} · {analysis.assetName}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs mb-4">
          <SeverityBadge severity={analysis.severity} />
          <span className="px-2 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-300 font-semibold">risk {analysis.riskScore}/100 · {analysis.riskBand}</span>
          <span className="font-mono text-accent">{analysis.controlId}</span>
        </div>
        <div className="space-y-3 text-sm">
          {[
            ["Explanation", analysis.analysis.explanation],
            ["Why it matters", analysis.analysis.whyItMatters],
            ["Potential impact", analysis.analysis.potentialImpact],
            ["Root cause hypothesis", analysis.analysis.rootCauseHypothesis],
            ["Recommended remediation", analysis.analysis.recommendedRemediation],
            ["Rollback considerations", analysis.analysis.rollbackConsiderations],
            ["Executive summary", analysis.analysis.executiveSummary],
          ].map(([label, text]) => (
            <div key={label as string}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
              <p className="text-slate-300 leading-relaxed">{text}</p>
            </div>
          ))}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Validation steps</div>
            <ul className="list-disc pl-5 text-slate-300 space-y-1">
              {analysis.analysis.validationSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-surface-700 p-3 text-xs text-slate-400">
            <span className="text-slate-500 font-medium">Evidence grounding: </span>
            {analysis.evidenceSummary.evidenceAvailable ? analysis.evidenceSummary.notes : "No machine evidence was collected for this finding — treat as unverified until a scan provides evidence."}
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn-primary text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}