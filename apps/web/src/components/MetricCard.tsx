import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { GlassCard } from "./motion/GlassCard";
import { CountUp } from "./motion/CountUp";
import { cn } from "../utils/cn";

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  context: string;
  trend?: { text: string; direction: "up" | "down" | "flat"; positive: boolean };
  accent?: "accent" | "ok" | "warn" | "danger";
  link?: { to: string; label: string };
}

const ACCENTS = {
  accent: "bg-accent/10 text-accent border-accent/20 group-hover:border-accent/40",
  ok: "bg-status-ok/10 text-status-ok border-status-ok/20 group-hover:border-status-ok/40",
  warn: "bg-status-warn/10 text-status-warn border-status-warn/20 group-hover:border-status-warn/40",
  danger: "bg-status-danger/10 text-status-danger border-status-danger/20 group-hover:border-status-danger/40",
};

export function MetricCard({ icon, label, value, context, trend, accent = "accent", link }: MetricCardProps) {
  const trendIcon =
    trend?.direction === "up" ? <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> : trend?.direction === "down" ? <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" /> : <Minus className="w-3.5 h-3.5" aria-hidden="true" />;
  const trendColor =
    trend?.direction === "flat" ? "text-slate-400" : trend?.positive ? "text-status-ok" : "text-status-danger";
  const renderedValue = typeof value === "number" ? <CountUp to={value} /> : value;

  return (
    <GlassCard className="group !p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={cn("w-9 h-9 rounded-lg border flex items-center justify-center transition-colors", ACCENTS[accent])}>{icon}</span>
        {trend ? (
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", trendColor)}>
            {trendIcon}
            {trend.text}
          </span>
        ) : null}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-100 leading-none tabular-nums">{renderedValue}</div>
        <div className="text-sm text-slate-400 mt-1.5">{label}</div>
        <div className="text-xs text-slate-500 mt-1">{context}</div>
      </div>
      {link ? (
        <Link
          to={link.to}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline mt-auto pt-1 group/link"
        >
          {link.label} <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover/link:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
    </GlassCard>
  );
}