import { useState } from "react";
import { Cable, PlugZap, RefreshCw } from "lucide-react";
import type { ConnectorRecord } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { SectionTitle, StatusBadge } from "../../components/ui";
import { EnterpriseTabs } from "./EnterpriseTabs";
import { cn, timeAgo } from "../../utils/cn";

const STATUS_STYLE: Record<string, string> = {
  ONLINE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  OFFLINE: "border-slate-500/40 bg-slate-500/10 text-slate-400",
  AUTHENTICATION_FAILED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  NETWORK_BLOCKED: "border-red-500/40 bg-red-500/10 text-red-300",
};

function ConnectorCard({ connector, onTest, busy }: { connector: ConnectorRecord; onTest: (id: string) => void; busy: boolean }) {
  return (
    <div className="card !p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center shrink-0">
          <Cable className="w-4 h-4 text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-100 truncate">{connector.name}</div>
          <div className="text-[11px] text-slate-500">v{connector.version} · {connector.vendor}</div>
        </div>
        <span className={cn("px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide", STATUS_STYLE[connector.status] ?? STATUS_STYLE.OFFLINE)}>{connector.status.replaceAll("_", " ")}</span>
      </div>
      {connector.connectError ? <div className="mt-3 text-xs text-amber-300">{connector.connectError}</div> : null}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>Type <span className="font-mono text-slate-300">{connector.type}</span></span>
        <span>Transport <span className="font-mono text-slate-300">{connector.transportType ?? "SIMULATED"}</span></span>
        {connector.protocol ? <span>Protocol <span className="font-mono text-slate-300">{connector.protocol}</span></span> : null}
        {connector.latencyMs !== undefined ? <span>Latency <span className="font-mono text-slate-300">{connector.latencyMs}ms</span></span> : null}
        {connector.lastContactAt ? <span>last contact {timeAgo(connector.lastContactAt)}</span> : null}
      </div>
      {connector.capabilities && connector.capabilities.length > 0 ? (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Declared capabilities</div>
          <div className="flex flex-wrap gap-1">
            {connector.capabilities.map((cap) => (
              <span key={cap} className="px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 text-[10px] font-mono text-accent">{cap}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Authorized remediation actions</div>
        <div className="flex flex-wrap gap-1">
          {connector.authorizedActions.map((a) => (
            <span key={a} className="px-1.5 py-0.5 rounded border border-surface-700 text-[10px] font-mono text-slate-400">{a}</span>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Supported assets</div>
        <div className="flex flex-wrap gap-1">
          {connector.supportedAssetTypes.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded border border-surface-700 text-[10px] font-mono text-slate-400">{t}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => onTest(connector.id)} disabled={busy} className="btn text-xs inline-flex items-center gap-1.5 !py-1.5">
          <PlugZap className="w-3.5 h-3.5" aria-hidden="true" /> Test connection
        </button>
        <span className="text-[10px] text-slate-600">simulated connector</span>
      </div>
    </div>
  );
}

export default function ConnectorsPage() {
  const { data: connectors, loading, error, refresh } = useAsyncData<ConnectorRecord[]>(() => api.enterprise.connectors(), []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const probe = async () => {
    setBusy(true);
    setNotice("");
    refresh();
    setBusy(false);
  };

  const testConnection = async (id: string) => {
    setBusy(true);
    setNotice("");
    try {
      const c = await api.enterprise.testConnector(id);
      setNotice(`${c.name} connection test: ${c.status}.`);
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !connectors) return <LoadingState label="Loading connectors…" />;
  if (error && !connectors) return <ErrorState title="Could not load connectors" detail={error} onRetry={refresh} />;
  if (!connectors) return null;

  const online = connectors.filter((c) => c.status === "ONLINE").length;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Enterprise Connectors"
        subtitle="Simulated connectors bridge NEXUS-COMPLY to the estate. Scans and remediations execute only through ONLINE connectors; every status change is audited."
        actions={
          <button onClick={probe} disabled={busy} className="btn-primary text-sm inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Check connectivity
          </button>
        }
      />
      <EnterpriseTabs />

      {notice ? <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">{notice}</div> : null}

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-slate-100">{connectors.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">connectors</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">{online}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">online</div>
        </div>
        <div className="card !p-3 text-center">
          <div className="text-2xl font-bold text-slate-100">{connectors.length - online}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">degraded</div>
        </div>
      </div>

      <section>
        <SectionTitle sub="Probe periodically; test a connection to restore it to ONLINE in the simulation">Connectivity</SectionTitle>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {connectors.map((c) => (
            <ConnectorCard key={c.id} connector={c} onTest={testConnection} busy={busy} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle sub="Connector status is a live control on the closed loop">Status legend</SectionTitle>
        <div className="flex flex-wrap gap-4 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5"><StatusBadge status="PASS" /> ONLINE — can scan and execute remediations</span>
          <span className="inline-flex items-center gap-1.5"><StatusBadge status="FAIL" /> OFFLINE / AUTH_FAILED / NETWORK_BLOCKED — blocked</span>
        </div>
      </section>
    </div>
  );
}