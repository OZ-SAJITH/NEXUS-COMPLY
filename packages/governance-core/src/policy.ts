import type {
  ApplicabilityStatus,
  ComplianceFrameworkDef,
  FrameworkApplicability,
  FrameworkApplicabilityReason,
  FrameworkCategory,
  GovernanceContext,
  GovernanceEvaluation,
  GovernanceScores,
  OrganizationProfile,
  PolicyConflict,
  PolicyConflictFrameworkRef,
  RegionGovernanceScore,
} from "@nexus/shared-types";
import { FRAMEWORKS, FRAMEWORK_INDEX } from "./frameworks";
import { EU_CODES, REGIONS, regionOf, industryOf, DATA_TYPES } from "./regions";
import { coverageForFramework, triggersPass, type PassportStateInput } from "./engine";

/**
 * Deterministic policy engine. Governs which compliance/cyber frameworks
 * apply to an organization from region + industry + data + criticality.
 * NO LLM involvement — pure rule evaluation.
 */

export const GOVERNANCE_DISCLAIMER =
  "Framework applicability is determined from configured organizational context. NEXUS-COMPLY provides technical compliance assessment and does not constitute legal advice or certification.";

// ---------------------------------------------------------------------------
// Framework taxonomy
// ---------------------------------------------------------------------------

export const FRAMEWORK_CATEGORY: Record<string, FrameworkCategory> = {
  "nist-csf": "GLOBAL_BASELINE",
  cis: "GLOBAL_BASELINE",
  "iso-27001": "GLOBAL_BASELINE",
  "cis-benchmarks": "SECURITY_BASELINE",
  "nist-sp800-53": "SECURITY_BASELINE",
  "nist-sp800-171": "INDUSTRY",
  stig: "INDUSTRY",
  cisaguidance: "REGIONAL",
  nis2: "REGIONAL",
  dora: "INDUSTRY",
  gdpr: "REGIONAL",
  certin: "REGIONAL",
  dpdp: "REGIONAL",
  nciplc: "REGIONAL",
};

const FRAMEWORK_SHORT_NAME: Record<string, string> = {
  "nist-csf": "NIST CSF",
  cis: "CIS Controls",
  "iso-27001": "ISO/IEC 27001",
  "cis-benchmarks": "CIS Benchmarks",
  "nist-sp800-53": "NIST SP 800-53",
  "nist-sp800-171": "NIST 800-171",
  stig: "DISA STIG",
  cisaguidance: "CISA Guidance",
  nis2: "NIS2",
  dora: "DORA",
  gdpr: "GDPR",
  certin: "CERT-In",
  dpdp: "DPDP",
  nciplc: "NCIIPC",
};

const GESTALT_LABEL: Record<string, string> = {
  GLOBAL: "Global",
  EU: "European Union",
  US: "United States",
  INDIA: "India",
  APAC: "APAC",
  OTHER: "Other",
};

const GESTALT_FLAG: Record<string, string> = {
  GLOBAL: "🌐",
  EU: "🇪🇺",
  US: "🇺🇸",
  INDIA: "🇮🇳",
  APAC: "🌏",
  OTHER: "🏳️",
};

export const FRAMEWORK_CATEGORY_LABEL: Record<FrameworkCategory, { label: string; short: string }> = {
  GLOBAL_BASELINE: { label: "Global Baseline", short: "GLOBAL" },
  REGIONAL: { label: "Regional Requirement", short: "REGIONAL" },
  INDUSTRY: { label: "Industry Requirement", short: "INDUSTRY" },
  SECURITY_BASELINE: { label: "Security Baseline", short: "SECURITY" },
};

export function categoryOf(fw: Pick<ComplianceFrameworkDef, "id" | "bloc">): FrameworkCategory {
  return FRAMEWORK_CATEGORY[fw.id] ?? (fw.bloc === "GLOBAL" ? "GLOBAL_BASELINE" : "REGIONAL");
}

export function shortNameOf(fw: Pick<ComplianceFrameworkDef, "id" | "code">): string {
  return FRAMEWORK_SHORT_NAME[fw.id] ?? fw.code;
}

// ---------------------------------------------------------------------------
// Organizational context
// ---------------------------------------------------------------------------

export type PolicyField =
  | "regions"
  | "primaryRegion"
  | "industries"
  | "dataTypes"
  | "criticality"
  | "orgType"
  | "cloud"
  | "businessSectors";

export interface PolicyRuleDef {
  field: PolicyField;
  op: "any" | "all" | "none" | "is" | "always";
  value: string | string[];
  label: string;
}

interface FlatContext {
  regions: string[];
  primaryRegion: string;
  industries: string[];
  dataTypes: string[];
  criticality: string;
  orgType: string;
  cloud: string;
  businessSectors: string[];
}

export function orgTypeOf(org: OrganizationProfile): string {
  if (org.size === "GOVERNMENT") return "Government / Public Body";
  if (org.industries.includes("government")) return "Government / Public Body";
  if (org.industries.includes("cloud-provider")) return "Cloud Service Provider";
  if (org.industries.includes("defense") || org.industries.includes("defense-contractor")) return "Defense / Public Sector";
  if (org.industries.includes("healthcare")) return "Healthcare Organization";
  if (org.industries.includes("finance") || org.industries.includes("banking")) return "Financial / Regulated Entity";
  if (org.industries.includes("telecommunications")) return "Telecommunications Operator";
  if (org.industries.includes("critical-infrastructure")) return "Critical Infrastructure Operator";
  if (org.size === "ENTERPRISE") return "Enterprise Organization";
  if (org.size === "MID") return "Mid-Market Organization";
  return "Private Organization";
}

export function primaryRegionOf(org: OrganizationProfile): string {
  return org.primaryRegion ?? org.regions[0] ?? "GLOBAL";
}

export function flatContext(org: OrganizationProfile): FlatContext {
  return {
    regions: [...(org.regions ?? []), ...(org.customerRegions ?? [])],
    primaryRegion: primaryRegionOf(org),
    industries: org.industries ?? [],
    dataTypes: org.dataTypes ?? [],
    criticality: org.criticality,
    orgType: org.orgType ?? orgTypeOf(org),
    cloud: org.cloud,
    businessSectors: org.businessSectors ?? [],
  };
}

function expandValue(value: string | string[]): string[] {
  const list = (Array.isArray(value) ? value : [value]).map((v) => String(v));
  const out: string[] = [];
  for (const v of list) {
    if (v === "EU") out.push(...EU_CODES);
    else if (v === "GLOBAL") out.push(...REGIONS.map((r) => r.code));
    else out.push(v);
  }
  return out;
}

export function matchRule(rule: PolicyRuleDef, ctx: FlatContext): boolean {
  if (rule.op === "always") return true;
  const expected = expandValue(rule.value);
  const actual = (() => {
    switch (rule.field) {
      case "regions":
        return ctx.regions;
      case "primaryRegion":
        return [ctx.primaryRegion];
      case "industries":
        return ctx.industries;
      case "dataTypes":
        return ctx.dataTypes;
      case "criticality":
        return [ctx.criticality];
      case "orgType":
        return [ctx.orgType];
      case "cloud":
        return [ctx.cloud];
      case "businessSectors":
        return ctx.businessSectors;
      default:
        return [];
    }
  })();
  if (rule.field === "regions") {
    const eu = rule.value.includes("EU") ? EU_CODES.some((c) => actual.includes(c)) : false;
    const direct = actual.some((a) => expected.includes(a));
    const match = eu || direct;
    return rule.op === "none" ? !match : match;
  }
  const inter = actual.some((a) => expected.includes(a));
  if (rule.op === "any" || rule.op === "is") return inter;
  if (rule.op === "all") return expected.every((e) => actual.includes(e));
  if (rule.op === "none") return !inter;
  return false;
}

// ---------------------------------------------------------------------------
// Applicability rules (deterministic)
// ---------------------------------------------------------------------------

const ESSENTIAL_SECTORS = [
  "healthcare",
  "finance",
  "banking",
  "energy",
  "transportation",
  "telecommunications",
  "critical-infrastructure",
  "education",
  "government",
  "cloud-provider",
  "software-saas",
];

const POLICY_RULES: Record<string, PolicyRuleDef[]> = {
  "nist-csf": [{ field: "criticality", op: "always", value: [], label: "Applicable as a general risk-based cybersecurity framework for organizations across all regions and industries." }],
  cis: [{ field: "criticality", op: "always", value: [], label: "Applied as a major prioritized control baseline protecting against the most common attack techniques." }],
  "iso-27001": [{ field: "criticality", op: "always", value: [], label: "Adopted as the international information security baseline accepted in every region and industry." }],
  "cis-benchmarks": [{ field: "criticality", op: "always", value: [], label: "Applied as the default technical hardening baseline for servers, endpoints and cloud workloads." }],
  "nist-sp800-53": [
    { field: "regions", op: "any", value: ["US"], label: "Organization operates in the United States." },
    { field: "businessSectors", op: "any", value: ["GOVERNMENT", "PUBLIC_SECTOR", "CRITICAL_INFRA", "DEFENSE"], label: "Organization operates under a U.S. federal / public-sector impact baseline." },
  ],
  "nist-sp800-171": [
    { field: "industries", op: "any", value: ["defense", "defense-contractor", "government"], label: "Organization is a defense or government contractor relationship." },
    { field: "dataTypes", op: "any", value: ["CLASSIFIED", "INTERNAL"], label: "Organization processes Controlled Unclassified Information (CUI) or restricted data." },
  ],
  fedramp: [
    { field: "regions", op: "any", value: ["US"], label: "Organization operates in the United States." },
    { field: "industries", op: "any", value: ["cloud-provider", "software-saas"], label: "Organization provides cloud or SaaS services that may be offered to U.S. federal buyers." },
  ],
  stig: [{ field: "industries", op: "any", value: ["defense", "defense-contractor", "government", "critical-infrastructure"], label: "Defense, government or critical-infrastructure systems require DoD STIG configuration baselines." }],
  cisaguidance: [
    { field: "regions", op: "any", value: ["US"], label: "Organization operates in the United States." },
    { field: "industries", op: "any", value: ["critical-infrastructure", "telecommunications", "energy", "finance", "healthcare", "technology", "cloud-provider"], label: "Sector is covered by CISA operational advisories and Zero Trust maturity guidance." },
  ],
  nis2: [
    { field: "regions", op: "any", value: ["EU"], label: "Organization operates in the European Union." },
    { field: "industries", op: "any", value: ESSENTIAL_SECTORS, label: "Organization provides essential or important services under EU NIS2." },
  ],
  dora: [
    { field: "regions", op: "any", value: ["EU"], label: "Organization operates in the European Union." },
    { field: "industries", op: "any", value: ["finance", "banking", "software-saas", "cloud-provider"], label: "Organization is a financial entity in scope of DORA, or supplies ICT services to EU financial entities (ICT third-party)." },
  ],
  gdpr: [
    { field: "regions", op: "any", value: ["EU"], label: "Organization operates in the European Union." },
    { field: "dataTypes", op: "any", value: ["PERSONAL"], label: "Organization processes personal data of individuals in the EU." },
  ],
  certin: [{ field: "regions", op: "any", value: ["IN"], label: "Organization operates covered entities in India under CERT-In directions." }],
  dpdp: [
    { field: "regions", op: "any", value: ["IN"], label: "Organization operates in India." },
    { field: "dataTypes", op: "any", value: ["PERSONAL"], label: "Organization processes digital personal data of individuals in India." },
  ],
  nciplc: [
    { field: "regions", op: "any", value: ["IN"], label: "Organization operates in India." },
    { field: "industries", op: "any", value: ["critical-infrastructure", "energy", "defense", "telecommunications", "finance", "banking", "government", "transportation"], label: "Organization operates or services national critical information infrastructure (CII)." },
  ],
};

const POLICY_CONDITIONAL_NOTES: Record<string, string> = {
  "nist-sp800-53": "Applies to federal systems and FedRAMP authorizations — confirm the U.S. federal / public-sector baseline applies.",
  "nist-sp800-171": "Applies under DFARS 7012 where the organization contracts with the U.S. DoD handling CUI.",
  fedramp: "FedRAMP applies only when offering cloud services to U.S. federal buyers.",
  nis2: "NIS2 applies to essential/important entities — confirm sector designation with legal review.",
  dora: "DORA requires financial-sector applicability. Do NOT mark DORA applicable merely because the EU is selected.",
  gdpr: "GDPR applies when processing personal data of individuals in the EU.",
  dpdp: "DPDP applies when processing digital personal data of individuals in India.",
  cisaguidance: "CISA guidance applies where the sector is covered by U.S. CISA advisories.",
  nciplc: "NCIIPC applies where the organization operates national critical information infrastructure.",
};

const DEFAULT_BASELINES = ["nist-csf", "cis", "iso-27001", "cis-benchmarks"];

export function evaluateFramework(org: OrganizationProfile, fw: ComplianceFrameworkDef): FrameworkApplicability {
  const ctx = flatContext(org);
  const category = categoryOf(fw);
  const region = fw.bloc;
  const regionLabel = GESTALT_LABEL[fw.bloc] ?? regionOf(fw.region).label;
  const shortName = shortNameOf(fw);

  const isBaseline = DEFAULT_BASELINES.includes(fw.id);
  const rules = POLICY_RULES[fw.id] ?? null;

  let reasons: FrameworkApplicabilityReason[];
  let status: ApplicabilityStatus;
  let condition: string | undefined;

  if (isBaseline) {
    reasons = [
      {
        key: "baseline:default",
        text: "Adopted as an organizational cybersecurity baseline across all operating regions and industries.",
        matched: true,
      },
    ];
    status = "ACTIVE";
  } else if (rules) {
    reasons = rules.map((r) => ({
      key: `${r.field}:${String(r.value)}`,
      text: r.label,
      matched: matchRule(r, ctx),
    }));
    const matchedCount = reasons.filter((r) => r.matched).length;
    if (matchedCount === reasons.length) {
      status = "ACTIVE";
    } else if (matchedCount > 0) {
      status = "CONDITIONAL";
      condition = POLICY_CONDITIONAL_NOTES[fw.id];
    } else {
      status = "NOT_APPLICABLE";
      condition = POLICY_CONDITIONAL_NOTES[fw.id];
    }
  } else {
    const pass = triggersPass(fw, org);
    reasons = [{ key: "triggers", text: fw.whyApplies, matched: pass }];
    status = pass ? "ACTIVE" : (POLICY_RULES[fw.id] ? "CONDITIONAL" : "NOT_APPLICABLE");
  }

  return {
    frameworkId: fw.id,
    code: fw.code,
    name: fw.name,
    shortName,
    version: fw.version,
    category,
    region,
    regionLabel,
    status,
    applicabilityLabel: status === "ACTIVE" ? "Applicable framework" : status === "CONDITIONAL" ? "Conditional" : "Not applicable",
    condition,
    reasons,
    controlIds: fw.controlIds,
    baselineScore: fw.baselineScore,
  };
}

export function governanceContext(org: OrganizationProfile): GovernanceContext {
  const primary = primaryRegionOf(org);
  const operating = [...new Set([...(org.regions ?? [])])];
  const primaryLabel = primary === "GLOBAL" ? "Global / Multi-region" : regionOf(primary).label;
  return {
    organization: { id: org.id, name: org.name, descriptions: org.description ? [org.description] : [] },
    primaryRegion: primary,
    primaryRegionLabel: primaryLabel,
    operatingRegions: operating,
    operatingRegionLabels: operating.map((r) => regionOf(r).label),
    industryIds: org.industries ?? [],
    industryLabels: (org.industries ?? []).map((id) => industryOf(id).label),
    orgType: org.orgType ?? orgTypeOf(org),
    dataTypes: (org.dataTypes ?? []).map((d) => dataTypeLabel(d)),
    criticality: org.criticality,
    cloud: org.cloud,
  };
}

function dataTypeLabel(id: string): string {
  return DATA_TYPES.find((d) => d.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Weighted scoring
// ---------------------------------------------------------------------------

const ZERO_INPUT: PassportStateInput = {
  openCritical: 0,
  openHigh: 0,
  activeExceptions: 0,
  pendingApprovals: 0,
  highRiskChanges: 0,
  driftCount: 0,
  vendorRiskAvg: 50,
};

function adjustedCoverage(fw: ComplianceFrameworkDef, input?: PassportStateInput) {
  return coverageForFramework(fw, input ?? ZERO_INPUT);
}

function weightedScore(items: Array<{ score: number; weight: number }>, fallback = 0): number {
  const totalWeight = items.reduce((a, i) => a + i.weight, 0);
  if (totalWeight <= 0) return fallback;
  return Math.round(items.reduce((a, i) => a + i.score * i.weight, 0) / totalWeight);
}

export function computeGovernanceScores(
  _org: OrganizationProfile,
  applicable: FrameworkApplicability[],
  input?: PassportStateInput
): GovernanceScores {
  const active = applicable.filter((a) => a.status === "ACTIVE");
  const withCoverage = active.map((a) => {
    const fw = FRAMEWORK_INDEX.get(a.frameworkId);
    const cov = fw ? adjustedCoverage(fw, input) : { score: a.baselineScore, totalControls: a.controlIds.length, passedControls: 0 };
    return { a, score: cov.score, total: cov.totalControls };
  });

  const globalBaseline = weightedScore(withCoverage.filter((x) => x.a.category === "GLOBAL_BASELINE").map((x) => ({ score: x.score, weight: x.total })));
  const regional = weightedScore(withCoverage.filter((x) => x.a.category === "REGIONAL").map((x) => ({ score: x.score, weight: x.total })));
  const industry = weightedScore(withCoverage.filter((x) => x.a.category === "INDUSTRY").map((x) => ({ score: x.score, weight: x.total })));
  const overall = weightedScore(withCoverage.map((x) => ({ score: x.score, weight: x.total })));

  const byRegionList: RegionGovernanceScore[] = [];
  const regionKeys = [...new Set(withCoverage.map((x) => x.a.region))].sort();
  for (const key of regionKeys) {
    const items = withCoverage.filter((x) => x.a.region === key);
    byRegionList.push({
      region: key,
      label: GESTALT_LABEL[key] ?? key,
      flag: GESTALT_FLAG[key] ?? "🏳️",
      activeFrameworks: items.length,
      conditionalFrameworks: applicable.filter((a) => a.status === "CONDITIONAL" && a.region === key).length,
      score: weightedScore(items.map((x) => ({ score: x.score, weight: x.total }))),
    });
  }

  return {
    overall,
    globalBaseline,
    regional,
    industry,
    byRegion: byRegionList,
    method:
      "Overall is the control-weighted average score across ACTIVE frameworks. Global Baseline averages GLOBAL_BASELINE frameworks; Regional averages REGIONAL; Industry averages INDUSTRY. Per-region rows weight that region's ACTIVE frameworks by control count.",
  };
}

// ---------------------------------------------------------------------------
// Policy conflicts
// ---------------------------------------------------------------------------

function hasRegion(org: OrganizationProfile, kind: "EU" | "US" | "IN"): boolean {
  const regions = [...(org.regions ?? []), ...(org.customerRegions ?? [])];
  if (kind === "US") return regions.includes("US");
  if (kind === "IN") return regions.includes("IN");
  return regions.some((r) => EU_CODES.includes(r));
}

function fwRef(region: string, label: string, frameworks: string[]): PolicyConflictFrameworkRef {
  return { region, label, frameworks };
}

export function policyConflicts(org: OrganizationProfile): PolicyConflict[] {
  const eu = hasRegion(org, "EU");
  const us = hasRegion(org, "US");
  const india = hasRegion(org, "IN");
  const now = new Date().toISOString();
  const conflicts: PolicyConflict[] = [];

  if (eu && india && us) {
    conflicts.push({
      id: "conf-retention",
      topic: "Data retention policy",
      description: "Retention obligations differ across India, the EU and the United States.",
      requirementA: "CERT-In log retention (180 days) + sectoral record-keeping.",
      requirementAFrom: "CERT-In · DPDP",
      requirementB: "GDPR data minimization — no retention beyond stated purpose.",
      requirementBFrom: "GDPR · NIS2",
      affectedControlId: "DATA-001",
      affectedControl: "Data Retention, Residency and Minimization",
      affectedRegions: ["IN", "EU", "US"],
      potentialImpact: "A single global retention default can over-retain EU personal data or under-retain records required in India.",
      recommendedReview: "Security/legal review required. Map retention by jurisdiction before applying any global policy.",
      frameworks: [fwRef("IN", "India", ["CERT-In", "DPDP"]), fwRef("EU", "European Union", ["GDPR", "NIS2"]), fwRef("US", "United States", ["NIST SP 800-53", "FedRAMP"])],
      status: "DETECTED",
      detectedAt: now,
    });
  }

  if (eu && us) {
    conflicts.push({
      id: "conf-notification",
      topic: "Incident notification timelines",
      description: "Breach notification deadlines differ by jurisdiction.",
      requirementA: "GDPR/NIS2 notification to authorities within 24-72 hours.",
      requirementAFrom: "GDPR · NIS2",
      requirementB: "Entity-specific U.S. notification rules (FTC and state law timelines).",
      requirementBFrom: "U.S. state law · CISA guidance",
      affectedControlId: "IR-001",
      affectedControl: "Incident Response and Notification",
      affectedRegions: ["EU", "US"],
      potentialImpact: "A single 72-hour notification timeline may miss stricter EU or U.S. deadlines, or over-report.",
      recommendedReview: "Maintain a jurisdiction-aware notification matrix and a pre-agreed legal response playbook.",
      frameworks: [fwRef("EU", "European Union", ["GDPR", "NIS2"]), fwRef("US", "United States", ["CISA Guidance"])],
      status: "DETECTED",
      detectedAt: now,
    });
  }

  if (india && eu) {
    conflicts.push({
      id: "conf-residency",
      topic: "Data residency for personal data",
      description: "DPDP-era guidance and GDPR transfer safeguards interact on cross-border personal data flows.",
      requirementA: "India-based copy for covered sectors + DPDP reasonable safeguards.",
      requirementAFrom: "DPDP · CERT-In",
      requirementB: "GDPR Chapter V transfer safeguards before any EU personal data leaves the EEA.",
      requirementBFrom: "GDPR",
      affectedControlId: "DATA-001",
      affectedControl: "Data Retention, Residency and Minimization",
      affectedRegions: ["IN", "EU"],
      potentialImpact: "Data placement for one region may violate transfer or residency obligations of the other.",
      recommendedReview: "Map data flows per jurisdiction and obtain legal review before transfer decisions.",
      frameworks: [fwRef("IN", "India", ["DPDP", "CERT-In"]), fwRef("EU", "European Union", ["GDPR"])],
      status: "DETECTED",
      detectedAt: now,
    });
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Full evaluation
// ---------------------------------------------------------------------------

export function evaluateGovernance(org: OrganizationProfile, input?: PassportStateInput): GovernanceEvaluation {
  const context = governanceContext(org);
  const frameworks = FRAMEWORKS.map((fw) => evaluateFramework(org, fw));
  const activeFrameworks = frameworks.filter((a) => a.status === "ACTIVE");
  const conditional = frameworks.filter((a) => a.status === "CONDITIONAL");
  const scores = computeGovernanceScores(org, frameworks, input);
  const conflicts = policyConflicts(org);

  const openGaps = activeFrameworks.reduce((sum, a) => {
    const fw = FRAMEWORK_INDEX.get(a.frameworkId);
    if (!fw) return sum;
    const cov = adjustedCoverage(fw, input);
    return sum + Math.max(0, cov.totalControls - cov.passedControls);
  }, 0);

  return {
    context,
    frameworks,
    activeFrameworks,
    activeCount: activeFrameworks.length,
    conditionalCount: conditional.length,
    notApplicableCount: frameworks.length - activeFrameworks.length - conditional.length,
    globalBaselines: frameworks.filter((a) => a.status === "ACTIVE" && a.category === "GLOBAL_BASELINE"),
    regional: frameworks.filter((a) => a.status !== "NOT_APPLICABLE" && a.category === "REGIONAL"),
    industryDriven: frameworks.filter((a) => a.status !== "NOT_APPLICABLE" && a.category === "INDUSTRY"),
    securityBaselines: frameworks.filter((a) => a.status !== "NOT_APPLICABLE" && a.category === "SECURITY_BASELINE"),
    scores,
    conflicts,
    openGaps,
    disclaimer: GOVERNANCE_DISCLAIMER,
    evaluatedAt: new Date().toISOString(),
  };
}