import { useMemo, useState } from "react";
import { Reply, Wrench } from "lucide-react";
import type { RemediationRecord, RemediationStatus } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { SectionTitle, Stat } from "../../components/ui";
import { EnterpriseTabs } from "./EnterpriseTabs";
import { RemediationWorkflow } from "../../components/assets/RemediationWorkflow";

const STATUS_ORDER: Record<string, number> = {
  VERIFIED: 0,
  PLANNED: 1,
  VALIDATED: 2,
  VALIDATION_FAILED: 3,
  PENDING_APPROVAL: 4,
  APPROVED: 5,
  EXECUTING: 6,
  COMPLETED: 7,
  VERIFYING: 8,
  FAILED: 9,
  REJECTED: 10,
  ROLLED_BACK: 11,
};

export default function RemediationsPage() {
  const { data: rems, loading, error, refresh } = useAsyncData<RemediationRecord[]>(() => api.enterprise.remediations(), []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    setNotice("");
    try {
      const r = await fn();
      const rem = r as RemediationRecord;
      setNotice(`${label} complete — status now ${rem.status}.`);
      refresh();
    } catch (e) {
      setNotice(`${label} rejected: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const m = new Map<RemediationStatus, number>();
    for (const r of rems ?? []) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rems]);

  if (loading && !rems) return <LoadingState label="Loading remediations…" />;
  if (error && !rems) return <ErrorState title="Could not load remediations" detail={error} onRetry={refresh} />;
  if (!rems) return null;

  const filtered = rems
    .filter((r) => status === "ALL" || r.status === status)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) || (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Remediation Workflow"
        subtitle="Structured, validated, human-approved remediation with simulation, sandbox validation, audit and automatic verification against re-scanned evidence. Rollback restores the snapshot."
      />
      <EnterpriseTabs />

      {notice ? <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">{notice}</div> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Verified" value={counts.get("VERIFIED") ?? 0} tone="good" />
        <Stat label="In flight" value={(counts.get("PLANNED") ?? 0) + (counts.get("VALIDATED") ?? 0) + (counts.get("PENDING_APPROVAL") ?? 0) + (counts.get("APPROVED") ?? 0)} tone="warn" />
        <Stat label="Executed" value={(counts.get("COMPLETED") ?? 0) + (counts.get("VERIFYING") ?? 0)} />
        <Stat label="Failed / rolled back" value={(counts.get("FAILED") ?? 0) + (counts.get("ROLLED_BACK") ?? 0)} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="w-4 h-4 text-accent" aria-hidden="true" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by status">
          <option value="ALL">All statuses</option>
          {[...counts.keys()].sort().map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")} ({counts.get(s)})</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} of {rems.length} remediations</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState title="No remediations in this view" hint="Scan an asset and plan a remediation from a failing finding to start the closed loop." />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <RemediationWorkflow
              key={r.id}
              rem={r}
              busy={busy}
              onAction={run}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}

      <section>
        <SectionTitle sub="The loop enforced by every transition">Closed loop</SectionTitle>
        <div className="card !p-4 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
          {["PLANNED", "VALIDATED", "PENDING_APPROVAL", "APPROVED", "EXECUTING", "COMPLETED", "VERIFYING", "VERIFIED"].map((step, i) => (
            <span key={step} className="inline-flex items-center gap-2">
              {i > 0 ? <Reply className="w-3 h-3 rotate-180 text-slate-600" aria-hidden="true" /> : null}
              <span className="px-2 py-0.5 rounded border border-surface-700">{step}</span>
            </span>
          ))}
          <span className="text-slate-600">←</span>
          <span className="px-2 py-0.5 rounded border border-red-500/30 text-red-300">FAILED → ROLLED_BACK</span>
        </div>
      </section>
    </div>
  );
}