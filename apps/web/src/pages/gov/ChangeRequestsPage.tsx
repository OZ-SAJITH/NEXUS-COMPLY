import { useMemo, useState } from "react";
import type { ChangeRequest, CompliancePassport } from "@nexus/shared-types";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Snowflake, ArrowRight, Search } from "lucide-react";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "../../components/states";
import { GovTabs } from "./GovTabs";
import { StatusPill } from "../../components/gov/StatusPill";
import { RiskBandPill } from "../../components/gov/RiskBandPill";
import { timeAgo } from "../../utils/cn";

function ChangeRow({ change, onOpen }: { change: ChangeRequest; onOpen: (id: string) => void }) {
  return (
    <button onClick={() => onOpen(change.id)} className="w-full text-left card card-hover !p-4 group">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={change.status} />
        <RiskBandPill band={change.risk} />
        {change.emergency ? <span className="px-2 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-[10px] uppercase tracking-wide text-orange-400">emergency</span> : null}
        <span className="ml-auto text-[11px] text-slate-500 font-mono">#{change.id}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-100">{change.title}</div>
      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{change.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
        <span className="font-mono">{change.targetSystems.join(", ")}</span>
        <span>{change.impacts?.length ? `${change.impacts[0].dependencyCount} deps · ${change.impacts[0].servicesCount} services` : "not analyzed yet"}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-accent opacity-0 group-hover:opacity-100 transition-opacity">
          Open change <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </span>
        {change.updatedAt ? <span>{timeAgo(change.updatedAt)}</span> : null}
      </div>
    </button>
  );
}

export default function ChangeRequestsPage() {
  const { data: changes, loading, error, refresh } = useAsyncData<ChangeRequest[]>(() => api.gov.changes(), []);
  const { data: passport } = useAsyncData<CompliancePassport>(() => api.gov.passport(), []);
  const { data: freeze } = useAsyncData(() => api.gov.freeze(), []);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");

  const allStatuses = useMemo(() => (changes ? [...new Set(changes.map((c) => c.status))] : []), [changes]);

  if (loading && !changes) return <LoadingState label="Loading change requests…" />;
  if (error && !changes) return <ErrorState title="Could not load changes" detail={error} onRetry={refresh} />;
  if (!changes) return null;

  const all = changes ?? [];
  const order: Record<string, number> = { DRAFT: 0, AI_ANALYZED: 1, SIMULATION_REQUIRED: 2, PENDING_REVIEW: 3, APPROVAL_REQUIRED: 4, CHANGES_REQUESTED: 5, APPROVED: 6, EXECUTING: 7, VERIFICATION: 8, FAILED: 9, ROLLBACK_RECOMMENDED: 10, ROLLED_BACK: 11, SUCCESS: 12, REJECTED: 13 };
  const q = query.trim().toLowerCase();
  const sorted = all
    .filter((c) => (status === "ALL" ? true : c.status === status))
    .filter((c) => !q || `${c.title} ${c.description} ${c.id}`.toLowerCase().includes(q))
    .sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Safe Change Governance"
        subtitle="Every change is analyzed, simulated, reviewed and guarded — with four-eyes approval, an optional change freeze and automated rollback ordering."
        actions={
          <Link to="/app/governance/changes/new" className="btn-primary text-sm">
            <Plus className="w-4 h-4" aria-hidden="true" /> New change
          </Link>
        }
      />
      <GovTabs />

      {freeze?.active ? (
        <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-4 flex items-start gap-3">
          <Snowflake className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-sm font-medium text-sky-200">Change freeze active{freeze.triggeredAt ? ` since ${timeAgo(freeze.triggeredAt)}` : ""}</div>
            {freeze.reason ? <div className="text-xs text-sky-200/70 mt-0.5">{freeze.reason}</div> : <div className="text-xs text-sky-200/70 mt-0.5">Non-essential approvals, executions and rollbacks are blocked.</div>}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description or ID…"
            className="input !pl-9 !py-2 text-sm"
            aria-label="Search change requests"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !py-2 text-sm" aria-label="Filter by status">
          <option value="ALL">All statuses</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">{sorted.length} of {all.length} changes</span>
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState title="No changes match" hint={q || status !== "ALL" ? "Adjust the search or status filter to see more changes." : "Draft a change to begin the governed workflow."} action={<Link to="/app/governance/changes/new" className="btn-primary text-xs">New change</Link>} />
        </div>
      ) : (
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-1.5 md:gap-3">
        {sorted.map((c) => (
          <ChangeRow key={c.id} change={c} onOpen={(id) => navigate(`/app/governance/changes/${id}`)} />
        ))}
      </div>
      )}

      {passport ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card !p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{passport.pendingApprovals}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">awaiting approval</div>
          </div>
          <div className="card !p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{passport.highRiskChanges}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">high-risk active</div>
          </div>
          <div className="card !p-3 text-center">
            <div className="text-2xl font-bold text-accent">{changes.filter((c) => c.status === "SUCCESS").length}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">verified changes</div>
          </div>
          <div className="card !p-3 text-center">
            <div className="text-2xl font-bold text-violet-400">{new Set(changes.flatMap((c) => c.approvals.map((a) => a.approverName))).size}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">unique approvers</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}