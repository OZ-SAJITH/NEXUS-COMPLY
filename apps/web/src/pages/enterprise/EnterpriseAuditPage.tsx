import { useMemo, useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import type { AuditEventRecord } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { SectionTitle } from "../../components/ui";
import { EnterpriseTabs } from "./EnterpriseTabs";
import { cn, formatDate } from "../../utils/cn";

const EVENT_STYLE: Record<string, string> = {
  ASSET_DISCOVERED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  ASSET_UPDATED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  ASSET_SCANNED: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  EVIDENCE_COLLECTED: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  FINDING_ANALYZED: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  REMEDIATION_PLANNED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  REMEDIATION_VALIDATED: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  REMEDIATION_APPROVED: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  REMEDIATION_REJECTED: "border-red-500/40 bg-red-500/10 text-red-300",
  REMEDIATION_EXECUTED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  REMEDIATION_VERIFICATION_PASSED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  REMEDIATION_VERIFICATION_FAILED: "border-red-500/40 bg-red-500/10 text-red-300",
  REMEDIATION_ROLLED_BACK: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  CONNECTOR_STATUS_CHANGED: "border-purple-500/40 bg-purple-500/10 text-purple-300",
};

export default function EnterpriseAuditPage() {
  const { data: events, loading, error, refresh } = useAsyncData<AuditEventRecord[]>(() => api.enterprise.audit(), []);
  const [type, setType] = useState("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const types = useMemo(() => (events ? [...new Set(events.map((e) => e.eventType))] : []), [events]);

  if (loading && !events) return <LoadingState label="Loading enterprise audit trail…" />;
  if (error && !events) return <ErrorState title="Could not load audit trail" detail={error} onRetry={refresh} />;
  if (!events) return null;

  const filtered = events.filter((e) => type === "ALL" || e.eventType === type);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Enterprise Audit Trail"
        subtitle="Append-only, source-tagged ledger of discovery, scanning, evidence collection, AI analysis and every remediation transition."
      />
      <EnterpriseTabs />

      <div className="flex flex-wrap items-center gap-2">
        <ScrollText className="w-4 h-4 text-accent" aria-hidden="true" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by event type">
          <option value="ALL">All event types</option>
          {types.sort().map((t) => (
            <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} events · {events.length} total</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="No events in this view" hint="Run a discovery, scan an asset or advance a remediation to populate the ledger." />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="card !p-3">
              <button onClick={() => setOpenId(openId === e.id ? null : e.id)} className="w-full text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap", EVENT_STYLE[e.eventType] ?? "border-slate-500/40 bg-slate-500/10 text-slate-300")}>{e.eventType.replaceAll("_", " ")}</span>
                  <span className="text-[11px] text-slate-400 font-mono">{e.entityType}:{e.entityId}</span>
                  {e.controlId ? <span className="text-[11px] text-slate-500 font-mono">{e.controlId}</span> : null}
                  <span className={cn("px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold", e.source === "ai" ? "text-fuchsia-400 bg-fuchsia-500/10" : e.source === "human" ? "text-amber-400 bg-amber-500/10" : "text-slate-400 bg-slate-500/10")}>{e.source}</span>
                  <span className="ml-auto text-[11px] text-slate-500 inline-flex items-center gap-1">
                    {formatDate(e.at)} <ChevronDown className={cn("w-3 h-3 transition-transform", openId === e.id ? "rotate-180" : "")} aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {e.actorName ? <span className="mr-3">actor: {e.actorName} ({e.actorRole})</span> : null}
                  <span className="mr-3 font-mono">auditId: {e.auditId}</span>
                  {e.findingId ? <span className="font-mono">finding: {e.findingId}</span> : null}
                </div>
              </button>
              {openId === e.id ? (
                <pre className="mt-3 text-[11px] text-slate-400 font-mono bg-surface-800/60 rounded-lg p-3 overflow-x-auto">{JSON.stringify(e.detail, null, 2)}</pre>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <section>
        <SectionTitle sub="Every enterprise event is typed, source-attributed and append-only">Immutability note</SectionTitle>
        <div className="card !p-4 text-xs text-slate-400 leading-relaxed">
          Events are emitted by the NEXUS-COMPLY engine against the simulated enterprise marketplace. Remediation transitions cannot be skipped: the workflow rejects out-of-order actions
          (for example approving before validation) and every human/system action writes a distinct, timestamped event.
        </div>
      </section>
    </div>
  );
}