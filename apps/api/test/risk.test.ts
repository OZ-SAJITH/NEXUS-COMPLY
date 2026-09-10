import { describe, it, expect } from "vitest";
import {
  computeRiskFactors,
  riskScoreFromFactors,
  riskBand,
  computeOverallRisk,
  summarizeCompliance,
  postureScore,
  scoreFinding,
} from "@nexus/compliance-rules";
import type { Finding } from "@nexus/shared-types";

function finding(partial: Partial<Finding>): Finding {
  return {
    id: "f-test",
    auditId: "audit-test",
    controlId: partial.controlId ?? "NET-SSH-001",
    controlName: partial.controlName ?? "test",
    severity: partial.severity ?? "HIGH",
    status: partial.status ?? "FAIL",
    what: "x",
    why: "y",
    where: "file",
    risk: 0,
    impact: "",
    recommendedFix: "",
    evidence: partial.evidence ?? [],
    references: {
      controlId: partial.controlId ?? "NET-SSH-001",
      intentType: partial.references?.intentType ?? "RESTRICT_ADMIN_ACCESS",
    },
  };
}

describe("Risk engine", () => {
  it("is deterministic: same input → same output", () => {
    expect(scoreFinding(finding({}))).toBe(scoreFinding(finding({})));
  });

  it("scores an internet-exposed admin finding as CRITICAL (>80)", () => {
    const f = finding({
      severity: "CRITICAL",
      references: { controlId: "NET-ADMEX-008", intentType: "RESTRICT_ADMIN_ACCESS" },
    });
    const risk = scoreFinding(f);
    expect(risk).toBeGreaterThanOrEqual(80);
    expect(riskBand(risk)).toBe("CRITICAL");
  });

  it("is monotonic: CRITICAL ≥ HIGH ≥ MEDIUM ≥ LOW", () => {
    const crit = riskScoreFromFactors(computeRiskFactors(finding({ severity: "CRITICAL" })));
    const high = riskScoreFromFactors(computeRiskFactors(finding({ severity: "HIGH" })));
    const med = riskScoreFromFactors(computeRiskFactors(finding({ severity: "MEDIUM" })));
    const low = riskScoreFromFactors(computeRiskFactors(finding({ severity: "LOW" })));
    expect(crit).toBeGreaterThanOrEqual(high);
    expect(high).toBeGreaterThanOrEqual(med);
    expect(med).toBeGreaterThanOrEqual(low);
  });

  it("computes overall audit risk from the worst failing findings", () => {
    const composed = computeOverallRisk([
      finding({ severity: "CRITICAL" }),
      finding({ severity: "HIGH" }),
    ]);
    expect(composed.overallScore).toBeGreaterThanOrEqual(60);
    expect(composed.explanation).toContain("weighted combination");
  });

  it("posture blends compliance score and risk penalty", () => {
    const good = postureScore({ passed: 10, failed: 0, warnings: 0, na: 5, score: 100 }, null);
    const bad = postureScore({ passed: 4, failed: 6, warnings: 0, na: 5, score: 40 }, null);
    expect(good).toBeGreaterThan(bad);
  });

  it("compliance score = passed / (passed + failed)", () => {
    const s = summarizeCompliance([
      finding({ status: "PASS" }),
      finding({ status: "PASS" }),
      finding({ status: "FAIL" }),
    ]);
    expect(s.score).toBe(67);
    expect(s.passed).toBe(2);
    expect(s.failed).toBe(1);
  });
});