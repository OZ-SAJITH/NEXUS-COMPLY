import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, RefreshCw, Radar, Globe2, ShieldAlert } from "lucide-react";
import type { AssetCriticality, AssetRecord, ConnectorRecord, ConnectorStatus } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { SeverityBadge, StatusBadge, Stat, Progress, SectionTitle } from "../../components/ui";
import { EnterpriseTabs, DiscoveryStageBadge } from "./EnterpriseTabs";
import { timeAgo } from "../../utils/cn";

const CRITICALITY_STYLE: Record<AssetCriticality, string> = {
  CRITICAL: "text-red-400 border-red-500/40 bg-red-500/10",
  HIGH: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  MEDIUM: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  LOW: "text-slate-400 border-slate-500/40 bg-slate-500/10",
};

const ACTIVE_STAGES = new Set(["IDENTIFIED", "CONNECTABLE", "SCANNABLE", "MONITORED", "COMPLIANT", "NON_COMPLIANT"]);

function connectorForAsset(asset: AssetRecord, connectors: ConnectorRecord[]): ConnectorRecord | undefined {
  const support = connectors.filter((c) => c.supportedAssetTypes.includes(asset.assetType));
  const online = support.find((c) => c.status === "ONLINE");
  const pool = online ? [online] : support;
  const candidates = pool.length > 0 ? pool : connectors.filter((c) => c.type === asset.connectorType);
  return candidates[0];
}

const CONNECTOR_STATUS_STYLE: Record<ConnectorStatus, string> = {
  ONLINE: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  OFFLINE: "text-slate-400 border-slate-500/40 bg-slate-500/10",
  AUTHENTICATION_FAILED: "text-red-400 border-red-500/40 bg-red-500/10",
  NETWORK_BLOCKED: "text-amber-400 border-amber-500/40 bg-amber-500/10",
};

function ConnectorCell({ asset, connectors }: { asset: AssetRecord; connectors: ConnectorRecord[] }) {
  const c = connectorForAsset(asset, connectors);
  if (!c) return <span className="text-[11px] text-slate-600">—</span>;
  return (
    <div>
      <div className="text-xs text-slate-300">{c.type}</div>
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${CONNECTOR_STATUS_STYLE[c.status]}`}>
        {c.status.split("_").join(" ")}
      </span>
    </div>
  );
}

const COMPLIANCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Any compliance status" },
  { value: "PASS", label: "Compliant (PASS)" },
  { value: "WARNING", label: "Warning" },
  { value: "FAIL", label: "Non-compliant (FAIL)" },
  { value: "UNSCANNED", label: "Not assessed yet" },
];

export default function AssetsPage() {
  const { data: assets, loading, error, refresh } = useAsyncData<AssetRecord[]>(() => api.enterprise.assets(), []);
  const { data: connectors, refresh: refreshConnectors } = useAsyncData<ConnectorRecord[]>(() => api.enterprise.connectors(), []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [criticality, setCriticality] = useState("ALL");
  const [assetType, setAssetType] = useState("ALL");
  const [vendor, setVendor] = useState("ALL");
  const [region, setRegion] = useState("ALL");
  const [environment, setEnvironment] = useState("ALL");
  const [tier, setTier] = useState("ALL");
  const [compliance, setCompliance] = useState("ALL");
  const [connectorStatus, setConnectorStatus] = useState("ALL");

  const runDiscovery = async () => {
    setBusy(true);
    setNotice("");
    try {
      const r = await api.enterprise.discover();
      const regions = new Set(r.assets.map((a) => a.regionLabel).filter(Boolean));
      setNotice(`Discovery run ${r.runId}: ${r.discovered} new assets discovered across ${regions.size} region${regions.size === 1 ? "" : "s"}, ${r.updated} updated.`);
      refresh();
      refreshConnectors();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setBusy(false);
    }
  };

  const list = assets ?? [];
  const conns = connectors ?? [];
  const q = query.trim().toLowerCase();

  const options = useMemo(() => {
    const uniq = <T,>(k: (a: AssetRecord) => T): T[] => [...new Set(list.map(k).filter((v): v is T => v !== undefined && v !== null))].sort((a, b) => String(a).localeCompare(String(b)));
    return {
      assetTypes: uniq((a) => a.assetType),
      vendors: uniq((a) => a.vendor),
      regions: uniq((a) => a.regionLabel),
      environments: uniq((a) => a.environment),
      tiers: uniq((a) => a.location.tier),
    };
  }, [list]);

  const filtered = useMemo(
    () =>
      list.filter((a) => {
        if (criticality !== "ALL" && a.criticality !== criticality) return false;
        if (assetType !== "ALL" && a.assetType !== assetType) return false;
        if (vendor !== "ALL" && a.vendor !== vendor) return false;
        if (region !== "ALL" && a.regionLabel !== region) return false;
        if (environment !== "ALL" && a.environment !== environment) return false;
        if (tier !== "ALL" && a.location.tier !== tier) return false;
        if (compliance === "UNSCANNED" && a.complianceStatus !== undefined) return false;
        if (compliance === "PASS" && (a.complianceStatus ?? "PASS") !== "PASS") return false;
        if (compliance === "WARNING" && a.complianceStatus !== "WARNING") return false;
        if (compliance === "FAIL" && a.complianceStatus !== "FAIL") return false;
        if (connectorStatus !== "ALL") {
          const c = connectorForAsset(a, conns);
          const status = c?.status ?? "NONE";
          if (connectorStatus === "ONLINE" && status !== "ONLINE") return false;
          if (connectorStatus === "OFFLINE" && status !== "OFFLINE") return false;
          if (connectorStatus === "ERROR" && status === "ONLINE") return false;
        }
        if (q && !`${a.name} ${a.hostname} ${a.ipAddress} ${a.vendor} ${a.technology} ${a.assetType} ${a.siteLabel} ${a.regionLabel}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [list, conns, criticality, assetType, vendor, region, environment, tier, compliance, connectorStatus, q]
  );

  const counts = useMemo(() => {
    const scanned = list.filter((a) => a.complianceStatus !== undefined);
    return {
      total: list.length,
      active: list.filter((a) => ACTIVE_STAGES.has(a.discoveryStatus)).length,
      critical: list.filter((a) => a.criticality === "CRITICAL").length,
      nonCompliant: list.filter((a) => a.complianceStatus === "FAIL").length,
      needsAttention: list.filter((a) => (a.riskScore ?? 0) >= 60 || a.complianceStatus === "FAIL").length,
      avgRisk: scanned.length ? Math.round(scanned.reduce((s, a) => s + (a.riskScore ?? 0), 0) / scanned.length) : 0,
    };
  }, [list]);

  const regionSummary = useMemo(() => {
    const map = new Map<string, { label: string; total: number; nonCompliant: number; scanned: number }>();
    for (const a of list) {
      const key = a.regionLabel || "UNASSIGNED";
      const entry = map.get(key) ?? { label: a.regionLabel, total: 0, nonCompliant: 0, scanned: 0 };
      entry.total += 1;
      if (a.complianceStatus === "FAIL") entry.nonCompliant += 1;
      if (a.complianceStatus !== undefined) entry.scanned += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [list]);

  if (loading && !assets) return <LoadingState label="Loading enterprise asset portfolio…" />;
  if (error && !assets) return <ErrorState title="Could not load assets" detail={error} onRetry={refresh} />;
  if (!assets) return null;

  const statusNotBad = filtered.length !== list.length;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Enterprise Asset Portfolio"
        subtitle="Simulated multi-region infrastructure discovered and catalogued by the NEXUS-COMPLY engine. Every asset carries a discovery stage, a compliance posture and evidence-grounded risk."
        actions={
          <button onClick={runDiscovery} disabled={busy} className="btn-primary text-sm inline-flex items-center gap-2">
            <Radar className="w-4 h-4" aria-hidden="true" /> {busy ? "Discovering…" : "Discover Assets"}
          </button>
        }
      />
      <EnterpriseTabs />

      {notice ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" aria-hidden="true" /> {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Stat label="Total assets" value={counts.total} />
        <Stat label="Active assets" value={counts.active} tone={counts.active > 0 ? "good" : "default"} />
        <Stat label="Critical assets" value={counts.critical} tone={counts.critical > 0 ? "danger" : "default"} />
        <Stat label="Non-compliant" value={counts.nonCompliant} tone={counts.nonCompliant > 0 ? "danger" : "good"} />
        <Stat label="Need attention" value={counts.needsAttention} tone={counts.needsAttention > 0 ? "warn" : "good"} />
      </div>

      <section>
        <SectionTitle sub="Discoverable footprint by region — assets, posture and coverage of the simulated estate">Regional footprint</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {regionSummary.map((r) => (
            <div key={r.label} className="card !p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200 inline-flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" /> {r.label}
                </span>
                <span className="text-xs text-slate-500">{r.total} assets</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className={r.nonCompliant > 0 ? "text-red-400" : "text-emerald-400"}>{r.nonCompliant} non-compliant</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{r.scanned} assessed</span>
              </div>
              <div className="mt-2">
                <Progress value={list.length && r.total ? (r.total / list.length) * 100 : 0} className="bg-surface-800" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle sub="Multi-attribute filtering over the discovered portfolio">Asset inventory</SectionTitle>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, hostname, IP, vendor, technology…"
              className="input w-full !pl-9 !py-2 text-sm"
              aria-label="Search assets"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by asset type">
              <option value="ALL">All types</option>
              {options.assetTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by vendor">
              <option value="ALL">All vendors</option>
              {options.vendors.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by region">
              <option value="ALL">All regions</option>
              {options.regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by environment">
              <option value="ALL">All environments</option>
              {options.environments.map((env) => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
            <select value={tier} onChange={(e) => setTier(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by tier">
              <option value="ALL">All tiers</option>
              {options.tiers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={criticality} onChange={(e) => setCriticality(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by criticality">
              <option value="ALL">All criticality</option>
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={compliance} onChange={(e) => setCompliance(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by compliance status">
              {COMPLIANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select value={connectorStatus} onChange={(e) => setConnectorStatus(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by connector status">
              <option value="ALL">Any connector status</option>
              <option value="ONLINE">Connector online</option>
              <option value="OFFLINE">Connector offline</option>
              <option value="ERROR">Connector error</option>
            </select>
            <span className="text-[11px] text-slate-500 ml-auto inline-flex items-center gap-1.5">
              {filtered.length} of {list.length} assets{statusNotBad ? <ShieldAlert className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" /> : null}
            </span>
          </div>
        </div>

        <div className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-surface-700">
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Type / Vendor</th>
                  <th className="px-4 py-3">Technology</th>
                  <th className="px-4 py-3">Region · Site</th>
                  <th className="px-4 py-3">Environment</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Criticality</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Connector</th>
                  <th className="px-4 py-3">Compliance</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Last scanned</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-surface-800/60 hover:bg-surface-800/40">
                    <td className="px-4 py-3">
                      <Link to={`/app/enterprise/assets/${a.id}`} className="block">
                        <div className="font-medium text-slate-100">{a.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{a.hostname}</div>
                        <div className="text-[11px] text-slate-600 font-mono">{a.ipAddress}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-300">{a.assetType}</div>
                      <div className="text-[11px] text-slate-500">{a.vendor}</div>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-400">{a.technology}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      <div>{a.regionLabel}</div>
                      <div className="text-[11px] text-slate-500">{a.siteLabel} · {a.location.networkZone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{a.environment}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{a.location.tier}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${CRITICALITY_STYLE[a.criticality]}`}>{a.criticality}</span>
                    </td>
                    <td className="px-4 py-3"><DiscoveryStageBadge stage={a.discoveryStatus} /></td>
                    <td className="px-4 py-3"><ConnectorCell asset={a} connectors={conns} /></td>
                    <td className="px-4 py-3">{a.complianceStatus ? <StatusBadge status={a.complianceStatus} /> : <span className="text-[11px] text-slate-600">unscanned</span>}</td>
                    <td className="px-4 py-3">{a.riskScore !== undefined ? <SeverityBadge severity={a.riskBand ?? "LOW"} /> : <span className="text-[11px] text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.lastScannedAt ? timeAgo(a.lastScannedAt) : "never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <div className="p-4"><EmptyState title="No assets match the current filters" hint="Adjust the search or clear some filters to see more of the discovered portfolio." /></div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}