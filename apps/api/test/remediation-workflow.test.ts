import { describe, it, expect, beforeAll } from "vitest";
import { getRepository } from "../src/storage/jsonRepo";
import { ConnectorManager } from "../src/services/enterprise/connectorManager";
import { discoverAssets, scanAsset } from "../src/services/enterprise/assetService";
import {
  approveRemediation,
  createRemediation,
  executeRemediation,
  rejectRemediation,
  requestApproval,
  rollbackRemediation,
  validateRemediation,
  verifyRemediation,
} from "../src/services/enterprise/remediationService";

const ACTOR = { id: "usr-test", name: "Test Reviewer", role: "reviewer" as const };

async function ctx() {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  return { repo, manager };
}

async function heroRemediation() {
  const c = await ctx();
  await discoverAssets(c);
  const asset = await c.repo.getAsset("ast-api-gateway-01");
  asset!.observedState.tlsMinVersion = "1.0";
  await c.repo.saveAsset(asset!);
  const scan = await scanAsset(c, "ast-api-gateway-01", { trigger: "manual" });
  const finding = scan.findings.find((f) => f.controlId === "TLS-001");
  if (!finding) throw new Error("TLS-001 FAIL finding was not produced for API-GATEWAY-01");
  const rem = await createRemediation(c, finding.id, "SIH demo — fix TLS 1.0 on API-GATEWAY-01");
  return { c, rem };
}

describe("Closed-loop remediation orchestration (API-GATEWAY-01 TLS-001)", () => {
  beforeAll(async () => {
    await getRepository().reset();
  });

  it("creates a PLANNED remediation from the hero finding", async () => {
    const { rem } = await heroRemediation();
    expect(rem.status).toBe("PLANNED");
    expect(rem.controlId).toBe("TLS-001");
    expect(rem.proposedAction.actionType).toBe("SET_TLS_MIN_VERSION");
    expect(rem.proposedAction.rollbackAvailable).toBe(true);
    expect(rem.riskBand).toBe("CRITICAL");
  });

  it("rejects an illegal transition (approve before validation)", async () => {
    const { c, rem } = await heroRemediation();
    await expect(approveRemediation(c, rem.id, ACTOR)).rejects.toThrow(/Cannot approve/i);
  });

  it("validates the proposal against the simulated environment", async () => {
    const { c, rem } = await heroRemediation();
    const validated = await validateRemediation(c, rem.id, ACTOR);
    expect(validated.status).toBe("VALIDATED");
    expect(validated.validation?.status).toBe("PASS");
    expect(validated.validation?.proposedState.tlsMinVersion).toBe("1.2");
  });

  it("invalidates a bad proposal (validation catches non-resolving actions)", async () => {
    const { c, rem } = await heroRemediation();
    rem.proposedAction.actionType = "DISABLE_INSECURE_PROTOCOL";
    rem.proposedAction.parameters = {};
    await c.repo.saveRemediation(rem);
    rem.status = "PLANNED";
    await c.repo.saveRemediation(rem);
    const result = await validateRemediation(c, rem.id, ACTOR);
    expect(result.status).toBe("VALIDATION_FAILED");
  });

  it("approves, executes, verifies — mutation is genuine and verification flips PASS", async () => {
    const { c, rem } = await heroRemediation();
    await validateRemediation(c, rem.id, ACTOR);
    await requestApproval(c, rem.id, ACTOR);
    await approveRemediation(c, rem.id, ACTOR, "Approved for SIH demo");

    const executed = await executeRemediation(c, rem.id, ACTOR);
    expect(executed.status).toBe("COMPLETED");
    expect(executed.execution?.status).toBe("COMPLETED");
    const asset = await c.repo.getAsset("ast-api-gateway-01");
    expect(asset!.observedState.tlsMinVersion).toBe("1.2");
    expect(asset!.stateHistory.some((h) => h.label.startsWith("Remediated:"))).toBe(true);

    const verified = await verifyRemediation(c, rem.id, ACTOR);
    expect(verified.status).toBe("VERIFIED");
    expect(verified.verification?.status).toBe("PASS");
    expect(verified.verification?.after.findingStatus).toBe("PASS");
    expect(verified.verification?.evidenceAfterIds.length).toBeGreaterThan(0);
  });

  it("records a complete audit trail for the whole closed loop", async () => {
    const { c, rem } = await heroRemediation();
    await validateRemediation(c, rem.id, ACTOR);
    await requestApproval(c, rem.id, ACTOR);
    await approveRemediation(c, rem.id, ACTOR);
    await executeRemediation(c, rem.id, ACTOR);
    await verifyRemediation(c, rem.id, ACTOR);
    const all = await c.repo.allAuditEvents();
    const entityEvents = all.filter((e) => e.entityId === rem.id);
    const types = entityEvents.map((e) => e.eventType);
    for (const expected of ["REMEDIATION_PLANNED", "REMEDIATION_VALIDATED", "REMEDIATION_APPROVED", "REMEDIATION_EXECUTED", "REMEDIATION_VERIFICATION_PASSED"]) {
      expect(types).toContain(expected);
    }
  });

  it("supports rejection before execution", async () => {
    const { c, rem } = await heroRemediation();
    await validateRemediation(c, rem.id, ACTOR);
    await requestApproval(c, rem.id, ACTOR);
    const rejected = await rejectRemediation(c, rem.id, ACTOR, "No change window");
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.approval?.status).toBe("REJECTED");
  });

  it("rolls back after a failed verification and restores the prior state", async () => {
    const { c, rem } = await heroRemediation();
    await validateRemediation(c, rem.id, ACTOR);
    await requestApproval(c, rem.id, ACTOR);
    await approveRemediation(c, rem.id, ACTOR);
    await executeRemediation(c, rem.id, ACTOR);

    // sabotage the change so verification fails
    const asset = await c.repo.getAsset("ast-api-gateway-01");
    asset!.observedState.tlsMinVersion = "1.0";
    await c.repo.saveAsset(asset!);

    const failed = await verifyRemediation(c, rem.id, ACTOR);
    expect(failed.status).toBe("FAILED");
    expect(failed.verification?.status).toBe("FAIL");

    const rolledBack = await rollbackRemediation(c, rem.id, ACTOR, "Rejected change window drift");
    expect(rolledBack.status).toBe("ROLLED_BACK");
    expect(rolledBack.rollback?.status).toBe("ROLLED_BACK");
  });
});