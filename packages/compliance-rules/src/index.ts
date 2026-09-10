import type {
  Finding,
  Severity,
  RiskAssessment,
} from "@nexus/shared-types";
import { getControlById, SEVERITY_WEIGHT } from "./controls";

export { CONTROLS, getControlById, getControls, SEVERITY_WEIGHT, PROTOTYPE_NOTICE } from "./controls";

// ---------------------------------------------------------------------------
// Explainable Risk Score
//
// Risk Score = weighted combination of transparent factors (0..100):
//
//   severityWeight   (from control severity, 0.10..1.0)
//   exposureWeight   (how exposed the service is: internet=1.0, any=1.0,
//                     restricted=0.3, internal=0.1)
//   criticalityWeight (asset criticality, default 0.7 based on control severity)
//   importanceWeight  (control importance weight 0.2..1.0)
//   exploitabilityWeight (how easy to exploit, based on protocol)
//
// overall = clamp( round( 100 *
//     severityWeight * 0.35 +
//     exposureWeight * 0.30 +
//     criticalityWeight * 0.15 +
//     importanceWeight * 0.10 +
//     exploitabilityWeight * 0.10 ) )
// ---------------------------------------------------------------------------

export interface RiskFactors {
  severityWeight: number;
  exposureWeight: number;
  criticalityWeight: number;
  importanceWeight: number;
  exploitabilityWeight: number;
}

const PROTOCOL_EXPLOITABILITY: Record<string, number> = {
  telnet: 0.95,
  http: 0.85,
  snmp: 0.8,
  ftp: 0.75,
  tftp: 0.7,
  ssh: 0.35,
  https: 0.2,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function severityToImportance(severity: Severity): number {
  switch (severity) {
    case "CRITICAL":
      return 1.0;
    case "HIGH":
      return 0.85;
    case "MEDIUM":
      return 0.7;
    case "LOW":
      return 0.5;
    default:
      return 0.3;
  }
}

function criticalityFromSeverity(severity: Severity): number {
  switch (severity) {
    case "CRITICAL":
      return 0.9;
    case "HIGH":
      return 0.75;
    case "MEDIUM":
      return 0.6;
    case "LOW":
      return 0.45;
    default:
      return 0.3;
  }
}

/**
 * Compute explainable risk factors for a FAILING finding.
 * Exposed when the control involves admin access / source networks / management.
 */
export function computeRiskFactors(
  finding: Pick<Finding, "severity" | "evidence" | "references" | "controlId">,
  extra?: { exposure?: "internet" | "any" | "restricted" | "internal"; assetCriticality?: number },
): RiskFactors {
  const severityWeight = SEVERITY_WEIGHT[finding.severity] ?? 0.5;

  let exposureWeight = 0.5;
  const ref = finding.references;
  const control = getControlById(finding.controlId);
  const conditionIntent = (control?.condition?.intentType as string) ?? ref?.intentType;

  if (conditionIntent === "ADMIN_EXPOSURE" || conditionIntent === "RESTRICT_ADMIN_ACCESS") {
    exposureWeight = 1.0;
  } else if (extra?.exposure) {
    exposureWeight = { internet: 1.0, any: 1.0, restricted: 0.3, internal: 0.1 }[extra.exposure] ?? 0.5;
  } else if (ref?.intentType === "RESTRICT_ADMIN_ACCESS") {
    exposureWeight = 1.0;
  }

  const criticalityWeight = extra?.assetCriticality ?? criticalityFromSeverity(finding.severity);
  const importanceWeight = severityToImportance(finding.severity);

  let exploitabilityWeight = 0.5;
  const protocolHint = finding.references?.intentType?.toLowerCase();
  if (protocolHint && PROTOCOL_EXPLOITABILITY[protocolHint]) {
    exploitabilityWeight = PROTOCOL_EXPLOITABILITY[protocolHint];
  } else {
    // default by severity
    exploitabilityWeight = { CRITICAL: 0.8, HIGH: 0.6, MEDIUM: 0.4, LOW: 0.2, INFO: 0.1 }[
      finding.severity
    ] ?? 0.4;
  }

  return {
    severityWeight: clamp01(severityWeight),
    exposureWeight: clamp01(exposureWeight),
    criticalityWeight: clamp01(criticalityWeight),
    importanceWeight: clamp01(importanceWeight),
    exploitabilityWeight: clamp01(exploitabilityWeight),
  };
}

export function riskScoreFromFactors(f: RiskFactors): number {
  const raw =
    f.severityWeight * 0.35 +
    f.exposureWeight * 0.3 +
    f.criticalityWeight * 0.15 +
    f.importanceWeight * 0.1 +
    f.exploitabilityWeight * 0.1;
  return Math.round(Math.max(0, Math.min(100, raw * 100)));
}

export function riskBand(score: number): Severity {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "INFO";
}

export function riskLabel(score: number): Severity {
  return riskBand(score);
}

export function severityToScore(severity: Severity): number {
  switch (severity) {
    case "CRITICAL":
      return 90;
    case "HIGH":
      return 70;
    case "MEDIUM":
      return 50;
    case "LOW":
      return 30;
    default:
      return 10;
  }
}

/**
 * Deterministic finding risk score.
 */
export function scoreFinding(finding: Finding): number {
  const factors = computeRiskFactors(finding);
  return riskScoreFromFactors(factors);
}

export interface OverallRiskComposition {
  overallScore: number;
  factors: {
    severityFactor: number;
    exposureFactor: number;
    criticalityFactor: number;
    controlImportanceFactor: number;
    exploitabilityFactor: number;
  };
  explanation: string;
}

/**
 * Overall audit risk = average of the worst failing findings, weighted by count
 * of critical/high findings. Still fully deterministic and explainable.
 */
export function computeOverallRisk(findings: Finding[]): OverallRiskComposition {
  const failing = findings.filter((f) => f.status === "FAIL");
  if (failing.length === 0) {
    return {
      overallScore: 0,
      factors: {
        severityFactor: 0,
        exposureFactor: 0,
        criticalityFactor: 0,
        controlImportanceFactor: 0,
        exploitabilityFactor: 0,
      },
      explanation: "No failing findings detected.",
    };
  }

  const topN = failing
    .slice()
    .sort((a, b) => b.risk - a.risk)
    .slice(0, Math.min(5, failing.length));

  let severityFactor = 0;
  let exposureFactor = 0;
  let criticalityFactor = 0;
  let importanceFactor = 0;
  let exploitabilityFactor = 0;

  for (const f of topN) {
    const rf = computeRiskFactors(f);
    severityFactor += rf.severityWeight;
    exposureFactor += rf.exposureWeight;
    criticalityFactor += rf.criticalityWeight;
    importanceFactor += rf.importanceWeight;
    exploitabilityFactor += rf.exploitabilityWeight;
  }
  const count = topN.length;
  severityFactor = severityFactor / count;
  exposureFactor = exposureFactor / count;
  criticalityFactor = criticalityFactor / count;
  importanceFactor = importanceFactor / count;
  exploitabilityFactor = exploitabilityFactor / count;

  const composite = Math.round(
    (severityFactor * 0.35 +
      exposureFactor * 0.3 +
      criticalityFactor * 0.15 +
      importanceFactor * 0.1 +
      exploitabilityFactor * 0.1) *
      100
  );

  const severityLabel = severityToLabel(composite);

  return {
    overallScore: composite,
    factors: {
      severityFactor: Math.round(severityFactor * 100),
      exposureFactor: Math.round(exposureFactor * 100),
      criticalityFactor: Math.round(criticalityFactor * 100),
      controlImportanceFactor: Math.round(importanceFactor * 100),
      exploitabilityFactor: Math.round(exploitabilityFactor * 100),
    },
    explanation: `Overall risk ${severityLabel} (${composite}/100) computed as a weighted combination of severity (${(Math.round(
      severityFactor * 100
    ))}%), exposure (${Math.round(exposureFactor * 100)}%), asset criticality (${Math.round(
      criticalityFactor * 100
    )}%), control importance (${Math.round(importanceFactor * 100)}%) and exploitability (${Math.round(
      exploitabilityFactor * 100
    )}%).`,
  };
}

function severityToLabel(score: number): Severity {
  return riskBand(score);
}

export function buildRiskAssessment(auditId: string, findings: Finding[]): RiskAssessment {
  const overall = computeOverallRisk(findings);
  return {
    id: `risk-${auditId}`,
    auditId,
    overallScore: overall.overallScore,
    severityFactor: overall.factors.severityFactor,
    exposureFactor: overall.factors.exposureFactor,
    criticalityFactor: overall.factors.criticalityFactor,
    controlImportanceFactor: overall.factors.controlImportanceFactor,
    exploitabilityFactor: overall.factors.exploitabilityFactor,
    explanation: overall.explanation,
    findings: findings.filter((f) => f.status === "FAIL").map((f) => f.id),
  };
}

// ---------------------------------------------------------------------------
// Compliance score + posture
// ---------------------------------------------------------------------------

export interface ComplianceSummary {
  passed: number;
  failed: number;
  warnings: number;
  na: number;
  score: number;
}

export function summarizeCompliance(findings: Finding[]): ComplianceSummary {
  const passed = findings.filter((f) => f.status === "PASS").length;
  const failed = findings.filter((f) => f.status === "FAIL").length;
  const warnings = findings.filter((f) => f.status === "WARNING").length;
  const na = findings.filter((f) => f.status === "NOT_APPLICABLE").length;
  const scored = passed + failed;
  const score = scored === 0 ? 0 : Math.round((passed / scored) * 100);
  return { passed, failed, warnings, na, score };
}

export function postureScore(summary: ComplianceSummary, risk: RiskAssessment | null): number {
  // Posture 0..100 = blend of compliance score and inverse of overall risk.
  const riskPenalty = risk ? Math.round((risk.overallScore / 100) * 50) : 0;
  const compliancePart = summary.score * 0.5;
  const riskPart = 50 - riskPenalty;
  return Math.max(0, Math.min(100, Math.round(compliancePart + riskPart)));
}

export function severityCount(findings: Finding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) {
    if (f.status === "FAIL" && out[f.severity] !== undefined) out[f.severity] += 1;
  }
  return out;
}

export type { ComplianceControl, FindingStatus } from "@nexus/shared-types";
