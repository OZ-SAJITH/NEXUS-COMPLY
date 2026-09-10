import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Database,
  Shuffle,
  ShieldCheck,
  Eye,
  BrainCircuit,
  Network,
  Wrench,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Info,
  KeyRound,
  Lock,
  History,
  ScanSearch,
} from "lucide-react";
import type { AuditRecord, Finding, ReviewDetail, ReviewQueueItem } from "@nexus/shared-types";
import { api, ApiRequestError } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { SeverityBadge, FindingStatusBadge } from "../components/SeverityBadge";
import { ReviewStatusBadge } from "../components/ReviewStatusBadge";
import { AuditTrailTimeline } from "../components/AuditTrailTimeline";
import { LoadingState, ErrorState } from "../components/states";
import { ReviewActionModal } from "./ReviewsPage";
import { Toast } from "../components/motion/Toast";
import { GlassCard } from "../components/motion/GlassCard";
import { VENDOR_META, GUIDANCE_FRAMEWORKS } from "../demo/dashboard";
import { cn, formatDate } from "../utils/cn";
import { sessionRole } from "../session";

const CHAIN = [
  { icon: Database, label: "Raw configuration" },
  { icon: Shuffle, label: "Normalized to security intent" },
  { icon: ShieldCheck, label: "Control evaluated" },
  { icon: Eye, label: "Line-level evidence" },
  { icon: BrainCircuit, label: "AI risk analysis" },
  { icon: Network, label: "Risk prioritization" },
  { icon: Wrench, label: "Recommendation" },
];

const BANNERS: Record<string, { tone: string; text: string }> = {
  AI_GENERATED: { tone: "text-slate-300 border-slate-500/40 bg-slate-500/10", text: "AI-generated finding that has not yet entered the Human Review Queue." },
  PENDING_REVIEW: { tone: "text-amber-300 border-amber-500/40 bg-status-warn-soft", text: "AI-generated finding — human review required. Pending findings are NOT counted as verified compliance." },
  CHANGES_REQUESTED: { tone: "text-pink-300 border-pink-500/40 bg-pink-500/10", text: "Human reviewer requested changes. The finding must be reopened and re-reviewed before it counts." },
  APPROVED: { tone: "text-emerald-300 border-emerald-500/40 bg-status-ok-soft", text: "Human reviewer approved this finding. It counts as verified compliance." },
  REJECTED: { tone: "text-red-300 border-red-500/40 bg-status-danger-soft", text: "Human reviewer rejected this AI suggestion. Reason recorded in the audit trail." },
  RESOLVED: { tone: "text-teal-300 border-teal-500/40 bg-teal-500/10", text: "Human-approved finding resolved during the finalized assessment." },
};

function frameworkOf(controlId: string): string {
  const id = controlId.toUpperCase();
  const hit = GUIDANCE_FRAMEWORKS.find((f) => f.controls.some((p) => id.startsWith(p)));
  return hit?.name ?? "Prototype controls";
}

export default function FindingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [finding, setFinding] = useState<Finding | null>(null);
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Parameters<typeof ReviewActionModal>[0]["type"] | null>(null);
  const [finalizeHint, setFinalizeHint] = useState<string | null>(null);
  const isReviewer = sessionRole() === "reviewer";

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { finding: f, auditId } = await api.getFinding(id);
      setFinding(f);
      setError("");
      api.getAudit(auditId).then(setAudit).catch(() => setAudit(null));
      try {
        setDetail(await api.getFindingReview(id));
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 404) setDetail(null);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !finding) return <ErrorState title="Could not load finding" detail={error} onRetry={load} />;
  if (!finding) return <LoadingState label="Loading finding detail…" />;

  const meta = audit ? VENDOR_META[audit.vendor] ?? VENDOR_META.unknown : VENDOR_META.unknown;
  const review = detail?.review ?? null;
  const banner = review ? BANNERS[review.status] : finding.status === "PASS" || finding.status === "NOT_APPLICABLE" ? null : { tone: "text-slate-300 border-slate-500/40 bg-slate-500/10", text: "This finding is not tracked in the Human Review Queue." };
  const sealed = Boolean(detail?.auditFinalization);
  const aiRecommendation = review?.humanModifiedRecommendation?.recommendedFix ?? review?.originalAiRecommendation.recommendedFix ?? finding.recommendedFix;

  const queueItem: ReviewQueueItem | null = review && audit ? {
    findingId: finding.id,
    auditId: audit.id,
    vendor: audit.vendor,
    configurationName: audit.configurationName,
    frameworkLabel: review.frameworkLabel,
    controlId: finding.controlId,
    controlName: finding.controlName,
    severity: finding.severity,
    risk: finding.risk,
    status: review.status,
    aiRecommendation,
    generatedByAiAt: review.generatedByAiAt,
    ageDays: 0,
    auditFinalized: sealed,
  } : null;

  const runAction = async (action: "approve" | "reject" | "request-changes" | "modify" | "reopen", payload: Record<string, unknown>) => {
    if (!detail) return;
    setBusy(true);
    try {
      switch (action) {
        case "approve":
          await api.approveFinding(finding.id, String(payload.comment ?? ""));
          setToast("Finding approved — the human decision is recorded in the audit trail.");
          break;
        case "reject":
          await api.rejectFinding(finding.id, String(payload.reason));
          setToast("Finding rejected with a recorded rationale.");
          break;
        case "request-changes":
          await api.requestChanges(finding.id, String(payload.requestedChanges));
          setToast("Changes requested — the finding needs another pass before it counts.");
          break;
        case "modify":
          await api.modifyFinding(finding.id, {
            why: payload.why ? String(payload.why) : undefined,
            impact: payload.impact ? String(payload.impact) : undefined,
            recommendedFix: payload.recommendedFix ? String(payload.recommendedFix) : undefined,
          });
          setToast("Human-corrected recommendation stored. The original AI output is preserved below.");
          break;
        case "reopen":
          await api.reopenFinding(finding.id);
          setToast("Finding reopened for another review pass.");
          break;
      }
      setModal(null);
      await load();
    } catch (e) {
      setToast(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finalize = async (payload: Record<string, unknown>) => {
    if (!audit || !queueItem) return;
    setBusy(true);
    try {
      const { finalization } = await api.finalizeAudit(audit.id, payload as { acknowledgePendingCritical?: boolean; comment?: string });
      setModal(null);
      setFinalizeHint(null);
      setToast(`Assessment finalized and sealed by ${finalization.finalizerName}.`);
      await load();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 400) setFinalizeHint(e.message);
      else setToast(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="page-enter">
      <Link to={audit ? `/app/audits/${audit.id}` : "/app/reviews"} className="group inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-4 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" /> Back to {audit ? "audit" : "Human Review Queue"}
      </Link>
      <PageHeader title="Finding Detail" subtitle="Evidence-bound, control-mapped finding — with a human-verifiable audit trail." />

      <GlassCard className="!p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <SeverityBadge severity={finding.severity} label={`${finding.severity} risk`} />
              <FindingStatusBadge status={finding.status} />
              {review ? <ReviewStatusBadge status={review.status} /> : null}
            </div>
            <h2 className="text-xl font-semibold text-slate-100 mt-3">{finding.what}</h2>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
              <span className="font-mono text-accent/90">{finding.controlId}</span>
              <span>·</span>
              <span>{finding.controlName}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-100">{finding.risk}<span className="text-sm text-slate-500">/100</span></div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">risk score</div>
          </div>
        </div>

        {banner ? (
          <div className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", banner.tone, ["APPROVED", "REJECTED", "CHANGES_REQUESTED", "RESOLVED"].includes(review?.status ?? "") && "status-flash")}>
            <span className="inline-flex items-center gap-2 font-medium"><ScanSearch className="w-4 h-4" aria-hidden="true" />{banner.text}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Meta tile="Affected vendor" value={meta.name} />
          <Meta tile="Affected asset" value={audit?.configurationName ?? audit?.id ?? "—"} mono />
          <Meta tile="Framework" value={frameworkOf(finding.controlId)} />
          <Meta tile="Detected" value={audit ? formatDate(audit.completedAt) : "—"} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-surface-700 bg-surface-850 p-4">
            <div className="label">Why it matters</div>
            <p className="text-sm text-slate-300 leading-relaxed">{finding.why}</p>
            <p className="text-sm text-slate-400 leading-relaxed mt-2">{finding.impact}</p>
          </div>
          <div className="rounded-xl border border-surface-700 bg-surface-850 p-4">
            <div className="label">Where it was found</div>
            <p className="text-sm text-slate-300 font-mono leading-relaxed break-all">{finding.where}</p>
          </div>
          <div className="rounded-xl border border-surface-700 bg-surface-850 p-4">
            <div className="label">Expected configuration</div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Control {finding.controlId} ({finding.controlName}) requires the guarded security property to hold on this device. Derived from the control mapping and scoped to {finding.references.controlId}.
            </p>
          </div>
          <div className="rounded-xl border border-surface-700 bg-surface-850 p-4">
            <div className="label">Current configuration</div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Device applied a configuration that violates the control at {finding.evidence.length ? `lines ${finding.evidence.map((e) => e.lineStart).join(", ")}` : "the evaluated surface"} of {finding.evidence[0]?.file ?? "the configuration"}.
            </p>
          </div>
        </div>

        {finding.evidence.length ? (
          <div>
            <div className="label">Evidence</div>
            <div className="space-y-2">
              {finding.evidence.map((e, i) => (
                <div key={i} className="rounded-lg bg-surface-800 border border-surface-700 p-3">
                  <div className="text-accent font-mono text-xs">{e.file} · Lines {e.lineStart}–{e.lineEnd}</div>
                  {e.reason ? <div className="text-slate-300 mt-1 text-xs leading-relaxed">{e.reason}</div> : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-surface-700 bg-surface-850 px-4 py-3 text-xs text-slate-500">
            Evidence unavailable for this finding — the assessment includes no line-level proof for this surface.
          </div>
        )}

        <details className="group rounded-xl border border-surface-700 bg-surface-850">
          <summary className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-200 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <Info className="w-4 h-4 text-accent" aria-hidden="true" />
            How this finding was determined
            <span className="ml-auto text-[11px] text-slate-500 group-open:hidden">expand</span>
            <span className="ml-auto hidden text-[11px] text-slate-500 group-open:inline">collapse</span>
          </summary>
          <div className="px-4 pb-4">
            <p className="text-xs text-slate-500 mb-4">This finding is not a black-box output. It is the terminal point of a fully transparent pipeline:</p>
            <ol className="flex flex-wrap items-center gap-1.5">
              {CHAIN.map((c, i) => (
                <li key={c.label} className="flex items-center gap-1.5 row-in" style={{ animationDelay: `${i * 90}ms` }}>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-surface-600 bg-surface-900 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-accent/40 hover:text-slate-100">
                    <c.icon className="w-3 h-3 text-accent" aria-hidden="true" />
                    {i === 3 ? <span className="text-accent/80 italic">L{finding.evidence[0]?.lineStart ?? "evidence"}</span> : c.label}
                  </span>
                  {i < CHAIN.length - 1 ? <span className="text-slate-600 w-2 text-center" aria-hidden="true">›</span> : null}
                </li>
              ))}
            </ol>
          </div>
        </details>

        {review ? (
          <div className="rounded-xl border border-surface-700 bg-surface-850 p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="label mb-0">Recommended remediation</div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                {review.humanModifiedRecommendation ? "Human-corrected" : "AI-generated recommendation"}
              </span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed mt-2">{aiRecommendation}</p>
            {review.humanModifiedRecommendation ? (
              <div className="mt-3 rounded-lg border border-surface-700 bg-surface-900 p-3 text-xs">
                <div className="text-slate-500 mb-1">Original AI recommendation (preserved)</div>
                <p className="text-slate-400 leading-relaxed">{review.originalAiRecommendation.recommendedFix}</p>
                {review.humanModifiedRecommendation.why ? <p className="text-slate-500 mt-1.5">Why: {review.humanModifiedRecommendation.why}</p> : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-status-warn/30 bg-status-warn-soft p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="label !text-amber-300 mb-0">Recommended remediation</div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500">AI-generated recommendation</span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed mt-2">{finding.recommendedFix}</p>
          </div>
        )}

        {/* Human review controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-surface-800">
          {detail?.canReview && queueItem ? (
            <>
              <button className="btn-success !px-3 !py-2 text-xs" onClick={() => setModal("approve")} disabled={busy}>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Approve
              </button>
              <button className="btn-danger !px-3 !py-2 text-xs" onClick={() => setModal("reject")} disabled={busy}>
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Reject
              </button>
              <button className="btn-outline !px-3 !py-2 text-xs" onClick={() => setModal("request-changes")} disabled={busy}>
                <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" /> Request Changes
              </button>
              <button className="btn-outline !px-3 !py-2 text-xs" onClick={() => setModal("modify")} disabled={busy}>
                <BrainCircuit className="w-3.5 h-3.5" aria-hidden="true" /> Modify Recommendation
              </button>
              {queueItem.status === "CHANGES_REQUESTED" ? (
                <button className="btn-outline !px-3 !py-2 text-xs" onClick={() => runAction("reopen", {})} disabled={busy}>
                  <History className="w-3.5 h-3.5" aria-hidden="true" /> Reopen
                </button>
              ) : null}
            </>
          ) : isReviewer && queueItem && !sealed ? (
            <span className="text-xs text-slate-500">{queueItem.reviewedBy ? `Reviewed by ${queueItem.reviewedBy} · ` : ""}Decision locked for this status.</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
              {sealed ? "Assessment finalized — review actions are sealed." : "View-only access. Only Security Reviewers can decide on findings."}
            </span>
          )}
          {isReviewer && queueItem && !sealed ? (
            <button className="btn-outline !px-3 !py-2 text-xs ml-auto" onClick={() => { setFinalizeHint(null); setModal("finalize"); }} disabled={busy}>
              <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Finalize Audit Assessment
            </button>
          ) : null}
        </div>

        {/* Audit trail */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-200">Audit trail</h3>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">immutable · AI vs human events</span>
          </div>
          <AuditTrailTimeline items={detail?.auditTrail ?? []} />
        </div>

        {detail?.auditFinalization ? (
          <div className="rounded-lg border border-status-ok/40 bg-status-ok-soft px-4 py-3 text-xs text-emerald-200 status-flash">
            Assessment finalized by <span className="font-medium">{detail.auditFinalization.finalizerName}</span> on {formatDate(detail.auditFinalization.finalizedAt)}
            {detail.auditFinalization.comment ? ` — ${detail.auditFinalization.comment}` : ""}. All future review actions are blocked.
          </div>
        ) : null}
      </GlassCard>
      </div>

      {modal && queueItem ? (
        <ReviewActionModal
          item={queueItem}
          type={modal}
          busy={busy}
          isReviewer={isReviewer}
          mustAcknowledge={finalizeHint}
          onClose={() => {
            setModal(null);
            setFinalizeHint(null);
          }}
          onSubmit={async (payload) => {
            if (modal === "finalize") await finalize(payload);
            else await runAction(modal, payload);
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
    </div>
  );
}

function Meta({ tile, value, mono }: { tile: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-850 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{tile}</div>
      <div className={cn("text-sm text-slate-200 mt-0.5 truncate", mono && "font-mono text-xs")} title={value}>{value}</div>
    </div>
  );
}