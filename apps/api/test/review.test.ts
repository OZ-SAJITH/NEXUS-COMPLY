import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Server } from "http";
import { runAudit } from "../src/services/auditService";
import { getRepository } from "../src/storage/jsonRepo";
import { ensureDemoUsers, toPublicUser } from "../src/services/auth";
import {
  approveFinding,
  rejectFinding,
  requestChanges,
  modifyFinding,
  reopenFinding,
  backfillReviewData,
  finalizeAudit,
  humanVerifiedSummary,
  listReviewQueue,
  getReviewDetail,
  isAuditSealed,
  ApiError,
} from "../src/services/reviewService";
import { createApp } from "../src/app";

const ciscoInsecure = () => readFileSync(resolve(__dirname, "../../../samples/cisco/demo-insecure.conf"), "utf-8");

async function reviewers() {
  const repo = getRepository();
  const reviewer = await repo.getUserByEmail("reviewer@nexus-comply.sih");
  const analyst = await repo.getUserByEmail("analyst@nexus-comply.sih");
  if (!reviewer || !analyst) throw new Error("demo users missing");
  return { reviewer: toPublicUser(reviewer), analyst: toPublicUser(analyst) };
}

async function newAudit() {
  const { audit } = await runAudit({ fileName: "cisco-insecure.conf", content: ciscoInsecure() });
  const actionable = audit.findings.filter((f) => f.status === "FAIL" || f.status === "WARNING");
  expect(actionable.length).toBeGreaterThan(0);
  return { audit, finding: actionable[0] };
}

let server: Server | null = null;
async function http(): Promise<{ base: string }> {
  server = createApp().listen(0);
  await new Promise<void>((res) => server!.once("listening", () => res()));
  const address = server!.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { base: `http://localhost:${port}/api` };
}

async function login(base: string, email: string, password: string) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res;
}

function eventTypes(repo = getRepository()) {
  return async (findingId: string) => (await repo.auditEventsForFinding(findingId)).map((e) => e.eventType);
}

beforeEach(async () => {
  await getRepository().reset();
  await ensureDemoUsers();
});

describe("Human-in-the-loop: registration", () => {
  it("registers AI/engine FAIL and WARNING findings into the Human Review Queue", async () => {
    const repo = getRepository();
    const { audit, finding } = await newAudit();
    const review = await repo.getFindingReview(finding.id);
    expect(review?.findingId).toBe(finding.id);
    expect(review?.status).toBe("PENDING_REVIEW");
    expect(review?.originalAiRecommendation.recommendedFix).toBeTruthy();
    const types = await eventTypes()(finding.id);
    expect(types).toContain("FINDING_AI_GENERATED");
    expect(types).toContain("FINDING_ENTERED_REVIEW");
    void audit;
  });

  it("does not register PASS findings, and approval is inaccessible before review exists", async () => {
    const repo = getRepository();
    const { audit } = await runAudit({ fileName: "cisco-insecure.conf", content: ciscoInsecure() });
    const pass = audit.findings.find((f) => f.status === "PASS");
    expect(pass).toBeTruthy();
    expect(await repo.getFindingReview(pass!.id)).toBeUndefined();
  });
});

describe("Human-in-the-loop: lifecycle transitions", () => {
  it("approve: PENDING_REVIEW -> APPROVED, records reviewer, emits human event", async () => {
    const repo = getRepository();
    const { reviewer } = await reviewers();
    const { finding } = await newAudit();

    const review = await approveFinding(finding.id, reviewer, "Matches anchored tunnel rules; approved.");

    expect(review.status).toBe("APPROVED");
    expect(review.reviewedBy).toBe(reviewer.displayName);
    expect(review.reviewComment).toContain("approved");
    const types = await eventTypes()(finding.id);
    const approvalEvent = (await repo.auditEventsForFinding(finding.id)).find((e) => e.eventType === "FINDING_APPROVED");
    expect(types).toContain("FINDING_APPROVED");
    expect(approvalEvent?.source).toBe("human");
    expect(approvalEvent?.actorName).toBe(reviewer.displayName);
  });

  it("reject requires a reason", async () => {
    const { reviewer } = await reviewers();
    const { finding } = await newAudit();
    await expect(rejectFinding(finding.id, reviewer, "")).rejects.toThrowError(ApiError);
  });

  it("reject with reason: PENDING_REVIEW -> REJECTED with reason recorded", async () => {
    const repo = getRepository();
    const { reviewer } = await reviewers();
    const { finding } = await newAudit();

    const review = await rejectFinding(finding.id, reviewer, "False positive: ACL ordering already enforced upstream.");

    expect(review.status).toBe("REJECTED");
    expect(review.rejectionReason).toContain("False positive");
    const event = (await repo.auditEventsForFinding(finding.id)).find((e) => e.eventType === "FINDING_REJECTED");
    expect(event?.detail.rejectionReason).toContain("False positive");
  });

  it("request-changes -> CHANGES_REQUESTED, reopen -> PENDING_REVIEW", async () => {
    const repo = getRepository();
    const { reviewer } = await reviewers();
    const { finding } = await newAudit();

    const changed = await requestChanges(finding.id, reviewer, "Re-evaluate with the exact interface list from the config.");
    expect(changed.status).toBe("CHANGES_REQUESTED");
    expect(changed.requestedChanges).toContain("Re-evaluate");

    const reopened = await reopenFinding(finding.id, reviewer);
    expect(reopened.status).toBe("PENDING_REVIEW");
    expect(reopened.reopenedAt).toBeTruthy();
    const types = await eventTypes()(finding.id);
    expect(types).toContain("FINDING_REOPENED");
  });

  it("modify stores the human version while preserving the original AI recommendation", async () => {
    const repo = getRepository();
    const { reviewer } = await reviewers();
    const { finding } = await newAudit();

    const review = await modifyFinding(finding.id, reviewer, {
      why: "The AI draft overstates the blast radius.",
      impact: "Restricted to the management plane uplink.",
      recommendedFix: "Apply the ACL to interface GigabitEthernet0/1/0 only.",
      risk: 32,
    });

    expect(review.status).toBe("PENDING_REVIEW");
    expect(review.humanModifiedRecommendation?.recommendedFix).toContain("GigabitEthernet0/1/0");
    expect(review.originalAiRecommendation.recommendedFix).toBeTruthy();
    expect(review.originalAiRecommendation.recommendedFix).not.toBe(review.humanModifiedRecommendation?.recommendedFix);
    const event = (await repo.auditEventsForFinding(finding.id)).find((e) => e.eventType === "FINDING_MODIFIED");
    expect(event?.source).toBe("human");

    const approved = await approveFinding(finding.id, reviewer, "Approved with the human correction applied.");
    expect(approved.humanModifiedRecommendation?.recommendedFix).toContain("GigabitEthernet0/1/0");
  });

  it("rejects invalid transitions: approving or reopening a non-actionable finding", async () => {
    const { reviewer } = await reviewers();
    const { finding } = await newAudit();
    await approveFinding(finding.id, reviewer);
    await expect(approveFinding(finding.id, reviewer)).rejects.toThrow(/Invalid action/);
    await expect(reopenFinding(finding.id, reviewer)).rejects.toThrow(/Only CHANGES_REQUESTED/);
  });
});

describe("Human-verified scoring", () => {
  it("pending findings are NOT counted; APPROVED stays FAIL, REJECTED counts as PASS", async () => {
    const repo = getRepository();
    const { reviewer } = await reviewers();
    const { audit } = await newAudit();

    const fails = audit.findings.filter((f) => f.status === "FAIL");
    const actionable = audit.findings.filter((f) => f.status === "FAIL" || f.status === "WARNING");
    expect(fails.length).toBeGreaterThanOrEqual(2);
    expect(actionable.length).toBeGreaterThanOrEqual(2);
    const fApproved = fails[0].id;

    const before = humanVerifiedSummary(audit.findings, await repo.getFindingReviewsForAudit(audit.id));
    expect(before.pending).toBe(actionable.length);
    // Nothing has been human-evaluated yet — only PASS/N.A. controls count.
    const total = audit.findings.length;
    expect(before.coverage).toBe(Math.round(((total - actionable.length) / total) * 100));

    // Approve one pending FAIL: it stays a real, human-verified FAIL.
    await approveFinding(fApproved, reviewer, "Exposure is real, fix is correct.");
    const approved = humanVerifiedSummary(audit.findings, await repo.getFindingReviewsForAudit(audit.id));
    expect(approved.pending).toBe(before.pending - 1);
    expect(approved.failed).toBe(1);
    expect(approved.coverage).toBeGreaterThan(before.coverage);

    // Reject every remaining pending finding: they count as human-reviewed PASS.
    for (const f of actionable) {
      if (f.id === fApproved) continue;
      await rejectFinding(f.id, reviewer, "False positive — control enforced upstream.");
    }
    const after = humanVerifiedSummary(audit.findings, await repo.getFindingReviewsForAudit(audit.id));
    expect(after.pending).toBe(0);
    expect(after.failed).toBe(1);
    expect(after.score).not.toBeNull();
    expect(after.coverage).toBe(100);
  });
});

describe("Human-in-the-loop: queue & detail", () => {
  it("lists actionable findings with framework label and age, respecting filters", async () => {
    const { audit, finding } = await newAudit();
    void audit;
    const queue = await listReviewQueue({ status: "PENDING_REVIEW" });
    expect(queue.items.some((i) => i.findingId === finding.id)).toBe(true);
    expect(queue.items[0].frameworkLabel.length).toBeGreaterThan(0);
    expect(queue.counts.PENDING_REVIEW).toBe(queue.items.length);

    const detail = await getReviewDetail(finding.id, null);
    expect(detail.review?.findingId).toBe(finding.id);
    expect(detail.auditTrail.length).toBeGreaterThanOrEqual(2);
    expect(detail.canReview).toBe(false);
  });
});

describe("Human-in-the-loop: finalization & audit seal", () => {
  it("finalize warns on unresolved CRITICAL/HIGH findings unless acknowledged", async () => {
    const { reviewer } = await reviewers();
    const { audit } = await newAudit();
    const critical = audit.findings.some((f) => f.status === "FAIL" && (f.severity === "CRITICAL" || f.severity === "HIGH"));
    if (critical) {
      await expect(finalizeAudit(audit.id, reviewer, {})).rejects.toThrow(/anyway/);
    }
  });

  it("finalize seals the review: subsequent mutations and AI interpretation changes are blocked", async () => {
    const repo = getRepository();
    const { reviewer } = await reviewers();
    const { audit, finding } = await newAudit();

    const critical = audit.findings.find((f) => f.severity === "CRITICAL" && f.status === "FAIL") ? true : false;
    const finalization = await finalizeAudit(audit.id, reviewer, {
      acknowledgePendingCritical: critical,
      comment: "Posture accepted for the current review window.",
    });
    expect(finalization.auditId).toBe(audit.id);
    expect(await isAuditSealed(audit.id)).toBe(true);

    const finalEvent = (await repo.allAuditEvents()).find((e) => e.eventType === "AUDIT_FINALIZED");
    expect(finalEvent).toBeTruthy();
    expect(finalEvent?.actorName).toBe(reviewer.displayName);

    await expect(approveFinding(finding.id, reviewer)).rejects.toThrow(/finalized/);
    await expect(rejectFinding(finding.id, reviewer, "nope")).rejects.toThrow(/finalized/);
  });
});

describe("Human-in-the-loop: HTTP + RBAC", () => {
  it("login returns a bearer token and public user; invalid credentials yield 401", async () => {
    const { base } = await http();
    const ok = await login(base, "reviewer@nexus-comply.sih", "demo-reviewer");
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { token: string; user: { role: string; displayName: string } };
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.user.role).toBe("reviewer");
    expect(body.user.displayName).toBe("Security Review Lead");

    const bad = await login(base, "reviewer@nexus-comply.sih", "wrong-password");
    expect(bad.status).toBe(401);
  });

  it("anonymous and analyst requests are rejected; reviewer can approve", async () => {
    const { base } = await http();
    const { finding } = await newAudit();

    const reviewRes = await fetch(`${base}/findings/${finding.id}/review`);
    expect(reviewRes.status).toBe(200);

    const anonymousApprove = await fetch(`${base}/findings/${finding.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "ok" }),
    });
    expect(anonymousApprove.status).toBe(401);

    const analystLogin = await login(base, "analyst@nexus-comply.sih", "demo-analyst");
    const analystToken = ((await analystLogin.json()) as { token: string }).token;
    const analystApprove = await fetch(`${base}/findings/${finding.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${analystToken}` },
      body: JSON.stringify({ comment: "ok" }),
    });
    expect(analystApprove.status).toBe(403);

    const reviewerLogin = await login(base, "reviewer@nexus-comply.sih", "demo-reviewer");
    const reviewerToken = ((await reviewerLogin.json()) as { token: string }).token;
    const reviewerApprove = await fetch(`${base}/findings/${finding.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${reviewerToken}` },
      body: JSON.stringify({ comment: "Approved via HTTP." }),
    });
    expect(reviewerApprove.status).toBe(200);
    const body = (await reviewerApprove.json()) as { review: { status: string; reviewedBy: string } };
    expect(body.review.status).toBe("APPROVED");
    expect(body.review.reviewedBy).toBe("Security Review Lead");
  });
});

describe("Human-in-the-loop: backfill of legacy data", () => {
  it("idempotently registers legacy FAIL/WARNING findings that were never reviewed", async () => {
    const repo = getRepository();
    await runAudit({ fileName: "cisco-insecure.conf", content: ciscoInsecure() });
    const liveCount = (await repo.allFindingReviews()).length;
    expect(liveCount).toBeGreaterThan(0);

    // Simulate legacy data: findings exist in DB but review workflow never ran.
    for (const r of await repo.allFindingReviews()) await repo.removeFindingReview(r.findingId);
    expect((await repo.allFindingReviews()).length).toBe(0);

    // Backfill on next boot re-creates the review records.
    const created = await backfillReviewData();
    expect(created).toBeGreaterThan(0);
    const reviews = await repo.allFindingReviews();
    expect(reviews.length).toBe(liveCount);
    expect(reviews.every((r) => r.status === "PENDING_REVIEW")).toBe(true);

    // Idempotent: re-running the migration must not duplicate records.
    await backfillReviewData();
    expect((await repo.allFindingReviews()).length).toBe(liveCount);
  });
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((res) => server!.close(() => res()));
    server = null;
  }
});