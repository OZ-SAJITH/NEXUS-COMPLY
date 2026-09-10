import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { runAudit } from "../services/auditService";
import { getRepository } from "../storage/jsonRepo";
import { AiClient } from "../services/aiClient";
import { simulateRemediation } from "../engines/remediation";
import { buildExposurePath } from "../engines/exposure";
import { getDashboardStats } from "../services/dashboardService";
import { generateReport } from "../services/reportService";
import { detectVendor, fingerprintSyntax, splitLines, extractSnippet } from "../utils/helpers";
import { redactSecrets } from "../utils/redact";
import { uniqueId } from "../utils/helpers";
import { reviewsRouter } from "./reviews";
import { SYSTEM_REVIEWER } from "../services/auth";
import { isAuditSealed } from "../services/reviewService";

export const apiRouter = Router();

apiRouter.use(reviewsRouter);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ["conf", "cfg", "config", "txt"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.split(".").pop() ?? "").toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: .${ext}`));
  },
});

function handleError(res: { status: (c: number) => { json: (o: unknown) => void } }, message: string, code = 400) {
  res.status(code).json({ error: message });
}

// ---------------------------------------------------------------------------
// POST /api/configurations/upload
// ---------------------------------------------------------------------------
apiRouter.post("/configurations/upload", upload.single("file"), async (req, res) => {
  const repo = getRepository();

  if (!req.file) {
    return handleError(res, "No file uploaded.");
  }

  const content = req.file.buffer.toString("utf-8");
  if (!content.trim()) {
    return handleError(res, "Uploaded file is empty.");
  }

  // Deterministic detection + redaction
  const redacted = redactSecrets(content);

  // Persist the raw config for later reference
  const detection = detectVendor(content);
  const saved = await repo.saveConfiguration({
    id: uniqueId("cfg"),
    name: req.file.originalname,
    content,
    fileType: req.file.originalname.split(".").pop() ?? "conf",
    sizeBytes: req.file.size,
    vendor: detection.vendor,
    vendorStatus: detection.status,
    detectedBy: detection.detectedBy,
    uploadedAt: new Date().toISOString(),
    redacted: redacted !== content,
  });

  res.status(201).json({
    id: saved.id,
    name: saved.name,
    vendor: detection.vendor,
    vendorStatus: detection.status,
    detectedBy: detection.detectedBy,
    confidence: detection.confidence,
    redacted: redacted !== content,
    redactedPreview: redacted.split("\n").slice(0, 40).join("\n"),
  });
});

// ---------------------------------------------------------------------------
// POST /api/audits  (run a full audit against an uploaded config id or body)
// ---------------------------------------------------------------------------
const auditBodySchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  aiOverrides: z
    .array(
      z.object({
        securityIntent: z.string(),
        protocol: z.string().optional(),
        sourceRestriction: z.boolean().optional(),
        loggingEnabled: z.boolean().optional(),
        status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
        confidence: z.number().min(0).max(1).optional(),
        detectedConcept: z.string().optional(),
        evidence: z.array(z.object({ lineStart: z.number().int(), lineEnd: z.number().int(), reason: z.string() })).optional(),
        suggestedRemediation: z.string().optional(),
      })
    )
    .optional(),
});

apiRouter.post("/audits", async (req, res) => {
  const parsed = auditBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return handleError(res, "Invalid audit request body: " + parsed.error.message);
  }

  const { name, content, aiOverrides } = parsed.data;

  const overrides = aiOverrides?.map((o) => ({
    id: uniqueId("ai"),
    sourceConfigId: "",
    detectedConcept: o.detectedConcept ?? "administrative_access",
    securityIntent: o.securityIntent as never,
    protocol: o.protocol,
    sourceRestriction: o.sourceRestriction ?? false,
    loggingEnabled: o.loggingEnabled ?? false,
    confidence: o.confidence ?? 0.9,
    evidence: o.evidence ?? [],
    suggestedRemediation: o.suggestedRemediation ?? "",
    provider: "mock" as "mock" | "live",
    status: (o.status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED",
    createdAt: new Date().toISOString(),
  }));

  try {
    const result = await runAudit({
      fileName: name,
      content,
      aiOverrides: overrides?.length ? overrides : undefined,
    });
    res.status(201).json(result.audit);
  } catch (err) {
    console.error("audit failed", err);
    res.status(500).json({ error: "Audit failed: " + (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/audits
// ---------------------------------------------------------------------------
apiRouter.get("/audits", async (_req, res) => {
  const repo = getRepository();
  const audits = await repo.allAudits();
  res.json(audits);
});

// ---------------------------------------------------------------------------
// GET /api/audits/:id
// ---------------------------------------------------------------------------
apiRouter.get("/audits/:id", async (req, res) => {
  const repo = getRepository();
  const audit = await repo.getAudit(req.params.id);
  if (!audit) return handleError(res, "Audit not found", 404);
  res.json(audit);
});

// ---------------------------------------------------------------------------
// GET /api/audits/:id/findings
// ---------------------------------------------------------------------------
apiRouter.get("/audits/:id/findings", async (req, res) => {
  const repo = getRepository();
  const audit = await repo.getAudit(req.params.id);
  if (!audit) return handleError(res, "Audit not found", 404);
  res.json(audit.findings);
});

// ---------------------------------------------------------------------------
// GET /api/findings/:id
// ---------------------------------------------------------------------------
apiRouter.get("/findings/:id", async (req, res) => {
  const repo = getRepository();
  const audits = await repo.allAudits();
  let found: unknown = null;
  let auditId = "";
  for (const a of audits) {
    const f = a.findings.find((x) => x.id === req.params.id);
    if (f) {
      found = f;
      auditId = a.id;
      break;
    }
  }
  if (!found) return handleError(res, "Finding not found", 404);
  res.json({ finding: found, auditId });
});

// ---------------------------------------------------------------------------
// POST /api/ai/interpret
// ---------------------------------------------------------------------------
const interpretSchema = z.object({
  configName: z.string().min(1),
  config: z.string().min(1),
});

apiRouter.post("/ai/interpret", async (req, res) => {
  const parsed = interpretSchema.safeParse(req.body);
  if (!parsed.success) return handleError(res, "Invalid interpret request");

  const { configName, config } = parsed.data;
  const redacted = redactSecrets(config);
  const fp = fingerprintSyntax(config);
  const detection = detectVendor(config);

  const client = new AiClient();
  const result = await client.interpret({
    configName,
    redactedConfig: redacted,
    vendor: detection.vendor,
    syntaxFingerprint: fp,
  });

  // Check for reusable mapping
  const existing = await getRepository().getMappingByFingerprint(fp);

  res.json({ ...result, syntaxFingerprint: fp, reusedMapping: !!existing, detectedVendor: detection.vendor });
});

// ---------------------------------------------------------------------------
// POST /api/ai/interpret/:id/approve | /reject | edit
// ---------------------------------------------------------------------------
const approveSchema = z.object({
  syntaxFingerprint: z.string().min(1),
  auditId: z.string().min(1),
});

apiRouter.post("/ai/interpret/:id/approve", async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return handleError(res, "Invalid approve request");
  const repo = getRepository();
  const audit = await repo.getAudit(parsed.data.auditId);
  if (!audit) return handleError(res, "Audit not found", 404);
  if (await isAuditSealed(audit.id)) return handleError(res, "This compliance review has been finalized. No further changes are permitted.", 409);

  const ais = audit.aiInterpretations ?? [];
  const ai = ais.find((a) => a.id === req.params.id);
  if (!ai) return handleError(res, "AI interpretation not found", 404);

  ai.status = "APPROVED";
  await repo.saveAudit(audit);

  // Save reusable mapping — the acting reviewer is recorded on every mapping.
  await repo.saveMapping({
    id: uniqueId("map"),
    syntaxFingerprint: parsed.data.syntaxFingerprint,
    aiInterpretationId: ai.id!,
    securityIntent: ai.securityIntent,
    protocol: ai.protocol,
    sourceRestriction: ai.sourceRestriction,
    loggingEnabled: ai.loggingEnabled,
    approvedAt: new Date().toISOString(),
    approvedBy: SYSTEM_REVIEWER.displayName,
  });

  res.json({ status: "APPROVED", mappingSaved: true });
});

apiRouter.post("/ai/interpret/:id/reject", async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return handleError(res, "Invalid reject request");
  const repo = getRepository();
  const audit = await repo.getAudit(parsed.data.auditId);
  if (!audit) return handleError(res, "Audit not found", 404);
  if (await isAuditSealed(audit.id)) return handleError(res, "This compliance review has been finalized. No further changes are permitted.", 409);

  const ais = audit.aiInterpretations ?? [];
  const ai = ais.find((a) => a.id === req.params.id);
  if (!ai) return handleError(res, "AI interpretation not found", 404);

  ai.status = "REJECTED";
  await repo.saveAudit(audit);
  res.json({ status: "REJECTED" });
});

apiRouter.post("/ai/interpret/:id/edit", async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  const edit = req.body as { securityIntent?: string; protocol?: string; sourceRestriction?: boolean; loggingEnabled?: boolean };
  if (!parsed.success) return handleError(res, "Invalid edit request");
  const repo = getRepository();
  const audit = await repo.getAudit(parsed.data.auditId);
  if (!audit) return handleError(res, "Audit not found", 404);
  if (await isAuditSealed(audit.id)) return handleError(res, "This compliance review has been finalized. No further changes are permitted.", 409);

  const ai = (audit.aiInterpretations ?? []).find((a) => a.id === req.params.id);
  if (!ai) return handleError(res, "AI interpretation not found", 404);

  if (edit.securityIntent) ai.securityIntent = edit.securityIntent as never;
  if (edit.protocol !== undefined) ai.protocol = edit.protocol;
  if (edit.sourceRestriction !== undefined) ai.sourceRestriction = edit.sourceRestriction;
  if (edit.loggingEnabled !== undefined) ai.loggingEnabled = edit.loggingEnabled;
  ai.status = "EDITED";

  // Save mapping for edited version too — the acting reviewer is recorded.
  await repo.saveMapping({
    id: uniqueId("map"),
    syntaxFingerprint: parsed.data.syntaxFingerprint,
    aiInterpretationId: ai.id!,
    securityIntent: ai.securityIntent,
    protocol: ai.protocol,
    sourceRestriction: ai.sourceRestriction,
    loggingEnabled: ai.loggingEnabled,
    approvedAt: new Date().toISOString(),
    approvedBy: SYSTEM_REVIEWER.displayName,
  });

  await repo.saveAudit(audit);
  res.json({ status: "EDITED", ai });
});

// ---------------------------------------------------------------------------
// POST /api/remediation/simulate
// ---------------------------------------------------------------------------
const simulateSchema = z.object({ auditId: z.string().min(1) });

apiRouter.post("/remediation/simulate", async (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) return handleError(res, "Invalid simulate request");
  const repo = getRepository();
  const audit = await repo.getAudit(parsed.data.auditId);
  if (!audit) return handleError(res, "Audit not found", 404);

  const result = simulateRemediation(audit);
  audit.remediation = result.simulation;
  await repo.saveAudit(audit);

  res.json(result.simulation);
});

// ---------------------------------------------------------------------------
// GET /api/audits/:id/exposure
// ---------------------------------------------------------------------------
apiRouter.get("/audits/:id/exposure", async (req, res) => {
  const repo = getRepository();
  const audit = await repo.getAudit(req.params.id);
  if (!audit) return handleError(res, "Audit not found", 404);
  const paths = audit.findings
    .filter((f) => f.status === "FAIL")
    .map((f) => buildExposurePath(audit, f))
    .filter((p) => p !== null);
  res.json(paths);
});

// ---------------------------------------------------------------------------
// GET /api/config/snippet
// GET evidence snippet helper
// ---------------------------------------------------------------------------
apiRouter.post("/config/snippet", async (req, res) => {
  const { content, lineStart, lineEnd } = (req.body ?? {}) as { content?: string; lineStart?: number; lineEnd?: number };
  if (!content || typeof lineStart !== "number") return handleError(res, "Invalid snippet request");
  const lines = splitLines(content);
  res.json({ snippet: extractSnippet(lines, lineStart, lineEnd ?? lineStart) });
});

// ---------------------------------------------------------------------------
// GET /api/configurations
// ---------------------------------------------------------------------------
apiRouter.get("/configurations", async (_req, res) => {
  const repo = getRepository();
  const configs = await repo.allConfigurations();
  res.json(configs);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard
// ---------------------------------------------------------------------------
apiRouter.get("/dashboard", async (_req, res) => {
  const stats = await getDashboardStats();
  res.json(stats);
});

// ---------------------------------------------------------------------------
// GET /api/reports/:auditId
// ---------------------------------------------------------------------------
apiRouter.get("/reports/:auditId", async (req, res) => {
  const repo = getRepository();
  const audit = await repo.getAudit(req.params.auditId);
  if (!audit) return handleError(res, "Audit not found", 404);
  const html = await generateReport(audit);
  res.type("html").send(html);
});

// ---------------------------------------------------------------------------
// GET /api/samples — list demo configuration samples (for the LOAD DEMO flow)
// ---------------------------------------------------------------------------
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_ROOT = join(__dirname, "../../../../samples");

const SAMPLE_SCENARIOS = [
  {
    id: "cisco-secure",
    vendor: "cisco" as const,
    status: "known" as const,
    label: "Cisco IOS — Secure Baseline",
    file: "cisco/demo-secure.conf",
  },
  {
    id: "cisco-insecure",
    vendor: "cisco" as const,
    status: "known" as const,
    label: "Cisco IOS — Internet-Facing Administration",
    file: "cisco/demo-insecure.conf",
  },
  {
    id: "fortinet-secure",
    vendor: "fortinet" as const,
    status: "known" as const,
    label: "Fortinet FortiGate — Secure Baseline",
    file: "fortinet/demo-secure.conf",
  },
  {
    id: "fortinet-insecure",
    vendor: "fortinet" as const,
    status: "known" as const,
    label: "Fortinet FortiGate — Insecure",
    file: "fortinet/demo-insecure.conf",
  },
  {
    id: "juniper-secure",
    vendor: "juniper" as const,
    status: "known" as const,
    label: "Juniper Junos — Secure Baseline",
    file: "juniper/demo-secure.conf",
  },
  {
    id: "juniper-insecure",
    vendor: "juniper" as const,
    status: "known" as const,
    label: "Juniper Junos — Insecure",
    file: "juniper/demo-insecure.conf",
  },
  {
    id: "unknown-custom",
    vendor: "unknown" as const,
    status: "unknown" as const,
    label: "CloudEdge SDN — Custom Syntax (Flagship Demo)",
    file: "unknown/custom-demo.conf",
  },
  {
    id: "unknown-custom-branch",
    vendor: "unknown" as const,
    status: "unknown" as const,
    label: "CloudEdge SDN — Custom Syntax (Variant)",
    file: "unknown/custom-demo-branch.conf",
  },
];

apiRouter.get("/samples", async (_req, res) => {
  const out: Array<{ id: string; vendor: string; status: string; label: string; file: string; content: string; exists: boolean }> = [];
  for (const s of SAMPLE_SCENARIOS) {
    const full = join(SAMPLES_ROOT, s.file);
    try {
      const content = await readFileSafe(full);
      out.push({
        id: s.id,
        vendor: s.vendor,
        status: s.status,
        label: s.label,
        file: s.file,
        content,
        exists: true,
      });
    } catch {
      out.push({ id: s.id, vendor: s.vendor, status: s.status, label: s.label, file: s.file, content: "", exists: false });
    }
  }
  res.json(out);
});

async function readFileSafe(p: string): Promise<string> {
  const { readFile } = await import("fs/promises");
  return (await readFile(p, "utf-8")) as string;
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});
