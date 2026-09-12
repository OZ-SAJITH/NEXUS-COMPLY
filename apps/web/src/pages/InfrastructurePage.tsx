import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { AuditRecord } from "@nexus/shared-types";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { VendorCard, type VendorRow } from "../components/VendorCard";
import { NetworkGraph } from "../components/NetworkGraph";
import { LoadingState, ErrorState, EmptyState } from "../components/states";
import { VENDOR_META } from "../demo/dashboard";
import { computeVendors } from "../demo/dashboard";
import { cn } from "../utils/cn";

const TABS = [
  { key: "vendors", label: "Vendors", to: "/app/infrastructure" },
  { key: "devices", label: "Devices", to: "/app/infrastructure/devices" },
  { key: "networks", label: "Networks", to: "/app/infrastructure/networks" },
  { key: "assets", label: "Assets", to: "/app/infrastructure/assets" },
] as const;

export default function InfrastructurePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = TABS.find((t) => t.to === location.pathname)?.key ?? "vendors";
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .listAudits()
      .then(setAudits)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener("nexus:refresh", onRefresh);
    return () => window.removeEventListener("nexus:refresh", onRefresh);
  }, [refresh]);

  if (loading && !audits.length) return <LoadingState label="Loading infrastructure inventory…" />;
  if (error && !audits.length) return <ErrorState title="Could not load inventory" detail={error} onRetry={refresh} />;

  const vendors: VendorRow[] = computeVendors(audits);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Infrastructure"
        subtitle="Asset inventory, device posture and topology across vendor platforms."
      />
      <nav className="flex gap-1 border-b border-surface-700 mb-6" aria-label="Infrastructure sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors",
              tab === t.key ? "border-accent text-slate-100 bg-surface-900" : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "vendors" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {vendors.map((v, i) => (
            <div key={v.vendor} className="row-in" style={{ animationDelay: `${i * 80}ms` }}>
              <VendorCard row={v} />
            </div>
          ))}
          {vendors.length === 0 ? (
            <div className="card col-span-full">
              <EmptyState title="No vendors yet" hint="Run audits to build the vendor inventory." action={<Link to="/app/audits/new" className="btn-primary text-xs">New audit</Link>} />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "devices" ? (
        <div className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-surface-700">
                  <th scope="col" className="py-3 px-4 font-medium">Device</th>
                  <th scope="col" className="py-3 px-2 font-medium">Vendor</th>
                  <th scope="col" className="py-3 px-2 font-medium">Role</th>
                  <th scope="col" className="py-3 px-2 font-medium">Compliance</th>
                  <th scope="col" className="py-3 px-2 font-medium">Findings</th>
                  <th scope="col" className="py-3 px-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a, i) => {
                  const failing = a.findings.filter((f) => f.status === "FAIL");
                  const critical = failing.filter((f) => f.severity === "CRITICAL").length;
                  const meta = VENDOR_META[a.vendor] ?? VENDOR_META.unknown;
                  const score = a.compliance?.score ?? 0;
                  return (
                    <tr key={a.id} className="border-b border-surface-800/70 last:border-0 hover:bg-surface-850/50 transition-colors row-in" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                      <td className="py-2.5 px-4">
                        <Link to={`/app/audits/${a.id}`} className="text-slate-200 font-medium hover:text-accent transition-colors">{a.configurationName}</Link>
                        <div className="text-[11px] text-slate-500 font-mono">{a.id}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-300">{meta.name}</td>
                      <td className="py-2.5 px-2 text-slate-500 capitalize">{inferRole(a.configurationName)}</td>
                      <td className="py-2.5 px-2 font-mono"><span className={score >= 85 ? "text-emerald-400" : score >= 55 ? "text-amber-400" : "text-red-400"}>{score}%</span></td>
                      <td className="py-2.5 px-2 text-slate-400">{failing.length}{critical ? <span className="ml-1 text-red-400 font-mono">({critical} crit)</span> : null}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={cn("chip border", critical > 0 ? "border-red-500/40 bg-status-danger-soft text-red-300" : failing.length ? "border-amber-500/40 bg-status-warn-soft text-amber-300" : "border-emerald-500/40 bg-status-ok-soft text-emerald-300")}>
                          {critical > 0 ? "CRITICAL" : failing.length ? "ACTION" : "HEALTHY"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "networks" ? (
        <div className="card !p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-1">Network topology</h2>
          <p className="text-xs text-slate-500 mb-4">Live device posture on the security architecture. Click a node to inspect and jump to its audit.</p>
          <NetworkGraph audits={audits} onOpen={(device) => navigate(`/app/audits/${device.auditId}`)} />
        </div>
      ) : null}

      {tab === "assets" ? (
        <div className="grid gap-2.5">
          {audits.map((a, i) => {
            const meta = VENDOR_META[a.vendor] ?? VENDOR_META.unknown;
            const score = a.compliance?.score ?? 0;
            return (
              <Link key={a.id} to={`/app/audits/${a.id}`} className="group flex items-center gap-3 rounded-xl border border-surface-700 hover:border-accent/40 hover:bg-accent/5 px-4 py-3 transition-all duration-200 hover:translate-x-0.5 row-in" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-bold" style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }}>
                  {meta.monogram}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{a.configurationName}</div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">{a.id}</div>
                </div>
                <span className="chip border border-surface-600 text-slate-400">{meta.name}</span>
                <span className="font-mono text-sm w-12 text-right"><span className={score >= 85 ? "text-emerald-400" : score >= 55 ? "text-amber-400" : "text-red-400"}>{score}%</span></span>
              </Link>
            );
          })}
          {audits.length === 0 ? (
            <div className="card">
              <EmptyState title="No assets discovered" hint="Run an audit to register the configuration as an asset." action={<Link to="/app/audits/new" className="btn-primary text-xs">New audit</Link>} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function inferRole(name: string): string {
  const n = name.toLowerCase();
  if (/(fw|firewall|palo|checkpoint)/.test(n)) return "firewall";
  if (/(core|rtr|router|gw)/.test(n)) return "core router";
  if (/(sw|switch)/.test(n)) return "switch";
  return "endpoint";
}