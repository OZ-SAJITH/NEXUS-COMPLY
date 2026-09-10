import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { SeverityBadge } from "./SeverityBadge";
import { VENDOR_META } from "../demo/dashboard";
import { cn } from "../utils/cn";

export interface VendorRow {
  vendor: string;
  assets: number;
  compliance: number;
  risk: number;
  highRisk: number;
  findings: number;
  auditId?: string;
}

function ringColor(score: number): string {
  if (score >= 85) return "#10b981";
  if (score >= 70) return "#38bdf8";
  if (score >= 55) return "#f59e0b";
  return "#ef4444";
}

function MiniRing({ value, size = 48 }: { value: number; size?: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setAnimated(value), 120);
    return () => clearTimeout(t);
  }, [value]);
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ringColor(clamped)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(animated / 100) * c} ${c}`}
        style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  );
}

export function VendorCard({ row }: { row: VendorRow }) {
  const meta = VENDOR_META[row.vendor] ?? VENDOR_META.unknown;
  const riskBand = row.risk >= 80 ? "CRITICAL" : row.risk >= 60 ? "HIGH" : row.risk >= 40 ? "MEDIUM" : "LOW";
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--rx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--ry", `${e.clientY - rect.top}px`);
  };

  const status =
    row.compliance >= 85 ? "bg-status-ok" : row.compliance >= 70 ? "bg-accent" : row.compliance >= 55 ? "bg-status-warn" : "bg-status-danger";

  return (
    <Link
      ref={ref}
      to={row.auditId ? `/app/audits/${row.auditId}` : "/app/infrastructure"}
      onMouseMove={onMove}
      className="glass-card group !rounded-xl !p-4 block"
    >
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-lg border flex items-center justify-center text-xs font-bold transition-transform duration-300 group-hover:scale-105"
          style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14`, boxShadow: `0 0 14px ${meta.color}22` }}
        >
          {meta.monogram}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100 truncate group-hover:text-accent transition-colors">{meta.name}</span>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", row.highRisk > 0 ? "bg-status-danger animate-pulse-dot" : status)} aria-hidden="true" title={row.highRisk > 0 ? "High-risk findings pending" : "Baseline nominal"} />
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{row.assets} asset{row.assets === 1 ? "" : "s"} · {row.findings} finding{row.findings === 1 ? "" : "s"}</div>
        </div>
        <MiniRing value={row.compliance} />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <SeverityBadge severity={riskBand} label={`${riskBand} risk`} />
        <span className="text-xs text-slate-500 font-mono">risk {row.risk}</span>
      </div>
      <span className="sr-only">View {meta.name} details</span>
    </Link>
  );
}