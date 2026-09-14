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
  discoverAssets,
  ensureAssets,
  evidenceDetail,
  scanAsset,
  testAssetConnector,
  ENTERPRISE_REGIONS,
  ENTERPRISE_TIERS,
  enterpriseTopologyConnections,
} from "../services/enterprise/assetService";
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

enterpriseRouter.get("/frameworks", async (_req, res) => {
  const repo = getRepository();
  const catalogue = await assetControlCatalogue({ repo, manager: new ConnectorManager(repo) });
  res.json(catalogue.frameworks);
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
    .filter((e) => ["asset", "evidence", "remediation", "connector"].includes(e.entityType))
    .sort((a, b) => b.at.localeCompare(a.at));
  res.json(enterprise);
});