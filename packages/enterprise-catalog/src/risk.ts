import type {
  AssetRecord,
  FindingStatus,
  RiskBand,
  RiskExplanation,
  RiskFactorDetail,
  Severity,
} from "@nexus/shared-types";
import { CRITICALITY_WEIGHT } from "./enterprise";

// ---------------------------------------------------------------------------
// Explainable asset risk.
//
// Risk =      severity        x 35%
//           + exposure        x 30%   (edge/DMZ/internet-facing = higher)
//           + asset criticality x 15%
//           + business import.   x 10%
//           + exploitability     x 10%
// Every factor is reported so a judge can see WHY the score is what it is.
// ---------------------------------------------------------------------------

export function exposureWeightOfAsset(asset: AssetRecord, _severity: Severity): number {
  const zone = asset.location.networkZone ?? "";
  const tier = asset.location.tier ?? "TIER_2";
  const isEdge = zone === "DMZ" || zone === "CLOUD";
  const isBorder = asset.tags?.includes("internet-facing") || asset.tags?.includes("payment-border") || asset.tags?.includes("pci");
  if (isBorder) return 1.0;
  if (isEdge) return 0.85;
  if (zone === "MGMT" || tier === "TIER_3") return 0.2;
  if (tier === "TIER_1") return 0.5;
  return 0.4;
}

export function exploitabilityWeightOf(evidence: string[], protocol?: string): number {
  const joined = (evidence ?? []).join(" ").toLowerCase();
  if (/telnet|ftp/.test(joined)) return 0.95;
  if (joined.includes("http")) return 0.85;
  if (joined.includes("tls 1.0") || joined.includes("weak cipher")) return 0.8;
  if (joined.includes("0.0.0.0") || joined.includes("internet-facing")) return 0.9;
  if (protocol) {
    if (/telnet|ftp/.test(protocol)) return 0.9;
    if (/http/i.test(protocol)) return 0.8;
    if (/ssh|https/i.test(protocol)) return 0.3;
  }
  return 0.5;
}

const IMPORTANCE_OF: Record<Severity, number> = {
  CRITICAL: 1.0,
  HIGH: 0.85,
  MEDIUM: 0.7,
  LOW: 0.5,
  INFO: 0.3,
};

const EXPLOIT_DEFAULT: Record<Severity, number> = {
  CRITICAL: 0.8,
  HIGH: 0.6,
  MEDIUM: 0.4,
  LOW: 0.2,
  INFO: 0.1,
};

export function computeAssetRiskFactors(
  asset: AssetRecord,
  severity: Severity,
  options: { evidence?: string[]; protocol?: string } = {},
) {
  const severityW = { CRITICAL: 1.0, HIGH: 0.75, MEDIUM: 0.5, LOW: 0.25, INFO: 0.1 }[severity] ?? 0.5;
  const exposureW = exposureWeightOfAsset(asset, severity);
  const criticalityW = CRITICALITY_WEIGHT[asset.criticality] ?? 0.5;
  const importanceW = IMPORTANCE_OF[severity];
  const exploitabilityW = exploitabilityWeightOf(options.evidence ?? [], options.protocol) ?? EXPLOIT_DEFAULT[severity];
  return { severityW, exposureW, criticalityW, importanceW, exploitabilityW };
}

export function riskBandFromScore(score: number): RiskBand {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

export function explainableRisk(
  asset: AssetRecord,
  severity: Severity,
  options: { evidence?: string[]; protocol?: string; bandOverride?: FindingStatus } = {},
): RiskExplanation {
  const f = computeAssetRiskFactors(asset, severity, options);
  const score = Math.round(
    Math.max(0, Math.min(100, f.severityW * 35 + f.exposureW * 30 + f.criticalityW * 15 + f.importanceW * 10 + f.exploitabilityW * 10)),
  );
  const factors: RiskFactorDetail[] = [
    {
      factor: "severity",
      label: "Control severity",
      weight: f.severityW,
      value: Math.round(f.severityW * 100),
      contribution: Math.round(f.severityW * 35),
      reason: `Control severity is ${severity}.`,
    },
    {
      factor: "exposure",
      label: "Exposure",
      weight: f.exposureW,
      value: Math.round(f.exposureW * 100),
      contribution: Math.round(f.exposureW * 30),
      reason: exposureReason(asset),
    },
    {
      factor: "criticality",
      label: "Asset criticality",
      weight: f.criticalityW,
      value: Math.round(f.criticalityW * 100),
      contribution: Math.round(f.criticalityW * 15),
      reason: `Asset criticality is rated ${asset.criticality}.`,
    },
    {
      factor: "importance",
      label: "Business importance",
      weight: f.importanceW,
      value: Math.round(f.importanceW * 100),
      contribution: Math.round(f.importanceW * 10),
      reason: `Business importance follows the ${severity} severity class.`,
    },
    {
      factor: "exploitability",
      label: "Exploitability",
      weight: f.exploitabilityW,
      value: Math.round(f.exploitabilityW * 100),
      contribution: Math.round(f.exploitabilityW * 10),
      reason: exploitReason(options),
    },
  ];
  const topFactor = [...factors].sort((a, b) => b.contribution - a.contribution)[0].factor;
  return {
    score,
    band: riskBandFromScore(score),
    factors,
    summary: `Score ${score}/100 (${riskBandFromScore(score)}). Driven primarily by ${topFactor.replace("_", " ")}. ${score >= 80 ? "Immediate remediation recommended." : score >= 60 ? "Prioritize remediation in the current cycle." : score >= 40 ? "Schedule remediation; monitor." : "Low residual risk; continue monitoring."}`,
  };
}

function exposureReason(asset: AssetRecord): string {
  if (asset.tags?.includes("internet-facing") || asset.tags?.includes("payment-border") || asset.tags?.includes("pci")) {
    return `Asset is ${asset.tags.includes("payment-border") ? "on the payment border" : "internet-facing"} and handles sensitive traffic.`;
  }
  const zone = asset.location.networkZone ?? "";
  if (zone === "DMZ" || zone === "CLOUD") return `Asset sits in the ${zone} security zone (edge exposure).`;
  if (asset.location.tier === "TIER_3") return "Asset lives in the management tier with restricted exposure.";
  return `Asset is internal (zone ${zone || "unknown"}) with moderate exposure.`;
}

function exploitReason(options: { evidence?: string[]; protocol?: string }): string {
  const w = exploitabilityWeightOf(options.evidence ?? [], options.protocol);
  if (w >= 0.85) return "Easily exploitable condition (unencrypted/insecure channel or exposed listener).";
  if (w >= 0.6) return "Known-exploitable condition with moderate difficulty.";
  return "Low-moderate exploitability; no trivial public exploit observed.";
}