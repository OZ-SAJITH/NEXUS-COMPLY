import { describe, it, expect, beforeAll } from "vitest";
import { getRepository } from "../src/storage/jsonRepo";
import { ConnectorManager } from "../src/services/enterprise/connectorManager";
import {
  discoverAssets,
  ensureAssets,
  scanAsset,
  assetImpact,
  assetControlCatalogue,
  findAssetFinding,
  assetConnectorProfile,
  testAssetConnector,
  evidenceDetail,
} from "../src/services/enterprise/assetService";
import { analyzeFinding } from "../src/services/enterprise/aiAnalysisService";
import { verifyEvidenceRecord, seededConnectors, upgradeStoredEvidenceIntegrity } from "@nexus/enterprise-catalog";

async function ctx() {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  return { repo, manager };
}

describe("Enterprise asset discovery", () => {
  beforeAll(async () => {
    await getRepository().reset();
  });

  it("discovers the full deterministic simulated catalog", async () => {
    const c = await ctx();
    const { result } = await discoverAssets(c);
    expect(result.assets.length).toBeGreaterThanOrEqual(22);
    const hero = result.assets.find((a) => a.id === "ast-api-gateway-01");
    expect(hero).toBeDefined();
    expect(hero!.name).toBe("API-GATEWAY-01");
    expect(hero!.observedState.tlsMinVersion).toBe("1.0");
  });

  it("keeps observed state across re-discovery (no reset of remediated assets)", async () => {
    const c = await ctx();
    await ensureAssets(c);
    const first = await discoverAssets(c);
    const again = await discoverAssets(c);
    expect(again.result.assets.length).toBe(first.result.assets.length);
    const hero = again.assets.find((a) => a.id === "ast-api-gateway-01");
    expect(hero!.observedState.tlsMinVersion).toBe("1.0");
  });
});

describe("Enterprise scan → evidence → findings → risk", () => {
  it("scans API-GATEWAY-01 and produces the TLS-001 CRITICAL finding with explainable risk", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const scan = await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
    expect(scan.status).toBe("COMPLETED");
    const finding = scan.findings.find((f) => f.controlId === "TLS-001");
    expect(finding).toBeDefined();
    expect(finding!.status).toBe("FAIL");
    expect(finding!.severity).toBe("CRITICAL");
    expect(finding!.risk).toBeGreaterThanOrEqual(80);
    expect(finding!.riskExplanation?.band).toBe("CRITICAL");
    expect(finding!.evidenceIds.length).toBeGreaterThan(0);

    const evidence = await c.repo.evidenceForFinding(finding!.id);
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].integrityHash).toMatch(/^[0-9a-f]{64}$/);

    const asset = await c.repo.getAsset("ast-api-gateway-01");
    expect(asset!.complianceStatus).toBe("FAIL");
    expect(asset!.lastScannedAt).toBeDefined();
  });

  it("re-scan after TLS action flips TLS-001 to PASS (deterministic re-evaluation)", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const asset = await c.repo.getAsset("ast-api-gateway-01");
    asset!.observedState.tlsMinVersion = "1.2";
    await c.repo.saveAsset(asset!);
    const scan = await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
    expect(scan.findings.some((f) => f.controlId === "TLS-001")).toBe(false);
    const evidence = await c.repo.evidenceForAsset("ast-api-gateway-01");
    const tlsEvidence = evidence.find((e) => e.controlId === "TLS-001");
    expect(tlsEvidence?.status).toBe("PASS");
  });

  it("builds an impact graph with business destination", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const graph = await assetImpact(c, "ast-api-gateway-01");
    expect(graph.nodes.some((n) => n.id === "ast-api-gateway-01")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "business")).toBe(true);
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("AI analysis grounded in evidence", () => {
  it("produces an evidence-grounded 8-part analysis for the hero finding", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const asset = await c.repo.getAsset("ast-api-gateway-01");
    asset!.observedState.tlsMinVersion = "1.0";
    await c.repo.saveAsset(asset!);
    const scan = await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
    const finding = scan.findings.find((f) => f.controlId === "TLS-001")!;
    const { asset: heroAsset } = await findAssetFinding(c, finding.id);
    const evidence = await c.repo.evidenceForFinding(finding.id);
    const analysis = await analyzeFinding(c, finding, heroAsset, evidence);
    expect(analysis.analysis.explanation.length).toBeGreaterThan(10);
    expect(analysis.analysis.executiveSummary).toMatch(/evidence-grounded risk/i);
    expect(analysis.evidenceSummary.evidenceAvailable).toBe(true);
    expect(analysis.provider).toBe("mock");
  });
});

describe("Asset control catalogue & frameworks", () => {
  it("returns controls and framework coverage", async () => {
    const c = await ctx();
    const catalogue = await assetControlCatalogue(c);
    expect(catalogue.controls.length).toBe(16);
    expect(catalogue.frameworks.length).toBe(6);
    const nist = catalogue.frameworks.find((f) => f.framework === "NIST");
    expect(nist).toBeDefined();
    expect(nist!.status).toMatch(/COMPLIANT|PARTIAL|AT_RISK|NOT_ASSESSED/);
  });
});

describe("PHASE 2 — connector abstraction + evidence integrity", () => {
  it("seeds the full multi-vendor connector catalogue (17 adapters) with transports/protocols", async () => {
    const seeds = seededConnectors();
    expect(seeds.length).toBe(17);
    const windows = seeds.find((c) => c.id === "conn-srv-02");
    expect(windows?.transportType).toBe("AGENT");
    expect(windows?.protocol).toBe("WINRM");
    expect(windows?.capabilities).toContain("OS_INFO");
    const paloAlto = seeds.find((c) => c.vendor === "Palo Alto");
    expect(paloAlto?.transportType).toBe("HTTPS_API");
    const fortinet = seeds.find((c) => c.vendor === "Fortinet");
    expect(fortinet?.transportType).toBe("HTTPS_API");
    expect(fortinet?.protocol).toBe("HTTPS");
    for (const c of seeds) {
      if (c.status === "ONLINE") {
        expect(c.latencyMs).toBeGreaterThan(0);
      }
      expect(c.capabilities?.length).toBeGreaterThan(0);
    }
  });

  it("recognizes the Linux server adapter and merges it into an existing repo without clobbering", async () => {
    const c = await ctx();
    await getRepository().reset();
    await c.manager.ensureSeeded();
    const before = (await c.repo.allConnectors()).length;
    expect(before).toBe(17);
    const existing = await c.repo.allConnectors();
    const first = existing[0];
    first!.name = "MANUALLY-RENAMED";
    await c.repo.saveConnector(first!);
    await c.manager.ensureSeeded();
    const after = await c.repo.allConnectors();
    expect(after.length).toBe(17);
    expect(after.find((x) => x.id === first!.id)!.name).toBe("MANUALLY-RENAMED");
  });

  it("resolves a connector profile with capabilities for API-GATEWAY-01", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const profile = await assetConnectorProfile(c, "ast-api-gateway-01");
    expect(profile.assetId).toBe("ast-api-gateway-01");
    expect(profile.online).toBe(true);
    expect(profile.connector).toBeDefined();
    expect(profile.connector!.vendor).toBe("Kong");
    expect(profile.connector!.protocol).toBe("HTTPS");
    expect(profile.fromCapabilities.length).toBeGreaterThan(0);
    expect(profile.latencyMs).toBeGreaterThan(0);
  });

  it("tests the asset's connector and reports latency/transport/protocol", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const result = await testAssetConnector(c, "ast-api-gateway-01");
    expect(result.ok).toBe(true);
    expect(result.connectorId).toBe("conn-app-01");
    expect(result.status).toBe("ONLINE");
    expect(result.transportType).toBe("HTTPS_API");
    expect(result.protocol).toBe("HTTPS");
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it("returns a 404-shaped profile + failed test for an unknown asset", async () => {
    const c = await ctx();
    await expect(assetConnectorProfile(c, "ast-nope")).rejects.toMatchObject({ status: 404 });
  });

  it("collects normalized evidence with REAL SHA-256 integrity that verifies", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const scan = await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
    expect(scan.evidenceIds.length).toBeGreaterThan(scan.findings.length);
    const evidence = await c.repo.evidenceForAsset("ast-api-gateway-01");
    expect(evidence.length).toBeGreaterThanOrEqual(13);
    const tls = evidence.find((e) => e.controlId === "TLS-001");
    expect(tls).toBeDefined();
    expect(tls!.evidenceType).toBe("TLS");
    expect(tls!.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    const verification = verifyEvidenceRecord(tls!);
    expect(verification.verified).toBe(true);
    expect(verification.hash).toBe(tls!.integrityHash);
  });

  it("verifies evidence detail with a derived (not stored) integrity verification", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const evidence = await c.repo.evidenceForAsset("ast-api-gateway-01");
    const first = evidence.find((e) => e.controlId === "TLS-001")!;
    const detail = await evidenceDetail(c, "ast-api-gateway-01", first.id);
    expect(detail.id).toBe(first.id);
    expect(detail.verification.verified).toBe(true);
    expect(detail.verification.hash).toHaveLength(64);
    expect(detail.verification.canonical).toContain("NEXUS-EVIDENCE-1");
  });

  it("rejects evidence that belongs to another asset", async () => {
    const c = await ctx();
    await discoverAssets(c);
    const evidence = await c.repo.evidenceForAsset("ast-api-gateway-01");
    await expect(evidenceDetail(c, "ast-api-gateway-02", evidence[0].id)).rejects.toBeDefined();
  });

  it("backfills PHASE-2 profile fields onto legacy connector records while preserving runtime state", async () => {
    const c = await ctx();
    await getRepository().reset();
    await c.manager.ensureSeeded();
    const existing = await c.repo.allConnectors();
    const legacy = existing.find((x) => x.id === "conn-app-01")!;
    legacy.name = "LEGACY-RENAMED";
    legacy.status = "NETWORK_BLOCKED";
    legacy.transportType = undefined as never;
    legacy.protocol = undefined as never;
    legacy.capabilities = undefined as never;
    legacy.latencyMs = undefined as never;
    await c.repo.saveConnector(legacy);
    await c.manager.ensureSeeded();
    const upgraded = (await c.repo.allConnectors()).find((x) => x.id === "conn-app-01")!;
    expect(upgraded.transportType).toBe("HTTPS_API");
    expect(upgraded.protocol).toBe("HTTPS");
    expect(upgraded.capabilities?.length).toBeGreaterThan(0);
    expect(upgraded.latencyMs).toBeGreaterThan(0);
    expect(upgraded.name).toBe("LEGACY-RENAMED");
    expect(upgraded.status).toBe("NETWORK_BLOCKED");
  });

  it("upgrades legacy stored evidence to a real SHA-256 that verifies", async () => {
    const c = await ctx();
    await discoverAssets(c);
    await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
    const evidence = await c.repo.evidenceForAsset("ast-api-gateway-01");
    const legacy = { ...evidence[0], id: "ev-legacy-0001", integrityHash: "ab12cd34" as string };
    await c.repo.saveEvidence(legacy);
    const stored = await c.repo.allEvidence();
    const { records, upgraded } = upgradeStoredEvidenceIntegrity(stored);
    expect(upgraded).toBeGreaterThan(0);
    await c.repo.saveEvidenceBatch(records);
    const fixed = (await c.repo.allEvidence()).find((e) => e.id === "ev-legacy-0001")!;
    expect(fixed.integrityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyEvidenceRecord(fixed).verified).toBe(true);
  });
});