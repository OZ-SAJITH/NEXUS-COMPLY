import type { ReactNode } from "react";
import { cn, severityColor, statusColor } from "../utils/cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("chip border", className)}>{children}</span>;
}

export function SeverityBadge({ severity, label }: { severity: string; label?: string }) {
  return <Badge className={severityColor(severity)}>{label ?? severity}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={statusColor(status)}>{status.replaceAll("_", " ")}</Badge>;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-surface-800 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", className ?? "bg-accent")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-slate-100">{children}</h2>
      {sub ? <p className="text-sm text-slate-500 mt-0.5">{sub}</p> : null}
    </div>
  );
}

export function Stat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "danger" | "good" | "warn" }) {
  const toneCls =
    tone === "danger" ? "text-red-400" : tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-slate-100";
  return (
    <div className="card flex-1 min-w-[140px]">
      <div className={cn("text-3xl font-bold", toneCls)}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}