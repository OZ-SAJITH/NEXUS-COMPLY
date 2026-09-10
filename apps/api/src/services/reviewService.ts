import type {
  AuditEventRecord,
  AuditEventSource,
  AuditEventType,
  AuditRecord,
  ComplianceFinalization,
  Finding,
  FindingReviewRecord,
  HumanModifiedRecommendation,
  ReviewAggregate,
  ReviewDetail,
  ReviewQueueItem,
  ReviewQueueResponse,
  ReviewStatus,
  Severity,
  UserRecord,
} from "@nexus/shared-types";
import { getControlById } from "@nexus/compliance-rules";
import { getRepository } from "../storage/jsonRepo";
import { uniqueId } from "../utils/helpers";
import type { AuthUser } from "./auth";
import { toPublicUser } from "./auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Status machine
// ---------------------------------------------------------------------------

const REVIEWABLE_STATUSES: ReviewStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED"];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  AI_GENERATED: "AI Generated",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes Requested",
  RESOLVED: "Resolved",
};

function isReviewable(status: ReviewStatus): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}

function requireActionable(findingId: string, status: ReviewStatus, sealed: boolean): void {
  if (sealed) {
    throw new ApiError(409, "This compliance review has been finalized. No further changes are permitted.");
  }
  if (!isReviewable(status)) {
    throw new ApiError(409, `Invalid action for finding ${findingId} in status "${status}". Only PENDING_REVIEW and CHANGES_REQUESTED findings can be actioned.`);
  }
}

function frameworkLabelOf(controlId: string): string {
  return getControlById(controlId)?.frameworks.filter((f) => f !== "PROTOTYPE").join(", ") || "Prototype";
}

function evidenceAvailable(finding: Finding): boolean {
  return finding.evidence.length > 0;
}

// ---------------------------------------------------------------------------
// Event recording (append-only)
// ---------------------------------------------------------------------------

function recordEvent(input: {
  eventType: AuditEventType;
  entityType: "finding" | "audit" | "ai_interpretation";
  entityId: string;
  findingId?: string;
  auditId: string;
  vendor?: string;
  frameworkLabel?: string;
  controlId?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: "analyst" | "reviewer";
  source: AuditEventSource;
  detail: Record<string, unknown>;
}): Promise<AuditEventRecord> {
  const event: AuditEventRecord = {
    id: uniqueId("evt"),
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    findingId: input.findingId,
    auditId: input.auditId,
    vendor: input.vendor as never,
    frameworkLabel: input.frameworkLabel,
    controlId: input.controlId,
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    source: input.source,
    at: new Date().toISOString(),
    detail: input.detail,
  };
  return getRepository().appendAuditEvent(event);
}

export async function isAuditSealed(auditId: string): Promise<boolean> {
  return Boolean(await getRepository().getFinalization(auditId));
}

// ---------------------------------------------------------------------------
// Registration: AI-generated findings must enter PENDING_REVIEW
// ---------------------------------------------------------------------------

export async function registerFindingsForReview(audit: AuditRecord): Promise<string[]> {
  const repo = getRepository();
  const created: string[] = [];

  for (const finding of audit.findings) {
    if (finding.status !== "FAIL" && finding.status !== "WARNING") continue;
    if (await repo.hasFindingReview(finding.id)) continue;

    const now = new Date().toISOString();
    const review: FindingReviewRecord = {
      findingId: finding.id,
      auditId: audit.id,
      auditConfigurationName: audit.configurationName,
      vendor: audit.vendor,
      controlId: finding.controlId,
      controlName: finding.controlName,
      controlDescription: getControlById(finding.controlId)?.description ?? null,
      frameworks: getControlById(finding.controlId)?.frameworks ?? [],
      frameworkLabel: frameworkLabelOf(finding.controlId),
      severity: finding.severity,
      risk: finding.risk,
      findingTitle: finding.what,
      findingDescription: finding.why,
      status: "AI_GENERATED",
      originalAiRecommendation: {
        why: finding.why,
        impact: finding.impact,
        recommendedFix: finding.recommendedFix,
        risk: finding.risk,
      },
      generatedByAiAt: now,
      pendingSince: now,
    };
    await repo.saveFindingReview(review);

    await recordEvent({
      eventType: "FINDING_AI_GENERATED",
      entityType: "finding",
      entityId: finding.id,
      findingId: finding.id,
      auditId: audit.id,
      vendor: audit.vendor,
      frameworkLabel: review.frameworkLabel,
      controlId: finding.controlId,
      actorName: "NEXUS AI analysis engine",
      source: "ai",
      detail: {
        controlId: finding.controlId,
        controlName: finding.controlName,
        severity: finding.severity,
        risk: finding.risk,
        findingStatus: finding.status,
        evidenceAvailable: evidenceAvailable(finding),
      },
    });

    review.status = "PENDING_REVIEW";
    await repo.saveFindingReview(review);

    await recordEvent({
      eventType: "FINDING_ENTERED_REVIEW",
      entityType: "finding",
      entityId: finding.id,
      findingId: finding.id,
      auditId: audit.id,
      vendor: audit.vendor,
      frameworkLabel: review.frameworkLabel,
      controlId: finding.controlId,
      actorName: "Human review queue",
      source: "system",
      detail: { note: "Finding entered the Human Review Queue awaiting a reviewer decision." },
    });

    created.push(finding.id);
  }

  return created;
}

// ---------------------------------------------------------------------------
// Backfill for audits created before the review workflow existed (migration)
// ---------------------------------------------------------------------------

export async function backfillReviewData(): Promise<number> {
  const repo = getRepository();
  const audits = await repo.allAudits();
  let created = 0;
  for (const audit of audits) {
    created += (await registerFindingsForReview(audit)).length;
  }
  if (created > 0) console.log(`[nexus-api] migrated ${created} AI-generated finding(s) into the Human Review Queue.`);
  return created;
}

// ---------------------------------------------------------------------------
// Human decisions
// ---------------------------------------------------------------------------

export async function approveFinding(findingId: string, actor: AuthUser, comment?: string): Promise<FindingReviewRecord> {
  const review = await mustGetReview(findingId);
  requireActionable(findingId, review.status, await isAuditSealed(review.auditId));

  const ai = review.humanModifiedRecommendation
    ? { why: review.humanModifiedRecommendation.why ?? review.originalAiRecommendation.why, recommendedFix: review.humanModifiedRecommendation.recommendedFix ?? review.originalAiRecommendation.recommendedFix }
    : review.originalAiRecommendation;

  review.status = "APPROVED";
  review.reviewerId = actor.id;
  review.reviewedBy = actor.displayName;
  review.reviewComment = comment?.trim() || undefined;
  review.reviewedAt = new Date().toISOString();
  delete review.rejectionReason;
  delete review.requestedChanges;
  await getRepository().saveFindingReview(review);

  await recordEvent({
    eventType: "FINDING_APPROVED",
    entityType: "finding",
    entityId: findingId,
    findingId,
    auditId: review.auditId,
    vendor: review.vendor,
    frameworkLabel: review.frameworkLabel,
    controlId: review.controlId,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    source: "human",
    detail: {
      previousStatus: "PENDING_REVIEW",
      newStatus: "APPROVED",
      comment: comment?.trim() || null,
      approvedRecommendation: { why: ai.why, recommendedFix: ai.recommendedFix },
    },
  });

  return review;
}

export async function rejectFinding(findingId: string, actor: AuthUser, reason: string): Promise<FindingReviewRecord> {
  const clean = reason?.trim() ?? "";
  if (!clean) throw new ApiError(400, "A rejection reason is required.");

  const review = await mustGetReview(findingId);
  requireActionable(findingId, review.status, await isAuditSealed(review.auditId));

  review.status = "REJECTED";
  review.reviewerId = actor.id;
  review.reviewedBy = actor.displayName;
  review.rejectionReason = clean;
  review.reviewedAt = new Date().toISOString();
  delete review.reviewComment;
  delete review.requestedChanges;
  await getRepository().saveFindingReview(review);

  await recordEvent({
    eventType: "FINDING_REJECTED",
    entityType: "finding",
    entityId: findingId,
    findingId,
    auditId: review.auditId,
    vendor: review.vendor,
    frameworkLabel: review.frameworkLabel,
    controlId: review.controlId,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    source: "human",
    detail: {
      previousStatus: "PENDING_REVIEW",
      newStatus: "REJECTED",
      rejectionReason: clean,
      originalAiRecommendation: review.originalAiRecommendation.recommendedFix,
    },
  });

  return review;
}

export async function requestChanges(findingId: string, actor: AuthUser, requestedChanges: string): Promise<FindingReviewRecord> {
  const clean = requestedChanges?.trim() ?? "";
  if (!clean) throw new ApiError(400, "Please describe what needs to change.");

  const review = await mustGetReview(findingId);
  requireActionable(findingId, review.status, await isAuditSealed(review.auditId));

  review.status = "CHANGES_REQUESTED";
  review.reviewerId = actor.id;
  review.reviewedBy = actor.displayName;
  review.requestedChanges = clean;
  review.reviewedAt = new Date().toISOString();
  delete review.reviewComment;
  delete review.rejectionReason;
  await getRepository().saveFindingReview(review);

  await recordEvent({
    eventType: "FINDING_CHANGES_REQUESTED",
    entityType: "finding",
    entityId: findingId,
    findingId,
    auditId: review.auditId,
    vendor: review.vendor,
    frameworkLabel: review.frameworkLabel,
    controlId: review.controlId,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    source: "human",
    detail: { previousStatus: "PENDING_REVIEW", newStatus: "CHANGES_REQUESTED", requestedChanges: clean },
  });

  return review;
}

export async function modifyFinding(
  findingId: string,
  actor: AuthUser,
  patch: { why?: string; impact?: string; recommendedFix?: string; risk?: number }
): Promise<FindingReviewRecord> {
  const review = await mustGetReview(findingId);
  requireActionable(findingId, review.status, await isAuditSealed(review.auditId));

  if (!patch.recommendedFix?.trim() && !patch.why?.trim() && !patch.impact?.trim()) {
    throw new ApiError(400, "Provide at least one change to the AI recommendation.");
  }

  const modified: HumanModifiedRecommendation = {
    why: patch.why?.trim() || undefined,
    impact: patch.impact?.trim() || undefined,
    recommendedFix: patch.recommendedFix?.trim() || undefined,
    risk: typeof patch.risk === "number" && Number.isFinite(patch.risk) ? patch.risk : undefined,
    recommendedBy: actor.displayName,
    reviewerId: actor.id,
    modifiedAt: new Date().toISOString(),
  };
  review.humanModifiedRecommendation = modified;
  review.modifiedAt = modified.modifiedAt;
  await getRepository().saveFindingReview(review);

  await recordEvent({
    eventType: "FINDING_MODIFIED",
    entityType: "finding",
    entityId: findingId,
    findingId,
    auditId: review.auditId,
    vendor: review.vendor,
    frameworkLabel: review.frameworkLabel,
    controlId: review.controlId,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    source: "human",
    detail: {
      originalAiRecommendation: review.originalAiRecommendation,
      humanModifiedRecommendation: modified,
      note: "Original AI output preserved; the human version is stored separately.",
    },
  });

  return review;
}

export async function reopenFinding(findingId: string, actor: AuthUser): Promise<FindingReviewRecord> {
  const review = await mustGetReview(findingId);
  if (await isAuditSealed(review.auditId)) {
    throw new ApiError(409, "This compliance review has been finalized. No further changes are permitted.");
  }
  if (review.status !== "CHANGES_REQUESTED") {
    throw new ApiError(409, `Only CHANGES_REQUESTED findings can be returned to PENDING_REVIEW (current: ${review.status}).`);
  }

  review.status = "PENDING_REVIEW";
  review.reopenedAt = new Date().toISOString();
  await getRepository().saveFindingReview(review);

  await recordEvent({
    eventType: "FINDING_REOPENED",
    entityType: "finding",
    entityId: findingId,
    findingId,
    auditId: review.auditId,
    vendor: review.vendor,
    frameworkLabel: review.frameworkLabel,
    controlId: review.controlId,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    source: "human",
    detail: { previousStatus: "CHANGES_REQUESTED", newStatus: "PENDING_REVIEW" },
  });

  return review;
}

async function mustGetReview(findingId: string): Promise<FindingReviewRecord> {
  const review = await getRepository().getFindingReview(findingId);
  if (!review) throw new ApiError(404, "Finding is not part of the review workflow.");
  return review;
}

// ---------------------------------------------------------------------------
// Compliance scoring: AI assessment vs human-verified compliance
// ---------------------------------------------------------------------------

export interface HumanVerifiedSummary {
  passed: number;
  failed: number;
  warnings: number;
  na: number;
  pending: number;
  score: number | null;
  coverage: number;
}

export function humanVerifiedSummary(findings: Finding[], reviews: FindingReviewRecord[]): HumanVerifiedSummary {
  const byId = new Map(reviews.map((r) => [r.findingId, r]));

  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let na = 0;
  let pending = 0;

  for (const f of findings) {
    if (f.status === "PASS") {
      passed += 1;
      continue;
    }
    if (f.status === "NOT_APPLICABLE") {
      na += 1;
      continue;
    }
    const review = byId.get(f.id);
    const status = review?.status;
    if (status === "APPROVED") {
      if (f.status === "WARNING") warnings += 1;
      else failed += 1;
      continue;
    }
    if (status === "RESOLVED" || status === "REJECTED") {
      passed += 1;
      continue;
    }
    pending += 1;
  }

  const evaluated = passed + failed + warnings + na;
  const total = evaluated + pending;
  const score = passed + failed === 0 ? null : Math.round((passed / (passed + failed)) * 100);
  const coverage = total === 0 ? 0 : Math.round((evaluated / total) * 100);

  return { passed, failed, warnings, na, pending, score, coverage };
}

export async function reviewAggregate(): Promise<ReviewAggregate> {
  const repo = getRepository();
  const audits = await repo.allAudits();
  const reviews = await repo.allFindingReviews();

  let aiPassed = 0;
  let aiFailed = 0;
  let verifiedPassed = 0;
  let verifiedFailed = 0;
  let total = 0;
  let covered = 0;

  const counts: Record<ReviewStatus, number> = { AI_GENERATED: 0, PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0, CHANGES_REQUESTED: 0, RESOLVED: 0 };
  for (const r of reviews) counts[r.status] += 1;

  for (const audit of audits) {
    const summary = humanVerifiedSummary(audit.findings, reviews.filter((r) => r.auditId === audit.id));
    for (const f of audit.findings) {
      if (f.status === "FAIL") aiFailed += 1;
      else if (f.status === "PASS") aiPassed += 1;
    }
    verifiedPassed += summary.passed;
    verifiedFailed += summary.failed;
    total += audit.findings.length;
    covered += audit.findings.length - summary.pending;
  }

  const aiScore = aiPassed + aiFailed === 0 ? 100 : Math.round((aiPassed / (aiPassed + aiFailed)) * 100);
  const humanVerifiedScore = verifiedPassed + verifiedFailed === 0 ? aiScore : Math.round((verifiedPassed / (verifiedPassed + verifiedFailed)) * 100);
  const humanVerifiedCoverage = total === 0 ? 0 : Math.round((covered / total) * 100);

  return {
    aiScore,
    humanVerifiedScore,
    humanVerifiedCoverage,
    aiGenerated: counts.AI_GENERATED,
    pending: counts.PENDING_REVIEW,
    approved: counts.APPROVED,
    rejected: counts.REJECTED,
    changesRequested: counts.CHANGES_REQUESTED,
    resolved: counts.RESOLVED,
    finalizedAudits: (await repo.allFinalizations()).length,
    accessibleToReview: counts.PENDING_REVIEW + counts.CHANGES_REQUESTED + counts.AI_GENERATED,
  };
}

// ---------------------------------------------------------------------------
// Queue + detail reads
// ---------------------------------------------------------------------------

export interface QueueFilters {
  vendor?: string;
  framework?: string;
  severity?: string;
  status?: string;
  reviewer?: string;
  sortBy?: "risk" | "oldest" | "newest";
  search?: string;
}

export async function listReviewQueue(filters: QueueFilters = {}): Promise<ReviewQueueResponse> {
  const repo = getRepository();
  const reviews = await repo.allFindingReviews();
  const finalizations = await (await repo.allFinalizations()).map((f) => f.auditId);
  const finalized = new Set(finalizations);

  const items: ReviewQueueItem[] = reviews.map((r) => {
    const ageMs = Date.now() - new Date(r.status === "PENDING_REVIEW" || r.status === "AI_GENERATED" || r.status === "CHANGES_REQUESTED" ? r.pendingSince : r.generatedByAiAt).getTime();
    return {
      findingId: r.findingId,
      auditId: r.auditId,
      vendor: r.vendor,
      configurationName: r.auditConfigurationName,
      frameworkLabel: r.frameworkLabel,
      controlId: r.controlId,
      controlName: r.controlName,
      severity: r.severity,
      risk: r.risk,
      status: r.status,
      aiRecommendation: r.humanModifiedRecommendation?.recommendedFix ?? r.originalAiRecommendation.recommendedFix,
      generatedByAiAt: r.generatedByAiAt,
      ageDays: Math.max(0, Math.round(ageMs / 86400000)),
      reviewerId: r.reviewerId,
      reviewedBy: r.reviewedBy,
      auditFinalized: finalized.has(r.auditId),
    };
  });

  let filtered = items;
  if (filters.vendor) filtered = filtered.filter((i) => i.vendor === filters.vendor);
  if (filters.framework) filtered = filtered.filter((i) => i.frameworkLabel === filters.framework);
  if (filters.severity) filtered = filtered.filter((i) => i.severity === filters.severity);
  if (filters.status === "ACTIONABLE") filtered = filtered.filter((i) => isReviewable(i.status) && !i.auditFinalized);
  else if (filters.status) filtered = filtered.filter((i) => i.status === filters.status);
  if (filters.reviewer) filtered = filtered.filter((i) => i.reviewerId === filters.reviewer);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (i) => i.controlName.toLowerCase().includes(q) || i.controlId.toLowerCase().includes(q) || i.configurationName.toLowerCase().includes(q) || i.findingId.toLowerCase().includes(q)
    );
  }

  const sortBy = filters.sortBy ?? "risk";
  if (sortBy === "risk") filtered.sort((a, b) => b.risk - a.risk);
  else if (sortBy === "oldest") filtered.sort((a, b) => a.generatedByAiAt.localeCompare(b.generatedByAiAt));
  else filtered.sort((a, b) => b.generatedByAiAt.localeCompare(a.generatedByAiAt));

  const counts: Record<ReviewStatus, number> = { AI_GENERATED: 0, PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0, CHANGES_REQUESTED: 0, RESOLVED: 0 };
  for (const r of reviews) counts[r.status] += 1;

  return { items: filtered, counts, filtered: filtered.length };
}

export async function getReviewDetail(findingId: string, viewer: AuthUser | null): Promise<ReviewDetail> {
  const repo = getRepository();
  const audits = await repo.allAudits();
  let audit: AuditRecord | undefined;
  let finding: Finding | undefined;
  for (const a of audits) {
    const f = a.findings.find((x) => x.id === findingId);
    if (f) {
      audit = a;
      finding = f;
      break;
    }
  }
  if (!audit || !finding) throw new ApiError(404, "Finding not found");

  let review = await repo.getFindingReview(findingId);
  if (!review && (finding.status === "FAIL" || finding.status === "WARNING")) {
    await registerFindingsForReview(audit);
    review = await repo.getFindingReview(findingId);
  }
  if (!review) throw new ApiError(404, "Finding is not part of the review workflow.");

  const control = getControlById(finding.controlId);
  const sealed = Boolean(await repo.getFinalization(audit.id));
  const reviewerRole = viewer?.role === "reviewer";
  const reviewable = isReviewable(review.status) && !sealed;
  const auditTrail = await repo.auditEventsForFinding(findingId);

  return {
    finding,
    audit,
    review,
    control: control
      ? { id: control.id, name: control.name, description: control.description ?? null, frameworks: control.frameworks, severity: control.severity, remediation: control.remediation }
      : null,
    auditTrail,
    canReview: reviewerRole && reviewable,
    viewerRole: viewer?.role ?? "analyst",
    auditFinalization: (await repo.getFinalization(audit.id)) ?? null,
    reviewable,
  };
}

// ---------------------------------------------------------------------------
// Finalize compliance review (seals the assessment)
// ---------------------------------------------------------------------------

export async function finalizeAudit(auditId: string, actor: AuthUser, input: { acknowledgePendingCritical?: boolean; comment?: string }): Promise<ComplianceFinalization> {
  const repo = getRepository();
  const audit = await repo.getAudit(auditId);
  if (!audit) throw new ApiError(404, "Audit not found");

  const existing = await repo.getFinalization(auditId);
  if (existing) throw new ApiError(409, "This compliance review is already finalized.");

  const reviews = await repo.getFindingReviewsForAudit(auditId);
  const actionable = reviews.filter((r) => isReviewable(r.status));
  const pendingCritical = actionable.filter((r) => r.severity === "CRITICAL" || r.severity === "HIGH");

  if (pendingCritical.length > 0 && !input.acknowledgePendingCritical) {
    throw new ApiError(
      400,
      `${pendingCritical.length} critical/high finding(s) are still pending human review. Confirm that you want to finalize the assessment anyway.`
    );
  }

  const pending = reviews.filter((r) => isReviewable(r.status)).length;
  const approved = reviews.filter((r) => r.status === "APPROVED").length;
  const rejected = reviews.filter((r) => r.status === "REJECTED").length;
  const changesRequested = reviews.filter((r) => r.status === "CHANGES_REQUESTED").length;
  const aiAssessed = reviews.length;

  const finalization: ComplianceFinalization = {
    id: uniqueId("fin"),
    auditId,
    auditConfigurationName: audit.configurationName,
    vendor: audit.vendor,
    totalControls: audit.findings.length,
    aiAssessed,
    humanVerified: approved + rejected,
    pending,
    approved,
    rejected,
    changesRequested,
    criticalUnresolved: pendingCritical.length,
    finalizerId: actor.id,
    finalizerName: actor.displayName,
    finalizedAt: new Date().toISOString(),
    comment: input.comment?.trim() || undefined,
  };
  await repo.saveFinalization(finalization);

  // Approved findings become RESOLVED as part of the finalized assessment.
  for (const r of reviews.filter((x) => x.status === "APPROVED")) {
    r.status = "RESOLVED";
    r.resolvedAt = finalization.finalizedAt;
    await repo.saveFindingReview(r);
    await recordEvent({
      eventType: "FINDING_RESOLVED",
      entityType: "finding",
      entityId: r.findingId,
      findingId: r.findingId,
      auditId,
      vendor: r.vendor,
      frameworkLabel: r.frameworkLabel,
      controlId: r.controlId,
      actorId: actor.id,
      actorName: actor.displayName,
      actorRole: actor.role,
      source: "system",
      detail: { previousStatus: "APPROVED", newStatus: "RESOLVED", reason: "Compliance review finalized." },
    });
  }

  await recordEvent({
    eventType: "AUDIT_FINALIZED",
    entityType: "audit",
    entityId: auditId,
    auditId,
    vendor: audit.vendor,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    source: "human",
    detail: {
      totalControls: audit.findings.length,
      aiAssessed,
      humanVerified: finalization.humanVerified,
      pending,
      approved,
      rejected,
      changesRequested,
      criticalUnresolved: pendingCritical.length,
      comment: input.comment?.trim() || null,
      note: "Finalized assessment is locked against further modification.",
    },
  });

  return finalization;
}

export { toPublicUser };

export type { UserRecord };
export type { Severity };