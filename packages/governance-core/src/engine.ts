import type {
  ChangeImpactSummary,
  ChangeRequest,
  ChangeSimulation,
  ComplianceDriftItem,
  ComplianceException,
  ComplianceFrameworkDef,
  ComplianceFrameworkId,
  CompliancePassport,
  ConfigDiffItem,
  ConfigSetting,
  FrameworkCoverage,
  OrganizationProfile,
  RegionPolicyConflict,
  RegulatoryUpdate,
  RiskBand,
} from "@nexus/shared-types";
import { FRAMEWORKS, FRAMEWORK_INDEX } from "./frameworks";
import { EU_CODES, REGIONS, regionOf, industryOf } from "./regions";
import { GRAPH_INDEX, descendantsOf, nodeLabel, findNodesByIds } from "./dependencies";
import { VENDORS } from "./vendors";
import { GOVERNANCE_CONTROL_INDEX } from "./controls";

export type RiskDriverKey =
  | "technicalSeverity"
  | "businessCriticality"
  | "assetCriticality"
  | "exploitability"
  | "complianceImpact"
  | "dependencyCount"
  | "blastRadius"
  | "aiConfidence"
  | "changeComplexity";

export interface RiskDriver {
  label: string;
  points: number;
  max: number;
}

export interface RiskResult {
  score: number;
  band: RiskBand;
  drivers: RiskDriver[];
}

export interface PassportStateInput {
  openCritical: number;
  openHigh: number;
  activeExceptions: number;
  pendingApprovals: number;
  highRiskChanges: number;
  driftCount: number;
  vendorRiskAvg: number;
}

export function riskBandFromScore(securityScore: number): RiskBand {
  // securityScore is a compliance-style score (100 = excellent). Lower score => worse posture.
  if (securityScore >= 90) return "LOW";
  if (securityScore >= 78) return "MEDIUM";
  if (securityScore >= 62) return "HIGH";
  return "CRITICAL";
}

function bandOf(riskScore: number): RiskBand {
  if (riskScore >= 80) return "CRITICAL";
  if (riskScore >= 60) return "HIGH";
  if (riskScore >= 40) return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Regulatory Context Engine
// ---------------------------------------------------------------------------

function valueMatches(orgValue: unknown, operator: string, expect: string | string[]): boolean {
  if (operator === "always") return true;
  if (operator === "gte") return false; // not used by current data
  const values: string[] = Array.isArray(orgValue) ? (orgValue as string[]).map((v) => String(v)) : typeof orgValue === "string" ? [orgValue] : [];
  const expected = (Array.isArray(expect) ? expect : [expect]).map((e) => String(e));
  const norm = (list: string[]) => {
    const flatten: string[] = [];
    for (const v of list) {
      if (v === "EU") flatten.push(...EU_CODES);
      else flatten.push(v);
    }
    return flatten;
  };
  const orgNorm = norm(values);
  const expNorm = norm(expected);
  const intersection = orgNorm.some((v) => expNorm.includes(v));
  if (operator === "in" || operator === "any") return intersection;
  if (operator === "none") return !intersection;
  if (operator === "always") return true;
  return false;
}

export function triggersPass(fw: ComplianceFrameworkDef, org: OrganizationProfile): boolean {
  return fw.triggers.every((t) => valueMatches(org[t.field as keyof OrganizationProfile] as unknown, t.operator, t.value));
}

export function applicableFrameworks(org: OrganizationProfile): ComplianceFrameworkDef[] {
  return FRAMEWORKS.filter((f) => triggersPass(f, org));
}

export function applicableReason(fw: ComplianceFrameworkDef, _org: OrganizationProfile): string {
  if (fw.id === "gdpr") return "GDPR applies because the organization processes personal data of individuals in the EU.";
  if (fw.id === "dpdp") return "DPDP applies because the organization processes digital personal data of individuals in India.";
  if (fw.id === "certin") return "CERT-In applies because the organization operates covered entities in India.";
  if (fw.id === "nis2") return "NIS2 applies because the organization operates essential/important services in the EU.";
  if (fw.id === "dora") return "DORA applies because the organization operates in the EU financial sector or serves EU financial entities.";
  return fw.whyApplies;
}

// ---------------------------------------------------------------------------
// Compliance Passport
// ---------------------------------------------------------------------------

function penaltyFor(input: PassportStateInput): number {
  return input.openCritical * 0.6 + input.openHigh * 0.3 + input.driftCount * 0.8 + input.activeExceptions * 0.4 + input.highRiskChanges * 0.5;
}

export function coverageForFramework(fw: ComplianceFrameworkDef, input: PassportStateInput): FrameworkCoverage {
  const penalty = penaltyFor(input);
  const score = Math.max(0, Math.min(100, Math.round(fw.baselineScore - penalty)));
  const status: FrameworkCoverage["status"] = score >= 90 ? "COMPLIANT" : score >= 75 ? "PARTIAL" : score >= 55 ? "AT_RISK" : "NOT_ASSESSED";
  return {
    frameworkId: fw.id,
    code: fw.code,
    name: fw.name,
    region: fw.region,
    score,
    passedControls: fw.baselineControls.passed - Math.min(fw.baselineControls.passed, Math.ceil(penalty)),
    totalControls: fw.baselineControls.total,
    status,
    notes: [
      fw.whyApplies,
      penalty > 0 ? `${Math.round(penalty)} points deducted for open findings, drift and unapproved changes.` : "No negative signals detected for this framework.",
    ],
    applicable: true,
  };
}

export function computePassport(org: OrganizationProfile, input: PassportStateInput): CompliancePassport {
  const applicable = applicableFrameworks(org);
  const frameworks = applicable.map((fw) => coverageForFramework(fw, input));
  const weighted =
    frameworks.length === 0
      ? 0
      : Math.round(
          frameworks.reduce((acc, f) => acc + f.score * f.totalControls, 0) /
            frameworks.reduce((acc, f) => acc + f.totalControls, 0)
        );
  return {
    organization: org,
    globalScore: weighted,
    posture: riskBandFromScore(weighted),
    openCritical: input.openCritical,
    openHigh: input.openHigh,
    activeExceptions: input.activeExceptions,
    pendingApprovals: input.pendingApprovals,
    highRiskChanges: input.highRiskChanges,
    driftCount: input.driftCount,
    vendorRiskAvg: input.vendorRiskAvg,
    regions: org.regions.map(regionOf),
    industries: org.industries.map(industryOf),
    frameworks,
    applicableReasons: applicable.map((fw) => ({ frameworkId: fw.id, code: fw.code, reason: applicableReason(fw, org) })),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Risk Engine (explainable)
// ---------------------------------------------------------------------------

export interface RiskInputs {
  technicalSeverity: number; // 0..20
  exploitability: number; // 0..20
  businessCriticality: number; // 0..15
  assetCriticality: number; // 0..15
  complianceImpact: number; // 0..15
  dependencyCount: number; // 0..10
  broadcast?: number; // 0..10 blast radius
  aiConfidence?: number; // 0..100
  changeComplexity?: number; // 0..5
}

export function computeRisk(input: RiskInputs): RiskResult {
  const blast = input.broadcast ?? 0;
  const lowConfidencePenalty = input.aiConfidence !== undefined ? Math.max(0, Math.round((70 - input.aiConfidence) / 10)) : 0;
  const complexity = input.changeComplexity ?? 0;
  const drivers: RiskDriver[] = [
    { label: "Technical severity", points: input.technicalSeverity, max: 20 },
    { label: "Exploitability", points: input.exploitability, max: 20 },
    { label: "Business criticality", points: input.businessCriticality, max: 15 },
    { label: "Asset criticality", points: input.assetCriticality, max: 15 },
    { label: "Compliance impact", points: input.complianceImpact, max: 15 },
    { label: "Dependency count", points: input.dependencyCount, max: 10 },
    { label: "Blast radius", points: blast, max: 10 },
    { label: "AI confidence gap", points: lowConfidencePenalty, max: 10 },
    { label: "Change complexity", points: complexity, max: 5 },
  ].filter((d) => d.points > 0);
  const score = Math.max(0, Math.min(100, drivers.reduce((a, d) => a + d.points, 0)));
  return { score, band: bandOf(score), drivers };
}

export function riskBandLabel(score: number): RiskBand {
  return bandOf(score);
}

// ---------------------------------------------------------------------------
// Change Impact Analysis / Blast Radius
// ---------------------------------------------------------------------------

export function blastRadiusOf(targetIds: string[]): { ids: string[]; nodes: Array<{ id: string; label: string; type: string }> } {
  const ids = new Set<string>();
  targetIds.forEach((t) => {
    ids.add(t);
    descendantsOf(t).forEach((d) => ids.add(d));
  });
  const nodes = Array.from(ids).map((id) => {
    const n = GRAPH_INDEX.get(id);
    return { id, label: n?.label ?? nodeLabel(id), type: n?.type ?? "asset" };
  });
  return { ids: Array.from(ids), nodes };
}

export interface ImpactInput {
  changeId: string;
  title: string;
  targetSystems: string[];
  org: OrganizationProfile;
  aiConfidence?: number;
  rawSettings?: ConfigSetting[];
}

export function computeChangeImpact(inp: ImpactInput): ChangeImpactSummary {
  const { ids, nodes } = blastRadiusOf(inp.targetSystems);
  const affected = new Set(ids);
  const services = nodes.filter((n) => n.type === "service" || n.type === "identity" || n.type === "api");
  const apps = nodes.filter((n) => n.type === "application");
  const vendors = nodes.filter((n) => n.type === "vendor" || n.type === "subvendor");
  const critical = nodes.filter((n) => n.type === "asset" || n.type === "database");
  const depCount = affected.size;
  const hasLegacy = nodes.some((n) => n.type === "legacy");
  const risk = computeRisk({
    technicalSeverity: 12,
    exploitability: hasLegacy ? 14 : 8,
    businessCriticality: inp.org.criticality === "CRITICAL" ? 15 : inp.org.criticality === "HIGH" ? 12 : 8,
    assetCriticality: critical.length >= 1 ? 12 : 7,
    complianceImpact: 10,
    dependencyCount: Math.min(10, Math.round(depCount / 2)),
    broadcast: Math.min(10, Math.round(depCount / 1.5)),
    aiConfidence: inp.aiConfidence,
    changeComplexity: nodes.length > 8 ? 5 : Math.min(4, Math.round(nodes.length / 3)),
  });
  return {
    changeId: inp.changeId,
    changeTitle: inp.title,
    affectedAssets: critical.map((n) => n.label),
    affectedServices: services.map((n) => n.label),
    affectedApps: apps.map((n) => n.label),
    affectedVendors: vendors.map((n) => n.label),
    criticalAssets: critical.filter((n) => n.type === "asset").map((n) => n.label),
    dependencies: nodes.map((n) => n.label),
    dependencyCount: depCount,
    downstreamCount: depCount - inp.targetSystems.length,
    servicesCount: services.length,
    appsCount: apps.length,
    vendorsCount: vendors.length,
    criticalAssetsCount: critical.filter((n) => n.type === "asset").length,
    securityImpact: risk.band === "CRITICAL" || risk.band === "HIGH" ? "Change touches authentication or boundary controls" : "Limited to configuration hardening",
    complianceImpact: "Controls mapped across multiple frameworks are affected",
    availabilityImpact: hasLegacy ? "Legacy components may not support stricter policies" : "Primary services remain available during staged rollout",
    authenticationImpact: inp.targetSystems.some((t) => GRAPH_INDEX.get(t)?.type === "identity" || t === "identity")
      ? "Authentication flows terminate at affected identity components"
      : "No direct authentication path change",
    dataImpact: critical.length ? "Critical data-bearing assets are in the dependency path" : "No critical data assets affected",
    networkImpact: hasLegacy ? "Legacy network path may be incompatible" : "Boundary policies updated",
    potentialEffects: hasLegacy
      ? ["Service interruption", "Authentication failure", "Legacy compatibility issue"]
      : depCount > 6
        ? ["Transient errors", "Increased latency on dependent services"]
        : ["Contained — single platform"],
    risk: risk.band,
    blastRadius: depCount,
    recommendation: hasLegacy
      ? "SIMULATE FIRST — legacy compatibility risk detected."
      : depCount > 6
        ? "Staged rollout with monitoring required."
        : "Approach is low risk — proceed to review.",
    simulateFirst: hasLegacy || depCount > 6,
  };
}

// ---------------------------------------------------------------------------
// Change Simulator (What-If)
// ---------------------------------------------------------------------------

export function diffConfigs(before: ConfigSetting[], after: ConfigSetting[]): ConfigDiffItem[] {
  const byKey = new Map(after.map((c) => [c.key, c]));
  const diff: ConfigDiffItem[] = [];
  for (const b of before) {
    const a = byKey.get(b.key);
    if (!a) {
      diff.push({ key: b.key, label: b.label, category: b.category, current: b.value, proposed: "(removed)", change: "REMOVED" });
    } else if (a.value !== b.value) {
      diff.push({ key: b.key, label: b.label, category: b.category, current: b.value, proposed: a.value, change: "CHANGED" });
    }
  }
  for (const a of after) {
    if (!before.some((b) => b.key === a.key)) {
      diff.push({ key: a.key, label: a.label, category: a.category, current: "(absent)", proposed: a.value, change: "ADDED" });
    }
  }
  return diff;
}

export function runSimulation(change: ChangeRequest): ChangeSimulation {
  const diff = diffConfigs(change.configBefore, change.configAfter);
  const hardeningChanges = diff.filter((d) => d.change !== "REMOVED" && isHardening(d.key, d.proposed));
  const looseChanges = diff.filter((d) => isLoosening(d.key, d.proposed));
  const complianceDelta = Math.min(20, Math.round(hardeningChanges.length * 2.5 - looseChanges.length * 3));
  const securityDelta = Math.min(20, Math.round(hardeningChanges.length * 3.2 - looseChanges.length * 3));
  const { nodes } = blastRadiusOf(change.targetSystems);
  const hasLegacy = nodes.some((n) => n.type === "legacy");
  const legacyFlags = change.configAfter.some((c) => /legacy|radius|tls1/i.test(c.key) && /enable|allow|1\.0|1\.1|fallback/i.test(c.value));
  const compatibilityRisk: RiskBand = hasLegacy || legacyFlags ? "HIGH" : change.targetSystems.length > 3 ? "MEDIUM" : "LOW";
  const failureModes: string[] = [];
  if (hasLegacy || legacyFlags) failureModes.push("Legacy client compatibility failure");
  if (change.targetSystems.some((t) => t === "identity")) failureModes.push("Authentication interruption");
  if (change.targetSystems.some((t) => t === "api-gw")) failureModes.push("API gateway latency / rejections");
  if (nodes.length > 8) failureModes.push("Cascading dependency degradation");
  if (failureModes.length === 0) failureModes.push("No failure modes projected");
  const risk = computeRisk({
    technicalSeverity: 8,
    exploitability: 6,
    businessCriticality: change.risk === "CRITICAL" ? 15 : change.risk === "HIGH" ? 11 : 7,
    assetCriticality: 8,
    complianceImpact: Math.max(0, complianceDelta),
    dependencyCount: Math.min(10, Math.round(nodes.length / 2)),
    broadcast: Math.min(10, Math.round(nodes.length / 2)),
    aiConfidence: change.aiConfidence,
    changeComplexity: diff.length,
  });
  const status: ChangeSimulation["status"] = compatibilityRisk === "HIGH" ? "CONDITIONAL" : risk.band === "HIGH" || risk.band === "CRITICAL" ? "CONDITIONAL" : "PASSED";
  return {
    id: `sim-${change.id}-${Math.round(Date.now() / 1000)}`,
    changeId: change.id,
    diff,
    complianceDelta,
    securityDelta,
    compatibilityRisk,
    affectedSystems: nodes.map((n) => n.label),
    failureModes,
    blastRadius: nodes.length,
    riskScore: risk.score,
    recommendation:
      status === "CONDITIONAL"
        ? "TEST IN STAGING — conditional approval with monitoring requirements."
        : "Simulation passed — safe to proceed through the safety gate.",
    status,
    simulatedAt: new Date().toISOString(),
  };
}

function isHardening(key: string, value: string): boolean {
  if (/mfa|auth.*enable|encrypt|luks|audit|secure.*boot|restricted|disabled|full|1\.3|aes-256/i.test(key + " " + value)) return true;
  return /^(enabled|full|mandatory|restricted|aes-256|1\.3)$/i.test(value);
}

function isLoosening(key: string, value: string): boolean {
  return /^(disabled|optional|partial|open|shared|1\.0|1\.1)$/i.test(value) || /legacy.*enabled/i.test(key + " " + value);
}

// ---------------------------------------------------------------------------
// Exception Guardian
// ---------------------------------------------------------------------------

export interface ExceptionInput {
  change: ChangeRequest;
  org: OrganizationProfile;
  simulation?: ChangeSimulation | null;
  conflictTopics?: string[];
}

export function detectExceptions(inp: ExceptionInput): ComplianceException[] {
  const out: ComplianceException[] = [];
  const { nodes } = blastRadiusOf(inp.change.targetSystems);
  const hasLegacy = nodes.some((n) => n.type === "legacy");
  const sim = inp.simulation;
  const mayCreate = (partial: Pick<ComplianceException, "controlId" | "controlName" | "title" | "observed" | "issueType" | "aiConfidence" | "risk"> & Partial<ComplianceException>, slug?: string) => {
    if (inp.change.exceptions?.some((e) => e.controlId === partial.controlId && e.issueType === partial.issueType)) return;
    out.push({
      ...partial,
      id: slug && hasLegacy ? `exc-${slug}` : `exc-${Math.round(Math.random() * 1e6)}`,
      code: `NC-${Math.floor(2000 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      changeId: inp.change.id,
      autoRemediationBlocked: partial.autoRemediationBlocked ?? true,
      requiredReview: partial.requiredReview ?? true,
      affectedSystems: partial.affectedSystems ?? nodes.map((n) => n.label),
      compensatingControls: partial.compensatingControls ?? [],
      reasons: partial.reasons ?? [],
      status: partial.status ?? "OPEN",
    } as ComplianceException);
  };

  if (hasLegacy) {
    mayCreate({
      controlId: "AUTH-001",
      controlName: "Strong Authentication",
      title: "Legacy system cannot support the proposed authentication baseline",
      observed: "Legacy components in the dependency path do not implement the proposed control.",
      issueType: "LEGACY_SYSTEM",
      aiConfidence: inp.change.aiConfidence,
      risk: inp.change.risk,
      reasons: ["Automatic remediation blocked.", "Changing authentication configuration may affect a business-critical dependency."],
      compensatingControls: ["Network isolation for legacy segment", "Rate limiting at the gateway", "Enhanced monitoring"],
      affectedSystems: nodes.map((n) => n.label),
    }, "legacy");
  }

  if (sim?.compatibilityRisk === "HIGH") {
    mayCreate({
      controlId: "EMG-001",
      controlName: "Emergency and Change Controls",
      title: "Potentially destructive remediation requires governance",
      observed: "Simulation flagged high compatibility risk across the dependency path.",
      issueType: "DESTRUCTIVE_REMEDIATION",
      aiConfidence: inp.change.aiConfidence,
      risk: "HIGH",
      reasons: ["Simulation recommends staging first.", "Blast radius requires controlled rollout."],
      compensatingControls: ["Staging deployment", "Automated rollback", "Post-change verification"],
    }, "destructive");
  }

  if (inp.change.aiConfidence < 70 && inp.change.aiConfidence > 0) {
    mayCreate({
      controlId: "MFA-PRIV-001",
      controlName: "Multi-Factor Authentication for Privileged Access",
      title: "Low AI confidence on remediation analysis",
      observed: `AI confidence is ${inp.change.aiConfidence}%, below the 70% review threshold.`,
      issueType: "LOW_AI_CONFIDENCE",
      aiConfidence: inp.change.aiConfidence,
      risk: "MEDIUM",
      reasons: ["Human review is required below the confidence threshold.", "Automatic progression is blocked."],
      compensatingControls: ["Manual technical review", "Additional evidence collection"],
    }, "confidence");
  }

  if ((inp.conflictTopics?.length ?? 0) > 0) {
    mayCreate({
      controlId: "DATA-001",
      controlName: "Data Retention, Residency and Minimization",
      title: "Cross-region policy conflict affects this change",
      observed: "Regional requirements for the affected data controls differ.",
      issueType: "REGIONAL_CONFLICT",
      aiConfidence: inp.change.aiConfidence,
      risk: "HIGH",
      reasons: ["Security/legal review required.", "No unilateral regional default applied."],
      compensatingControls: ["Regional data classification", "Jurisdiction-aware policy"],
    }, "region");
  }

  if (inp.org.criticality === "CRITICAL") {
    mayCreate({
      controlId: "EMG-001",
      controlName: "Emergency and Change Controls",
      title: "Business-critical organization — elevated change governance",
      observed: "Organization criticality requires strict change governance for all production changes.",
      issueType: "CRITICAL_DEPENDENCY",
      aiConfidence: inp.change.aiConfidence,
      risk: "CRITICAL",
      reasons: ["Four-eyes approval may be required.", "Production Safety Gate enforced."],
      compensatingControls: ["Dual approval", "Change freeze awareness", "Rollback plan verified"],
    }, "critical-org");
  }

  return out;
}

// ---------------------------------------------------------------------------
// Compliance Drift
// ---------------------------------------------------------------------------

export function computeDrift(): ComplianceDriftItem[] {
  const now = Date.now();
  const at = (d: number) => new Date(now - d * 24 * 3600_000).toISOString();
  return [
    {
      id: "drift-mfa",
      title: "MFA disabled on production identity service",
      expected: "MFA enabled for privileged access",
      observed: "MFA disabled",
      controlId: "MFA-PRIV-001",
      controlName: "Multi-Factor Authentication for Privileged Access",
      system: "Identity Service",
      affectedSystems: ["Identity Service", "Admin Portal", "API Gateway"],
      risk: "HIGH",
      severity: "HIGH",
      detectedAt: at(2),
      status: "OPEN",
      findingCreated: true,
      frameworkIds: ["iso-27001", "nist-csf", "cis", "nis2", "certin"],
    },
    {
      id: "drift-tls",
      title: "TLS 1.0 re-enabled on legacy client endpoint",
      expected: "TLS 1.2+ only",
      observed: "TLS 1.0 enabled",
      controlId: "CRYPT-001",
      controlName: "Encryption in Transit and at Rest",
      system: "API Gateway",
      affectedSystems: ["Legacy Client", "API Gateway"],
      risk: "MEDIUM",
      severity: "MEDIUM",
      detectedAt: at(5),
      status: "OPEN",
      findingCreated: true,
      frameworkIds: ["iso-27001", "nist-csf", "cis"],
    },
    {
      id: "drift-logging",
      title: "Audit logging paused on file storage service",
      expected: "Logging enabled + streamed to SIEM",
      observed: "Logging disabled",
      controlId: "LOG-001",
      controlName: "Centralized Logging and Monitoring",
      system: "File Storage",
      affectedSystems: ["File Storage", "Notification Service"],
      risk: "MEDIUM",
      severity: "MEDIUM",
      detectedAt: at(9),
      status: "OPEN",
      findingCreated: true,
      frameworkIds: ["iso-27001", "nist-csf", "certin", "gdpr"],
    },
  ];
}

// ---------------------------------------------------------------------------
// Cross-region policy analyzer
// ---------------------------------------------------------------------------

export function computeRegionConflicts(org: OrganizationProfile): RegionPolicyConflict[] {
  const eu = org.customerRegions.some((r) => EU_CODES.includes(r));
  const us = org.customerRegions.includes("US") || org.regions.includes("US");
  const india = org.customerRegions.includes("IN") || org.regions.includes("IN");
  const conflicts: RegionPolicyConflict[] = [];

  if (eu && india && us) {
    conflicts.push({
      id: "conf-retention",
      topic: "Data retention policy",
      description: "Retention obligations differ across India, the EU and the United States.",
      currentPolicy: "Keep business records for 8 years globally",
      regionRequirements: [
        { region: "IN", label: "India", requirement: "CERT-In log retention (180 days) + sectoral record-keeping", frameworks: ["certin", "dpdp"] },
        { region: "EU", label: "European Union", requirement: "GDPR minimization - no retention beyond purpose", frameworks: ["gdpr", "nis2"] },
        { region: "US", label: "United States", requirement: "Sectoral retention + litigation hold obligations", frameworks: ["nist-sp800-53", "fedramp"] },
      ],
      risk: "HIGH",
      status: "DETECTED",
      detectedAt: new Date().toISOString(),
      recommendation: "Security/legal review required. Do not apply a single global retention default in regions with conflicting obligations.",
    });
  }

  if (eu && us) {
    conflicts.push({
      id: "conf-notification",
      topic: "Incident notification timelines",
      description: "Breach notification deadlines differ by jurisdiction.",
      currentPolicy: "Notify authority within 72 hours",
      regionRequirements: [
        { region: "EU", label: "European Union", requirement: "GDPR/NIS2 24-72 hour notification", frameworks: ["gdpr", "nis2"] },
        { region: "US", label: "United States", requirement: "Entity-specific notification rules (FTC, state laws)", frameworks: [] },
      ],
      risk: "MEDIUM",
      status: "DETECTED",
      detectedAt: new Date().toISOString(),
      recommendation: "Maintain a jurisdiction-aware notification matrix and pre-agreed legal response playbook.",
    });
  }

  if (india) {
    conflicts.push({
      id: "conf-residency",
      topic: "Data residency for Indian personal data",
      description: "DPDP-era guidance and sectoral rules interact with cross-border transfer controls.",
      currentPolicy: "Primary copy stored in primary operating region",
      regionRequirements: [
        { region: "IN", label: "India", requirement: "India-based copy for covered sectors + DPDP safeguards", frameworks: ["dpdp", "certin"] },
        { region: "EU", label: "European Union", requirement: "GDPR Chapter V transfer safeguards", frameworks: ["gdpr"] },
      ],
      risk: "MEDIUM",
      status: "DETECTED",
      detectedAt: new Date().toISOString(),
      recommendation: "Map data flows per jurisdiction and obtain legal review before transfer decisions.",
    });
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Regulatory change intelligence (configurable demo data)
// ---------------------------------------------------------------------------

export function regulatoryUpdates(): RegulatoryUpdate[] {
  const at = (d: number) => new Date(Date.now() - d * 24 * 3600_000).toISOString();
  return [
    {
      id: "reg-nis2-guidance",
      frameworkId: "nis2",
      frameworkCode: "NIS2",
      title: "NIS2 implementing act — cyber risk-management guidance published",
      type: "Update to framework guidance",
      summary: "Updated guidance on supply-chain and access-control expectations for essential entities.",
      effective: "2026-03-31",
      affectedControls: ["MFA-PRIV-001", "ACCESS-001", "VENDOR-001", "SEG-001", "LOG-001", "IR-001", "PATCH-001"],
      affectedVendors: ["Vendor A · IdentityCloud", "Vendor B · Gateway Systems"],
      affectedSystems: ["Identity Service", "Admin Portal"],
      affectedRegions: ["EU"],
      status: "ASSESSING",
      impact: "HIGH",
      publishedAt: at(3),
    },
    {
      id: "reg-dpdp-rules",
      frameworkId: "dpdp",
      frameworkCode: "DPDP",
      title: "DPDP draft rules — technical security safeguards",
      type: "Draft rules update",
      summary: "Draft rules clarify reasonable safeguards and breach notification expectations for data fiduciaries.",
      effective: "TBD (draft)",
      affectedControls: ["CRYPT-001", "LOG-001", "IR-001", "DATA-001", "AUDIT-001"],
      affectedVendors: ["Vendor A · IdentityCloud"],
      affectedSystems: ["Customer Portal"],
      affectedRegions: ["IN"],
      status: "REVIEW_REQUIRED",
      impact: "MEDIUM",
      publishedAt: at(8),
    },
    {
      id: "reg-certin-logs",
      frameworkId: "certin",
      frameworkCode: "CERT-In",
      title: "CERT-In direction periodic review — log retention scope",
      type: "Regulatory review",
      summary: "Amplification of log retention requirements for covered service providers and data centres.",
      effective: "2026-06-30",
      affectedControls: ["LOG-001", "AUDIT-001", "DATA-001"],
      affectedVendors: ["Vendor E · AWS"],
      affectedSystems: ["File Storage", "Notification Service"],
      affectedRegions: ["IN"],
      status: "NEW",
      impact: "MEDIUM",
      publishedAt: at(1),
    },
  ];
}

export function regulatoryImpact(frameworkId: ComplianceFrameworkId): { affectedControls: string[]; affectedVendors: string[]; affectedSystems: string[] } {
  const update = regulatoryUpdates().find((u) => u.frameworkId === frameworkId);
  if (!update) return { affectedControls: [], affectedVendors: [], affectedSystems: [] };
  return {
    affectedControls: update.affectedControls,
    affectedVendors: update.affectedVendors,
    affectedSystems: update.affectedSystems,
  };
}

// ---------------------------------------------------------------------------
// Vendor helpers
// ---------------------------------------------------------------------------

export function averageVendorRisk(): number {
  if (VENDORS.length === 0) return 0;
  const weights: Record<string, number> = { LOW: 20, MEDIUM: 50, HIGH: 75, CRITICAL: 95 };
  return Math.round(VENDORS.reduce((a, v) => a + (weights[v.risk] ?? 50), 0) / VENDORS.length);
}

export function orgSectorSummary(org: OrganizationProfile): { sectors: string[]; industries: string[] } {
  return {
    sectors: org.businessSectors,
    industries: org.industries.map((i) => industryOf(i).label),
  };
}

// ---------------------------------------------------------------------------
// Config setting presets for common remediation scenarios
// ---------------------------------------------------------------------------

export const PRESET_CONFIGS: Record<string, ConfigSetting[]> = {
  "MFA enforcement": [
    { key: "auth.mfa.privileged", label: "MFA for privileged access", value: "enabled", category: "Identity" },
    { key: "auth.local.enabled", label: "Local account login", value: "disabled", category: "Identity" },
    { key: "auth.radius.legacy", label: "Legacy RADIUS fallback", value: "disabled", category: "Identity" },
  ],
  "Encryption hardening": [
    { key: "enc.algorithm", label: "Data-at-rest encryption", value: "AES-256", category: "Crypto" },
    { key: "enc.key.rotation", label: "Key rotation period", value: "90d", category: "Crypto" },
    { key: "enc.kms.access", label: "KMS access model", value: "isolated", category: "Crypto" },
  ],
  "TLS 1.3 only": [
    { key: "tls.version.min", label: "TLS minimum version", value: "1.3", category: "Crypto" },
    { key: "tls.cipher.legacy", label: "Legacy cipher allowance", value: "disabled", category: "Crypto" },
    { key: "tls.cipher.ecdhe", label: "ECDHE cipher suites", value: "enabled", category: "Crypto" },
  ],
  "Management exposure restricted": [
    { key: "mgmt.source.restrict", label: "Management source restriction", value: "10.0.0.0/24", category: "Access" },
    { key: "mgmt.exposure", label: "Management interface exposure", value: "restricted", category: "Access" },
    { key: "mgmt.protocol", label: "Management protocol", value: "ssh-v2", category: "Access" },
  ],
  "Logging enabled": [
    { key: "log.enabled", label: "Logging enabled", value: "true", category: "Monitoring" },
    { key: "log.siem.stream", label: "SIEM streaming", value: "enabled", category: "Monitoring" },
    { key: "log.retention", label: "Log retention (days)", value: "180", category: "Monitoring" },
  ],
  "Segmentation enforced": [
    { key: "seg.zone.boundary", label: "Zone boundary policy", value: "default-deny", category: "Network" },
    { key: "seg.ot.it", label: "OT/IT segmentation", value: "full", category: "Network" },
  ],
};

export { FRAMEWORKS, FRAMEWORK_INDEX, GOVERNANCE_CONTROL_INDEX, findNodesByIds, REGIONS, VENDORS };