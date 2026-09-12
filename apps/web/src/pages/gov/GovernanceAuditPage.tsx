import { useMemo, useState } from "react";
import type { GovernanceAuditEvent } from "@nexus/shared-types";
import { ScrollText, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { GovernanceTimeline } from "../../components/gov/GovernanceTimeline";
import { cn } from "../../utils/cn";
import { formatDate } from "../../utils/cn";

const TYPES: Array<GovernanceAuditEvent["actorType"] | "ALL"> = ["ALL", "ai", "human", "system"];

export default function GovernanceAuditPage() {
  const { data, loading, error, refresh } = useAsyncData<{ items: GovernanceAuditEvent[] }>(() => api.gov.auditTrail(), []);
  const [type, setType] = useState<(typeof TYPES)[number]>("ALL");
  const [query, setQuery] = useState("");
  const LIMIT = 30;
  const [showAll, setShowAll] = useState(false);

  const items = data?.items ?? [];

  const visible = useMemo(
    () =>
      items.filter((e) => {
        if (type !== "ALL" && e.actorType !== type) return false;
        if (query) {
          const q = query.toLowerCase();
          return e.action.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q) || e.eventType.toLowerCase().includes(q) || e.target.toLowerCase().includes(q);
        }
        return true;
      }),
    [items, type, query]
  );

  const shown = showAll ? visible : visible.slice(0, LIMIT);

  if (loading && !data) return <LoadingState label="Loading governance audit trail…" />;
  if (error && !data) return <ErrorState title="Could not load audit trail" detail={error} onRetry={refresh} />;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Governance Audit Trail"
        subtitle="Every AI decision and human override is written to an immutable, queryable ledger — who, what, why and when."
      />
      <GovTabs />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "px-3 py-1.5 rounded-full border text-[11px] font-medium transition-colors capitalize",
                type === t ? "border-accent/40 bg-accent/10 text-accent" : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200"
              )}
            >
              {t === "ALL" ? `all (${items.length})` : t}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events…"
          className="input !py-1.5 text-sm flex-1 min-w-[180px]"
          aria-label="Search audit events"
        />
      </div>

      <div className="card !p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
          <ScrollText className="w-4 h-4 text-accent" aria-hidden="true" /> Recent events
        </div>
        {visible.length === 0 ? <p className="text-sm text-slate-500">No events match your filters.</p> : <GovernanceTimeline events={visible} />}
      </div>

      <div className="card !p-5 overflow-x-auto">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
          <ScrollText className="w-4 h-4 text-accent" aria-hidden="true" /> All events
          <span className="ml-auto text-[11px] text-slate-500 font-normal">{visible.length} event{visible.length === 1 ? "" : "s"}{visible.length > LIMIT ? ` · showing ${shown.length}` : ""}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-surface-800">
              <th className="py-2 pr-3 font-semibold">Event</th>
              <th className="py-2 pr-3 font-semibold">Actor</th>
              <th className="py-2 pr-3 font-semibold">Target</th>
              <th className="py-2 pr-3 font-semibold hidden md:table-cell">State change</th>
              <th className="py-2 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className="border-b border-surface-800/60 last:border-0">
                <td className="py-2.5 pr-3">
                  <div className="text-xs font-medium text-slate-200">{e.action}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{e.eventType}</div>
                </td>
                <td className="py-2.5 pr-3 text-xs text-slate-400 capitalize">{e.actor} · {e.actorType}</td>
                <td className="py-2.5 pr-3 text-xs text-slate-500 font-mono">{e.targetType}</td>
                <td className="py-2.5 pr-3 text-xs font-mono text-slate-500 hidden md:table-cell">
                  {e.previousState ? (
                    <>
                      <span className="text-slate-500 line-through">{e.previousState}</span>
                      <span className="mx-1 text-slate-700">→</span>
                      <span className="text-slate-200">{e.newState}</span>
                    </>
                  ) : e.newState ? (
                    <span className="text-accent">{e.newState}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2.5 text-[11px] text-slate-500 font-mono whitespace-nowrap">{formatDate(e.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > LIMIT ? (
          <button onClick={() => setShowAll((v) => !v)} className="mt-3 w-full text-center text-xs text-accent hover:underline flex items-center justify-center gap-1 py-2">
            {showAll ? (<><ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> Show fewer</>) : (<><ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> Show all {visible.length} events</>)}
          </button>
        ) : null}
      </div>
    </div>
  );
}