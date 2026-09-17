import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Scale, Layers, ShieldCheck, FileText, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import type { ApplicableControlsResult, ComplianceFramework2, ComplianceSummary, GovernanceDecisionTrace, GovernanceException, PolicyProfile, PolicySelection } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { EnterpriseTabs } from "./EnterpriseTabs";
import { cn, timeAgo } from "../../utils/cn";
import { currentUser } from "../../session";
import { GovernanceExceptionBadge } from "../../components/assets/GovernanceExceptionBadge";
import { PostureCards } from "../../components/assets/PostureCards";

function FrameworkCatalog({ frameworks }: { frameworks: ComplianceFramework2[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-100">Framework catalog</h2>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {frameworks.map((f) => (
          <div key={f.id} className="card !p-4 flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-accent">{f.id}</span>
              <span className="font-semibold text-slate-100">{f.name}</span>
              <span className="ml-auto px-2 py-0.5 rounded border border-surface-700 text-[10px] font-mono text-slate-500">{f.version}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed flex-1">{f.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 font-mono text-accent">{f.scope}</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded border font-mono",
                f.applicability === "Applicable"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : f.applicability === "Optional"
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                    : f.applicability === "Organization-selected"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      : "border-slate-500/40 bg-slate-500/10 text-slate-400"
              )}>{f.applicability}</span>
              <span className={cn("px-1.5 py-0.5 rounded border font-mono", f.status === "ACTIVE" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-500/40 bg-slate-500/10 text-slate-400")}>{f.status}</span>
            </div>
            <button onClick={() => setOpen((v) => ({ ...v, [f.id]: !v[f.id] }))} className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-accent">
              {open[f.id] ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
              Disclaimer
            </button>
            {open[f.id] ? <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">{f.disclaimer}</p> : null}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Applicability is authored, not asserted — framework scope/qualification remains an organization decision.</p>
    </section>
  );
}

function PolicyProfiles({ policies }: { policies: PolicyProfile[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-100">Regional policy profiles</h2>
      </div>
      <div className="card !p-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-3">Profile</th>
              <th className="pb-2 pr-3">Region</th>
              <th className="pb-2 pr-3">Enabled frameworks</th>
              <th className="pb-2">Version</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.profileId} className="border-t border-surface-700">
                <td className="py-2 pr-3">
                  <div className="font-semibold text-slate-200">{p.name}</div>
                  <div className="font-mono text-accent text-[10px]">{p.profileId}</div>
                </td>
                <td className="py-2 pr-3 text-slate-400">{p.regionLabel} <span className="font-mono text-slate-600">({p.region})</span></td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {p.enabledFrameworks.map((f) => (
                      <span key={f} className="px-1.5 py-0.5 rounded border border-surface-700 bg-surface-800/50 text-[9px] font-mono text-slate-400">{f}</span>
                    ))}
                  </div>
                </td>
                <td className="py-2 font-mono text-slate-500">{p.version} · {p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Selection is deterministic by asset region — same asset always maps to the same profile.</p>
    </section>
  );
}

interface EvalState {
  policy: PolicySelection;
  applicableControls: ApplicableControlsResult;
  trace: GovernanceDecisionTrace;
  exceptions: GovernanceException[];
}

function AssetDecisionTrace({ assets }: { assets: Array<{ id: string; name: string; regionLabel: string }> }) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [evalState, setEvalState] = useState<EvalState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const didInit = useRef(false);

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      setError("");
      try {
        setEvalState(await api.enterprise.evaluateGovernance(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not evaluate governance for asset.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!assetId && assets.length > 0) {
      setAssetId(assets[0].id);
    }
  }, [assetId, assets]);

  useEffect(() => {
    if (!assetId || didInit.current) return;
    didInit.current = true;
    void load(assetId);
  }, [assetId, load]);

  const selectAsset = (id: string) => {
    setAssetId(id);
    void load(id);
  };

  if (!assetId) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-accent" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-100">Asset decision trace</h2>
        </div>
        <div className="card"><p className="text-sm text-slate-500">Discover assets first to inspect a governance decision trace.</p></div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-100">Asset decision trace</h2>
        </div>
        <select value={assetId} onChange={(e) => selectAsset(e.target.value)} className="input !py-1.5 text-xs ml-auto sm:ml-0" aria-label="Select asset">
          {assets.map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {a.regionLabel}</option>
          ))}
        </select>
        <Link to={`/app/enterprise/assets/${assetId}`} className="text-xs text-accent hover:underline">Open asset →</Link>
      </div>
      {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</div> : null}
      {evalState ? (
        <EvalSummary assetId={assetId} evalState={evalState} />
      ) : loading ? (
        <div className="card !p-4 h-24 flex items-center justify-center"><span className="text-xs text-slate-500">Evaluating governance context…</span></div>
      ) : null}
    </section>
  );
}

function EvalSummary({ assetId, evalState }: { assetId: string; evalState: EvalState }) {
  const { policy, applicableControls, trace, exceptions } = evalState;
  const assetExceptions = exceptions.filter((e) => e.assetId === assetId);
  const findings = trace.findings.length;
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="card !p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Regional policy</div>
        <div className="font-semibold text-slate-100 text-sm">{policy.policyProfileName}</div>
        <div className="font-mono text-accent text-[11px]">{policy.policyProfileId}</div>
        <div className="text-[11px] text-slate-500 mt-1">{policy.regionLabel} · {policy.environment} · {policy.criticality}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {policy.frameworks.map((f) => (
            <span key={f.id} className="px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 text-[9px] font-mono text-accent">{f.id}</span>
          ))}
        </div>
      </div>
      <div className="card !p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Applicable controls</div>
        <div className="text-2xl font-bold text-slate-100">{applicableControls.applicable.length}</div>
        <div className="text-[11px] text-slate-500">{applicableControls.total} evaluated · {applicableControls.excluded.length} excluded</div>
      </div>
      <div className="card !p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Findings</div>
        <div className="text-2xl font-bold text-slate-100">{findings}</div>
        <div className="text-[11px] text-slate-500">{trace.findings.filter((f) => f.status === "FAIL").length} failing in latest scan</div>
      </div>
      <div className="card !p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Active exceptions</div>
        <div className="text-2xl font-bold text-slate-100">{assetExceptions.filter((e) => e.status === "APPROVED").length}</div>
        <div className="text-[11px] text-slate-500">{assetExceptions.length} total on this asset</div>
      </div>
    </div>
  );
}

function ExceptionRegistry() {
  const { data: exceptions, loading, error, refresh } = useAsyncData<GovernanceException[]>(() => api.enterprise.governanceExceptions(), []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const decide = async (exc: GovernanceException, decision: "APPROVED" | "REJECTED") => {
    setBusy(true);
    setNotice("");
    try {
      const decided = await api.enterprise.decideGovernanceException(exc.id, { exceptionId: exc.id, decision, decidedBy: currentUser() });
      setNotice(decided.status === "APPROVED" ? `Approved ${exc.controlId} for ${exc.assetName} — renders FAIL + EXCEPTION APPROVED.` : `Rejected ${exc.controlId} — the control remains FAIL.`);
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not decide exception");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !exceptions) return <LoadingState label="Loading exceptions…" />;
  if (error && !exceptions) return <ErrorState title="Could not load exceptions" detail={error} onRetry={refresh} />;
  const list = exceptions ?? [];

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Scale className="w-4 h-4 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-100">Governance exception registry</h2>
        <button onClick={refresh} className="ml-auto btn-ghost !px-2 !py-1 text-xs inline-flex items-center gap-1.5" aria-label="Refresh exceptions">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh
        </button>
      </div>
      {notice ? <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent mb-3">{notice}</div> : null}
      {list.length === 0 ? (
        <div className="card"><p className="text-sm text-slate-500">No governance exceptions yet — request one from an asset's Adaptive Governance panel.</p></div>
      ) : (
        <div className="card !p-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-3">Control</th>
                <th className="pb-2 pr-3">Asset</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Requested by</th>
                <th className="pb-2 pr-3">Expires</th>
                <th className="pb-2 text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {list.map((exc) => (
                <tr key={exc.id} className="border-t border-surface-700 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-mono text-accent">{exc.controlId}</div>
                    <div className="text-[10px] text-slate-500">{exc.controlName}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <Link to={`/app/enterprise/assets/${exc.assetId}`} className="text-slate-300 hover:text-accent">{exc.assetName}</Link>
                    <div className="text-[10px] text-slate-600">{exc.reason.slice(0, 60)}{exc.reason.length > 60 ? "…" : ""}</div>
                  </td>
                  <td className="py-2 pr-3"><GovernanceExceptionBadge status={exc.status} /></td>
                  <td className="py-2 pr-3 text-slate-400">{exc.requestedBy}</td>
                  <td className="py-2 pr-3 font-mono text-slate-500">{new Date(exc.expiresAt).toLocaleDateString()}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {exc.status === "REQUESTED" ? (
                      <span className="inline-flex gap-1.5">
                        <button onClick={() => decide(exc, "APPROVED")} disabled={busy} className="btn !py-1 text-[11px]">Approve</button>
                        <button onClick={() => decide(exc, "REJECTED")} disabled={busy} className="btn !py-1 text-[11px]">Reject</button>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-600">{timeAgo(exc.createdAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-600">An approved exception renders <span className="font-semibold">FAIL + EXCEPTION APPROVED</span> — it never produces a silent PASS.</p>
    </section>
  );
}

function PostureStrip({ summary }: { summary: ComplianceSummary }) {
  const byRegion = summary.byRegion ?? [];
  const byFramework = summary.byFramework ?? [];
  if (byRegion.length === 0 && byFramework.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Scale className="w-4 h-4 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold text-slate-100">Regime posture</h2>
      </div>
      <PostureCards byRegion={byRegion} byFramework={byFramework} />
    </section>
  );
}

export default function GovernancePage() {
  const { data: frameworks, loading: fwLoading, error: fwError, refresh: refreshFrameworks } = useAsyncData<ComplianceFramework2[]>(() => api.enterprise.frameworks(), []);
  const { data: policies, error: polError, refresh: refreshPolicies } = useAsyncData<PolicyProfile[]>(() => api.enterprise.listPolicies(), []);
  const { data: assets, error: assetsError, refresh: refreshAssets } = useAsyncData<AssetOptions[]>(() => api.enterprise.assets(), []);
  const { data: summary } = useAsyncData<ComplianceSummary>(() => api.enterprise.complianceSummary(), []);

  const assetOptions: AssetOptions[] = useMemo(
    () => (assets ?? []).map((a) => ({ id: a.id, name: a.name, regionLabel: a.regionLabel ?? "" })),
    [assets]
  );

  if (fwLoading && !frameworks) return <LoadingState label="Loading governance…" />;
  if (fwError && !frameworks) return <ErrorState title="Could not load governance" detail={fwError} onRetry={refreshFrameworks} />;

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        title="Enterprise Governance"
        subtitle="Adaptive multi-framework compliance for the managed estate — regional policy, framework applicability and governed exceptions. SIMULATED environment."
        actions={
          <button onClick={() => { void refreshFrameworks(); void refreshPolicies(); void refreshAssets(); }} className="btn-ghost !px-3 !py-2 text-xs inline-flex items-center gap-2" aria-label="Refresh governance">
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh
          </button>
        }
      />
      <EnterpriseTabs />

      {polError && !policies ? <ErrorState title="Could not load policy profiles" detail={polError} onRetry={refreshPolicies} /> : null}
      {assetsError && !assets ? <ErrorState title="Could not load assets" detail={assetsError} onRetry={refreshAssets} /> : null}

      {summary ? <PostureStrip summary={summary} /> : null}
      {frameworks ? <FrameworkCatalog frameworks={frameworks} /> : null}
      {policies ? <PolicyProfiles policies={policies} /> : null}
      <AssetDecisionTrace assets={assetOptions} />
      <ExceptionRegistry />
    </div>
  );
}

interface AssetOptions {
  id: string;
  name: string;
  regionLabel: string;
}