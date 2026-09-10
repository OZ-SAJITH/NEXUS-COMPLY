import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { getRepository } from "../storage/jsonRepo";
import {
  approveFinding,
  finalizeAudit,
  getReviewDetail,
  listReviewQueue,
  modifyFinding,
  rejectFinding,
  reopenFinding,
  requestChanges,
} from "../services/reviewService";
import { SYSTEM_REVIEWER } from "../services/auth";
import { handleError } from "./helpers";

export const reviewsRouter = Router();

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
function ah(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// GET /api/reviews — Human Review Queue
// ---------------------------------------------------------------------------
reviewsRouter.get(
  "/reviews",
  ah(async (req, res) => {
    const { vendor, framework, severity, status, reviewer, sortBy, search } = req.query;
    const queue = await listReviewQueue({
      vendor: typeof vendor === "string" ? vendor : undefined,
      framework: typeof framework === "string" ? framework : undefined,
      severity: typeof severity === "string" ? severity : undefined,
      status: typeof status === "string" && status.length ? status : undefined,
      reviewer: typeof reviewer === "string" ? reviewer : undefined,
      sortBy: (sortBy === "oldest" || sortBy === "newest" || sortBy === "risk" ? sortBy : "risk") as "risk" | "oldest" | "newest",
      search: typeof search === "string" ? search : undefined,
    });
    res.json(queue);
  })
);

// ---------------------------------------------------------------------------
// GET /api/findings/:id/review — full review detail + audit trail
// ---------------------------------------------------------------------------
reviewsRouter.get(
  "/findings/:id/review",
  ah(async (req, res) => {
    const viewer = req.user ?? SYSTEM_REVIEWER;
    const detail = await getReviewDetail(req.params.id, viewer);
    res.json(detail);
  })
);

// ---------------------------------------------------------------------------
// GET /api/findings/:id/audit-trail
// ---------------------------------------------------------------------------
reviewsRouter.get(
  "/findings/:id/audit-trail",
  ah(async (req, res) => {
    const repo = getRepository();
    const items = await repo.auditEventsForFinding(req.params.id);
    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// POST /api/findings/:id/approve
// ---------------------------------------------------------------------------
const commentSchema = z.object({ comment: z.string().trim().max(2000).optional() });

reviewsRouter.post(
  "/findings/:id/approve",
  ah(async (req, res) => {
    const parsed = commentSchema.safeParse(req.body ?? {});
    if (!parsed.success) return handleError(res, "Invalid approval request.");
    const review = await approveFinding(req.params.id, SYSTEM_REVIEWER, parsed.data.comment);
    res.json({ review, message: "Finding approved. The human decision is recorded in the audit trail." });
  })
);

// ---------------------------------------------------------------------------
// POST /api/findings/:id/reject — reason required
// ---------------------------------------------------------------------------
const rejectSchema = z.object({ reason: z.string().trim().min(1, "A rejection reason is required.") });

reviewsRouter.post(
  "/findings/:id/reject",
  ah(async (req, res) => {
    const parsed = rejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) return handleError(res, parsed.error.issues[0]?.message ?? "A rejection reason is required.");
    const review = await rejectFinding(req.params.id, SYSTEM_REVIEWER, parsed.data.reason);
    res.json({ review });
  })
);

// ---------------------------------------------------------------------------
// POST /api/findings/:id/request-changes
// ---------------------------------------------------------------------------
const requestSchema = z.object({ requestedChanges: z.string().trim().min(1, "Describe what needs to change.") });

reviewsRouter.post(
  "/findings/:id/request-changes",
  ah(async (req, res) => {
    const parsed = requestSchema.safeParse(req.body ?? {});
    if (!parsed.success) return handleError(res, parsed.error.issues[0]?.message ?? "Describe what needs to change.");
    const review = await requestChanges(req.params.id, SYSTEM_REVIEWER, parsed.data.requestedChanges);
    res.json({ review });
  })
);

// ---------------------------------------------------------------------------
// POST /api/findings/:id/modify — preserve the original AI output
// ---------------------------------------------------------------------------
const modifySchema = z.object({
  why: z.string().trim().max(4000).optional(),
  impact: z.string().trim().max(4000).optional(),
  recommendedFix: z.string().trim().max(4000).optional(),
  risk: z.number().min(0).max(100).optional(),
});

reviewsRouter.post(
  "/findings/:id/modify",
  ah(async (req, res) => {
    const parsed = modifySchema.safeParse(req.body ?? {});
    if (!parsed.success) return handleError(res, "Invalid modification request.");
    const review = await modifyFinding(req.params.id, SYSTEM_REVIEWER, parsed.data);
    res.json({ review });
  })
);

// ---------------------------------------------------------------------------
// POST /api/findings/:id/reopen — CHANGES_REQUESTED -> PENDING_REVIEW
// ---------------------------------------------------------------------------
reviewsRouter.post(
  "/findings/:id/reopen",
  ah(async (req, res) => {
    const review = await reopenFinding(req.params.id, SYSTEM_REVIEWER);
    res.json({ review });
  })
);

// ---------------------------------------------------------------------------
// POST /api/compliance/:id/finalize — seals the human-verified assessment
// ---------------------------------------------------------------------------
const finalizeSchema = z.object({
  acknowledgePendingCritical: z.boolean().optional(),
  comment: z.string().trim().max(2000).optional(),
});

reviewsRouter.post(
  "/compliance/:id/finalize",
  ah(async (req, res) => {
    const parsed = finalizeSchema.safeParse(req.body ?? {});
    if (!parsed.success) return handleError(res, "Invalid finalization request.");
    const finalization = await finalizeAudit(req.params.id, SYSTEM_REVIEWER, parsed.data);
    res.json({ finalization });
  })
);