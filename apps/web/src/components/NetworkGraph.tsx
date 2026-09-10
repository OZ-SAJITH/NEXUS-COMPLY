import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AuditRecord } from "@nexus/shared-types";
import { VENDOR_META } from "../demo/dashboard";
import { SeverityBadge } from "./SeverityBadge";
import { cn } from "../utils/cn";

export interface GraphDevice {
  id: string;
  name: string;
  vendor: string;
  compliance: number;
  risk: number;
  findings: number;
  critical: number;
  auditId: string;
  role: string;
}

const COLUMNS = [
  { key: "edge", label: "EXTERNAL" },
  { key: "firewall", label: "FIREWALL" },
  { key: "core", label: "CORE ROUTER" },
  { key: "switches", label: "SWITCHES" },
  { key: "endpoints", label: "SERVERS / ENDPOINTS" },
] as const;

type LayerKey = "edge" | "firewall" | "core" | "switches" | "endpoints";

function classify(name: string): LayerKey {
  const n = name.toLowerCase();
  if (/(fw|firewall|palo|checkpoint|cpx)/.test(n)) return "firewall";
  if (/(core|rtr|router|gw|gateway|srx|mikrotik)/.test(n)) return "core";
  if (/(sw|switch|catalyst|access)/.test(n)) return "switches";
  return "endpoints";
}

function bandColor(compliance: number, critical: number): string {
  if (critical > 0 || compliance < 55) return "#ef4444";
  if (compliance < 85) return "#f59e0b";
  return "#10b981";
}

export function NetworkGraph({
  audits,
  onOpen,
}: {
  audits: AuditRecord[];
  onOpen: (device: GraphDevice) => void;
}) {
  const devices = useMemo<GraphDevice[]>(
    () =>
      audits.map((a) => {
        const failing = a.findings.filter((f) => f.status === "FAIL");
        return {
          id: a.id,
          name: a.configurationName,
          vendor: a.vendor,
          compliance: a.compliance?.score ?? 0,
          risk: a.risk?.overallScore ?? 0,
          findings: failing.length,
          critical: failing.filter((f) => f.severity === "CRITICAL").length,
          auditId: a.id,
          role: classify(a.configurationName),
        };
      }),
    [audits]
  );

  const [selected, setSelected] = useState<GraphDevice | null>(devices[0] ?? null);

  const grouped = useMemo(() => {
    const g: Record<LayerKey, GraphDevice[]> = { edge: [], firewall: [], core: [], switches: [], endpoints: [] };
    devices.forEach((d) => g[d.role as LayerKey].push(d));
    return g;
  }, [devices]);

  const [, height, viewW] = [820, 320, 640];
  const xFor = (key: LayerKey) => {
    const col = COLUMNS.findIndex((c) => c.key === key);
    return 70 + col * ((520 - 40) / (COLUMNS.length - 1));
  };
  const maxNodes = Math.max(...Object.values(grouped).map((l) => l.length), 2);
  const yFor = (list: GraphDevice[], i: number) => 55 + (i + 0.5) * ((height - 90) / Math.max(list.length, 1)) - (maxNodes > list.length ? (height - 90) / maxNodes / 2 : 0);

  const sel = selected ?? devices[0] ?? null;

  return (
    <div className="grid lg:grid-cols-[1fr_240px] gap-4">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${viewW} ${height}`} className="w-full min-w-[560px]" role="img" aria-label="Infrastructure topology map">
          <defs>
            <linearGradient id="splineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0ea5e9" stopOpacity="0.15" />
              <stop offset="1" stopColor="#38bdf8" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {/* spines */}
          {COLUMNS.map((col, i) => {
            if (col.key === "edge") return null;
            const x = xFor(col.key);
            const prevX = xFor(COLUMNS[i - 1].key);
            const yMid = height - 42;
            return (
              <g key={col.key}>
                <line x1={prevX} y1={yMid} x2={x} y2={yMid} stroke="url(#splineGrad)" strokeWidth="1.5" strokeDasharray="5 5" className="animate-dash-flow" />
              </g>
            );
          })}

          {/* columns */}
          {COLUMNS.map((col) => {
            const x = xFor(col.key);
            return (
              <g key={col.key}>
                <text x={x} y={height - 16} textAnchor="middle" fill="#64748b" fontSize="9" letterSpacing="1.5" style={{ fontWeight: 600 }}>
                  {col.label}
                </text>
                {col.key === "edge" ? (
                  <>
                    <circle cx={x} cy={90} r={22} fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeDasharray="3 3" className="animate-dash-flow" />
                    <circle cx={x} cy={90} r={14} fill="#0ea5e9" opacity="0.15" />
                    <text x={x} y={94} textAnchor="middle" fontSize="11" fill="#38bdf8">◎</text>
                  </>
                ) : (
                  <line x1={x} y1={44} x2={x} y2={height - 36} stroke="#1b2740" strokeWidth="1" />
                )}
                {grouped[col.key as LayerKey].map((d, i) => {
                  const y = col.key === "edge" ? 90 : yFor(grouped[col.key as LayerKey], i);
                  const color = bandColor(d.compliance, d.critical);
                  const meta = VENDOR_META[d.vendor] ?? VENDOR_META.unknown;
                  const active = sel?.id === d.id;
                  return (
                    <g
                      key={d.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(d)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${meta.name} ${d.name}, compliance ${d.compliance}%, ${d.critical} critical findings`}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(d)}
                    >
                      {col.key !== "edge" ? <line x1={x} y1={y} x2={x + 90} y2={y} stroke="#1b2740" strokeWidth="1" /> : null}
                      <circle cx={x} cy={y} r={16} fill="#0e1628" stroke={color} strokeWidth={active ? 3 : 1.5} className={active ? "animate-pulse-dot" : ""} />
                      <text x={x} y={y + 3.5} textAnchor="middle" fontSize="8.5" fill={meta.color} style={{ fontWeight: 700 }}>
                        {meta.monogram}
                      </text>
                      <text x={x} y={y + 27} textAnchor="middle" fontSize="8" fill="#94a3b8">
                        {d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rounded-xl border border-surface-700 bg-surface-850/60 p-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Selected node</div>
        {sel ? (
          <div className="mt-2 space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">{sel.name}</div>
              <div className="text-xs text-slate-500">
                {VENDOR_META[sel.vendor]?.name ?? sel.vendor} · {sel.role}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-surface-800 border border-surface-700 p-2">
                <div className="text-slate-500">Compliance</div>
                <div className={cn("font-mono font-bold", sel.compliance >= 85 ? "text-emerald-400" : sel.compliance >= 55 ? "text-amber-400" : "text-red-400")}>{sel.compliance}%</div>
              </div>
              <div className="rounded-lg bg-surface-800 border border-surface-700 p-2">
                <div className="text-slate-500">Risk</div>
                <SeverityBadge severity={sel.risk >= 80 ? "CRITICAL" : sel.risk >= 60 ? "HIGH" : sel.risk >= 40 ? "MEDIUM" : "LOW"} />
              </div>
              <div className="rounded-lg bg-surface-800 border border-surface-700 p-2 col-span-2">
                <div className="text-slate-500">Findings</div>
                <div className="text-slate-200 font-mono">{sel.findings} open{sel.critical ? ` · ${sel.critical} critical` : ""}</div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Link to={`/app/audits/${sel.auditId}`} className="btn-outline !px-3 !py-1.5 text-xs flex-1 text-center">
                Open audit
              </Link>
              <button className="btn-primary !px-3 !py-1.5 text-xs flex-1" onClick={() => onOpen(sel)} onKeyDown={() => undefined}>
                Investigate
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 mt-2">Select a device node to inspect posture.</p>
        )}
      </div>
    </div>
  );
}