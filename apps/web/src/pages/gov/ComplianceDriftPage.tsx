import { useCallback, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Ban, Boxes, Crosshair, Lock, Radio, ShieldAlert, Timer } from "lucide-react";
import type { ComplianceDriftItem } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { HelpTooltip } from "../../components/gov/HelpTooltip";
import { cn } from "../../utils/cn";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function severityStyle(sev: string) {
  switch (sev) {
    case "CRITICAL":
      return { text: "text-red-500", chip: "text-red-400 border-red-500/40 bg-red-500/10", bar: "bg-red-500" };
    case "HIGH":
      return { text: "text-orange-400", chip: "text-orange-400 border-orange-500/40 bg-orange-500/10", bar: "bg-orange-500" };
    case "MEDIUM":
      return { text: "text-amber-400", chip: "text-amber-400 border-amber-500/40 bg-amber-500/10", bar: "bg-amber-500" };
    default:
      return { text: "text-sky-400", chip: "text-sky-400 border-sky-500/40 bg-sky-500/10", bar: "bg-sky-500" };
  }
}

function timeAgo(iso: string): string {
  const s = Date.now() - new Date(iso).getTime();
  const days = Math.floor(s / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function DriftCard({ item, onSuppress, suppressed }: { item: ComplianceDriftItem; onSuppress: (id: string) => void; suppressed: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const style = severityStyle(item.severity);
  return (
    <div className={cn("rounded-lg border p-4", suppressed ? "border-surface-700 bg-surface-800/30" : "border-amber-500/25 bg-amber-500/5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("w-1.5 h-full self-stretch rounded-full shrink-0", suppressed ? "bg-slate-600" : `${style.bar}`)} aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert className={cn("w-4 h-4 shrink-0", suppressed ? "text-slate-500" : style.text)} aria-hidden="true" />
              <span className="font-semibold text-sm text-slate-200">{item.title}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              <span className="font-medium text-slate-300">{item.controlName}</span> · {item.controlId} · {item.system}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={cn("px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide", suppressed ? "text-slate-500 border-slate-600 bg-slate-800/40" : style.chip)}>
                {item.severity}
              </span>
              <span className={cn("px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide", item.risk === "HIGH" || item.risk === "CRITICAL" ? "text-orange-400 border-orange-500/40 bg-orange-500/10" : "text-slate-400 border-surface-700 bg-surface-800/40")}>
                risk {item.risk}
              </span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Timer className="w-3 h-3" aria-hidden="true" /> detected {timeAgo(item.detectedAt)}
              </span>
              {item.findingCreated && (
                <span className="px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide text-accent border-accent/30 bg-accent/5">
                  finding auto-created
                </span>
              )}
            </div>
          </div>
        </div>
        {!suppressed && (
          <button
            className="text-[10px] text-slate-300 border border-surface-600 bg-surface-800/60 rounded px-2 py-1 whitespace-nowrap hover:border-amber-500/40 hover:text-amber-400 transition-colors shrink-0"
            onClick={() => onSuppress(item.id)}
          >
            <Ban className="w-3 h-3 inline mr-1" aria-hidden="true" />ACKNOWLEDGE
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <div className="rounded bg-surface-800/50 border border-surface-700 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-emerald-500 font-semibold mb-1 flex items-center gap-1">
            <ArrowUpFromLine className="w-3 h-3" aria-hidden="true" /> Expected state
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{item.expected}</p>
        </div>
        <div className="rounded bg-surface-800/50 border border-surface-700 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-red-500 font-semibold mb-1 flex items-center gap-1">
            <ArrowDownToLine className="w-3 h-3" aria-hidden="true" /> Observed state
          </div>
          <p className="text-xs text-orange-300 leading-relaxed">{item.observed}</p>
        </div>
      </div>

      <button className="mt-3 text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1" onClick={() => setExpanded((p) => !p)}>
        {expanded ? "Hide" : "Show"} affected scope
        <span className={cn("transition-transform", expanded && "rotate-180")}>▾</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-3 animate-fade-in">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5 flex items-center gap-1">
              <Boxes className="w-3 h-3" aria-hidden="true" /> Affected systems
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.affectedSystems.map((sys) => (
                <span key={sys} className="px-2 py-0.5 rounded-full border border-surface-700 bg-surface-800/50 text-[10px] text-slate-300">{sys}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5 flex items-center gap-1">
              <Lock className="w-3 h-3" aria-hidden="true" /> Frameworks impacted
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.frameworkIds.map((f) => (
                <span key={f} className="px-2 py-0.5 rounded border border-surface-700 bg-surface-800/50 text-[10px] text-slate-400 font-mono">{f}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="px-2 py-1 rounded bg-surface-800/60 text-[10px] text-slate-400 border border-surface-700">
              <Crosshair className="w-3 h-3 inline mr-1 text-accent" aria-hidden="true" /> Applied control: {item.controlName}
            </span>
            <span className="px-2 py-1 rounded bg-surface-800/60 text-[10px] text-slate-300 border border-surface-700 flex items-center gap-1">
              <Radio className="w-3 h-3 text-accent" aria-hidden="true" /> Status: {item.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComplianceDriftPage() {
  const { data: drift, loading, error, refresh } = useAsyncData<ComplianceDriftItem[]>(() => api.gov.drift(), []);
  const [suppressedIds, setSuppressedIds] = useState<Set<string>>(() => new Set());

  const handleSuppress = useCallback(
    (id: string) => {
      api.gov
        .suppressDrift(id)
        .then(() => {
          setSuppressedIds((prev) => new Set(prev).add(id));
          refresh();
        })
        .catch(() => undefined);
    },
    [refresh]
  );

  if (loading && !drift) return <LoadingState label="Scanning control state against configured baselines…" />;
  if (error && !drift) return <ErrorState title="Could not load drift analysis" detail={error} onRetry={refresh} />;

  const items = drift ?? [];
  const visible = items.filter((d) => !suppressedIds.has(d.id) && d.status !== "SUPPRESSED");
  const allVisible = items.filter((d) => d.status !== "SUPPRESSED");
  const bySeverity = (s: string) => allVisible.filter((d) => d.severity === s).length;
  const critical = bySeverity("CRITICAL");
  const high = bySeverity("HIGH");
  const medium = bySeverity("MEDIUM");
  const low = bySeverity("LOW");
  const affectedSystems = new Set(items.flatMap((d) => d.affectedSystems)).size;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Compliance Drift"
        subtitle="Expected vs observed control state across your environment. Drift flagged here is never auto-remediated — changes to fix it require the governed change workflow."
        actions={<HelpTooltip label="compliance drift">Drift = observed configuration differs from the control state your active frameworks require. Detecting it is deterministic; acting on it is governed.</HelpTooltip>}
      />
      <GovTabs />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-card !p-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 uppercase tracking-wide font-semibold">
            <Radio className="w-3.5 h-3.5 text-accent" aria-hidden="true" /> Open drift
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-100 font-mono tabular-nums">{visible.length}</div>
          <div className="text-[11px] text-slate-500">items require a human decision</div>
        </div>
        <div className="glass-card !p-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 uppercase tracking-wide font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" /> High / critical
          </div>
          <div className="mt-1 text-2xl font-bold text-orange-400 font-mono tabular-nums">{critical + high}</div>
          <div className="text-[11px] text-slate-500">elevated risk to compliance posture</div>
        </div>
        <div className="glass-card !p-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 uppercase tracking-wide font-semibold">
            <Boxes className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" /> Affected systems
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-100 font-mono tabular-nums">{affectedSystems}</div>
          <div className="text-[11px] text-slate-500">systems outside expected state</div>
        </div>
        <div className="glass-card !p-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 uppercase tracking-wide font-semibold">
            <Ban className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> Acknowledged
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-100 font-mono tabular-nums">{suppressedIds.size}</div>
          <div className="text-[11px] text-slate-500">suppressed this session</div>
        </div>
      </div>

      {critical + high + medium + low > 0 && (
        <div className="card !p-5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Drift by severity</div>
          <div className="space-y-2">
            {SEVERITY_ORDER.map((s) => {
              const n = bySeverity(s);
              if (n === 0) return null;
              const style = severityStyle(s);
              const pct = (n / Math.max(1, items.length)) * 100;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide w-16 text-slate-400">{s}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-800 overflow-hidden">
                    <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${pct}%` }} aria-hidden="true" />
                  </div>
                  <span className="font-mono text-xs text-slate-400 tabular-nums w-8 text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card !p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Detected drift</h2>
            <p className="text-xs text-slate-500 mt-0.5">Acknowledge an item to record it in the audit trail; it is not auto-remediated for security.</p>
          </div>
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={<CheckCircleIcon />} title="No open drift" hint="All detected drift has been acknowledged. The governed change workflow is the required path to actually remediate it." />
        ) : (
          <div className="space-y-3">
            {visible.map((d) => (
              <DriftCard key={d.id} item={d} onSuppress={handleSuppress} suppressed={suppressedIds.has(d.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="card !p-4 border-surface-700/50 bg-surface-800/30">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Drift detection flags deviations between expected control state (from your active frameworks) and observed configuration. Resolution is gated by the
          NEXUS governed change workflow — impact analysis → simulation → approval → execution → verification — so remediation is always reviewable and auditable.
        </p>
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return <span className="text-emerald-400">✓</span>;
}