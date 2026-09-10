import type {
  AuditRecord,
  Finding,
  RemediationSimulation,
  RemediationStep,
  SecurityIntent,
} from "@nexus/shared-types";
import {
  getControls,
  summarizeCompliance,
  postureScore,
  scoreFinding,
  severityCount,
} from "@nexus/compliance-rules";
import { evaluateIntents } from "./compliance";
import { uniqueId } from "../utils/helpers";

export interface SimulationResult {
  simulation: RemediationSimulation;
  beforeSummary: { passed: number; failed: number; score: number };
  afterSummary: { passed: number; failed: number; score: number };
}

/**
 * Produce a recommended fix (corrective intent) for a failing control.
 * Deterministic per control — never mutates real configuration.
 */
export function remediationStepForFinding(finding: Finding, intents: SecurityIntent[]): RemediationStep | null {
  const control = getControls().find((c) => c.id === finding.controlId);
  if (!control) return null;

  // Clone relevant intents and apply the corrective change in-memory.
  const matched = intents.filter((i) => i.intentType === control.condition.intentType);
  const corrected = matched.map((i) => ({ ...i, source: { type: "NETWORK", value: "10.0.0.0/24" } as SecurityIntent["source"] }));

  const correctedIntents = intents.map((i) => corrected.find((c) => c.id === i.id) ?? i);

  // Re-evaluate only this control by re-running full engine then filter.
  const newFindings = evaluateIntents({ fileName: finding.evidence[0]?.file ?? "config" }, correctedIntents);
  const correctedFinding = newFindings.find((f) => f.controlId === finding.controlId);
  const riskAfter = correctedFinding && correctedFinding.status !== "FAIL" ? 0 : correctedFinding?.risk ?? finding.risk;

  return {
    controlId: finding.controlId,
    findingId: finding.id,
    action: control.remediation,
    newIntent: { source: { type: "NETWORK", value: "10.0.0.0/24" } },
    riskAfter,
    statusAfter: correctedFinding?.status ?? finding.status,
  };
}

/**
 * Simulate remediating all failing findings. Returns before/after comparison computed
 * from actual findings — never hard-coded.
 */
export function simulateRemediation(audit: AuditRecord): SimulationResult {
  const before = audit.findings;

  const failing = before.filter((f) => f.status === "FAIL");

  // Build a corrected copy of the intent set
  const correctedIntents: SecurityIntent[] = audit.intents.map((i) => ({ ...i }));
  const steps: RemediationStep[] = [];

  for (const f of failing) {
    const step = remediationStepForFinding(f, correctedIntents);
    if (!step) continue;

    // Apply corrective change to matched intent(s) in the corrected set
    const control = getControls().find((c) => c.id === f.controlId);
    if (control) {
      for (const intent of correctedIntents) {
        if (intent.intentType === control.condition.intentType) {
          intent.source = { type: "NETWORK", value: "10.0.0.0/24" };
          // disable insecure protocols
          if (control.condition.intentType === "DISABLE_INSECURE_PROTOCOL") {
            intent.enabled = false;
          }
          if (control.condition.intentType === "DEFAULT_DENY") {
            intent.enabled = true;
          }
          if (control.condition.intentType === "REQUIRE_LOGGING") {
            intent.loggingRequired = true;
          }
        }
      }
    }
    steps.push(step);
  }

  // Re-evaluate the corrected intent set to get real after-numbers
  const afterFindings = evaluateIntents({ fileName: audit.configurationName }, correctedIntents);

  const beforeSummary = summarizeCompliance(before);
  const afterSummary = summarizeCompliance(afterFindings);

  const beforeSeverity = severityCount(before);
  const afterSeverity = severityCount(afterFindings);

  const afterRisk = afterFindings
    .filter((f) => f.status === "FAIL")
    .map((f) => ({ ...f, risk: scoreFinding(f) }));

  const afterRiskScore = afterRisk.length
    ? Math.round(
        (afterRisk.reduce((s, f) => s + f.risk, 0) / afterRisk.length) *
          (1 - 0.5 * Math.min(1, afterRisk.length / before.length || 0))
      )
    : 0;

  const complianceScore = beforeSummary.score;
  const afterComplianceScore = afterSummary.score;

  const beforePosture = postureScore(beforeSummary, audit.risk);
  const afterRiskAssessment = {
    overallScore: afterRiskScore,
    auditId: audit.id,
    id: `risk-${audit.id}-after`,
    severityFactor: 0,
    exposureFactor: 0,
    criticalityFactor: 0,
    controlImportanceFactor: 0,
    exploitabilityFactor: 0,
    explanation: "after",
    findings: afterRisk.map((f) => f.id),
  };
  const afterPosture = postureScore(afterSummary, afterRiskAssessment);

  const simulation: RemediationSimulation = {
    id: uniqueId("sim"),
    auditId: audit.id,
    steps,
    complianceBefore: {
      passed: beforeSummary.passed,
      failed: beforeSummary.failed,
      score: complianceScore,
    },
    complianceAfter: {
      passed: afterSummary.passed,
      failed: afterSummary.failed,
      score: afterComplianceScore,
    },
    highRiskBefore: (beforeSeverity.CRITICAL + beforeSeverity.HIGH),
    highRiskAfter: (afterSeverity.CRITICAL + afterSeverity.HIGH),
    postureBefore: beforePosture,
    postureAfter: afterPosture,
    simulatedAt: new Date().toISOString(),
  };

  return {
    simulation,
    beforeSummary,
    afterSummary,
  };
}
