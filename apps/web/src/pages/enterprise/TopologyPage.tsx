import type { AssetRecord } from "@nexus/shared-types";
import type { EnterpriseTopology } from "../../services/api";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { SectionTitle } from "../../components/ui";
import { EnterpriseTabs } from "./EnterpriseTabs";
import { cn } from "../../utils/cn";

const ZONE_STYLE: Record<string, string> = {
  DMZ: "border-red-500/40 bg-red-500/10 text-red-300",
  CLOUD: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  CORE: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  APP: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  DATA: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  MGMT: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

const TIER_STYLE: Record<string, string> = {
  TIER_1: "border-red-500/40 bg-red-500/10 text-red-300",
  TIER_2: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  TIER_3: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  TIER_4: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

const TIER_FLOW: Array<{ tier: string; label: string; subtitle: string; color: string }> = [
  { tier: "TIER_1", label: "Tier 1 — Restricted Infrastructure", subtitle: "Internet edge, firewalls, reverse proxies, certificate services. Highest-trust perimeter boundary.", color: "border-red-500/60 bg-red-500/10 text-red-300" },
  { tier: "TIER_2", label: "Tier 2 — Application & Data", subtitle: "API gateways, microservices, databases, message queues. Business-critical workloads in DMZ / APP / DATA zones.", color: "border-amber-500/60 bg-amber-500/10 text-amber-300" },
  { tier: "TIER_3", label: "Tier 3 — Management & Compliance", subtitle: "NEXUS-COMPLY platform, CMDB, observability, remediation orchestrators. Lowest exposure; highest control.", color: "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" },
];

export default function TopologyPage() {
  const { data: topo, loading, error, refresh } = useAsyncData<EnterpriseTopology>(() => api.enterprise.topology(), []);
  const { data: assets } = useAsyncData<AssetRecord[]>(() => api.enterprise.assets(), []);

  const tierCounts = (() => {
    const list = assets ?? [];
    const m = new Map<string, number>();
    for (const a of list) m.set(a.location.tier, (m.get(a.location.tier) ?? 0) + 1);
    return m;
  })();

  if (loading && !topo) return <LoadingState label="Mapping enterprise topology…" />;
  if (error && !topo) return <ErrorState title="Could not load topology" detail={error} onRetry={refresh} />;
  if (!topo) return null;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Enterprise Topology"
        subtitle="Simulated global footprint — regions, sites, network zones and tiers. The tier flow shows directional traffic through the simulated estate; asset counts reflect the discovered portfolio."
      />
      <EnterpriseTabs />

      <section>
        <SectionTitle sub="Directional traffic through the security tiers of the simulated estate — inbound from public Internet to core services to compliance management">Tier traffic flow</SectionTitle>
        <div className="space-y-0">
          {TIER_FLOW.map((tf, idx) => (
            <div key={tf.tier} className="flex flex-col items-center">
              <div className={cn("w-full max-w-3xl rounded-xl border px-5 py-4", tf.color)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{tf.label}</div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">{tf.subtitle}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-xl font-bold text-slate-100">{tierCounts.get(tf.tier) ?? 0}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">assets</div>
                  </div>
                </div>
              </div>
              {idx < TIER_FLOW.length - 1 ? (
                <div className="flex flex-col items-center py-1 text-slate-600 select-none" aria-hidden="true">
                  <div className="w-px h-3 bg-slate-700" />
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-600 fill-current">
                    <path d="M12 16.5l-6-6h12z" />
                  </svg>
                  <div className="w-px h-3 bg-slate-700" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 mt-2 max-w-3xl">Traffic enters at Tier 1 (Internet edge / DMZ), passes to Tier 2 for application processing and data access, and is governed from Tier 3 where NEXUS-COMPLY enforces compliance controls and orchestrates remediation.</p>
      </section>

      <section>
        <SectionTitle sub={`Generated ${topo.generatedAt ? new Date(topo.generatedAt).toLocaleString() : "just now"}`}>Regions</SectionTitle>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {topo.regions.map((r) => (
            <div key={r.code} className="card !p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.flag ?? "🌐"}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{r.label}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{r.code}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {(r.sites ?? []).map((s) => (
                  <div key={s.id} className="rounded-lg border border-surface-700 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">{s.label}</span>
                      <span className="text-slate-500">{s.assets ?? 0} assets</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(s.zones ?? []).map((z) => (
                        <span key={z} className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border", ZONE_STYLE[z] ?? ZONE_STYLE.MGMT)}>{z}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle sub="Network segmentation of the simulated estate">Tiers</SectionTitle>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {topo.tiers.map((t) => (
            <div key={t.tier} className="card !p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border", TIER_STYLE[t.tier] ?? TIER_STYLE.TIER_4)}>{t.title}</span>
                <span className="text-xs text-slate-500">{tierCounts.get(t.tier) ?? 0} assets</span>
              </div>
              {t.description ? <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t.description}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle sub={`${topo.connections.length} deterministic service connections`}>Connections</SectionTitle>
        {topo.connections.length === 0 ? (
          <div className="card"><EmptyState title="No connections mapped" hint="Discovery and topology generation will map the service mesh." /></div>
        ) : (
          <div className="card overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-surface-700">
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topo.connections.map((c, i) => (
                    <tr key={i} className="border-b border-surface-800/60">
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-300">{c.from ?? c.fromAsset ?? "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">→</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-300">{c.to ?? c.toAsset ?? "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{c.type ?? "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{c.status ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}