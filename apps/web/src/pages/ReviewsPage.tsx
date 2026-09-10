import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  PenLine,
  Lock,
  ExternalLink,
  RefreshCw,
  Undo2,
  KeyRound,
  ShieldAlert,
} from "lucide-react";
import type { ReviewQueueItem, ReviewQueueResponse, ReviewStatus } from "../types";
import { api, ApiRequestError } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { ReviewStatusBadge } from "../components/ReviewStatusBadge";
import { SeverityBadge } from "../components/SeverityBadge";
import { LoadingState, ErrorState } from "../components/states";
import { sessionRole } from "../session";
import { Modal } from "../components/motion/Modal";
import { Toast } from "../components/motion/Toast";
import { Reveal } from "../components/motion/Reveal";
import { HumanReviewFlow } from "../components/motion/HumanReviewFlow";
import { AnimatedNexusLogo, type NexusLogoState } from "../components/motion/AnimatedNexusLogo";
import { cn } from "../utils/cn";

const STATUS_ORDER: ReviewStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "RESOLVED", "AI_GENERATED"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

type ActionName = "approve" | "reject" | "request-changes" | "modify" | "reopen";

export default function ReviewsPage() {
  const [data, setData] = useState<ReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string>("ACTIONABLE");
  const [severity, setSeverity] = useState("");
  const [vendor, setVendor] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"risk" | "oldest" | "newest">("risk");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ type: ActionName | "finalize"; item: ReviewQueueItem } | null>(null);
  const [finalizeHint, setFinalizeHint] = useState<string | null>(null);
  const [flash, setFlash] = useState<NexusLogoState | null>(null);
  const flashTimer = useRef<number | null>(null);
  const role = sessionRole();
  const isReviewer = role === "reviewer";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.getReviewQueue());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vendors = useMemo(() => {
    const set = new Set((data?.items ?? []).map((i) => i.vendor));
    return [...set];
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data?.items ?? [];
    if (status === "ACTIONABLE") rows = rows.filter((i) => (i.status === "PENDING_REVIEW" || i.status === "CHANGES_REQUESTED" || i.status === "AI_GENERATED") && !i.auditFinalized);
    else if (status) rows = rows.filter((i) => i.status === status);
    if (severity) rows = rows.filter((i) => i.severity === severity);
    if (vendor) rows = rows.filter((i) => i.vendor === vendor);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((i) => (i.controlName + i.controlId + i.configurationName).toLowerCase().includes(q));
    }
    if (sortBy === "oldest") rows = [...rows].sort((a, b) => a.generatedByAiAt.localeCompare(b.generatedByAiAt));
    else if (sortBy === "newest") rows = [...rows].sort((a, b) => b.generatedByAiAt.localeCompare(a.generatedByAiAt));
    else rows = [...rows].sort((a, b) => b.risk - a.risk);
    return rows;
  }, [data, status, severity, vendor, search, sortBy]);

  const runAction = async (action: ActionName, body: Record<string, unknown>): Promise<string> => {
    if (!modal) return "";
    const id = modal.item.findingId;
    switch (action) {
      case "approve":
        await api.approveFinding(id, String(body.comment ?? ""));
        return "Finding approved. The human decision is recorded in the audit trail.";
      case "reject":
        await api.rejectFinding(id, String(body.reason));
        return "Finding rejected with a recorded rationale.";
      case "request-changes":
        await api.requestChanges(id, String(body.requestedChanges));
        return "Changes requested — the finding is back on the queue once reopened.";
      case "modify":
        await api.modifyFinding(id, {
          why: body.why ? String(body.why) : undefined,
          impact: body.impact ? String(body.impact) : undefined,
          recommendedFix: body.recommendedFix ? String(body.recommendedFix) : undefined,
          risk: typeof body.risk === "number" ? body.risk : undefined,
        });
        return "The AI recommendation now carries a human-corrected version. Approve it to lock the decision.";
      case "reopen":
        await api.reopenFinding(id);
        return "Reopened for another review pass.";
    }
  };

  const submitAction = async (action: ActionName, body: Record<string, unknown>) => {
    setBusy(true);
    const pulse = (s: NexusLogoState) => {
      setFlash(s);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
    };
    try {
      const msg = await runAction(action, body);
      setModal(null);
      setToast(msg);
      await load();
      window.dispatchEvent(new CustomEvent("nexus:refresh"));
      if (action === "approve") pulse("SUCCESS");
    } catch (e) {
      setToast(e instanceof ApiRequestError ? e.message : String(e));
      if (action === "approve") pulse("ERROR");
    } finally {
      setBusy(false);
    }
  };

  const submitFinalize = async (item: ReviewQueueItem, input: { acknowledgePendingCritical?: boolean; comment?: string }) => {
    setBusy(true);
    try {
      const { finalization } = await api.finalizeAudit(item.auditId, input);
      setModal(null);
      setFinalizeHint(null);
      setToast(`Assessment for ${item.configurationName} finalized and sealed by ${finalization.finalizerName}.`);
      await load();
      window.dispatchEvent(new CustomEvent("nexus:refresh"));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 400) setFinalizeHint(e.message);
      else setToast(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts;

  if (loading && !data) return <LoadingState label="Loading Human Review Queue…" />;
  if (error && !data) return <ErrorState title="Could not load the review queue" detail={error} onRetry={load} />;
  if (!data || !counts) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Human Review Queue"
        subtitle="AI and the engine draft findings — humans own the final decision. Pending findings are not counted as verified compliance."
        actions={
          <>
            {!isReviewer ? (
              <span className="chip border text-amber-300 border-amber-500/40 bg-status-warn-soft">
                <KeyRound className="w-3 h-3" aria-hidden="true" /> View-only analyst access
              </span>
            ) : null}
            <button className="btn-ghost !px-3 !py-2 text-xs" onClick={load} aria-label="Refresh review queue">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </>
        }
      />

      {/* Human-in-the-loop pipeline (live aggregates) */}
      <Reveal delay={40}>
        <HumanReviewFlow
          aiGenerated={counts.AI_GENERATED}
          accessible={counts.PENDING_REVIEW + counts.CHANGES_REQUESTED}
          pending={counts.PENDING_REVIEW}
          approved={counts.APPROVED}
          resolved={counts.RESOLVED}
        />
      </Reveal>

      {/* Status summary */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={status === "ACTIONABLE"} onClick={() => setStatus("ACTIONABLE")}>
          Actionable · <span className="font-mono">{counts.PENDING_REVIEW + counts.CHANGES_REQUESTED}</span>
        </FilterChip>
        {STATUS_ORDER.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "PENDING_REVIEW" ? "Pending" : s === "CHANGES_REQUESTED" ? "Changes" : s === "AI_GENERATED" ? "AI-new" : s === "RESOLVED" ? "Resolved" : s}
            · <span className="font-mono">{counts[s]}</span>
          </FilterChip>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" aria-hidden="true" />
          <input className="input !pl-9 h-10 w-56" placeholder="Search control, config…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search findings" />
        </div>
        <select className="input h-10 w-auto" value={vendor} onChange={(e) => setVendor(e.target.value)} aria-label="Filter by vendor">
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v} value={v}>{v.toUpperCase()}</option>
          ))}
        </select>
        <select className="input h-10 w-auto" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
          <option value="">All severities</option>
          {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="input h-10 w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort">
          <option value="risk">Sort by risk</option>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {data.items.length} findings</span>
      </div>

      {/* Queue table */}
      {filtered.length === 0 ? (
        <div className="glass-card glass-card-static !p-10 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl border border-accent/20 bg-accent/5 flex items-center justify-center float-soft">
            <ShieldAlert className="w-7 h-7 text-accent/70" aria-hidden="true" />
          </div>
          <div className="mt-4 text-sm text-slate-400 font-medium">No findings in this view</div>
          <div className="text-sm text-slate-500 mt-1">
            {isReviewer ? "New audits automatically queue FAIL/WARNING findings here." : "Ask a reviewer to triage pending findings."}
          </div>
        </div>
      ) : (
        <div className="glass overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-800 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-medium">Finding</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Review status</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => {
                  const actionable = (item.status === "PENDING_REVIEW" || item.status === "CHANGES_REQUESTED") && !item.auditFinalized;
                  return (
                    <tr key={item.findingId} className="border-b border-surface-800/60 last:border-0 hover:bg-surface-900/60 transition-colors row-in" style={{ animationDelay: `${i * 40}ms` }}>
                      <td className="px-4 py-3">
                        <Link to={`/app/findings/${item.findingId}`} className="group block max-w-md">
                          <span className="text-slate-200 group-hover:text-accent font-medium line-clamp-2">{item.controlName}</span>
                          <span className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                            {item.controlId} · {item.configurationName}
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </span>
                        </Link>
                        <span className="text-[11px] text-slate-600 line-clamp-1 mt-0.5">{item.aiRecommendation}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{item.vendor.toUpperCase()}</td>
                      <td className="px-4 py-3"><SeverityBadge severity={item.severity} /></td>
                      <td className="px-4 py-3 font-mono text-slate-300">{item.risk}</td>
                      <td className="px-4 py-3"><ReviewStatusBadge status={item.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{item.ageDays}d</td>
                      <td className="px-4 py-3">
                        {item.auditFinalized ? (
                          <span className="chip border text-teal-300 border-teal-500/40 bg-teal-500/10">
                            <Lock className="w-3 h-3" aria-hidden="true" /> Sealed
                          </span>
                        ) : isReviewer && actionable ? (
                          <div className="flex flex-wrap gap-1.5">
                            <ChipAction onClick={() => setModal({ type: "approve", item })} className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Approve
                            </ChipAction>
                            <ChipAction onClick={() => setModal({ type: "reject", item })} className="border-red-500/40 text-red-300 hover:bg-red-500/10">
                              <XCircle className="w-3 h-3" aria-hidden="true" /> Reject
                            </ChipAction>
                            <ChipAction onClick={() => setModal({ type: "request-changes", item })} className="border-pink-500/40 text-pink-300 hover:bg-pink-500/10">
                              <MessageSquareWarning className="w-3 h-3" aria-hidden="true" /> Changes
                            </ChipAction>
                            <ChipAction onClick={() => setModal({ type: "modify", item })} className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
                              <PenLine className="w-3 h-3" aria-hidden="true" /> Modify
                            </ChipAction>
                            {item.status === "CHANGES_REQUESTED" ? (
                              <ChipAction onClick={() => submitAction("reopen", {})} className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10">
                                <Undo2 className="w-3 h-3" aria-hidden="true" /> Reopen
                              </ChipAction>
                            ) : null}
                          </div>
                        ) : isReviewer ? (
                          <span className="text-[11px] text-slate-600">{item.status === "AI_GENERATED" ? "Not queued" : item.reviewedBy ?? "—"}</span>
                        ) : (
                          <span className="text-[11px] text-slate-600">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Finalize assessment (reviewer) */}
      {isReviewer && data.items.some((i) => !i.auditFinalized) ? (
        <div className="glass-card glass-card-static !p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <ShieldAlert className="w-4 h-4 text-accent" aria-hidden="true" /> Finalize a compliance review
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Select any open finding to finalize and seal its entire audit assessment. Approved findings resolve; all further changes are blocked.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[...new Set(data.items.filter((i) => !i.auditFinalized).map((i) => i.auditId))]
              .slice(0, 12)
              .map((auditId) => {
                const item = data.items.find((i) => i.auditId === auditId)!;
                return (
                  <ChipAction key={auditId} onClick={() => { setFinalizeHint(null); setModal({ type: "finalize", item }); }} className="border-accent/40 text-accent hover:bg-accent/10">
                    <Lock className="w-3 h-3" aria-hidden="true" /> Finalize · {item.configurationName.slice(0, 26)}
                  </ChipAction>
                );
              })}
          </div>
        </div>
      ) : null}

      {/* Modals */}
      {modal ? (
        <ReviewActionModal
          item={modal.item}
          type={modal.type}
          busy={busy}
          isReviewer={isReviewer}
          mustAcknowledge={finalizeHint}
          onClose={() => {
            setModal(null);
            setFinalizeHint(null);
          }}
          onSubmit={async (payload) => {
            if (modal.type === "finalize") await submitFinalize(modal.item, payload as { acknowledgePendingCritical?: boolean; comment?: string });
            else await submitAction(modal.type, payload as Record<string, unknown>);
          }}
        />
      ) : null}

      {toast ? (
        <Toast
          tone={toast.startsWith("error") || toast.startsWith("4") || toast.startsWith("1") ? "error" : "success"}
          onDismiss={() => setToast(null)}
        >
          {toast}
        </Toast>
      ) : null}

      {flash ? (
        <div className="fixed inset-x-0 top-20 z-[90] flex justify-center pointer-events-none" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-xl glass px-4 py-3 bg-surface-950/90 border border-accent/30 shadow-[0_0_30px_rgba(56,189,248,0.15)]">
            <AnimatedNexusLogo state={flash} size={34} showWord={false} />
            <span className={cn("text-xs font-bold tracking-[0.14em] uppercase", flash === "ERROR" ? "text-red-300" : "text-emerald-300")}>
              {flash === "ERROR" ? "Approval failed" : "Decision recorded"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "chip border text-xs transition-all duration-150 active:scale-95",
        active ? "text-accent border-accent/50 bg-accent/10 shadow-[0_0_12px_rgba(56,189,248,0.15)]" : "text-slate-400 border-surface-700 hover:text-slate-200 hover:border-surface-500"
      )}
    >
      {children}
    </button>
  );
}

function ChipAction({ onClick, className, children }: { onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all duration-150 hover:-translate-y-0.5 active:scale-95", className)}
    >
      {children}
    </button>
  );
}

export function ReviewActionModal({
  item,
  type,
  busy,
  isReviewer,
  mustAcknowledge,
  onClose,
  onSubmit,
}: {
  item: ReviewQueueItem;
  type: "approve" | "reject" | "request-changes" | "modify" | "reopen" | "finalize";
  busy: boolean;
  isReviewer: boolean;
  mustAcknowledge: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState("");
  const [why, setWhy] = useState("");
  const [impact, setImpact] = useState("");
  const [recommendedFix, setRecommendedFix] = useState(item.aiRecommendation);
  const [finalizeComment, setFinalizeComment] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);

  if (type === "finalize") {
    const needsAck = Boolean(mustAcknowledge);
    const submit = () => onSubmit({ acknowledgePendingCritical: needsAck ? acknowledge : undefined, comment: finalizeComment });
    return (
      <Modal title={`Finalize assessment · ${item.configurationName}`} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Finalizing seals the human-verified assessment for this audit. Approved findings become <span className="text-teal-300">Resolved</span>; every future review action is blocked.
          </p>
          <Field label="Reviewer comment (optional)">
            <textarea className="input !h-24" value={finalizeComment} onChange={(e) => setFinalizeComment(e.target.value)} placeholder="e.g. Posture accepted for this review window…" />
          </Field>
          {needsAck ? (
            <div className="rounded-lg border border-status-danger/40 bg-status-danger-soft p-3 text-xs text-red-300 space-y-2">
              <p>{mustAcknowledge}</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} className="accent-accent mt-0.5" />
                <span>Acknowledge that critical/high findings are still pending human review and finalize the assessment anyway.</span>
              </label>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-outline !px-3 !py-2 text-xs" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary !px-3 !py-2 text-xs" onClick={submit} disabled={busy || (needsAck && !acknowledge)}>
              {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Lock className="w-3.5 h-3.5" aria-hidden="true" />} {busy ? "Finalizing…" : "Finalize & Seal"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const config = {
    approve: {
      title: "Approve finding",
      body: (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Confirming the AI recommendation as a correct, evidence-backed finding. The decision becomes part of the immutable audit trail.</p>
          <Field label="Comment (optional)">
            <textarea className="input !h-24" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Brief rationale…" />
          </Field>
        </div>
      ),
      submit: () => onSubmit({ comment }),
    },
    reject: {
      title: "Reject finding",
      body: (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">A rejection requires a reason — it is recorded against the finding and shown in the audit trail.</p>
          <Field label="Rejection reason">
            <textarea className="input !h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. False positive — control enforced upstream…" />
          </Field>
        </div>
      ),
      submit: () => onSubmit({ reason }),
    },
    "request-changes": {
      title: "Request changes",
      body: (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Send the finding back for another pass. It moves to Changes Requested and can be reopened for review.</p>
          <Field label="Requested changes">
            <textarea className="input !h-24" value={requested} onChange={(e) => setRequested(e.target.value)} placeholder="What must change before this is approved?" />
          </Field>
        </div>
      ),
      submit: () => onSubmit({ requestedChanges: requested }),
    },
    modify: {
      title: "Modify recommendation",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Human-correct the AI output. The original AI recommendation is preserved separately; you still approve afterwards.</p>
          <Field label="Why the change is needed">
            <textarea className="input !h-16" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Optional — reason for correcting…" />
          </Field>
          <Field label="Impact">
            <textarea className="input !h-16" value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Optional — corrected impact…" />
          </Field>
          <Field label="Recommended fix">
            <textarea className="input !h-16" value={recommendedFix} onChange={(e) => setRecommendedFix(e.target.value)} placeholder="Corrected recommendation…" />
          </Field>
        </div>
      ),
      submit: () => onSubmit({ why, impact, recommendedFix }),
    },
    reopen: {
      title: "Reopen for review",
      body: <p className="text-sm text-slate-400">Return this finding to Pending Review so it can be actioned again.</p>,
      submit: () => onSubmit({}),
    },
  }[type];

  const disabled = busy || !isReviewer || (type === "reject" && !reason.trim()) || (type === "request-changes" && !requested.trim()) || (type === "modify" && !why.trim() && !impact.trim() && !recommendedFix.trim());

  return (
    <Modal title={config.title} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-surface-700 bg-surface-850 p-3 text-xs">
          <ReviewStatusBadge status={item.status} />
          <div className="mt-1.5 text-slate-300 font-medium">{item.controlName}</div>
          <div className="text-slate-500 font-mono">{item.controlId} · {item.configurationName}</div>
        </div>
        {config.body}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-outline !px-3 !py-2 text-xs" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary !px-3 !py-2 text-xs" onClick={config.submit} disabled={disabled}>
            {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null} {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </Modal>
  );
}