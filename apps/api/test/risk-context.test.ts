import { describe, it, expect, beforeAll } from "vitest";
import type { AssetRecord, AssetRelationship } from "@nexus/shared-types";
import {
  INVENTORY,
  assetRelationships,
  buildFindingRiskContext,
  buildImpactGraph,
  explainableRisk,
  exposurePathForAsset,
  findingBlastRadius,
  impactScoreFor,
  networkExposureOfAsset,
  toAssetRecord,
} from "@nexus/enterprise-catalog";
import { getRepository } from "../src/storage/jsonRepo";
import { ConnectorManager } from "../src/services/enterprise/connectorManager";
import { discoverAssets, scanAsset, findingRiskContext, findingExposurePath } from "../src/services/enterprise/assetService";

// ---------------------------------------------------------------------------
// PHASE 5 — deterministic risk prioritization, blast radius, exposure path.
// All expectations are derived from the controlled simulated catalog + the
// established risk model (severity 35% / exposure 30% / criticality 15% /
// importance 10% / exploitability 10%; bands CRITICAL ≥80, HIGH ≥60, MEDIUM
// ≥40, LOW <40). Nothing is hard-coded.
// ---------------------------------------------------------------------------

function estate(): AssetRecord[] {
  return INVENTORY.map((s) => toAssetRecord(s, assetRelationships()));
}

function hero(): AssetRecord {
  return estate().find((a) => a.id === "ast-api-gateway-01")!;
}

function link(from: string, to: string, relation: AssetRelationship["relation"]): AssetRelationship {
  return { id: `rel-${from}-${to}`, fromAssetId: from, toAssetId: to, relation, status: "ALLOWED" };
}

describe("PHASE 5 — network exposure derivation", () => {
  it("maps the internet-facing API to INTERNET_FACING deterministically", () => {
    expect(networkExposureOfAsset(hero())).toBe("INTERNET_FACING");
  });

  it("derives the same class for identical inputs", () => {
    expect(networkExposureOfAsset(hero())).toBe(networkExposureOfAsset(hero()));
  });

  it("classifies an untagged management asset as RESTRICTED", () => {
    const mgmt = { ...hero(), id: "mgmt", tags: [], location: { ...hero().location, networkZone: "MGMT" } };
    expect(networkExposureOfAsset(mgmt)).toBe("RESTRICTED");
  });
});

describe("PHASE 5 — deterministic contextual risk", () => {
  it("is deterministic: same finding + same context → same risk", () => {
    const a = explainableRisk(hero(), "CRITICAL", { evidence: ["tls 1.0"] });
    const b = explainableRisk(hero(), "CRITICAL", { evidence: ["tls 1.0"] });
    expect(a.score).toBe(b.score);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("higher asset criticality increases contextual risk (formula calls for it)", () => {
    const low = { ...hero(), id: "api-low", name: "API-LOW", criticality: "LOW" as const, relationships: [] };
    const crit = { ...hero(), id: "api-crit", name: "API-CRIT", criticality: "CRITICAL" as const, relationships: [] };
    const lowScore = explainableRisk(low, "HIGH", { evidence: ["tls 1.0"] }).score;
    const critScore = explainableRisk(crit, "HIGH", { evidence: ["tls 1.0"] }).score;
    expect(critScore).toBeGreaterThan(lowScore);
  });

  it("internet exposure increases risk where configured", () => {
    const exposed = hero();
    const internal = { ...hero(), id: "api-internal", name: "API-INTERNAL", tags: [], relationships: [] };
    const exposedRisk = explainableRisk(exposed, "HIGH", {});
    const internalRisk = explainableRisk(internal, "HIGH", {});
    const exposureContribution = (r: typeof exposedRisk) => r.factors.find((f) => f.factor === "exposure")!.contribution;
    expect(exposureContribution(exposedRisk)).toBeGreaterThan(exposureContribution(internalRisk));
    expect(exposedRisk.score).toBeGreaterThan(internalRisk.score);
  });

  it("production internet-facing API outranks an isolated development server for the same TLS gap", () => {
    const prod = hero();
    const dev = { ...hero(), id: "api-dev", name: "API-DEV", environment: "DEVELOPMENT" as const, criticality: "LOW" as const, tags: [], relationships: [] };
    expect(explainableRisk(prod, "CRITICAL", {}).score).toBeGreaterThan(explainableRisk(dev, "CRITICAL", {}).score);
  });
});

describe("PHASE 5 — blast radius", () => {
  it("counts downstream assets, critical assets and regions for the hero API", () => {
    const blast = findingBlastRadius(hero(), estate());
    expect(blast.affectedAssetCount).toBeGreaterThan(0);
    expect(blast.affectedAssetIds.length).toBe(blast.affectedAssetCount);
    expect(blast.criticalAssetsAffected).toBeGreaterThan(0);
    expect(blast.regionsAffected).toContain("IND");
    expect([...blast.regionsAffected]).toEqual([...blast.regionsAffected].sort());
  });

  it("an isolated asset has a smaller (zero) blast radius", () => {
    const isolated = { ...hero(), id: "isolated", name: "ISO-01", relationships: [] };
    const blast = findingBlastRadius(isolated, estate());
    expect(blast.affectedAssetCount).toBe(0);
    expect(impactScoreFor(isolated, estate(), blast)).toBeLessThan(impactScoreFor(hero(), estate()));
  });

  it("more critical downstream dependencies increases potential impact", () => {
    const iso = { ...hero(), id: "api-iso", name: "API-ISO", tags: [] };
    const dbLow = { ...hero(), id: "db-low", name: "DB-LOW", assetType: "DATABASE" as const, criticality: "LOW" as const, tags: [], relationships: [] };
    const estateLow = [iso, dbLow];
    const impactBase = impactScoreFor(iso, estateLow);
    const dbCrit = { ...dbLow, id: "db-crit", name: "DB-CRIT", criticality: "CRITICAL" as const };
    const isoCrit = { ...iso, relationships: [link("api-iso", "db-crit", "dependsOn")] };
    const estateCrit = [isoCrit, dbCrit];
    const impactCrit = impactScoreFor(isoCrit, estateCrit);
    expect(impactCrit).toBeGreaterThan(impactBase);
  });

  it("cross-region is only reported when relationships justify it", () => {
    const cascade = estate().filter((a) => a.id === "ast-api-gateway-01" || a.id === "ast-db-customer-core");
    const blast = findingBlastRadius(hero(), cascade);
    for (const region of blast.regionsAffected) {
      expect(cascade.some((a) => a.location.region === region)).toBe(true);
    }
  });
});

describe("PHASE 5 — bounded graph traversal", () => {
  it("terminates on a cyclic dependency without infinite loops", () => {
    const cycA = { ...hero(), id: "cyc-a", name: "CYC-A", relationships: [link("cyc-a", "cyc-b", "dependsOn")] };
    const cycB = { ...hero(), id: "cyc-b", name: "CYC-B", relationships: [link("cyc-b", "cyc-a", "connectsTo")] };
    const graph = buildImpactGraph(cycA, [cycA, cycB]);
    expect(graph.nodes.length).toBeLessThan(10);
    const blast = findingBlastRadius(cycA, [cycA, cycB]);
    expect(blast.affectedAssetCount).toBe(1);
  });

  it("exposure-path traversal stays bounded on a deep chain", () => {
    const path = exposurePathForAsset(hero(), estate());
    expect(path.depth).toBeLessThanOrEqual(8);
    expect(path.potential).toBe(true);
    expect(path.label).toBe("Potential exposure path");
    expect(path.path[0].kind).toBe("internet");
  });

  it("the hero exposure path runs Internet → edge device → API", () => {
    const path = exposurePathForAsset(hero(), estate());
    const names = path.path.map((h) => h.name);
    expect(names[0]).toBe("Internet");
    expect(path.path.some((h) => h.kind === "edge")).toBe(true);
  });
});

describe("PHASE 5 — finding risk context", () => {
  it("risk context explanation matches the score contributors", () => {
    const explanation = explainableRisk(hero(), "CRITICAL", { evidence: [], protocol: "https" });
    const context = buildFindingRiskContext({
      findingId: "f-hero",
      severity: "CRITICAL",
      asset: hero(),
      allAssets: estate(),
      riskExplanation: explanation,
      evidenceConfidence: 0.99,
    });
    expect(context.riskScore).toBe(explanation.score);
    expect(context.riskLevel).toBe(explanation.band);
    expect(context.exposure).toBe("INTERNET_FACING");
    expect(context.contributors.severityContribution).toBe(explanation.factors.find((f) => f.factor === "severity")!.contribution);
    expect(context.contributors.exposureContribution).toBe(explanation.factors.find((f) => f.factor === "exposure")!.contribution);
    expect(context.contributors.criticalityContribution).toBe(explanation.factors.find((f) => f.factor === "criticality")!.contribution);
    expect(context.explanation).toContain(`${explanation.score}/100`);
    expect(context.explanation).toContain("internet-facing");
  });

  it("is fully deterministic across repeated computation", () => {
    const input = { findingId: "f-hero", severity: "CRITICAL" as const, asset: hero(), allAssets: estate(), evidenceConfidence: 0.99 };
    expect(JSON.stringify(buildFindingRiskContext(input))).toBe(JSON.stringify(buildFindingRiskContext(input)));
  });
});

describe("PHASE 5 — service integration (API mirrors the catalogue functions)", () => {
  beforeAll(async () => {
    await getRepository().reset();
  });

  async function ctx() {
    const repo = getRepository();
    const manager = new ConnectorManager(repo);
    return { repo, manager };
  }

  it("serves a finding risk context with exposure, blast radius and impact for TLS-001", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const scan = await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
    const finding = scan.findings.find((f) => f.controlId === "TLS-001")!;
    const context = await findingRiskContext(c, finding.id);
    expect(context.findingId).toBe(finding.id);
    expect(context.exposure).toBe("INTERNET_FACING");
    expect(context.riskScore).toBe(finding.risk);
    expect(context.riskLevel).toBe("CRITICAL");
    expect(context.impactScore).toBeGreaterThan(0);
    expect(context.blastRadius.affectedAssetCount).toBeGreaterThan(0);
    expect(context.evidenceConfidence).toBeGreaterThan(0);
  });

  it("serves a bounded potential exposure path for the hero asset", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const path = await findingExposurePath(c, "ast-api-gateway-01");
    expect(path.rootAssetId).toBe("ast-api-gateway-01");
    expect(path.path[0].name).toBe("Internet");
    expect(path.disclaimer).toContain("potential");
  });
});