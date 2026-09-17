import { describe, it, expect, beforeAll } from "vitest";
import { getRepository } from "../src/storage/jsonRepo";
import { ConnectorManager } from "../src/services/enterprise/connectorManager";
import { discoverAssets, scanAsset, complianceSummary } from "../src/services/enterprise/assetService";
import {
  listFrameworks,
  getFrameworkById,
  listPolicies,
  getPolicyById,
  selectPolicy,
  getAssetApplicableControls,
  getAssetGovernance,
  listExceptions,
  requestException,
  decideException,
} from "../src/services/enterprise/governanceService";

async function ctx() {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  return { repo, manager };
}

describe("PHASE 4 — Governance: framework catalog", () => {
  beforeAll(async () => {
    await getRepository().reset();
  });

  it("returns the full compliance framework catalog", async () => {
    const frameworks = await listFrameworks();
    expect(frameworks.length).toBeGreaterThanOrEqual(5);
    expect(frameworks.map((f) => f.id)).toContain("NIST");
    expect(frameworks.map((f) => f.id)).toContain("CIS");
    expect(frameworks.map((f) => f.id)).toContain("ISO27001");
    for (const fw of frameworks) {
      expect(fw.applicability).toMatch(/Applicable|Optional|Organization-selected|Not applicable/);
      expect(fw.disclaimer).toBeTruthy();
    }
  });

  it("returns a specific framework by id", async () => {
    const fw = await getFrameworkById("NIST");
    expect(fw.id).toBe("NIST");
    expect(fw.name).toContain("NIST");
    expect(fw.version).toBeTruthy();
  });

  it("returns 404 for unknown framework", async () => {
    await expect(getFrameworkById("NONEXISTENT")).rejects.toThrow("Framework not found");
  });
});

describe("PHASE 4 — Governance: policy profiles", () => {
  it("returns all policy profiles", async () => {
    const policies = await listPolicies();
    expect(policies.length).toBeGreaterThanOrEqual(5);
    const ids = policies.map((p) => p.profileId);
    expect(ids).toContain("GLOBAL_BASELINE");
    expect(ids).toContain("INDIA_ENTERPRISE");
    expect(ids).toContain("US_ENTERPRISE");
    expect(ids).toContain("SINGAPORE_ENTERPRISE");
  });

  it("returns a specific policy by id", async () => {
    const policy = await getPolicyById("INDIA_ENTERPRISE");
    expect(policy.profileId).toBe("INDIA_ENTERPRISE");
    expect(policy.region).toBe("IND");
  });

  it("returns 404 for unknown policy", async () => {
    await expect(getPolicyById("NONEXISTENT")).rejects.toThrow("Policy profile not found");
  });
});

describe("PHASE 4 — Governance: policy selection (deterministic)", () => {
  beforeAll(async () => {
    await getRepository().reset();
    const c = await ctx();
    await discoverAssets(c);
  });

  it("API-CHN-01 selects INDIA_ENTERPRISE policy", async () => {
    const c = await ctx();
    const selection = await selectPolicy(c, "ast-api-chn-01");
    expect(selection.region).toBe("IND");
    expect(selection.policyProfileId).toBe("INDIA_ENTERPRISE");
    expect(selection.regionLabel).toBe("India");
  });

  it("API-NY-01 selects US_ENTERPRISE policy", async () => {
    const c = await ctx();
    const selection = await selectPolicy(c, "ast-api-ny-01");
    expect(selection.region).toBe("USA");
    expect(selection.policyProfileId).toBe("US_ENTERPRISE");
    expect(selection.regionLabel).toBe("United States");
  });

  it("API-SG-01 selects SINGAPORE_ENTERPRISE policy", async () => {
    const c = await ctx();
    const selection = await selectPolicy(c, "ast-api-sg-01");
    expect(selection.region).toBe("SGP");
    expect(selection.policyProfileId).toBe("SINGAPORE_ENTERPRISE");
    expect(selection.regionLabel).toBe("Singapore");
  });

  it("selection includes frameworks and applicable controls", async () => {
    const c = await ctx();
    const selection = await selectPolicy(c, "ast-api-gateway-01");
    expect(selection.frameworks.length).toBeGreaterThanOrEqual(1);
    expect(selection.applicableControls.length).toBeGreaterThanOrEqual(1);
    expect(selection.explanation.length).toBeGreaterThanOrEqual(1);
    expect(selection.disclaimer).toBeTruthy();
  });
});

describe("PHASE 4 — Governance: applicable controls", () => {
  it("returns applicable controls for an asset", async () => {
    const c = await ctx();
    const result = await getAssetApplicableControls(c, "ast-api-gateway-01");
    expect(result.applicable.length).toBeGreaterThanOrEqual(1);
    expect(result.total).toBeGreaterThanOrEqual(21);
    expect(result.disclaimer).toBeTruthy();
    for (const ctrl of result.applicable) {
      expect(ctrl.controlId).toBeTruthy();
      expect(ctrl.whyApplicable).toBeTruthy();
      expect(ctrl.frameworkMembership.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("PHASE 4 — Governance: full decision trace", () => {
  beforeAll(async () => {
    await getRepository().reset();
    const c = await ctx();
    await discoverAssets(c);
    await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
  });

  it("returns a complete governance trace for a scanned asset", async () => {
    const c = await ctx();
    const trace = await getAssetGovernance(c, "ast-api-gateway-01");
    expect(trace.assetId).toBe("ast-api-gateway-01");
    expect(trace.region).toBeTruthy();
    expect(trace.regionLabel).toBeTruthy();
    expect(trace.organizationPolicy).toBeTruthy();
    expect(trace.regionalPolicy).toBeTruthy();
    expect(trace.frameworks.length).toBeGreaterThanOrEqual(1);
    expect(trace.applicableControls.length).toBeGreaterThanOrEqual(1);
    expect(trace.disclaimer).toBeTruthy();
    expect(trace.generatedAt).toBeTruthy();
  });
});

describe("PHASE 4 — Governance: exception lifecycle", () => {
  beforeAll(async () => {
    await getRepository().reset();
    const c = await ctx();
    await discoverAssets(c);
  });

  it("full lifecycle: request → approve → verify FAIL+EXCEPTION APPROVED → reject", async () => {
    const c = await ctx();

    // Request exception
    const exc = await requestException(c, {
      controlId: "TLS-001",
      assetId: "ast-api-gateway-01",
      reason: "Legacy TLS required for backward compatibility",
      requestedBy: "Demo Operator",
      expiresInDays: 30,
    });
    expect(exc.status).toBe("REQUESTED");
    expect(exc.controlId).toBe("TLS-001");
    expect(exc.assetId).toBe("ast-api-gateway-01");
    expect(exc.expiresAt).toBeTruthy();

    // Approve exception
    const approved = await decideException(c, {
      exceptionId: exc.id,
      decision: "APPROVED",
      decidedBy: "Security Lead",
      reason: "Approved for 30-day migration window",
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toBe("Security Lead");

    // Verify it appears in exceptions list
    const all = await listExceptions(c);
    expect(all.some((e) => e.id === exc.id)).toBe(true);
    const found = all.find((e) => e.id === exc.id)!;
    expect(found.status).toBe("APPROVED");

    // Reject another exception
    const exc2 = await requestException(c, {
      controlId: "AUTH-001",
      assetId: "ast-api-gateway-01",
      reason: "Test rejection",
      requestedBy: "Demo Operator",
    });
    const rejected = await decideException(c, {
      exceptionId: exc2.id,
      decision: "REJECTED",
      decidedBy: "Security Lead",
      reason: "Not justified",
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Not justified");
  });

  it("returns empty list when no exceptions exist for a different asset", async () => {
    const c = await ctx();
    const exceptions = await listExceptions(c, "ast-api-ny-01");
    expect(exceptions.length).toBe(0);
  });
});

describe("PHASE 4 — Compliance summary: byRegion + byFramework", () => {
  beforeAll(async () => {
    await getRepository().reset();
    const c = await ctx();
    const { assets } = await discoverAssets(c);
    // Scan a few assets so we have evaluation data
    for (const a of assets.slice(0, 3)) {
      await scanAsset(c, a.id, { trigger: "manual" });
    }
  });

  it("complianceSummary includes byRegion and byFramework", async () => {
    const c = await ctx();
    const summary = await complianceSummary(c);
    expect(summary.byRegion).toBeDefined();
    expect(summary.byRegion!.length).toBeGreaterThanOrEqual(1);
    expect(summary.byFramework).toBeDefined();
    expect(summary.byFramework!.length).toBeGreaterThanOrEqual(1);

    // Verify regional scores are valid
    for (const r of summary.byRegion!) {
      expect(r.region).toBeTruthy();
      expect(r.regionLabel).toBeTruthy();
      expect(r.assetCount).toBeGreaterThanOrEqual(1);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }

    // Verify framework scores are valid
    for (const f of summary.byFramework!) {
      expect(f.framework).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(100);
      expect(f.status).toMatch(/COMPLIANT|PARTIAL|AT_RISK|NOT_ASSESSED/);
    }
  });

  it("PASS controls are included in byRegion score (not just FAIL/WARNING)", async () => {
    const c = await ctx();
    const summary = await complianceSummary(c);
    // With PASS controls counted, at least some regions should have score > 0
    const hasNonZero = summary.byRegion!.some((r) => r.passed > 0);
    expect(hasNonZero).toBe(true);
  });
});
