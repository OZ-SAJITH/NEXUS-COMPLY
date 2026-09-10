import type {
  AuditEventRecord,
  AuditRecord,
  ApprovedMapping,
  ComplianceFinalization,
  ConfigurationRecord,
  Finding,
  FindingReviewRecord,
  RemediationStep,
  ReviewAggregate,
  ReviewDetail,
  ReviewQueueResponse,
  ReviewStatus,
} from "@nexus/shared-types";
import { SCENARIOS, buildAudit, buildAuditFromContent, DEMO_CONTROL_BY_ID, mockInterpret, uniqueId, findScenario, detectVendor, CONTROL_INTENT, isInsecureContent, splitLines, hashNum } from "./demoData";

export class DemoApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface DemoState {
  audits: AuditRecord[];
  reviews: FindingReviewRecord[];
  events: AuditEventRecord[];
  finalizations: ComplianceFinalization[];
  mappings: ApprovedMapping[];
  configurations: ConfigurationRecord[];
}

const STORAGE_KEY = "nexus-comply-demo-v1";
export const REVIEWER = { id: "usr-system-reviewer", displayName: "Security Review Lead", role: "reviewer" as const };

const REVIEWABLE: ReviewStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED"];

function isReviewable(s: ReviewStatus): boolean {
  return REVIEWABLE.includes(s);
}

function nowIso(): string {
  return new Date().toISOString();
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 3600_000).toISOString();
}

function controlOf(id: string) {
  return DEMO_CONTROL_BY_ID[id] ?? null;
}

// ---------------------------------------------------------------------------
// Seed — a realistic multi-vendor demo workspace
// ---------------------------------------------------------------------------

function seedState(): DemoState {
  const audits: AuditRecord[] = [];
  const reviews: FindingReviewRecord[] = [];
  const events: AuditEventRecord[] = [];
  const configurations: ConfigurationRecord[] = [];
  const finalizations: ComplianceFinalization[] = [];
  const mappings: ApprovedMapping[] = [];

  const add = (path: string, scenarioId: string) => {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
    const audit = buildAudit(scenario, path, path);
    audits.push(audit);
    configurations.push({
      id: audit.configurationId,
      name: path,
      content: scenario.content,
      fileType: path.split(".").pop() ?? "conf",
      sizeBytes: scenario.content.length,
      vendor: audit.vendor,
      vendorStatus: audit.vendorStatus,
      detectedBy: audit.vendorStatus === "known" ? `Matched ${audit.vendor} syntax` : "No recognized vendor syntax",
      uploadedAt: audit.completedAt ?? nowIso(),
      redacted: true,
    });
  };

  add("cisco/demo-secure.conf", "cisco-secure");
  add("cisco/demo-insecure.conf", "cisco-insecure");
  add("fortinet/demo-secure.conf", "fortinet-secure");
  add("fortinet/demo-insecure.conf", "fortinet-insecure");
  add("juniper/demo-secure.conf", "juniper-secure");
  add("juniper/demo-insecure.conf", "juniper-insecure");
  add("unknown/custom-demo.conf", "unknown-custom");
  add("unknown/custom-demo-branch.conf", "unknown-custom-branch");

  // Register every AI-generated FAIL/WARNING finding into the human review flow
  for (const audit of audits) {
    const created = registerFindings(audit, reviews, events);
    optSealPrereviewDecisions(audit, created, { audits, reviews, events, finalizations, mappings, configurations });
  }

  // One interpretation already approved by a reviewer -> reusable mapping (adaptive)
  const branch = audits.find((a) => a.id === "unknown-custom-branch");
  const branchAi = branch?.aiInterpretations?.[0];
  if (branch && branchAi?.id) {
    branchAi.status = "APPROVED";
    branchAi.createdAt = branchAi.createdAt ?? daysAgo(3);
    const map: ApprovedMapping = {
      id: uniqueId("map"),
      syntaxFingerprint: branchAi.syntaxFingerprint ?? `fp-${hashNum(branch.configurationName).toString(36)}`,
      aiInterpretationId: branchAi.id,
      securityIntent: branchAi.securityIntent,
      protocol: branchAi.protocol,
      sourceRestriction: branchAi.sourceRestriction,
      loggingEnabled: branchAi.loggingEnabled,
      approvedAt: daysAgo(3),
      approvedBy: REVIEWER.displayName,
    };
    mappings.push(map);
    events.push({
      id: uniqueId("evt"),
      eventType: "AI_INTERPRETATION_APPROVED",
      entityType: "ai_interpretation",
      entityId: branchAi.id,
      auditId: branch.id,
      vendor: branch.vendor,
      actorId: REVIEWER.id,
      actorName: REVIEWER.displayName,
      actorRole: "reviewer",
      source: "human",
      at: daysAgo(3),
      detail: { note: "Reviewer approved the candidate interpretation for the custom syntax — mapping saved." },
    });
  }

  // Finalize one audit so the compliance review lifecycle is fully demonstrated
  finalizeInSeed("cisco-secure", { audits, reviews, events, finalizations, mappings, configurations });

  const state: DemoState = { audits, reviews, events, finalizations, mappings, configurations };
  return state;
}

function registerFindings(audit: AuditRecord, reviews: FindingReviewRecord[], events: AuditEventRecord[]): string[] {
  const created: string[] = [];
  for (const finding of audit.findings) {
    if (finding.status !== "FAIL" && finding.status !== "WARNING") continue;
    if (reviews.some((r) => r.findingId === finding.id)) continue;
    const control = controlOf(finding.controlId);
    const now = nowIso();
    const review: FindingReviewRecord = {
      findingId: finding.id,
      auditId: audit.id,
      auditConfigurationName: audit.configurationName,
      vendor: audit.vendor,
      controlId: finding.controlId,
      controlName: finding.controlName,
      controlDescription: control?.description ?? null,
      frameworks: control?.frameworks ?? [],
      frameworkLabel: (control?.frameworks ?? []).filter((f) => f !== "PROTOTYPE").join(", ") || "Prototype",
      severity: finding.severity,
      risk: finding.risk,
      findingTitle: finding.what,
      findingDescription: finding.why,
      status: "AI_GENERATED",
      originalAiRecommendation: { why: finding.why, impact: finding.impact, recommendedFix: finding.recommendedFix, risk: finding.risk },
      generatedByAiAt: audit.completedAt ?? now,
      pendingSince: audit.completedAt ?? now,
    };
    reviews.push(review);
    events.push({
      id: uniqueId("evt"),
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
      at: review.pendingSince,
      detail: { controlId: finding.controlId, controlName: finding.controlName, severity: finding.severity, risk: finding.risk, findingStatus: finding.status },
    });
    review.status = "PENDING_REVIEW";
    events.push({
      id: uniqueId("evt"),
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
      at: review.pendingSince,
      detail: { note: "Finding entered the Human Review Queue awaiting a reviewer decision." },
    });
    created.push(finding.id);
  }
  return created;
}

function optSealPrereviewDecisions(audit: AuditRecord, created: string[], state: DemoState): void {
  const findingIds = created;
  if (audit.vendorStatus !== "known") return;
  findingIds.forEach((fid, idx) => {
    const review = state.reviews.find((r) => r.findingId === fid);
    if (!review) return;
    if (idx === 0) {
      review.status = "APPROVED";
      review.reviewerId = REVIEWER.id;
      review.reviewedBy = REVIEWER.displayName;
      review.reviewedAt = daysAgo(2);
      state.events.push({
        id: uniqueId("evt"),
        eventType: "FINDING_APPROVED",
        entityType: "finding",
        entityId: fid,
        findingId: fid,
        auditId: audit.id,
        vendor: audit.vendor,
        frameworkLabel: review.frameworkLabel,
        controlId: review.controlId,
        actorId: REVIEWER.id,
        actorName: REVIEWER.displayName,
        actorRole: "reviewer",
        source: "human",
        at: review.reviewedAt,
        detail: { previousStatus: "PENDING_REVIEW", newStatus: "APPROVED", comment: "Matched the approved security baseline for this control." },
      });
    } else if (idx === 1) {
      review.status = "REJECTED";
      review.reviewerId = REVIEWER.id;
      review.reviewedBy = REVIEWER.displayName;
      review.rejectionReason = "Raw access-list line is contextually required (documented exception).";
      review.reviewedAt = daysAgo(2);
      state.events.push({
        id: uniqueId("evt"),
        eventType: "FINDING_REJECTED",
        entityType: "finding",
        entityId: fid,
        findingId: fid,
        auditId: audit.id,
        vendor: audit.vendor,
        frameworkLabel: review.frameworkLabel,
        controlId: review.controlId,
        actorId: REVIEWER.id,
        actorName: REVIEWER.displayName,
        actorRole: "reviewer",
        source: "human",
        at: review.reviewedAt,
        detail: { previousStatus: "PENDING_REVIEW", newStatus: "REJECTED", rejectionReason: review.rejectionReason },
      });
    } else if (idx === 2 && audit.completedAt) {
      review.status = "CHANGES_REQUESTED";
      review.reviewerId = REVIEWER.id;
      review.reviewedBy = REVIEWER.displayName;
      review.requestedChanges = "Re-verify after the network team tightens the source restrictions.";
      review.reviewedAt = daysAgo(1);
      state.events.push({
        id: uniqueId("evt"),
        eventType: "FINDING_CHANGES_REQUESTED",
        entityType: "finding",
        entityId: fid,
        findingId: fid,
        auditId: audit.id,
        vendor: audit.vendor,
        frameworkLabel: review.frameworkLabel,
        controlId: review.controlId,
        actorId: REVIEWER.id,
        actorName: REVIEWER.displayName,
        actorRole: "reviewer",
        source: "human",
        at: review.reviewedAt,
        detail: { previousStatus: "PENDING_REVIEW", newStatus: "CHANGES_REQUESTED", requestedChanges: review.requestedChanges },
      });
    }
  });
}

function finalizeInSeed(auditId: string, state: DemoState): void {
  const audit = state.audits.find((a) => a.id === auditId);
  if (!audit) return;
  const reviews = state.reviews.filter((r) => r.auditId === auditId);
  const approved = reviews.filter((r) => r.status === "APPROVED" || r.status === "PENDING_REVIEW" || r.status === "CHANGES_REQUESTED");
  for (const r of approved) {
    r.status = "RESOLVED";
    r.resolvedAt = daysAgo(1);
  }
  state.finalizations.push({
    id: uniqueId("fin"),
    auditId,
    auditConfigurationName: audit.configurationName,
    vendor: audit.vendor,
    totalControls: audit.findings.length,
    aiAssessed: state.reviews.filter((r) => r.auditId === auditId).length,
    humanVerified: approved.length,
    pending: 0,
    approved: approved.length,
    rejected: 0,
    changesRequested: 0,
    criticalUnresolved: 0,
    finalizerId: REVIEWER.id,
    finalizerName: REVIEWER.displayName,
    finalizedAt: daysAgo(1),
    comment: "Human-verified assessment locked after baseline review.",
  });
  state.events.push({
    id: uniqueId("evt"),
    eventType: "AUDIT_FINALIZED",
    entityType: "audit",
    entityId: auditId,
    auditId,
    vendor: audit.vendor,
    actorId: REVIEWER.id,
    actorName: REVIEWER.displayName,
    actorRole: "reviewer",
    source: "human",
    at: daysAgo(1),
    detail: { note: "Finalized assessment is locked against further modification." },
  });
}

// ---------------------------------------------------------------------------
// Load / persist
// ---------------------------------------------------------------------------

function loadState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (Array.isArray(parsed.audits) && parsed.audits.length > 0 && Array.isArray(parsed.reviews)) return parsed;
    }
  } catch {
    // ignore corrupted storage
  }
  const fresh = seedState();
  persist(fresh);
  return fresh;
}

let state: DemoState | null = null;

export function latestState(): DemoState {
  if (!state) state = loadState();
  return state;
}

function persist(s: DemoState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode) — demo stays in-memory
  }
}

function commit(): void {
  persist(state ?? (state = seedState()));
}

export function resetDemo(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  state = seedState();
  persist(state);
}

// ---------------------------------------------------------------------------
// Event + review mechanics
// ---------------------------------------------------------------------------

function recordEvent(input: {
  eventType: AuditEventRecord["eventType"];
  entityType: string;
  entityId: string;
  findingId?: string;
  auditId: string;
  vendor?: string;
  frameworkLabel?: string;
  controlId?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: "analyst" | "reviewer";
  source: AuditEventRecord["source"];
  detail: Record<string, unknown>;
}): AuditEventRecord {
  const s = latestState();
  const ev: AuditEventRecord = {
    id: uniqueId("evt"),
    eventType: input.eventType,
    entityType: input.entityType as AuditEventRecord["entityType"],
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
    at: nowIso(),
    detail: input.detail,
  };
  s.events.push(ev);
  commit();
  return ev;
}

function isSealed(auditId: string): boolean {
  return latestState().finalizations.some((f) => f.auditId === auditId);
}

function requireActionable(review: FindingReviewRecord): void {
  if (isSealed(review.auditId)) throw new DemoApiError(409, "This compliance review has been finalized. No further changes are permitted.");
  if (!isReviewable(review.status)) {
    throw new DemoApiError(409, `Invalid action for finding ${review.findingId} in status "${review.status}". Only PENDING_REVIEW and CHANGES_REQUESTED findings can be actioned.`);
  }
}

export function registerFindingsForAudit(auditId: string): number {
  const s = latestState();
  const audit = s.audits.find((a) => a.id === auditId);
  if (!audit) return 0;
  const n = registerFindings(audit, s.reviews, s.events);
  if (n.length) commit();
  return n.length;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function humanVerifiedSummary(findings: Finding[], reviews: FindingReviewRecord[]): { passed: number; failed: number; warnings: number; na: number; pending: number; score: number | null; coverage: number } {
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
    const status = byId.get(f.id)?.status;
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

export function reviewAggregate(): ReviewAggregate {
  const s = latestState();
  const counts: Record<ReviewStatus, number> = { AI_GENERATED: 0, PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0, CHANGES_REQUESTED: 0, RESOLVED: 0 };
  for (const r of s.reviews) counts[r.status] += 1;
  let aiPassed = 0;
  let aiFailed = 0;
  let verifiedPassed = 0;
  let verifiedFailed = 0;
  let total = 0;
  let covered = 0;
  for (const audit of s.audits) {
    const summary = humanVerifiedSummary(audit.findings, s.reviews.filter((r) => r.auditId === audit.id));
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
    finalizedAudits: s.finalizations.length,
    accessibleToReview: counts.PENDING_REVIEW + counts.CHANGES_REQUESTED + counts.AI_GENERATED,
  };
}

export function getDashboardStats() {
  const s = latestState();
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let postureSum = 0;
  let postureCount = 0;
  const risk: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const vendorDistribution: Record<string, number> = { cisco: 0, fortinet: 0, juniper: 0, unknown: 0 };
  const topRisks: Finding[] = [];
  let knownAnalyzed = 0;
  let unknownDetected = 0;
  let aiInterpretations = 0;
  let approvedMappings = 0;
  let rejectedMappings = 0;
  for (const audit of s.audits) {
    if (audit.compliance) {
      passed += audit.compliance.passed;
      failed += audit.compliance.failed;
      warnings += audit.compliance.warnings;
    }
    if (audit.risk) {
      const comp = audit.compliance;
      const posture = Math.max(0, Math.min(100, Math.round((comp ? comp.score : 0) * 0.5 + (50 - (audit.risk.overallScore / 100) * 50))));
      postureSum += posture;
      postureCount += 1;
    }
    for (const f of audit.findings) {
      if (f.status === "FAIL" && risk[f.severity] !== undefined) risk[f.severity] += 1;
    }
    vendorDistribution[audit.vendor] = (vendorDistribution[audit.vendor] ?? 0) + 1;
    if (audit.vendorStatus === "known") knownAnalyzed += 1;
    else unknownDetected += 1;
    for (const f of audit.findings) {
      if (f.status === "FAIL") topRisks.push({ ...f, auditId: audit.id });
    }
    if (audit.aiInterpretations) {
      aiInterpretations += audit.aiInterpretations.length;
      for (const ai of audit.aiInterpretations) {
        if (ai.status === "APPROVED") approvedMappings += 1;
        if (ai.status === "REJECTED") rejectedMappings += 1;
      }
    }
  }
  topRisks.sort((a, b) => b.risk - a.risk);
  const posture = postureCount ? Math.round(postureSum / postureCount) : 0;
  const score = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;
  return {
    posture,
    compliance: { passed, failed, warnings, score },
    risk,
    vendorDistribution,
    topRisks: topRisks.slice(0, 6),
    adaptive: {
      knownAnalyzed,
      unknownDetected,
      aiInterpretations,
      approvedMappings: s.mappings.length,
      rejectedMappings,
      totalAudits: s.audits.length,
    },
    review: reviewAggregate(),
  };
}

// ---------------------------------------------------------------------------
// Audits / configurations / samples
// ---------------------------------------------------------------------------

export function listAudits(): AuditRecord[] {
  return [...latestState().audits].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

export function getAudit(id: string): AuditRecord {
  const a = latestState().audits.find((x) => x.id === id);
  if (!a) throw new DemoApiError(404, "Audit not found");
  return a;
}

export function createAudit(name: string, content: string, aiOverrides?: Array<{ status?: string; securityIntent?: string; protocol?: string; sourceRestriction?: boolean; loggingEnabled?: boolean; confidence?: number }>): AuditRecord {
  const s = latestState();
  const audit = buildAuditFromContent(name, content);
  if (aiOverrides?.length && audit.aiInterpretations) {
    const ai = audit.aiInterpretations[0];
    const o = aiOverrides[0];
    if (ai && o) {
      if (o.securityIntent) ai.securityIntent = o.securityIntent as never;
      if (o.sourceRestriction !== undefined) ai.sourceRestriction = o.sourceRestriction;
      if (o.loggingEnabled !== undefined) ai.loggingEnabled = o.loggingEnabled;
      if (o.protocol) ai.protocol = o.protocol;
      ai.status = o.status === "APPROVED" ? "APPROVED" : "PENDING";
    }
  }
  s.audits.push(audit);
  s.configurations.push({
    id: audit.configurationId,
    name,
    content,
    fileType: name.split(".").pop() ?? "conf",
    sizeBytes: content.length,
    vendor: audit.vendor,
    vendorStatus: audit.vendorStatus,
    detectedBy: audit.vendorStatus === "known" ? `Matched ${audit.vendor} syntax` : "No recognized vendor syntax",
    uploadedAt: nowIso(),
    redacted: false,
  });
  registerFindings(audit, s.reviews, s.events);
  commit();
  return audit;
}

export function listConfigurations(): ConfigurationRecord[] {
  return latestState().configurations;
}

export function getConfigurationContent(id: string): string {
  return latestState().configurations.find((c) => c.id === id)?.content ?? "";
}

export function listSamples() {
  return SCENARIOS.map((sc) => ({
    id: sc.id,
    vendor: sc.vendor,
    status: sc.status,
    label: sc.label,
    file: `${sc.vendor === "unknown" ? "unknown" : sc.vendor}/${sc.vendor === "unknown" ? "custom-demo.conf" : sc.label.split("—")[1] ? "demo-insecure.conf" : "demo-secure.conf"}`,
    content: sc.content,
    exists: true,
  }));
}

// ---------------------------------------------------------------------------
// Findings / exposure / remediation / interpret
// ---------------------------------------------------------------------------

export function getFinding(findingId: string): { finding: Finding; auditId: string } {
  for (const a of latestState().audits) {
    const f = a.findings.find((x) => x.id === findingId);
    if (f) return { finding: f, auditId: a.id };
  }
  throw new DemoApiError(404, "Finding not found");
}

function isRestrictedSource(source?: { type?: string; value?: string } | null): boolean {
  if (!source || source.type === "ANY") return false;
  const v = (source.value ?? "").trim().toLowerCase();
  return !(["any", "all", "0.0.0.0/0", "::/0", "*"].includes(v));
}

export function getExposurePaths(auditId: string) {
  const audit = getAudit(auditId);
  const paths = audit.findings
    .filter((f) => f.status === "FAIL")
    .map((f) => {
      const admin = audit.intents.filter((i) => i.intentType === "RESTRICT_ADMIN_ACCESS" || i.intentType === "SECURE_MANAGEMENT_INTERFACE");
      const isAdmin = admin.length > 0;
      const adminExposure = admin.some((i) => !isRestrictedSource(i.source));
      if (isAdmin) {
        const path = adminExposure
          ? [
              { label: "Internet", type: "external" as const, detail: "Unrestricted source permitted" },
              { label: "Edge Firewall", type: "network" as const, detail: "Management port open" },
            ]
          : [
              { label: "Approved Network", type: "network" as const, detail: "10.0.0.0/24" },
              { label: "Edge Firewall", type: "network" as const, detail: "Management allowed" },
            ];
        const proto = admin[0].protocol?.toUpperCase() ?? "SSH";
        return {
          findingId: f.id,
          controlId: f.controlId,
          title: adminExposure ? "Potential Administrative Exposure" : "Administrative Access Path",
          warning: adminExposure ? "Potential exposure path — administrative services reachable from an untrusted source." : "Approved administrative access path.",
          path: [...path, { label: proto, type: "service" as const, detail: "Management protocol" }, { label: "Admin Device", type: "device" as const, detail: "Device management plane" }, { label: "Critical Server", type: "asset" as const, detail: "Reachable after admin compromise" }],
          potential: true,
        };
      }
      return {
        findingId: f.id,
        controlId: f.controlId,
        title: `Potential Exposure — ${f.controlName}`,
        warning: "Potential exposure path for explainability and prioritization. Not a confirmed compromise.",
        path: [
          { label: "External Source", type: "external" as const, detail: "Unverified" },
          { label: "Network Stack", type: "network" as const, detail: f.where },
          { label: "Device", type: "device" as const, detail: f.controlName },
          { label: "Internal Assets", type: "asset" as const, detail: "Lateral movement risk" },
        ],
        potential: true,
      };
    });
  return paths;
}

export function simulateRemediation(auditId: string) {
  const audit = getAudit(auditId);
  const failing = audit.findings.filter((f) => f.status === "FAIL");
  const steps: RemediationStep[] = failing.map((f) => {
    const control = controlOf(f.controlId);
    return {
      controlId: f.controlId,
      findingId: f.id,
      action: control?.remediation ?? "Review control configuration",
      newIntent: { source: { type: "NETWORK" as const, value: "10.0.0.0/24" } },
      riskAfter: 0,
      statusAfter: "PASS" as const,
    };
  });
  const before = audit.compliance ?? { passed: 0, failed: 0, warnings: 0, na: 0, score: 0 };
  const afterScore = Math.round(((before.passed + failing.length) / Math.max(1, before.passed + before.failed)) * 100);
  const simulation = {
    id: uniqueId("sim"),
    auditId,
    steps,
    complianceBefore: { passed: before.passed, failed: before.failed, score: before.score },
    complianceAfter: { passed: before.passed + failing.length, failed: Math.max(0, before.failed - 0), score: afterScore },
    highRiskBefore: before.failed,
    highRiskAfter: 0,
    postureBefore: Math.round(before.score * 0.5 + 50 - (audit.risk?.overallScore ?? 0) / 2),
    postureAfter: Math.round(afterScore * 0.5 + 50),
    simulatedAt: nowIso(),
  };
  audit.remediation = simulation;
  commit();
  return simulation;
}

export function interpret(body: { configName: string; config: string }) {
  const det = detectVendor(body.config);
  const scenario = findScenario(body.config);
  const fp = `fp-${hashNum(body.config).toString(36)}`;
  const usedExisting = false;
  const vendor = det.vendor === "unknown" ? "unknown" : (scenario?.vendor ?? det.vendor);
  return { ...mockInterpret(body.config), syntaxFingerprint: fp, reusedMapping: usedExisting, detectedVendor: vendor };
}

export function aiInterpretTransition(op: "approve" | "reject" | "edit", aiId: string, body: { auditId: string; syntaxFingerprint: string; securityIntent?: string; protocol?: string; sourceRestriction?: boolean; loggingEnabled?: boolean }) {
  const s = latestState();
  const audit = s.audits.find((a) => a.id === body.auditId);
  if (!audit) throw new DemoApiError(404, "Audit not found");
  if (isSealed(audit.id)) throw new DemoApiError(409, "This compliance review has been finalized. No further changes are permitted.");
  const ai = (audit.aiInterpretations ?? []).find((a) => a.id === aiId);
  if (!ai) throw new DemoApiError(404, "AI interpretation not found");
  if (op === "approve") {
    ai.status = "APPROVED";
    commit();
    return { status: "APPROVED", mappingSaved: true };
  }
  if (op === "reject") {
    ai.status = "REJECTED";
    commit();
    return { status: "REJECTED" };
  }
  if (body.securityIntent) ai.securityIntent = body.securityIntent as never;
  if (body.protocol !== undefined) ai.protocol = body.protocol;
  if (body.sourceRestriction !== undefined) ai.sourceRestriction = body.sourceRestriction;
  if (body.loggingEnabled !== undefined) ai.loggingEnabled = body.loggingEnabled;
  ai.status = "EDITED";
  commit();
  return { status: "EDITED", ai };
}

// ---------------------------------------------------------------------------
// Review queue + actions
// ---------------------------------------------------------------------------

export function listReviewQueue(params: Record<string, string | undefined> = {}): ReviewQueueResponse {
  const s = latestState();
  const finalized = new Set(s.finalizations.map((f) => f.auditId));
  const items = s.reviews.map((r) => {
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
  const v = params.vendor;
  const fw = params.framework;
  const sev = params.severity;
  const status = params.status;
  const reviewer = params.reviewer;
  const search = params.search;
  if (v) filtered = filtered.filter((i) => i.vendor === v);
  if (fw) filtered = filtered.filter((i) => i.frameworkLabel === fw);
  if (sev) filtered = filtered.filter((i) => i.severity === sev);
  if (status === "ACTIONABLE") filtered = filtered.filter((i) => isReviewable(i.status) && !i.auditFinalized);
  else if (status) filtered = filtered.filter((i) => i.status === status);
  if (reviewer) filtered = filtered.filter((i) => i.reviewerId === reviewer);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((i) => i.controlName.toLowerCase().includes(q) || i.controlId.toLowerCase().includes(q) || i.configurationName.toLowerCase().includes(q) || i.findingId.toLowerCase().includes(q));
  }
  const sortBy = params.sortBy === "oldest" || params.sortBy === "newest" ? params.sortBy : "risk";
  if (sortBy === "risk") filtered.sort((a, b) => b.risk - a.risk);
  else if (sortBy === "oldest") filtered.sort((a, b) => a.generatedByAiAt.localeCompare(b.generatedByAiAt));
  else filtered.sort((a, b) => b.generatedByAiAt.localeCompare(a.generatedByAiAt));
  const counts: Record<ReviewStatus, number> = { AI_GENERATED: 0, PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0, CHANGES_REQUESTED: 0, RESOLVED: 0 };
  for (const r of s.reviews) counts[r.status] += 1;
  return { items: filtered, counts, filtered: filtered.length };
}

export function getReviewDetail(findingId: string): ReviewDetail {
  const s = latestState();
  let audit: AuditRecord | undefined;
  let finding: Finding | undefined;
  for (const a of s.audits) {
    const f = a.findings.find((x) => x.id === findingId);
    if (f) {
      audit = a;
      finding = f;
      break;
    }
  }
  if (!audit || !finding) throw new DemoApiError(404, "Finding not found");
  let review = s.reviews.find((r) => r.findingId === findingId);
  if (!review) {
    registerFindingsForAudit(audit.id);
    review = s.reviews.find((r) => r.findingId === findingId);
  }
  if (!review) throw new DemoApiError(404, "Finding is not part of the review workflow.");
  const control = controlOf(finding.controlId);
  const sealed = isSealed(audit.id);
  const reviewable = isReviewable(review.status) && !sealed;
  const auditTrail = s.events.filter((e) => e.findingId === findingId).sort((a, b) => b.at.localeCompare(a.at));
  return {
    finding,
    audit,
    review,
    control: control ? { id: control.id, name: control.name, description: control.description ?? null, frameworks: control.frameworks, severity: control.severity, remediation: control.remediation } : null,
    auditTrail,
    canReview: reviewable,
    viewerRole: "reviewer",
    auditFinalization: s.finalizations.find((f) => f.auditId === audit.id) ?? null,
    reviewable,
  };
}

export function getAuditTrail(findingId: string): { items: AuditEventRecord[] } {
  const s = latestState();
  return { items: s.events.filter((e) => e.findingId === findingId).sort((a, b) => b.at.localeCompare(a.at)) };
}

function mustGetReview(findingId: string): FindingReviewRecord {
  const review = latestState().reviews.find((r) => r.findingId === findingId);
  if (!review) throw new DemoApiError(404, "Finding is not part of the review workflow.");
  return review;
}

export function approveFinding(findingId: string, comment?: string): FindingReviewRecord {
  const review = mustGetReview(findingId);
  requireActionable(review);
  review.status = "APPROVED";
  review.reviewerId = REVIEWER.id;
  review.reviewedBy = REVIEWER.displayName;
  review.reviewComment = comment?.trim() || undefined;
  review.reviewedAt = nowIso();
  delete review.rejectionReason;
  delete review.requestedChanges;
  recordEvent({ eventType: "FINDING_APPROVED", entityType: "finding", entityId: findingId, findingId, auditId: review.auditId, vendor: review.vendor, frameworkLabel: review.frameworkLabel, controlId: review.controlId, actorId: REVIEWER.id, actorName: REVIEWER.displayName, actorRole: "reviewer", source: "human", detail: { previousStatus: "PENDING_REVIEW", newStatus: "APPROVED", comment: comment?.trim() || null } });
  commit();
  return review;
}

export function rejectFinding(findingId: string, reason: string): FindingReviewRecord {
  const clean = reason?.trim() ?? "";
  if (!clean) throw new DemoApiError(400, "A rejection reason is required.");
  const review = mustGetReview(findingId);
  requireActionable(review);
  review.status = "REJECTED";
  review.reviewerId = REVIEWER.id;
  review.reviewedBy = REVIEWER.displayName;
  review.rejectionReason = clean;
  review.reviewedAt = nowIso();
  delete review.reviewComment;
  delete review.requestedChanges;
  recordEvent({ eventType: "FINDING_REJECTED", entityType: "finding", entityId: findingId, findingId, auditId: review.auditId, vendor: review.vendor, frameworkLabel: review.frameworkLabel, controlId: review.controlId, actorId: REVIEWER.id, actorName: REVIEWER.displayName, actorRole: "reviewer", source: "human", detail: { previousStatus: "PENDING_REVIEW", newStatus: "REJECTED", rejectionReason: clean } });
  commit();
  return review;
}

export function requestChanges(findingId: string, requestedChanges: string): FindingReviewRecord {
  const clean = requestedChanges?.trim() ?? "";
  if (!clean) throw new DemoApiError(400, "Please describe what needs to change.");
  const review = mustGetReview(findingId);
  requireActionable(review);
  review.status = "CHANGES_REQUESTED";
  review.reviewerId = REVIEWER.id;
  review.reviewedBy = REVIEWER.displayName;
  review.requestedChanges = clean;
  review.reviewedAt = nowIso();
  delete review.reviewComment;
  delete review.rejectionReason;
  recordEvent({ eventType: "FINDING_CHANGES_REQUESTED", entityType: "finding", entityId: findingId, findingId, auditId: review.auditId, vendor: review.vendor, frameworkLabel: review.frameworkLabel, controlId: review.controlId, actorId: REVIEWER.id, actorName: REVIEWER.displayName, actorRole: "reviewer", source: "human", detail: { previousStatus: "PENDING_REVIEW", newStatus: "CHANGES_REQUESTED", requestedChanges: clean } });
  commit();
  return review;
}

export function modifyFinding(findingId: string, patch: { why?: string; impact?: string; recommendedFix?: string; risk?: number }): FindingReviewRecord {
  const review = mustGetReview(findingId);
  requireActionable(review);
  if (!patch.recommendedFix?.trim() && !patch.why?.trim() && !patch.impact?.trim()) {
    throw new DemoApiError(400, "Provide at least one change to the AI recommendation.");
  }
  review.humanModifiedRecommendation = {
    why: patch.why?.trim() || undefined,
    impact: patch.impact?.trim() || undefined,
    recommendedFix: patch.recommendedFix?.trim() || undefined,
    risk: typeof patch.risk === "number" && Number.isFinite(patch.risk) ? patch.risk : undefined,
    recommendedBy: REVIEWER.displayName,
    reviewerId: REVIEWER.id,
    modifiedAt: nowIso(),
  };
  review.modifiedAt = review.humanModifiedRecommendation.modifiedAt;
  recordEvent({ eventType: "FINDING_MODIFIED", entityType: "finding", entityId: findingId, findingId, auditId: review.auditId, vendor: review.vendor, frameworkLabel: review.frameworkLabel, controlId: review.controlId, actorId: REVIEWER.id, actorName: REVIEWER.displayName, actorRole: "reviewer", source: "human", detail: { humanModifiedRecommendation: review.humanModifiedRecommendation } });
  commit();
  return review;
}

export function reopenFinding(findingId: string): FindingReviewRecord {
  const review = mustGetReview(findingId);
  if (isSealed(review.auditId)) throw new DemoApiError(409, "This compliance review has been finalized. No further changes are permitted.");
  if (review.status !== "CHANGES_REQUESTED") throw new DemoApiError(409, `Only CHANGES_REQUESTED findings can be returned to PENDING_REVIEW (current: ${review.status}).`);
  review.status = "PENDING_REVIEW";
  review.reopenedAt = nowIso();
  recordEvent({ eventType: "FINDING_REOPENED", entityType: "finding", entityId: findingId, findingId, auditId: review.auditId, vendor: review.vendor, frameworkLabel: review.frameworkLabel, controlId: review.controlId, actorId: REVIEWER.id, actorName: REVIEWER.displayName, actorRole: "reviewer", source: "human", detail: { previousStatus: "CHANGES_REQUESTED", newStatus: "PENDING_REVIEW" } });
  commit();
  return review;
}

export function finalizeAudit(auditId: string, input: { acknowledgePendingCritical?: boolean; comment?: string }) {
  const s = latestState();
  const audit = s.audits.find((a) => a.id === auditId);
  if (!audit) throw new DemoApiError(404, "Audit not found");
  if (s.finalizations.some((f) => f.auditId === auditId)) throw new DemoApiError(409, "This compliance review is already finalized.");
  const reviews = s.reviews.filter((r) => r.auditId === auditId);
  const actionable = reviews.filter((r) => isReviewable(r.status));
  const pendingCritical = actionable.filter((r) => r.severity === "CRITICAL" || r.severity === "HIGH");
  if (pendingCritical.length > 0 && !input.acknowledgePendingCritical) {
    throw new DemoApiError(400, `${pendingCritical.length} critical/high finding(s) are still pending human review. Confirm that you want to finalize the assessment anyway.`);
  }
  const pending = actionable.length;
  const approved = reviews.filter((r) => r.status === "APPROVED").length;
  const rejected = reviews.filter((r) => r.status === "REJECTED").length;
  const changesRequested = reviews.filter((r) => r.status === "CHANGES_REQUESTED").length;
  const finalization: ComplianceFinalization = {
    id: uniqueId("fin"),
    auditId,
    auditConfigurationName: audit.configurationName,
    vendor: audit.vendor,
    totalControls: audit.findings.length,
    aiAssessed: reviews.length,
    humanVerified: approved + rejected,
    pending,
    approved,
    rejected,
    changesRequested,
    criticalUnresolved: pendingCritical.length,
    finalizerId: REVIEWER.id,
    finalizerName: REVIEWER.displayName,
    finalizedAt: nowIso(),
    comment: input.comment?.trim() || undefined,
  };
  s.finalizations.push(finalization);
  for (const r of reviews.filter((x) => x.status === "APPROVED")) {
    r.status = "RESOLVED";
    r.resolvedAt = finalization.finalizedAt;
    recordEvent({ eventType: "FINDING_RESOLVED", entityType: "finding", entityId: r.findingId, findingId: r.findingId, auditId, vendor: r.vendor, frameworkLabel: r.frameworkLabel, controlId: r.controlId, actorId: REVIEWER.id, actorName: REVIEWER.displayName, actorRole: "reviewer", source: "system", detail: { previousStatus: "APPROVED", newStatus: "RESOLVED", reason: "Compliance review finalized." } });
  }
  recordEvent({ eventType: "AUDIT_FINALIZED", entityType: "audit", entityId: auditId, auditId, vendor: audit.vendor, actorId: REVIEWER.id, actorName: REVIEWER.displayName, actorRole: "reviewer", source: "human", detail: { totalControls: audit.findings.length, humanVerified: finalization.humanVerified, pending, approved, rejected, changesRequested, note: "Finalized assessment is locked against further modification." } });
  commit();
  return finalization;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function reportHtml(auditId: string): string {
  const audit = getAudit(auditId);
  const failing = audit.findings.filter((f) => f.status === "FAIL");
  const rows = audit.findings
    .map((f) => {
      const status = f.status;
      const cls = status === "PASS" ? "#059669" : status === "FAIL" ? "#dc2626" : status === "WARNING" ? "#d97706" : "#475569";
      return `<tr><td>${f.controlId}</td><td>${f.controlName}</td><td>${f.severity}</td><td><span style="color:${cls};font-weight:600">${status}</span></td><td>${f.risk}</td><td>${f.recommendedFix}</td></tr>`;
    })
    .join("");
  const review = reviewAggregate();
  return `<!doctype html><html><head><meta charset="utf-8"><title>NEXUS-COMPLY report — ${audit.configurationName}</title><style>body{font-family:system-ui,sans-serif;margin:40px;color:#0f172a}h1{font-size:22px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #e2e8f0;padding:8px;text-align:left}th{background:#f1f5f9}.ok{color:#059669}.bad{color:#dc2626}.warn{color:#d97706}</style></head><body><h1>NEXUS-COMPLY Compliance Assessment Report</h1><p><strong>Asset:</strong> ${audit.configurationName}</p><p><strong>Vendor:</strong> ${audit.vendor} (${audit.vendorStatus}) · <strong>Generated:</strong> ${new Date().toISOString()}</p><h2>Summary</h2><table><tr><th>AI engine score</th><th>Human-verified score</th><th>Human-verified coverage</th><th>Compliance</th></tr><tr><td>${review.aiScore}%</td><td>${review.humanVerifiedScore}%</td><td>${review.humanVerifiedCoverage}%</td><td>${audit.compliance?.score ?? 0}% (${audit.compliance?.passed ?? 0} passed / ${audit.compliance?.failed ?? 0} failed)</td></tr></table><h2>Findings (${audit.findings.length})</h2>
<p class="${failing.length ? "bad" : "ok"}">${failing.length} failing control(s) detected.</p>
<table><tr><th>Control</th><th>Name</th><th>Severity</th><th>Status</th><th>Risk</th><th>Recommendation</th></tr>${rows}</table></body></html>`;
}

// ---------------------------------------------------------------------------
// AI endpoint glue
// ---------------------------------------------------------------------------

export function toInterpretData(aiId: string, auditId: string, status: "APPROVED" | "REJECTED" | "EDITED") {
  return { id: aiId, auditId, status };
}

export { CONTROL_INTENT };
export { isInsecureContent };
export { splitLines };