import type {
  AssetFinding,
  AssetRecord,
  AiProviderMode,
  EvidenceRecord,
  FindingAnalysis,
} from "@nexus/shared-types";
import { getAssetControlById } from "@nexus/enterprise-catalog";
import type { Instantiation } from "./assetService";

/**
 * Deterministic, evidence-grounded finding analysis.
 *
 * Every narrative statement is derived from the evaluated control, the
 * normalized evidence and the explainable risk calculation — NOT from free-form
 * model output. When AI_PROVIDER=live the service tries the Python AI worker
 * and falls back to this deterministic analysis if it is unreachable.
 */
export async function analyzeFinding(ctx: Instantiation, finding: AssetFinding, asset: AssetRecord, evidence: EvidenceRecord[]): Promise<FindingAnalysis> {
  const analysis = buildAnalysis(finding, asset, evidence);

  const providerMode: AiProviderMode = process.env.AI_PROVIDER === "live" ? "live" : "mock";
  let liveResult: FindingAnalysis | null = null;
  if (providerMode === "live") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${process.env.AI_SERVICE_URL ?? "http://localhost:8000"}/api/ai/analyze-finding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId: finding.id,
          title: finding.what,
          controlId: finding.controlId,
          severity: finding.severity,
          riskScore: finding.risk,
          riskBand: finding.riskExplanation?.band,
          assetName: asset.name,
          assetType: asset.assetType,
          environment: asset.environment,
          evidence: evidence.map((e) => ({ type: e.evidenceType, observedValue: e.observedValue, expectedValue: e.expectedValue, source: e.source })),
          reason: finding.why,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as FindingAnalysis;
        liveResult = { ...data, provider: "live" };
      }
    } catch {
      liveResult = null;
    }
  }
  return liveResult ?? analysis;
}

function buildAnalysis(finding: AssetFinding, asset: AssetRecord, evidence: EvidenceRecord[]): FindingAnalysis {
  const control = getAssetControlById(finding.controlId);
  const riskExplanation = finding.riskExplanation;
  const currentRisk = riskExplanation?.score ?? finding.risk;
  const bandLabel = riskExplanation?.band ?? "HIGH";

  const topEvidence = evidence.slice(0, 3);
  const evidenceNotes = topEvidence.length
    ? `Ground truth from ${topEvidence.length} evidence record(s): ${topEvidence
        .map((e) => `${e.controlId} observed=${e.observedValue} (expected ${e.expectedValue}, source ${e.source})`)
        .join("; ")}.`
    : "No machine evidence was collected for this finding — treat as unverified until a scan provides evidence.";

  return {
    findingId: finding.id,
    findingTitle: finding.what,
    controlId: finding.controlId,
    severity: finding.severity,
    riskScore: currentRisk,
    riskBand: riskExplanation?.band ?? "HIGH",
    assetName: asset.name,
    assetType: asset.assetType,
    environment: asset.environment,
    provider: "mock",
    model: "nexus-evidence-grounded-v1",
    analysis: {
      explanation: `Control ${finding.controlId} (${
        control?.name ?? finding.controlName
      }) reports ${finding.status.toLowerCase()} on ${asset.name}: ${finding.why}`,
      whyItMatters: `${control?.name ?? finding.controlName} protects the confidentiality/integrity of ${
        asset.tags?.includes("pci") ? "cardholder data" : asset.tags?.includes("pii") ? "personal data" : "sensitive traffic"
      }. ${finding.severity} severity makes this a ${bandLabel} concern.`,
      potentialImpact:
        currentRisk >= 80
          ? "Exploitation could expose sensitive data or allow unauthorized control of the asset, cascading to dependent services and business data."
          : currentRisk >= 60
            ? "Exploitation poses a material risk to the affected asset and its dependent services."
            : "Exploitation risk is bounded; residual exposure remains and warrants scheduled remediation.",
      rootCauseHypothesis: rootCause(finding, asset),
      recommendedRemediation: control?.remediation ?? finding.recommendedFix,
      validationSteps: [
        "Re-run asset scan and confirm the control now evaluates PASS.",
        "Confirm normalized evidence shows the expected value in the controlled environment.",
        "Inspect the new verification record before closing the remediation.",
      ],
      rollbackConsiderations:
        "The remediation snapshots the prior observed state; if verification fails, the action can be rolled back to restore the previous configuration.",
      executiveSummary: `${asset.name} (#${asset.assetType}) failed control ${finding.controlId} with ${finding.status.toLowerCase()} status. Evidence-grounded risk is ${currentRisk}/100 (${bandLabel}). Remediation is proposed, validated and executed only after human approval.`,
    },
    evidenceSummary: {
      evidenceAvailable: evidence.length > 0,
      count: evidence.length,
      notes: evidenceNotes,
    },
    generatedAt: new Date().toISOString(),
  };
}

function rootCause(finding: AssetFinding, asset: AssetRecord): string {
  const v = asset.observedState;
  if (v.tlsMinVersion && finding.controlId === "TLS-001") return `Observed minimum TLS ${String(v.tlsMinVersion)} is below the required TLS 1.2 — legacy cipher policy inherited from an older hardening baseline.`;
  if (v.dbBindAddress === "0.0.0.0") return "Database listener bound to 0.0.0.0 — outside the data zone binding policy.";
  if (v.plaintextSecrets === true) return "Secrets stored in plaintext configuration/environment — no vault integration for this deployment.";
  if (v.mqAuthRequired === false) return "Broker allows anonymous connections — authentication not enabled on the vhost.";
  if (v.firewallAnyRules && Number(v.firewallAnyRules) > 5) return "Firewall policy contains excessive broad allow rules replacing least-privilege entries.";
  if (v.configChecksum && v.configChecksum !== v.expectedChecksum) return "Deployed configuration checksum differs from the approved baseline — drift detected.";
  return `Configuration evidence for ${finding.controlId} on ${asset.name} is inconsistent with the required baseline — manual review of observed state advised.`;
}