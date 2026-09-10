import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { simulateRemediation } from "../src/engines/remediation";
import { runAudit } from "../src/services/auditService";
import { getRepository } from "../src/storage/jsonRepo";

const ciscoInsecure = () => readFileSync(resolve(__dirname, "../../../samples/cisco/demo-insecure.conf"), "utf-8");

describe("Safe remediation simulation", () => {
  it("improves compliance AFTER vs BEFORE (derived from re-evaluation, not hard-coded)", async () => {
    await getRepository().reset();
    const { audit } = await runAudit({ fileName: "cisco-insecure.conf", content: ciscoInsecure() });
    const { simulation, beforeSummary, afterSummary } = simulateRemediation(audit);

    expect(beforeSummary.failed).toBeGreaterThan(0);
    expect(afterSummary.failed).toBeLessThan(beforeSummary.failed);
    expect(simulation.complianceAfter.score).toBeGreaterThan(simulation.complianceBefore.score);
    expect(simulation.postureAfter).toBeGreaterThanOrEqual(simulation.postureBefore);
    expect(simulation.complianceAfter.score).toBe(100);
    expect(simulation.complianceAfter.failed).toBe(0);
  });

  it("never mutates the real configuration or the audit's finding set", async () => {
    await getRepository().reset();
    const { audit } = await runAudit({ fileName: "cisco-insecure.conf", content: ciscoInsecure() });
    const findingsBefore = JSON.stringify(audit.findings);
    const configBefore = audit.intents.map((i) => `${i.intentType}:${i.enabled}:${i.source?.value}`).join("|");

    simulateRemediation(audit);

    expect(JSON.stringify(audit.findings)).toBe(findingsBefore);
    const configAfter = audit.intents.map((i) => `${i.intentType}:${i.enabled}:${i.source?.value}`).join("|");
    expect(configAfter).toBe(configBefore);
  });

  it("returns an explainable step per failing control", async () => {
    await getRepository().reset();
    const { audit } = await runAudit({ fileName: "cisco-insecure.conf", content: ciscoInsecure() });
    const { simulation } = simulateRemediation(audit);
    const failing = audit.findings.filter((f) => f.status === "FAIL");
    expect(simulation.steps.length).toBe(failing.length);
    for (const step of simulation.steps) {
      expect(step.action.length).toBeGreaterThan(0);
      expect(step.controlId.startsWith("NET-")).toBe(true);
    }
  });
});