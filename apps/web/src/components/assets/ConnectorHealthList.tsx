import { PlugZap } from "lucide-react";
import type { AssetConnectorProfile } from "@nexus/shared-types";
import { SectionTitle } from "../ui";
import { cn, timeAgo } from "../../utils/cn";

/**
 * Connector health card for a managing connector with declared capabilities.
 */
export function ConnectorHealthList({
  profile,
  onTest,
  busy,
}: {
  profile?: AssetConnectorProfile;
  onTest: () => void;
  busy: boolean;
}) {
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