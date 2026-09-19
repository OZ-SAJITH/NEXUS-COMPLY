import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AssetFinding, FindingBlastRadius, RemediationRecord } from "@nexus/shared-types";
import {
  buildRemediationIntelligence,
  changeRiskFor,
  confidenceFromEvidence,
  validateAiRemediationPlanShape,
  BASELINE_REMEDIATION_LABEL,
  INVENTORY,
  toAssetRecord,
  assetRelationships,
  type IntelligenceEvidenceInput,
  type RemediationIntelligenceInput,
} from "@nexus/enterprise-catalog";
import { getRepository } from "../src/storage/jsonRepo";
import { ConnectorManager } from "../src/services/enterprise/connectorManager";
import { discoverAssets, scanAsset } from "../src/services/enterprise/assetService";
import {
  analyzeRemediationIntelligence,
  listFindingRemediations,
} from "../src/services/enterprise/remediationService";
import { SYSTEM_REVIEWER } from "../src/services/auth";

function actor() {
  return { id: SYSTEM_REVIEWER.id, name: SYSTEM_REVIEWER.displayName, role: SYSTEM_REVIEWER.role };
}

function heroAsset() {
  return toAssetRecord(INVENTORY[0], assetRelationships());
}

function heroFinding(): AssetFinding {
  return {
    id: "f-hero-tls-001",
    auditId: "audit-hero",
    controlId: "TLS-001",
    controlName: "TLS minimum version",
    severity: "CRITICAL",
    status: "FAIL",
    what: "TLS 1.0 detected",
    why: "Observed TLS 1.0 below required TLS 1.2",
    where: "API-GATEWAY-01 tls configuration",
    impact: "Man-in-the-middle exposure of API traffic",
    recommendedFix: "Set minimum TLS version to 1.2",
    evidence: [],
    references: { controlId: "TLS-001" },
    risk: 84,
    observedValue: "TLS 1.0",
    expectedValue: "TLS 1.2",
    lifecycle: "OPEN",
    evidenceIds: [],
    assetId: heroAsset().id,
    assetType: "API",
    riskExplanation: { score: 84, band: "CRITICAL", summary: "test", factors: [] },
  };
}

function blastFixture(): FindingBlastRadius {
  return {
    affectedAssetCount: 3,
    affectedAssetIds: ["ast-web-payments", "ast-db-customer-core", "ast-mq-orders"],
    criticalAssetsAffected: 1,
    servicesAffected: 2,
    affectedServices: ["Web", "Database"],
    regionsAffected: ["IND"],
    crossRegion: false,
  };
}

function minimalInput(overrides: Partial<RemediationIntelligenceInput> = {}): RemediationIntelligenceInput {
  const finding = heroFinding();
  const asset = heroAsset();
  return {
    finding,
    asset,
    allAssets: INVENTORY.map((s) => toAssetRecord(s, assetRelationships())),
    evidence: [],
    riskContext: {
      findingId: finding.id,
      assetId: asset.id,
      assetName: asset.name,
      riskScore: finding.risk,
      riskLevel: "CRITICAL",
      severity: "CRITICAL",
      assetType: "API",
      assetCriticality: "CRITICAL",
      exposure: "INTERNET_FACING",
      impactScore: 22,
      blastRadius: blastFixture(),
      evidenceConfidence: 0.99,
      contributors: {
        assetCriticality: "CRITICAL",
        exposure: "INTERNET_FACING",
        severityContribution: 0,
        exposureContribution: 0,
        criticalityContribution: 0,
        importanceContribution: 0,
        exploitabilityContribution: 0,
        complianceImpact: "HIGH",
        evidenceConfidence: 0.99,
        dependencyImpact: "MEDIUM",
      },
      explanation: "test",
    },
    actionType: "SET_TLS_MIN_VERSION",
    id: "int-test-01",
    version: 1,
    createdBy: "tester",
    provider: "mock",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Catalog unit tests — deterministic intelligence generation.
// ---------------------------------------------------------------------------

describe("PHASE 6 — deterministic remediation intelligence (catalog)", () => {
  it("generates a structurally valid plan for TLS-001 with zero evidence", () => {
    const plan = buildRemediationIntelligence(minimalInput());
    expect(validateAiRemediationPlanShape(plan).ok).toBe(true);
    expect(plan.id).toBe("int-test-01");
    expect(plan.version).toBe(1);
    expect(plan.requiresApproval).toBe(true);
    expect(plan.provider).toBe("mock");
    expect(plan.source).toBe("deterministic");
  });

  it("marks root cause as INSUFFICIENT_EVIDENCE when evidence is empty", () => {
    const plan = buildRemediationIntelligence(minimalInput());
    expect(plan.rootCauseCertainty).toBe("INSUFFICIENT_EVIDENCE");
    expect(plan.evidenceUsed).toHaveLength(0);
    expect(plan.confidence).toBeLessThanOrEqual(0.65);
  });

  it("includes baseline label disclaimer for deterministic/mock plans", () => {
    const plan = buildRemediationIntelligence(minimalInput());
    expect(plan.disclaimer).toContain(BASELINE_REMEDIATION_LABEL);
  });

  it("TLS-001 produces SET_TLS_MIN_VERSION + ENFORCE_STRONG_CIPHERS actions", () => {
    const plan = buildRemediationIntelligence(minimalInput());
    const types = plan.recommendedActions.map((a) => a.actionType);
    expect(types).toContain("SET_TLS_MIN_VERSION");
    expect(types).toContain("ENFORCE_STRONG_CIPHERS");
    for (const a of plan.recommendedActions) {
      expect(a.target.length).toBeGreaterThan(0);
      expect(a.expectedState.length).toBeGreaterThan(0);
    }
  });

  it("rollback is AVAILABLE for TLS-001", () => {
    const plan = buildRemediationIntelligence(minimalInput());
    expect(plan.rollbackStatus).toBe("AVAILABLE");
  });

  it("rejects a malformed plan", () => {
    expect(validateAiRemediationPlanShape({ foo: 1 }).ok).toBe(false);
    expect(validateAiRemediationPlanShape(null).ok).toBe(false);
    expect(validateAiRemediationPlanShape(undefined).ok).toBe(false);
  });

  it("confidence is 0.30 when no evidence is provided", () => {
    expect(confidenceFromEvidence([])).toBe(0.3);
  });

  it("evidence-grounded root cause when verified evidence is supplied", () => {
    const evidence: IntelligenceEvidenceInput[] = [
      {
        id: "ev-01",
        evidenceId: "ev-tls-001",
        controlId: "TLS-001",
        evidenceType: "TLS",
        observedValue: "TLS 1.0",
        expectedValue: "TLS 1.2",
        source: "scan",
        integrityHash: "abc123",
        verification: { verified: true },
      },
    ];
    const plan = buildRemediationIntelligence(minimalInput({ evidence }));
    expect(plan.rootCauseCertainty).toBe("EVIDENCE_GROUNDED");
    expect(plan.evidenceUsed.length).toBeGreaterThanOrEqual(1);
    expect(plan.evidenceUsed[0].observedValue).toBe("TLS 1.0");
    expect(plan.evidenceUsed[0].verified).toBe(true);
    expect(plan.confidence).toBeGreaterThan(0.65);
  });

  it("DB-001 produces a structured database-encryption plan with no fabricated vendor commands", () => {
    const dbAsset = toAssetRecord(
      INVENTORY.find((a) => a.id === "ast-db-customer-core")!,
      assetRelationships(),
    );
    const finding: AssetFinding = {
      ...heroFinding(),
      id: "f-db-001",
      controlId: "DB-001",
      controlName: "Database Encryption at Rest",
      severity: "HIGH",
      what: "Database encryption at rest is disabled",
      why: "Observed encryption disabled where enabled is required",
      observedValue: "disabled",
      expectedValue: "enabled",
      assetId: dbAsset.id,
      assetType: "DATABASE",
    };
    const base = minimalInput();
    const plan = buildRemediationIntelligence({
      ...base,
      finding,
      asset: dbAsset,
      actionType: "ENABLE_DB_ENCRYPTION",
      riskContext: {
        ...base.riskContext,
        findingId: finding.id,
        assetId: dbAsset.id,
        assetName: dbAsset.name,
        assetType: "DATABASE",
        exposure: "INTERNAL",
        impactScore: 11,
        blastRadius: {
          ...blastFixture(),
          affectedAssetCount: 1,
          affectedAssetIds: [dbAsset.id],
          criticalAssetsAffected: 1,
          affectedServices: ["Database"],
        },
      },
    });
    expect(validateAiRemediationPlanShape(plan).ok).toBe(true);
    expect(plan.requiresApproval).toBe(true);
    expect(plan.recommendedActions.map((a) => a.actionType)).toContain("ENABLE_DB_ENCRYPTION");
    expect(plan.preChecks.length).toBeGreaterThan(0);
    expect(plan.validationSteps.length).toBeGreaterThan(0);
    expect(plan.rollbackSteps.length).toBeGreaterThan(0);
    expect(plan.rollbackStatus).toBe("AVAILABLE");
    for (const a of plan.recommendedActions) {
      expect(a.action).not.toMatch(/\b(psql|ALTER\s+SYSTEM|aws\s+rds|kubectl|ssh)\b/i);
    }
  });

  it("change risk is deterministic across repeated calls", () => {
    const a = changeRiskFor({
      actionImpact: "MEDIUM",
      exposure: "INTERNET_FACING",
      environment: "PROD_SIM",
      blast: { affectedAssetCount: 3, affectedAssetIds: [], criticalAssetsAffected: 1, servicesAffected: 2, affectedServices: ["Web", "Database"], regionsAffected: ["IND"], crossRegion: false },
      rollbackAvailable: true,
      destructiveInProd: false,
      connectorAuthorized: true,
    });
    const b = changeRiskFor({
      actionImpact: "MEDIUM",
      exposure: "INTERNET_FACING",
      environment: "PROD_SIM",
      blast: { affectedAssetCount: 3, affectedAssetIds: [], criticalAssetsAffected: 1, servicesAffected: 2, affectedServices: ["Web", "Database"], regionsAffected: ["IND"], crossRegion: false },
      rollbackAvailable: true,
      destructiveInProd: false,
      connectorAuthorized: true,
    });
    expect(a.risk).toBe(b.risk);
    expect(a.reason).toBe(b.reason);
  });

  it("change risk becomes REVIEW_REQUIRED when rollback is unavailable", () => {
    const result = changeRiskFor({
      actionImpact: "LOW",
      exposure: "INTERNAL",
      environment: "DEVELOPMENT",
      blast: { affectedAssetCount: 0, affectedAssetIds: [], criticalAssetsAffected: 0, servicesAffected: 0, affectedServices: [], regionsAffected: [], crossRegion: false },
      rollbackAvailable: false,
      destructiveInProd: false,
      connectorAuthorized: true,
    });
    expect(result.risk).toBe("REVIEW_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// Service integration — analyzeRemediationIntelligence against live repo.
// ---------------------------------------------------------------------------

describe("PHASE 6 — analyzeRemediationIntelligence (service integration)", () => {
  beforeEach(async () => {
    await getRepository().reset();
    const repo = getRepository();
    const manager = new ConnectorManager(repo);
    await discoverAssets({ repo, manager });
    await scanAsset({ repo, manager }, "ast-api-gateway-01", { trigger: "manual" });
  });

  async function ctx() {
    const repo = getRepository();
    const manager = new ConnectorManager(repo);
    return { repo, manager };
  }

  async function tlsFinding() {
    const c = await ctx();
    const scan = (await c.repo.scansForAsset("ast-api-gateway-01"))[0];
    return { c, finding: scan.findings.find((f) => f.controlId === "TLS-001")! };
  }

  it("returns a RemediationRecord enriched with intelligence", async () => {
    const { c, finding } = await tlsFinding();
    const rem: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    expect(rem.status).toBe("PLANNED");
    expect(rem.intelligence).toBeDefined();
    expect(rem.intelligence!.requiresApproval).toBe(true);
    expect(rem.intelligence!.provider).toBe("mock");
    expect(rem.intelligence!.source).toBe("deterministic");
    expect(rem.intelligence!.version).toBe(1);
    expect(rem.planVersions).toBeDefined();
    expect(rem.planVersions!.length).toBe(1);
    expect(rem.planVersions![0].version).toBe(1);
    expect(rem.planVersions![0].approvalStatus).toBe("NONE");
    expect(rem.planVersions![0].executionStatus).toBe("NOT_EXECUTED");
  });

  it("disclaimer contains baseline label for deterministic plans", async () => {
    const { c, finding } = await tlsFinding();
    const rem: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    expect(rem.intelligence!.disclaimer).toContain(BASELINE_REMEDIATION_LABEL);
  });

  it("rollback is AVAILABLE for TLS remediation in the service", async () => {
    const { c, finding } = await tlsFinding();
    const rem: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    expect(rem.intelligence!.rollbackStatus).toBe("AVAILABLE");
  });

  it("evidence used is non-empty (from scan evidence)", async () => {
    const { c, finding } = await tlsFinding();
    const rem: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    expect(rem.intelligence!.evidenceUsed.length).toBeGreaterThan(0);
    expect(rem.intelligence!.evidenceUsed[0].hash.length).toBeGreaterThan(0);
  });

  it("increments version on a subsequent analyze for the same finding", async () => {
    const { c, finding } = await tlsFinding();
    const rem1: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    const rem1v = rem1.intelligence!.version;
    const rem1pv = rem1.planVersions!.length;
    const rem2: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    expect(rem2.id).toBe(rem1.id);
    expect(rem2.intelligence!.version).toBe(rem1v + 1);
    expect(rem2.planVersions!.length).toBe(rem1pv + 1);
    expect(rem2.planVersions![rem2.planVersions!.length - 1].version).toBe(rem2.intelligence!.version);
  });

  it("status remains PLANNED after intelligence generation", async () => {
    const { c, finding } = await tlsFinding();
    const rem: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    expect(rem.status).toBe("PLANNED");
  });

  it("audit event AI_REMEDIATION_INTELLIGENCE_GENERATED is logged with the current plan", async () => {
    const { c, finding } = await tlsFinding();
    const rem: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    const events = await c.repo.allAuditEvents();
    const intelEvents = events
      .filter((e) => e.eventType === "AI_REMEDIATION_INTELLIGENCE_GENERATED" && e.entityId === rem.id)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    expect(intelEvents.length).toBeGreaterThan(0);
    const intelEvent = intelEvents[0];
    expect(intelEvent!.entityType).toBe("remediation");
    expect(intelEvent!.source).toBe("ai");
    expect(intelEvent!.detail).toMatchObject({
      intelligenceId: rem.intelligence!.id,
      version: rem.intelligence!.version,
      source: "deterministic",
      provider: "mock",
      requiresApproval: true,
    });
  });

  it("listFindingRemediations returns the enriched remediation for that finding", async () => {
    const { c, finding } = await tlsFinding();
    await analyzeRemediationIntelligence(c, finding.id, actor());
    const rems = await listFindingRemediations(c, finding.id);
    expect(rems.length).toBeGreaterThanOrEqual(1);
    expect(rems.some((r) => r.intelligence != null)).toBe(true);
  });

  it("change risk from live service matches catalog calculation", async () => {
    const { c, finding } = await tlsFinding();
    const rem: RemediationRecord = await analyzeRemediationIntelligence(c, finding.id, actor());
    const asset = (await c.repo.allAssets()).find((a) => a.id === rem.assetId)!;
    const blast = rem.intelligence!.blastRadius;
    const expected = changeRiskFor({
      actionImpact: "MEDIUM",
      exposure: "INTERNET_FACING",
      environment: asset.environment,
      blast,
      rollbackAvailable: true,
      destructiveInProd: false,
      connectorAuthorized: true,
    });
    expect(rem.intelligence!.changeRisk).toBe(expected.risk);
  });
});

// ---------------------------------------------------------------------------
// Live-provider enrichment + honest fallback (PHASE 6 §19/§29).
// ---------------------------------------------------------------------------

describe("PHASE 6 — live AI remediation enrichment and fallback", () => {
  const savedEnv = { provider: process.env.AI_PROVIDER, url: process.env.AI_SERVICE_URL };

  function stopServer(server: Server): Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  function startMockAi(respond: (body: unknown) => { status: number; json: Record<string, unknown> }): Promise<{ server: Server; base: string }> {
    return new Promise((resolve) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const out = respond(body);
          res.writeHead(out.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(out.json));
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as { port: number };
        resolve({ server, base: `http://127.0.0.1:${address.port}` });
      });
    });
  }

  beforeEach(async () => {
    process.env.AI_PROVIDER = "live";
    await getRepository().reset();
    const repo = getRepository();
    const manager = new ConnectorManager(repo);
    await discoverAssets({ repo, manager });
    await scanAsset({ repo, manager }, "ast-api-gateway-01", { trigger: "manual" });
  });

  afterEach(() => {
    process.env.AI_PROVIDER = savedEnv.provider;
    process.env.AI_SERVICE_URL = savedEnv.url;
  });

  async function ctx() {
    const repo = getRepository();
    const manager = new ConnectorManager(repo);
    return { repo, manager };
  }

  async function tlsFinding() {
    const c = await ctx();
    const scan = (await c.repo.scansForAsset("ast-api-gateway-01"))[0];
    return { c, finding: scan.findings.find((f) => f.controlId === "TLS-001")! };
  }

  it("applies live prose overrides onto the deterministic plan (source=ai, provider=live)", async () => {
    let received: Record<string, unknown> | null = null;
    const { server, base } = await startMockAi((body) => {
      received = body as Record<string, unknown>;
      return {
        status: 200,
        json: {
          findingId: "f-hero",
          summary: "Live summary for TLS-001 on API-GATEWAY-01.",
          rootCause: "Live root cause grounded in supplied evidence.",
          potentialImpact: "Live potential impact — never a confirmed compromise.",
          changeRiskReason: "Classified HIGH — live enrichment.",
          confidence: 0.88,
        },
      };
    });
    process.env.AI_SERVICE_URL = base;
    try {
      const { c, finding } = await tlsFinding();
      const rem = await analyzeRemediationIntelligence(c, finding.id, actor());
      expect(rem.intelligence!.source).toBe("ai");
      expect(rem.intelligence!.provider).toBe("live");
      expect(rem.intelligence!.summary).toBe("Live summary for TLS-001 on API-GATEWAY-01.");
      expect(rem.intelligence!.rootCause).toBe("Live root cause grounded in supplied evidence.");
      expect(rem.intelligence!.confidence).toBe(0.88);
      expect(rem.intelligence!.requiresApproval).toBe(true);
      expect(validateAiRemediationPlanShape(rem.intelligence).ok).toBe(true);

      // §29: the system prompt safety contract is sent verbatim.
      if (received == null) throw new Error("expected the live AI service to have been called");
      const raw: Record<string, unknown> = received;
      expect(String(raw["systemPrompt"])).toContain("You are a security remediation planning assistant");
      expect(String(raw["systemPrompt"])).toContain("Never invent evidence");
      // §3: structured context only — no hidden application state.
      expect((raw["finding"] as Record<string, unknown>)["controlId"]).toBe("TLS-001");
      expect(Array.isArray(raw["evidence"])).toBe(true);
      const blast = (raw["riskContext"] as Record<string, unknown>)["blastRadius"];
      expect(typeof blast === "object" && blast !== null).toBe(true);
      const conn = raw["connector"];
      if (conn) expect(Array.isArray((conn as Record<string, unknown>)["authorizedActions"])).toBe(true);
    } finally {
      await stopServer(server);
    }
  });

  it("falls back to baseline guidance (provider=mock) when the live AI call fails", async () => {
    const { server, base } = await startMockAi(() => ({ status: 503, json: {} }));
    process.env.AI_SERVICE_URL = base;
    try {
      const { c, finding } = await tlsFinding();
      const rem = await analyzeRemediationIntelligence(c, finding.id, actor());
      expect(rem.intelligence!.source).toBe("deterministic");
      expect(rem.intelligence!.provider).toBe("mock");
      expect(rem.intelligence!.disclaimer).toContain(BASELINE_REMEDIATION_LABEL);
      expect(rem.intelligence!.requiresApproval).toBe(true);
      expect(validateAiRemediationPlanShape(rem.intelligence).ok).toBe(true);
    } finally {
      await stopServer(server);
    }
  });
});
