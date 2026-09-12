import { cn } from "../../utils/cn";

export function ConfidenceMeter({ value, label = "AI confidence" }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const tone = clamped >= 85 ? "bg-emerald-500" : clamped >= 60 ? "bg-amber-500" : "bg-red-500";
  const text = clamped >= 85 ? "text-emerald-400" : clamped >= 60 ? "text-amber-400" : "text-red-400";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={cn("font-mono font-semibold tabular-nums", text)}>{clamped}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-800 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}