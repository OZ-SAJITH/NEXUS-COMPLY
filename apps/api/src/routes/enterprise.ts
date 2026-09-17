import { Router } from "express";
import { z } from "zod";
import { getRepository } from "../storage/jsonRepo";
import { ConnectorManager } from "../services/enterprise/connectorManager";
import {
  assetConnectorProfile,
  assetControlCatalogue,
  assetEvidence,
  assetFindings,
  assetImpact,
  assetScans,
  complianceSummary,
  discoverAssets,
  ensureAssets,
  evidenceDetail,
  scanAsset,
  setFindingLifecycle,
  testAssetConnector,
  ENTERPRISE_REGIONS,
  ENTERPRISE_TIERS,
  enterpriseTopologyConnections,
} from "../services/enterprise/assetService";
import {
  decideException,
  getAssetApplicableControls,
  getAssetGovernance,
  getFrameworkById,
  getPolicyById,
  listExceptions,
  listFrameworks,
  listPolicies,
  requestException,
  selectPolicy,
} from "../services/enterprise/governanceService";
import { analyzeFinding } from "../services/enterprise/aiAnalysisService";
import {
  approveRemediation,
  createRemediation,
  executeRemediation,
  rejectRemediation,
  requestApproval,
  rollbackRemediation,
  validateRemediation,
  verifyRemediation,
} from "../services/enterprise/remediationService";
import { SYSTEM_REVIEWER } from "../services/auth";
import { ApiError } from "../services/reviewService";
import { controlFrameworkMappings } from "@nexus/enterprise-catalog";

export const enterpriseRouter = Router();

function reviewerActor() {
  return { id: SYSTEM_REVIEWER.id, name: SYSTEM_REVIEWER.displayName, role: SYSTEM_REVIEWER.role };
}

function handleError(res: { status: (c: number) => { json: (o: unknown) => void } }, message: string, code = 400) {
  res.status(code).json({ error: message });
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

enterpriseRouter.get("/assets", async (_req, res) => {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  const assets = await ensureAssets({ repo, manager });
  res.json(assets);
});

enterpriseRouter.get("/assets/:id", async (req, res) => {
  const repo = getRepository();
  const asset = await repo.getAsset(req.params.id);
  if (!asset) return handleError(res, "Asset not found", 404);
  res.json(asset);
});

enterpriseRouter.post("/assets/discover", async (_req, res) => {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  const { result } = await discoverAssets({ repo, manager });
  res.json(result);
});

enterpriseRouter.post("/assets/:id/scan", async (req, res) => {
  const parsed = z.object({ trigger: z.enum(["manual", "auto_verify", "scheduled"]).optional().default("manual") }).safeParse(req.body ?? {});
  const trigger = parsed.success ? parsed.data.trigger : "manual";
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  const scan = await scanAsset({ repo, manager }, req.params.id, { trigger });
  res.status(scan.status === "ERROR" ? 409 : 201).json(scan);
});

enterpriseRouter.get("/assets/:id/evidence", async (req, res) => {
  const repo = getRepository();
  const records = await assetEvidence({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json(records);
});

enterpriseRouter.get("/assets/:id/connector", async (req, res) => {
  const repo = getRepository();
  const profile = await assetConnectorProfile({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json(profile);
});

enterpriseRouter.post("/assets/:id/connector/test", async (req, res) => {
  const repo = getRepository();
  const result = await testAssetConnector({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.status(result.ok ? 200 : 409).json(result);
});

enterpriseRouter.get("/assets/:id/evidence/:evidenceId", async (req, res) => {
  const repo = getRepository();
  const detail = await evidenceDetail({ repo, manager: new ConnectorManager(repo) }, req.params.id, req.params.evidenceId);
  res.json(detail);
});

enterpriseRouter.get("/assets/:id/findings", async (req, res) => {
  const repo = getRepository();
  const findings = await assetFindings({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json(findings);
});

enterpriseRouter.get("/assets/:id/scans", async (req, res) => {
  const repo = getRepository();
  const scans = await assetScans({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json(scans);
});

enterpriseRouter.get("/assets/:id/impact", async (req, res) => {
  const repo = getRepository();
  const graph = await assetImpact({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json(graph);
});

const lifecycleSchema = z.object({
  lifecycle: z.enum(["ACKNOWLEDGED", "EXCEPTED", "OPEN"]),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * PHASE 3 finding lifecycle: human actor acknowledges / excepts / reopens a
 * finding. Remediation orchestration advances PLANNED → REMEDIATED → VERIFIED
 * through the remediation workflow.
 */
enterpriseRouter.post("/assets/:id/findings/:findingId/lifecycle", async (req, res, next) => {
  const repo = getRepository();
  const parsed = lifecycleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid lifecycle update", issues: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const finding = await setFindingLifecycle({ repo, manager: new ConnectorManager(repo) }, req.params.id, req.params.findingId, parsed.data);
    res.json(finding);
  } catch (err) {
    next(err);
  }
});

/**
 * PHASE 3 compliance summary — deterministic, evidence-grounded posture across
 * the entire managed estate (rules re-run against persisted evidence).
 */
enterpriseRouter.get("/enterprise/compliance-summary", async (_req, res, next) => {
  const repo = getRepository();
  try {
    const summary = await complianceSummary({ repo, manager: new ConnectorManager(repo) });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

enterpriseRouter.get("/enterprise/topology", async (_req, res) => {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  await ensureAssets({ repo, manager });
  await manager.probeAll();
  res.json({
    regions: ENTERPRISE_REGIONS,
    tiers: ENTERPRISE_TIERS,
    connections: enterpriseTopologyConnections(),
    generatedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

enterpriseRouter.get("/connectors", async (_req, res) => {
  const manager = new ConnectorManager(getRepository());
  const connectors = await manager.probeAll();
  res.json(connectors);
});

enterpriseRouter.get("/connectors/:id", async (req, res) => {
  const manager = new ConnectorManager(getRepository());
  const connector = await manager.get(req.params.id);
  if (!connector) return handleError(res, "Connector not found", 404);
  res.json(connector);
});

enterpriseRouter.get("/connectors/:id/health", async (req, res) => {
  const manager = new ConnectorManager(getRepository());
  const health = await manager.health(req.params.id);
  res.json(health);
});

enterpriseRouter.post("/connectors/:id/test", async (req, res) => {
  const manager = new ConnectorManager(getRepository());
  const connector = await manager.testConnection(req.params.id);
  res.json(connector);
});

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

enterpriseRouter.get("/evidence/:id", async (req, res) => {
  const repo = getRepository();
  const record = await repo.getEvidence(req.params.id);
  if (!record) return handleError(res, "Evidence not found", 404);
  res.json(record);
});

// ---------------------------------------------------------------------------
// Asset control catalogue & framework coverage
// ---------------------------------------------------------------------------

enterpriseRouter.get("/asset-controls", async (_req, res) => {
  const repo = getRepository();
  const catalogue = await assetControlCatalogue({ repo, manager: new ConnectorManager(repo) });
  res.json(catalogue.controls);
});

// ---------------------------------------------------------------------------
// PHASE 4 — Global Adaptive Governance + Multi-Framework Compliance
// ---------------------------------------------------------------------------

enterpriseRouter.get("/frameworks", async (_req, res) => {
  const frameworks = await listFrameworks();
  res.json(frameworks);
});

enterpriseRouter.get("/frameworks/:id", async (req, res) => {
  const framework = await getFrameworkById(req.params.id);
  res.json(framework);
});

enterpriseRouter.get("/policies", async (_req, res) => {
  const policies = await listPolicies();
  res.json(policies);
});

enterpriseRouter.get("/policies/:id", async (req, res) => {
  const policy = await getPolicyById(req.params.id);
  res.json(policy);
});

enterpriseRouter.post("/governance/policy/select", async (req, res) => {
  const parsed = z.object({ assetId: z.string().min(1) }).safeParse(req.body ?? {});
  if (!parsed.success) return handleError(res, "Invalid policy selection request: " + parsed.error.message);
  const repo = getRepository();
  const selection = await selectPolicy({ repo, manager: new ConnectorManager(repo) }, parsed.data.assetId);
  res.json(selection);
});

enterpriseRouter.get("/governance/evaluate/:assetId", async (req, res) => {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  const asset = await repo.getAsset(req.params.assetId);
  if (!asset) return handleError(res, "Asset not found", 404);
  const [policy, applicableControls, trace, exceptions] = await Promise.all([
    selectPolicy({ repo, manager }, req.params.assetId),
    getAssetApplicableControls({ repo, manager }, req.params.assetId),
    getAssetGovernance({ repo, manager }, req.params.assetId),
    listExceptions({ repo, manager }, req.params.assetId),
  ]);
  res.json({ assetId: req.params.assetId, policy, applicableControls, trace, exceptions });
});

enterpriseRouter.get("/assets/:id/governance", async (req, res) => {
  const repo = getRepository();
  const trace = await getAssetGovernance({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json(trace);
});

enterpriseRouter.get("/assets/:id/frameworks", async (req, res) => {
  const repo = getRepository();
  const asset = await repo.getAsset(req.params.id);
  if (!asset) return handleError(res, "Asset not found", 404);
  const governance = await getAssetGovernance({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json({
    assetId: asset.id,
    region: governance.region,
    regionLabel: governance.regionLabel,
    frameworks: governance.frameworks.map((f) => ({
      id: f.id,
      name: f.name,
      version: f.version,
      status: f.status,
      disclaimer: f.disclaimer,
      mappings: governance.applicableControls
        .filter((c) => {
          const mappings = controlFrameworkMappings(c.controlId);
          return mappings.some((m) => m.framework === f.id);
        })
        .map((c) => {
          const mappings = controlFrameworkMappings(c.controlId);
          const mapping = mappings.find((m) => m.framework === f.id);
          return { controlId: c.controlId, controlName: c.controlName, ...mapping };
        }),
    })),
    generatedAt: new Date().toISOString(),
  });
});

enterpriseRouter.get("/assets/:id/applicable-controls", async (req, res) => {
  const repo = getRepository();
  const controls = await getAssetApplicableControls({ repo, manager: new ConnectorManager(repo) }, req.params.id);
  res.json(controls);
});

// ---- Governance exceptions ----

enterpriseRouter.get("/enterprise/governance/exceptions", async (_req, res) => {
  const repo = getRepository();
  const exceptions = await listExceptions({ repo, manager: new ConnectorManager(repo) });
  res.json(exceptions);
});

const exceptionRequestSchema = z.object({
  controlId: z.string().min(1),
  assetId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  requestedBy: z.string().min(1),
  expiresInDays: z.number().int().positive().optional(),
});

enterpriseRouter.post("/enterprise/governance/exceptions", async (req, res) => {
  const parsed = exceptionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return handleError(res, "Invalid exception request: " + parsed.error.message);
  const repo = getRepository();
  const exception = await requestException({ repo, manager: new ConnectorManager(repo) }, parsed.data);
  res.status(201).json(exception);
});

const exceptionDecisionSchema = z.object({
  exceptionId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  decidedBy: z.string().min(1),
  reason: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(),
});

enterpriseRouter.post("/enterprise/governance/exceptions/:id/decide", async (req, res) => {
  const parsed = exceptionDecisionSchema.safeParse({ ...(req.body ?? {}), exceptionId: req.params.id });
  if (!parsed.success) return handleError(res, "Invalid exception decision: " + parsed.error.message);
  const repo = getRepository();
  const exception = await decideException({ repo, manager: new ConnectorManager(repo) }, parsed.data);
  res.json(exception);
});

// ---------------------------------------------------------------------------
// Findings: AI analysis grounded in evidence
// ---------------------------------------------------------------------------

enterpriseRouter.post("/findings/:id/analyze", async (req, res) => {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  const { finding, asset } = await findFindingForArticle(repo, manager, req.params.id);
  const evidence = await repo.evidenceForFinding(finding.id);
  const fallbackEvidence = evidence.length === 0 ? await repo.evidenceForAsset(asset.id) : evidence;
  const analysis = await analyzeFinding({ repo, manager }, finding, asset, fallbackEvidence);
  res.json(analysis);
});

async function findFindingForArticle(repo: Awaited<ReturnType<typeof getRepository>>, manager: ConnectorManager, findingId: string) {
  const scans = await repo.allAssetScans();
  for (const scan of scans) {
    const finding = scan.findings.find((f) => f.id === findingId);
    if (finding) {
      const asset = await repo.getAsset(scan.assetId);
      if (asset) return { finding, asset };
    }
  }
  throw new ApiError(404, "Finding not found");
}

// ---------------------------------------------------------------------------
// Remediation closed loop
// ---------------------------------------------------------------------------

const createSchema = z.object({ findingId: z.string().min(1), reason: z.string().optional() });

enterpriseRouter.post("/remediations", async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return handleError(res, "Invalid remediation request: " + parsed.error.message);
  const repo = getRepository();
  const rem = await createRemediation({ repo, manager: new ConnectorManager(repo) }, parsed.data.findingId, parsed.data.reason);
  res.status(201).json(rem);
});

enterpriseRouter.get("/remediations", async (_req, res) => {
  const repo = getRepository();
  const list = await repo.allRemediations();
  res.json(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

enterpriseRouter.get("/remediations/:id", async (req, res) => {
  const repo = getRepository();
  const rem = await repo.getRemediation(req.params.id);
  if (!rem) return handleError(res, "Remediation not found", 404);
  res.json(rem);
});

enterpriseRouter.post("/remediations/:id/validate", async (req, res) => {
  const repo = getRepository();
  const rem = await validateRemediation({ repo, manager: new ConnectorManager(repo) }, req.params.id, reviewerActor());
  res.json(rem);
});

enterpriseRouter.post("/remediations/:id/request-approval", async (req, res) => {
  const repo = getRepository();
  const rem = await requestApproval({ repo, manager: new ConnectorManager(repo) }, req.params.id, reviewerActor());
  res.json(rem);
});

enterpriseRouter.post("/remediations/:id/approve", async (req, res) => {
  const parsed = z.object({ comment: z.string().optional() }).safeParse(req.body ?? {});
  const comment = parsed.success ? parsed.data.comment : undefined;
  const repo = getRepository();
  const rem = await approveRemediation({ repo, manager: new ConnectorManager(repo) }, req.params.id, reviewerActor(), comment);
  res.json(rem);
});

enterpriseRouter.post("/remediations/:id/reject", async (req, res) => {
  const parsed = z.object({ reason: z.string().optional() }).safeParse(req.body ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;
  const repo = getRepository();
  const rem = await rejectRemediation({ repo, manager: new ConnectorManager(repo) }, req.params.id, reviewerActor(), reason);
  res.json(rem);
});

enterpriseRouter.post("/remediations/:id/execute", async (req, res) => {
  const repo = getRepository();
  const rem = await executeRemediation({ repo, manager: new ConnectorManager(repo) }, req.params.id, reviewerActor());
  res.json(rem);
});

enterpriseRouter.post("/remediations/:id/verify", async (req, res) => {
  const repo = getRepository();
  const rem = await verifyRemediation({ repo, manager: new ConnectorManager(repo) }, req.params.id, reviewerActor());
  res.json(rem);
});

enterpriseRouter.post("/remediations/:id/rollback", async (req, res) => {
  const parsed = z.object({ reason: z.string().optional() }).safeParse(req.body ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;
  const repo = getRepository();
  const rem = await rollbackRemediation({ repo, manager: new ConnectorManager(repo) }, req.params.id, reviewerActor(), reason);
  res.json(rem);
});

// ---------------------------------------------------------------------------
// Enterprise audit trail
// ---------------------------------------------------------------------------

enterpriseRouter.get("/audit", async (_req, res) => {
  const repo = getRepository();
  const all = await repo.allAuditEvents();
  const enterprise = all
    .filter((e) => ["asset", "evidence", "remediation", "connector", "governance"].includes(e.entityType))
    .sort((a, b) => b.at.localeCompare(a.at));
  res.json(enterprise);
});