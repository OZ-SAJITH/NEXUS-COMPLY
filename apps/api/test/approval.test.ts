import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getRepository } from "../src/storage/jsonRepo";
import { runAudit } from "../src/services/auditService";

const custom = () => readFileSync(resolve(__dirname, "../../../samples/unknown/custom-demo.conf"), "utf-8");
const branch = () => readFileSync(resolve(__dirname, "../../../samples/unknown/custom-demo-branch.conf"), "utf-8");

beforeEach(async () => {
  await getRepository().reset();
});

describe("Human approval → reusable mapping loop", () => {
  it("a fresh unknown config gets a PENDING candidate interpretation", async () => {
    const { audit } = await runAudit({ fileName: "custom.conf", content: custom() });
    expect(audit.vendor).toBe("unknown");
    expect(audit.aiInterpretations?.length).toBe(1);
    expect(audit.aiInterpretations![0].status).toBe("PENDING");
    expect(audit.aiInterpretations![0].confidence).toBeGreaterThanOrEqual(0);
  });

  it("approving the interpretation makes it reusable — next identical config uses the mapping", async () => {
    const first = await runAudit({ fileName: "custom.conf", content: custom() });
    const ai = first.audit.aiInterpretations![0];

    // replicate the approve route: mark APPROVED + persist reusable mapping
    ai.status = "APPROVED";
    await getRepository().saveAudit(first.audit);
    await getRepository().saveMapping({
      id: "map-1",
      syntaxFingerprint: ai.syntaxFingerprint!,
      aiInterpretationId: ai.id!,
      securityIntent: ai.securityIntent,
      protocol: ai.protocol,
      sourceRestriction: ai.sourceRestriction,
      loggingEnabled: ai.loggingEnabled,
      approvedAt: new Date().toISOString(),
      approvedBy: "judge",
    });

    const second = await runAudit({ fileName: "custom.conf", content: custom() });
    expect(second.usedApprovedMapping).toBe(true);
    expect(second.audit.aiInterpretations ?? []).toHaveLength(0);
  });

  it("a syntactically-different branch of the same custom language also reuses the mapping", async () => {
    const first = await runAudit({ fileName: "custom.conf", content: custom() });
    const ai = first.audit.aiInterpretations![0];
    ai.status = "APPROVED";
    await getRepository().saveAudit(first.audit);
    await getRepository().saveMapping({
      id: "map-2",
      syntaxFingerprint: ai.syntaxFingerprint!,
      aiInterpretationId: ai.id!,
      securityIntent: ai.securityIntent,
      protocol: ai.protocol,
      sourceRestriction: ai.sourceRestriction,
      loggingEnabled: ai.loggingEnabled,
      approvedAt: new Date().toISOString(),
      approvedBy: "judge",
    });

    const variant = await runAudit({ fileName: "custom-demo-branch.conf", content: branch() });
    expect(variant.usedApprovedMapping).toBe(true);
    expect((variant.audit.aiInterpretations ?? []).length).toBe(0);
  });

  it("rejecting an interpretation does NOT persist a reusable mapping", async () => {
    const first = await runAudit({ fileName: "custom.conf", content: custom() });
    const ai = first.audit.aiInterpretations![0];
    ai.status = "REJECTED";
    await getRepository().saveAudit(first.audit);
    expect(await getRepository().allApprovedMappings()).toHaveLength(0);

    const second = await runAudit({ fileName: "custom.conf", content: custom() });
    expect(second.usedApprovedMapping).toBe(false);
    expect(second.audit.aiInterpretations![0].status).toBe("PENDING");
  });
});