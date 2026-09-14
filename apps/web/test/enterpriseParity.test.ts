import { describe, it, expect } from "vitest";
import { enterpriseDemo } from "../src/demo/enterpriseStore";
import { dispatchDemo } from "../src/services/demoApi";

/**
 * Demo-mode parity tests.
 *
 * The GitHub Pages / static-hosting build has no Express server: every API call
 * the frontend makes is served by `demoApi.ts` -> `enterpriseDemo`. This suite
 * guards the risk in §8 of NEXUS-COMPLY-UPGRADE-PLAN.md (demo-mode parity) by
 * asserting the in-browser facade mirrors the backend enterprise API surface.
 */

describe("enterpriseDemo — backend parity", () => {
  it("seeds the full simulated catalog ready to scan", () => {
    const assets = enterpriseDemo.listAssets();
    expect(assets.length).toBeGreaterThanOrEqual(22);
    const hero = assets.find((a) => a.id === "ast-api-gateway-01");
    expect(hero).toBeDefined();
    expect(hero!.name).toBe("API-GATEWAY-01");
    expect(assets.every((a) => a.discoveryStatus === "SCANNABLE")).toBe(true);
  });

  it("discoveries actually discover the 14-asset regional wave, then re-runs are idempotent", () => {
    const before = enterpriseDemo.listAssets();
    const seededCount = before.length;
    expect(seededCount).toBe(22);
    const r = enterpriseDemo.discover();
    expect(r.runId).toMatch(/^disc-/);
    expect(r.discovered).toBe(14);
    expect(r.updated).toBe(0);
    expect(r.assets.length).toBe(seededCount + 14);

    const after = enterpriseDemo.listAssets();
    expect(after.length).toBe(seededCount + 14);
    const names = new Set(after.map((a) => a.name));
    for (const n of ["FW-CHN-01", "RTR-CHN-01", "SW-CHN-01", "APP-CHN-01", "API-CHN-01", "DB-CHN-01", "MQ-CHN-01", "FW-NY-01", "APP-NY-01", "DB-NY-01", "FW-SG-01", "API-SG-01", "DB-SG-01", "CERT-SG-01"]) {
      expect(names.has(n), `expected kind asset ${n} in discovered wave`).toBe(true);
    }
    const regions = new Set(after.map((a) => a.regionLabel));
    expect(regions.size).toBe(3);
    expect(after.every((a) => a.discoveryStatus === "SCANNABLE")).toBe(true);

    const again = enterpriseDemo.discover();
    expect(again.discovered).toBe(0);
    expect(again.assets.length).toBe(after.length);
    expect(enterpriseDemo.listAssets().length).toBe(after.length);
  });

  it("scans the hero asset → TLS-001 CRITICAL FAIL with normalized evidence", () => {
    const scan = enterpriseDemo.scan("ast-api-gateway-01", "manual");
    expect(scan.status).toBe("COMPLETED");
    expect(scan.findings.length).toBeGreaterThan(0);
    const tls = scan.findings.find((f) => f.controlId === "TLS-001");
    expect(tls).toBeDefined();
    expect(tls!.status).toBe("FAIL");
    expect(tls!.severity).toBe("CRITICAL");
    expect(enterpriseDemo.assetEvidence("ast-api-gateway-01").length).toBeGreaterThan(0);
  });

  it("enriches findings with asset context (assetId / assetType / location)", () => {
    const findings = enterpriseDemo.assetFindings("ast-api-gateway-01");
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.assetId).toBe("ast-api-gateway-01");
      expect(f.assetType).toBe("API");
      expect(f.location).toBeDefined();
    }
  });

  it("exposes topology and the connector registry", () => {
    const topo = enterpriseDemo.topology();
    expect(topo.regions.length).toBeGreaterThanOrEqual(3);
    expect(topo.tiers.length).toBeGreaterThanOrEqual(3);
    const connectors = enterpriseDemo.listConnectors();
    expect(connectors.length).toBeGreaterThanOrEqual(17);
    const online = connectors.some((c) => c.status === "ONLINE");
    expect(online).toBe(true);
  });

  it("PHASE 2 — seeded connectors declare transport, protocol and capabilities", () => {
    const connectors = enterpriseDemo.listConnectors();
    expect(connectors.length).toBe(17);
    for (const c of connectors) {
      expect(Array.isArray(c.capabilities) && c.capabilities.length > 0).toBe(true);
    }
    const windows = connectors.find((c) => c.id === "conn-srv-02");
    expect(windows?.transportType).toBe("AGENT");
    expect(windows?.protocol).toBe("WINRM");
    const azure = connectors.find((c) => c.id === "conn-cloud-02");
    expect(azure?.transportType).toBe("CLOUD_API");
  });

  it("PHASE 2 — connector profile resolves for a managed asset", () => {
    const profile = enterpriseDemo.assetConnectorProfile("ast-api-gateway-01");
    expect(profile.assetId).toBe("ast-api-gateway-01");
    expect(profile.online).toBe(true);
    expect(profile.connector?.vendor).toBe("Kong");
    expect(profile.fromCapabilities.length).toBeGreaterThan(0);
    expect(profile.latencyMs).toBeGreaterThan(0);
  });

  it("PHASE 2 — tests the asset connector and returns transport/latency/capabilities", () => {
    const result = enterpriseDemo.testAssetConnector("ast-api-gateway-01");
    expect(result.ok).toBe(true);
    expect(result.connectorId).toBe("conn-app-01");
    expect(result.status).toBe("ONLINE");
    expect(result.protocol).toBe("HTTPS");
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it("PHASE 2 — evidence detail re-verifies the SHA-256 integrity (derived, not stored)", () => {
    const scan = enterpriseDemo.scan("ast-api-gateway-01", "manual");
    expect(scan.evidenceIds.length).toBeGreaterThan(0);
    const evidence = enterpriseDemo.assetEvidence("ast-api-gateway-01");
    expect(evidence.length).toBeGreaterThan(0);
    const first = evidence[0];
    const detail = enterpriseDemo.assetEvidenceDetail("ast-api-gateway-01", first.id);
    expect(detail.id).toBe(first.id);
    expect(detail.verification.verified).toBe(true);
    expect(detail.verification.hash).toBe(first.integrityHash);
    expect(detail.verification.canonical).toContain("NEXUS-EVIDENCE-1");
  });
});

describe("demoApi dispatch — mirrors the enterprise REST surface", () => {
  const hero = "ast-api-gateway-01";

  function demo<T>(path: string, init?: RequestInit): T {
    return dispatchDemo<T>(path, init).body;
  }

  it("serves list/detail/scan/evidence/findings/scans/impact", () => {
    const assets = demo<Array<{ id: string }>>("/api/assets");
    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toBeGreaterThanOrEqual(22);

    const detail = demo<{ id: string }>("/api/assets/" + hero);
    expect(detail.id).toBe(hero);

    const scan = demo<{ status: string; findings: Array<{ controlId: string }> }>("/api/assets/" + hero + "/scan", { method: "POST" });
    expect(scan.status).toBe("COMPLETED");

    expect(demo<unknown[]>("/api/assets/" + hero + "/evidence")).toBeInstanceOf(Array);
    const findings = demo<Array<{ controlId: string }>>("/api/assets/" + hero + "/findings");
    expect(findings.length).toBeGreaterThan(0);
    expect(demo<unknown[]>("/api/assets/" + hero + "/scans")).toBeInstanceOf(Array);
    expect(demo("/api/assets/" + hero + "/impact")).toBeDefined();
  });

  it("serves discovery + topology + connectors", () => {
    const discover = demo<{ runId: string; discovered: number }>("/api/assets/discover", { method: "POST" });
    expect(discover.runId).toMatch(/^disc-/);
    // idempotent re-run — the store-level test above already executed the first
    // discovery run that created the 14-asset regional wave.
    expect(discover.discovered).toBe(0);

    const topo = demo<{ regions: unknown[]; tiers: unknown[]; connections: unknown[] }>("/api/enterprise/topology");
    expect(topo.regions.length).toBeGreaterThan(0);
    expect(topo.tiers.length).toBeGreaterThan(0);

    const connectors = demo<Array<{ id: string }>>("/api/connectors");
    expect(connectors.length).toBeGreaterThanOrEqual(17);
    expect(demo<{ id: string }>("/api/connectors/conn-net-01").id).toBe("conn-net-01");
    const health = demo<{ id: string; status: string }>("/api/connectors/conn-net-01/health");
    expect(health.id).toBe("conn-net-01");
  });

  it("PHASE 2 — serves the asset connector profile, connection test and verified evidence detail", () => {
    const profile = demo<{ assetId: string; online: boolean; connector: { id: string; transportType: string } }>("/api/assets/" + hero + "/connector");
    expect(profile.assetId).toBe(hero);
    expect(profile.online).toBe(true);
    expect(profile.connector.transportType).toBe("HTTPS_API");

    const test = demo<{ ok: boolean; status: string; latencyMs: number }>("/api/assets/" + hero + "/connector/test", { method: "POST" });
    expect(test.ok).toBe(true);
    expect(test.status).toBe("ONLINE");
    expect(test.latencyMs).toBeGreaterThan(0);

    const evidence = demo<Array<{ id: string }>>("/api/assets/" + hero + "/evidence");
    expect(evidence.length).toBeGreaterThan(0);
    const detail = demo<{ id: string; verification: { verified: boolean; hash: string; canonical: string } }>("/api/assets/" + hero + "/evidence/" + evidence[0].id);
    expect(detail.verification.verified).toBe(true);
    expect(detail.verification.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.verification.canonical).toContain("NEXUS-EVIDENCE-1");
  });

  it("serves the remediation + audit surface with real ids", () => {
    const rems = demo<Array<{ id: string }>>("/api/remediations");
    expect(rems.length).toBeGreaterThanOrEqual(1);
    const remId = rems[0].id;
    expect(demo<{ id: string }>("/api/remediations/" + remId).id).toBe(remId);
    expect(demo<unknown[]>("/api/audit")).toBeInstanceOf(Array);
  });

  it("404s on unknown asset-resource routes", () => {
    expect(() => dispatchDemo("/api/assets/does-not-exist/findings")).toThrowError(/not found/i);
    expect(() => dispatchDemo("/api/evidence/nope")).toThrowError(/not found/i);
  });
});