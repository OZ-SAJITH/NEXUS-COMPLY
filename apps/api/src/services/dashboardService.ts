import type { DashboardStats, Finding, Severity, VendorId } from "@nexus/shared-types";
import { summarizeCompliance, postureScore, severityCount } from "@nexus/compliance-rules";
import { getRepository } from "../storage/jsonRepo";
import { reviewAggregate } from "./reviewService";

/**
 * Aggregate statistics across all audits for the dashboard.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const repo = getRepository();
  const audits = await repo.allAudits();

  let passed = 0;
  let failed = 0;
  let warnings = 0;
  let postureSum = 0;
  let postureCount = 0;

  const risk: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const vendorDistribution: Record<VendorId, number> = { cisco: 0, fortinet: 0, juniper: 0, unknown: 0 };
  const topRisks: Finding[] = [];

  let knownAnalyzed = 0;
  let unknownDetected = 0;
  let aiInterpretations = 0;
  let approvedMappings = 0;
  let rejectedMappings = 0;

  for (const audit of audits) {
    if (audit.compliance) {
      passed += audit.compliance.passed;
      failed += audit.compliance.failed;
      warnings += audit.compliance.warnings;
    }
    if (audit.risk) {
      postureSum += postureScore(
        summarizeCompliance(audit.findings),
        audit.risk
      );
      postureCount += 1;
    }

    // severity counts across failing findings
    const sev = severityCount(audit.findings);
    for (const k of Object.keys(sev) as Severity[]) {
      risk[k] += sev[k];
    }

    vendorDistribution[audit.vendor] = (vendorDistribution[audit.vendor] ?? 0) + 1;
    if (audit.vendorStatus === "known") knownAnalyzed += 1;
    else unknownDetected += 1;

    for (const f of audit.findings) {
      if (f.status === "FAIL") topRisks.push({ ...f, auditId: audit.id });
    }

    if (audit.aiInterpretations) {
      aiInterpretations += audit.aiInterpretations.length;
      for (const ai of audit.aiInterpretations) {
        if (ai.status === "APPROVED") approvedMappings += 1;
        if (ai.status === "REJECTED") rejectedMappings += 1;
      }
    }
  }

  topRisks.sort((a, b) => b.risk - a.risk);
  const topRisksSliced = topRisks.slice(0, 6);

  const posture = postureCount ? Math.round(postureSum / postureCount) : 0;

  const score = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;

  return {
    posture,
    compliance: { passed, failed, warnings, score },
    risk,
    vendorDistribution,
    topRisks: topRisksSliced,
    adaptive: {
      knownAnalyzed,
      unknownDetected,
      aiInterpretations,
      approvedMappings: await (await repo.allApprovedMappings()).length,
      rejectedMappings,
      totalAudits: audits.length,
    },
    review: await reviewAggregate(),
  };
}
