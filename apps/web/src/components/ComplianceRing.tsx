import { useEffect, useRef, useState } from "react";
import { CountUp } from "./motion/CountUp";
import { cn } from "../utils/cn";

function ringColor(score: number): string {
  if (score >= 85) return "#10b981";
  if (score >= 70) return "#38bdf8";
  if (score >= 55) return "#f59e0b";
  return "#ef4444";
}

interface ComplianceRingProps {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

export function ComplianceRing({ value, size = 168, stroke = 12, label, sublabel, className }: ComplianceRingProps) {
  const [animated, setAnimated] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          requestAnimationFrame(() => setAnimated(value));
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [value]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const color = ringColor(clamped);

  return (
    <div ref={ref} className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <div
        className="absolute rounded-full blur-2xl opacity-40 transition-opacity duration-700"
        style={{ inset: size * 0.2, backgroundColor: color }}
        aria-hidden="true"
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 relative">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(animated / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label ? (
          <span className="text-3xl font-bold text-slate-100 leading-none">{label}</span>
        ) : (
          <CountUp to={Math.round(clamped)} className="text-3xl font-bold text-slate-100 leading-none tabular-nums" />
        )}
        {sublabel ? <span className="text-[11px] text-slate-500 mt-1">{sublabel}</span> : null}
      </div>
    </div>
  );
}

export function ComplianceBar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = ringColor(clamped);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-400">{label}</span>
        {hint ? <span className="text-slate-600">{hint}</span> : null}
        <span className="font-mono text-slate-200">{clamped}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}