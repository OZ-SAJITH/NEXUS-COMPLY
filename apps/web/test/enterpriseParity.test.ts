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

  it("discoveries actually discover the 15-asset regional wave, then re-runs are idempotent", () => {
    const before = enterpriseDemo.listAssets();
    const seededCount = before.length;
    expect(seededCount).toBe(22);
    const r = enterpriseDemo.discover();
    expect(r.runId).toMatch(/^disc-/);
    expect(r.discovered).toBe(15);
    expect(r.updated).toBe(0);
    expect(r.assets.length).toBe(seededCount + 15);

    const after = enterpriseDemo.listAssets();
    expect(after.length).toBe(seededCount + 15);
    const names = new Set(after.map((a) => a.name));
    for (const n of ["FW-CHN-01", "RTR-CHN-01", "SW-CHN-01", "APP-CHN-01", "API-CHN-01", "DB-CHN-01", "MQ-CHN-01", "FW-NY-01", "APP-NY-01", "API-NY-01", "DB-NY-01", "FW-SG-01", "API-SG-01", "DB-SG-01", "CERT-SG-01"]) {
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

  it("PHASE 3 — serves the compliance summary with score, severities and lifecycle breakdown", () => {
    const s = demo<{ score: number; passed: number; failed: number; warnings: number; na: number; bySeverity: Array<{ severity: string; count: number }>; lifecycleBreakdown: Array<{ lifecycle: string; count: number }> }>("/api/enterprise/compliance-summary");
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.passed + s.failed + s.warnings + s.na).toBe(s.total);
    expect(Array.isArray(s.bySeverity)).toBe(true);
    expect(Array.isArray(s.lifecycleBreakdown)).toBe(true);
    expect(s.lifecycleBreakdown.some((l) => l.lifecycle === "OPEN")).toBe(true);
  });

  it("PHASE 3 — finding lifecycle transition persists via the REST surface", () => {
    const findings = demo<Array<{ id: string }>>("/api/assets/" + hero + "/findings");
    expect(findings.length).toBeGreaterThan(0);
    const id = findings[0].id;
    const acked = demo<{ id: string; lifecycle: string; lifecycleReason?: string }>("/api/assets/" + hero + "/findings/" + id + "/lifecycle", {
      method: "POST",
      body: JSON.stringify({ lifecycle: "ACKNOWLEDGED", reason: "accepted temporarily pending owner sign-off" }),
    });
    expect(acked.id).toBe(id);
    expect(acked.lifecycle).toBe("ACKNOWLEDGED");

    const reopened = demo<{ id: string; lifecycle: string }>("/api/assets/" + hero + "/findings/" + id + "/lifecycle", {
      method: "POST",
      body: JSON.stringify({ lifecycle: "OPEN" }),
    });
    expect(reopened.lifecycle).toBe("OPEN");
  });
});

describe("PHASE 4 — governance demo mirror (backend parity)", () => {
  const hero = "ast-api-gateway-01";

  function demo<T>(path: string, init?: RequestInit): T {
    return dispatchDemo<T>(path, init).body;
  }

  it("serves the framework catalog and raises 404 for unknown frameworks", () => {
    const frameworks = demo<Array<{ id: string; name: string; scope: string; applicability: string; disclaimer: string }>>("/api/frameworks");
    expect(frameworks.length).toBeGreaterThanOrEqual(5);
    expect(frameworks.map((f) => f.id)).toContain("NIST");
    const nist = demo<{ id: string; name: string }>("/api/frameworks/NIST");
    expect(nist.id).toBe("NIST");
    expect(() => dispatchDemo("/api/frameworks/NONEXISTENT")).toThrowError(/framework not found/i);
  });

  it("serves policy profiles and selects a deterministic region policy", () => {
    const policies = demo<Array<{ profileId: string; region: string }>>("/api/policies");
    expect(policies.map((p) => p.profileId)).toContain("INDIA_ENTERPRISE");
    const ipe = demo<{ profileId: string; region: string }>("/api/policies/INDIA_ENTERPRISE");
    expect(ipe.region).toBe("IND");

    const sel = demo<{ region: string; policyProfileId: string; regionLabel: string }>("/api/governance/policy/select", {
      method: "POST",
      body: JSON.stringify({ assetId: hero }),
    });
    expect(sel.region).toBe("IND");
    expect(sel.policyProfileId).toBe("INDIA_ENTERPRISE");
    expect(sel.regionLabel).toBe("India");
  });

  it("serves asset governance trace, per-framework view and applicable controls", () => {
    const trace = demo<{ assetId: string; region: string; frameworks: unknown[]; applicableControls: unknown[]; exceptions: unknown[] }>("/api/assets/" + hero + "/governance");
    expect(trace.assetId).toBe(hero);
    expect(trace.frameworks.length).toBeGreaterThanOrEqual(1);
    expect(trace.applicableControls.length).toBeGreaterThanOrEqual(1);

    const fw = demo<{ frameworks: unknown[] }>("/api/assets/" + hero + "/frameworks");
    expect(fw.frameworks.length).toBeGreaterThanOrEqual(1);

    const controls = demo<{ applicable: unknown[]; total: number }>("/api/assets/" + hero + "/applicable-controls");
    expect(controls.total).toBeGreaterThanOrEqual(21);
    expect(controls.applicable.length).toBeGreaterThanOrEqual(1);

    const gov = demo<{ policy: { policyProfileId: string }; trace: { assetId: string } }>("/api/governance/evaluate/" + hero);
    expect(gov.policy.policyProfileId).toBe("INDIA_ENTERPRISE");
    expect(gov.trace.assetId).toBe(hero);
  });

  it("full exception lifecycle through the REST surface: request → approve → verify → list", () => {
    const request = { controlId: "TLS-001", assetId: hero, reason: "Legacy TLS for backward compatibility", requestedBy: "Demo Operator", expiresInDays: 30 };
    const created = demo<{ id: string; status: string; controlId: string; assetId: string }>("/api/enterprise/governance/exceptions", {
      method: "POST",
      body: JSON.stringify(request),
    });
    expect(created.status).toBe("REQUESTED");
    expect(created.controlId).toBe("TLS-001");
    expect(created.assetId).toBe(hero);

    const approved = demo<{ id: string; status: string; approvedBy: string }>("/api/enterprise/governance/exceptions/" + created.id + "/decide", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVED", decidedBy: "Security Lead", reason: "Approved" }),
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toBe("Security Lead");

    const all = demo<Array<{ id: string; status: string }>>("/api/enterprise/governance/exceptions");
    expect(all.some((e) => e.id === created.id)).toBe(true);
    expect(all.find((e) => e.id === created.id)!.status).toBe("APPROVED");

    const events = demo<Array<{ eventType: string; entityType: string; entityId: string }>>("/api/audit");
    const governanceEvents = events.filter((e) => e.entityType === "governance" && (e.eventType === "GOVERNANCE_EXCEPTION_REQUESTED" || e.eventType === "GOVERNANCE_EXCEPTION_DECIDED") && e.entityId === created.id);
    expect(governanceEvents).toHaveLength(2);
  });

  it("compliance summary includes byRegion + byFramework with PASS controls counted", () => {
    const s = demo<{ byRegion: Array<{ region: string; assetCount: number; passed: number; score: number }>; byFramework: Array<{ framework: string; score: number; status: string }> }>("/api/enterprise/compliance-summary");
    expect(s.byRegion.length).toBeGreaterThanOrEqual(1);
    expect(s.byRegion.some((r) => r.assetCount >= 1)).toBe(true);
    // PASS controls are accumulated into byRegion scores (the PHASE 4 fix)
    expect(s.byRegion.some((r) => r.passed > 0)).toBe(true);
    expect(s.byFramework.length).toBeGreaterThanOrEqual(1);
    for (const f of s.byFramework) expect(f.score).toBeGreaterThanOrEqual(0);
  });
});

describe("PHASE 6 — AI remediation intelligence demo mirror (backend parity)", () => {
  const hero = "ast-api-gateway-01";

  it("scans provide a TLS-001 finding that can be analyzed into structured intelligence", () => {
    const scan = enterpriseDemo.scan(hero, "manual");
    const tls = scan.findings.find((f) => f.controlId === "TLS-001") ?? scan.findings[0];
    const rem = enterpriseDemo.remediationIntelligence(tls.id);
    expect(rem.status).toBe("PLANNED");
    expect(rem.intelligence).toBeDefined();
    expect(rem.intelligence!.requiresApproval).toBe(true);
    expect(rem.intelligence!.provider).toBe("mock");
    expect(rem.intelligence!.source).toBe("deterministic");
    expect(rem.intelligence!.evidenceUsed.length).toBeGreaterThan(0);
    expect(rem.intelligence!.rollbackStatus).toBe("AVAILABLE");
    expect(rem.planVersions!.length).toBe(1);
    expect(rem.planVersions![0].approvalStatus).toBe("NONE");
    expect(rem.planVersions![0].executionStatus).toBe("NOT_EXECUTED");
  });

  it("second analyze bumps the plan version, reusing the same remediation record", () => {
    const scan = enterpriseDemo.scan(hero, "manual");
    const tls = scan.findings.find((f) => f.controlId === "TLS-001") ?? scan.findings[0];
    const first = enterpriseDemo.remediationIntelligence(tls.id);
    const second = enterpriseDemo.remediationIntelligence(tls.id);
    expect(second.id).toBe(first.id);
    expect(second.intelligence!.version).toBe(2);
    expect(second.planVersions!.length).toBe(2);
  });

  it("audit ledger records the AI_REMEDIATION_INTELLIGENCE_GENERATED event", () => {
    const events = enterpriseDemo.auditEvents();
    const intel = events.filter((e) => e.eventType === "AI_REMEDIATION_INTELLIGENCE_GENERATED");
    expect(intel.length).toBeGreaterThan(0);
    expect(intel[0].source).toBe("ai");
  });

  it("demoApi serves analyze/list/detail/validate-plan mirroring the REST surface", () => {
    const findings = dispatchDemo<{ body: Array<{ id: string }> }>("/api/assets/" + hero + "/findings").body;
    const findingId = findings.find((f) => f.id.startsWith("finding") || f.id.includes(hero))?.id ?? findings[0].id;

    const analyzed = dispatchDemo<{ body: { id: string; intelligence?: unknown; status: string } }>(
      "/api/findings/" + findingId + "/remediation/analyze",
      { method: "POST" }
    ).body;
    expect(analyzed.status).toBe("PLANNED");
    expect(analyzed.intelligence).toBeDefined();

    const list = dispatchDemo<{ body: Array<{ id: string }> }>("/api/findings/" + findingId + "/remediation").body;
    expect(list.some((r) => r.id === analyzed.id)).toBe(true);

    const detail = dispatchDemo<{ body: { id: string } }>("/api/remediation/" + analyzed.id).body;
    expect(detail.id).toBe(analyzed.id);

    const validated = dispatchDemo<{ body: { id: string; status: string } }>("/api/remediation/" + analyzed.id + "/validate-plan", {
      method: "POST",
      body: "{}",
    }).body;
    expect(validated.status).toMatch(/VALIDAT/);
  });

  it("404s the analyze route for an unknown finding", () => {
    expect(() => dispatchDemo("/api/findings/does-not-exist/remediation/analyze", { method: "POST" })).toThrowError(/not found/i);
  });

  it("closed loop reaches VERIFIED even though the re-scan drops the resolved finding", () => {
    const scan = enterpriseDemo.scan(hero, "manual");
    const tls = scan.findings.find((f) => f.controlId === "TLS-001") ?? scan.findings[0];
    const rem = enterpriseDemo.remediationIntelligence(tls.id);
    expect(enterpriseDemo.validateRemediation(rem.id).status).toBe("VALIDATED");
    expect(enterpriseDemo.requestApproval(rem.id).status).toBe("PENDING_APPROVAL");
    expect(enterpriseDemo.approve(rem.id).status).toBe("APPROVED");
    expect(enterpriseDemo.execute(rem.id).status).toBe("COMPLETED");
    const verified = enterpriseDemo.verify(rem.id);
    expect(verified.status).toBe("VERIFIED");
    expect(verified.verification.status).toBe("PASS");
    expect(verified.verification.triggeredBy).toBe("auto_verify_scan");
  });
});