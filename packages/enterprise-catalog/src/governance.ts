import type {
  ApplicableControl,
  ApplicableControlsResult,
  AssetControlFramework,
  AssetFinding,
  AssetRecord,
  ComplianceFramework2,
  FindingStatus,
  FrameworkControlMapping2,
  FrameworkPosture,
  GovernanceDecisionTrace,
  GovernanceException,
  GovernanceExceptionRef,
  GovernanceFindingContext,
  MappingStatus,
  OrganizationBaseline,
  PolicyProfile,
  PolicySelection,
  RegionKey,
  RegionalPosture,
  Severity,
} from "@nexus/shared-types";
import { getAssetControls, getAssetControlById } from "./controls";
import { regionLabelOf } from "./enterprise";

// ---------------------------------------------------------------------------
// Framework catalog
// ---------------------------------------------------------------------------

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework2[] = [
  {
    id: "NIST",
    name: "NIST Cybersecurity Framework",
    version: "CSF 2.0",
    description:
      "Risk-based framework for managing cybersecurity risk across Identify, Protect, Detect, Respond, and Recover functions.",
    scope: "TECHNICAL",
    status: "ACTIVE",
    applicability: "Applicable",
    disclaimer:
      "NIST CSF is a voluntary framework. Applicability and maturity targets depend on organizational risk appetite and regulatory context.",
  },
  {
    id: "CIS",
    name: "CIS Controls v8",
    version: "v8.0",
    description:
      "Prioritized set of 18 cybersecurity best-practice controls (Implementation Groups) for defense-in-depth.",
    scope: "TECHNICAL",
    status: "ACTIVE",
    applicability: "Applicable",
    disclaimer:
      "CIS Controls are consensus-developed best practices. Implementation Group (IG) selection determines which controls are required for a given organization size and risk profile.",
  },
  {
    id: "ISO27001",
    name: "ISO/IEC 27001:2022",
    version: "2022",
    description:
      "International standard for information security management systems (ISMS). Annex A lists 93 controls across 4 themes.",
    scope: "TECHNICAL",
    status: "CONDITIONAL",
    applicability: "Organization-selected",
    disclaimer:
      "ISO 27001 certification is voluntary and requires organizational ISMS scope definition. This platform does not render legal or certification applicability determinations.",
  },
  {
    id: "PCI_DSS",
    name: "PCI DSS v4.0",
    version: "v4.0",
    description:
      "Payment Card Industry Data Security Standard for entities that store, process, or transmit cardholder data.",
    scope: "REGULATORY",
    status: "CONDITIONAL",
    applicability: "Organization-selected",
    disclaimer:
      "PCI DSS applies only to organizations that store, process, or transmit cardholder data. Applicability depends on the organization's transaction volume and payment processor requirements.",
  },
  {
    id: "OWASP",
    name: "OWASP Application Security Verification Standard",
    version: "ASVS 4.0",
    description:
      "Application-level security verification requirements organized by verification levels (L1-L3).",
    scope: "TECHNICAL",
    status: "ACTIVE",
    applicability: "Optional",
    disclaimer:
      "OWASP ASVS is voluntary and typically adopted for custom application security verification. Level selection depends on application risk profile.",
  },
  {
    id: "PROTOTYPE",
    name: "NEXUS Prototype Controls",
    version: "v1.0",
    description:
      "Internal controls used for prototype and development validation. Not intended for production use.",
    scope: "TECHNICAL",
    status: "ACTIVE",
    applicability: "Optional",
    disclaimer: "Prototype controls are for internal validation only and have no external compliance equivalence.",
  },
];

// ---------------------------------------------------------------------------
// Control-to-framework mappings
// ---------------------------------------------------------------------------

interface ControlMappingDef {
  mappings: FrameworkControlMapping2[];
}

const CONTROL_MAPPINGS: Record<string, ControlMappingDef> = {
  "TLS-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-2", note: "NIST CSF PR.DS-2: Data-in-transit is protected." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 13 — Data Protection (encryption in transit). Verify exact sub-control against CIS benchmark." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — Cryptography controls. Verify exact control number against current standard." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — Protect cardholder data during transmission. Verify exact requirement against current standard." },
      { framework: "OWASP", mappingStatus: "REVIEW_REQUIRED", note: "OWASP ASVS — Transport layer security. Verify level and requirement against current ASVS version." },
    ],
  },
  "TLS-002": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-2", note: "NIST CSF PR.DS-2: Data-in-transit is protected — disable legacy protocols." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 13 — ensure supported security protocols only. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — use of cryptography. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — strong cryptography protocols. Verify exact requirement." },
    ],
  },
  "TLS-003": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-2", note: "NIST CSF PR.DS-2: Data-in-transit — cipher strength enforcement." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 13 — strong encryption ciphers. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — cryptography policy. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — strong cryptographic ciphers. Verify exact requirement." },
    ],
  },
  "TLS-004": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-2", note: "NIST CSF PR.DS-2: Data-in-transit — key management." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 13 — certificate management. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — key management lifecycle. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — cryptographic key management. Verify exact requirement." },
    ],
  },
  "TLS-005": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-2", note: "NIST CSF PR.DS-2: Data-in-transit — mutual TLS authentication." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 13 — certificate-based authentication. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — secure authentication. Verify exact control." },
      { framework: "OWASP", mappingStatus: "REVIEW_REQUIRED", note: "OWASP ASVS — mutual TLS verification. Verify level and requirement." },
    ],
  },
  "DB-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-1", note: "NIST CSF PR.DS-1: Data-at-rest is protected." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 3 — data protection at rest. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — information deletion / data masking. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — protect stored account data. Verify exact requirement." },
    ],
  },
  "DB-002": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-5", note: "NIST CSF PR.AC-5: Network integrity protected (restrict database exposure)." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 12 — network infrastructure management. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — secure network architecture. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — restrict access to cardholder data. Verify exact requirement." },
    ],
  },
  "FW-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-5", note: "NIST CSF PR.AC-5: Network integrity — firewall rule hygiene." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 9 — email and web browser protections / Control 12. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — network security controls. Verify exact control." },
    ],
  },
  "AUTH-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-1", note: "NIST CSF PR.AC-1: Identities and credentials are managed, verified, and audited." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 5 — Account Management. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — secure authentication. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — strong authentication. Verify exact requirement." },
      { framework: "OWASP", mappingStatus: "REVIEW_REQUIRED", note: "OWASP ASVS — authentication verification. Verify level and requirement." },
    ],
  },
  "INTEGRITY-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-6", note: "NIST CSF PR.DS-6: Integrity checking mechanisms — verify this sub-control exists in your version." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — information integrity. Verify exact control." },
    ],
  },
  "XMLSIG-010": {
    mappings: [
      { framework: "NIST", mappingStatus: "REVIEW_REQUIRED", note: "NIST CSF — application integrity validation. Verify exact control mapping." },
      { framework: "OWASP", mappingStatus: "REVIEW_REQUIRED", note: "OWASP ASVS — input validation and XML security. Verify level and requirement." },
    ],
  },
  "API-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-1", note: "NIST CSF PR.AC-1: API authentication enforcement — identity and credential management." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 5 — Account Management / access enforcement. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — secure authentication. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — identify and authenticate access. Verify exact requirement." },
      { framework: "OWASP", mappingStatus: "REVIEW_REQUIRED", note: "OWASP ASVS — API authentication. Verify level and requirement." },
    ],
  },
  "API-002": {
    mappings: [
      { framework: "OWASP", mappingStatus: "REVIEW_REQUIRED", note: "OWASP ASVS — anti-automation / rate limiting. Verify level and requirement." },
    ],
  },
  "DATA-012": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-1", note: "NIST CSF PR.DS-1: Data-at-rest is protected — secrets in plaintext are a data-at-rest exposure." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 3 — data protection. Verify exact sub-control for secret management." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — information classification and secret handling. Verify exact control." },
      { framework: "OWASP", mappingStatus: "REVIEW_REQUIRED", note: "OWASP ASVS — secure secret management. Verify level and requirement." },
    ],
  },
  "ACCESS-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-4", note: "NIST CSF PR.AC-4: Access permissions managed with least privilege and separation of duties." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 6 — Access Control Management. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — access control. Verify exact control." },
    ],
  },
  "OUTDATE-014": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.IP-1", note: "NIST CSF PR.IP-1: Information security policy — asset currency lifecycle." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 7 — Continuous Vulnerability Management. Verify exact sub-control." },
    ],
  },
  "CONFIG-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.IP-1", note: "NIST CSF PR.IP-1: Information security policy — configuration baseline management." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 4 — Secure Configuration of Enterprise Assets and Software. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — configuration management. Verify exact control." },
    ],
  },
  "MQ-016": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-1", note: "NIST CSF PR.AC-1: Broker authentication — credential management for messaging infrastructure." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 5 — Account Management for messaging. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — secure authentication. Verify exact control." },
    ],
  },
  "CERT-002": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.DS-2", note: "NIST CSF PR.DS-2: Data-in-transit — certificate key strength." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 13 — certificate strength requirements. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — cryptographic key management. Verify exact control." },
      { framework: "PCI_DSS", mappingStatus: "REVIEW_REQUIRED", note: "PCI DSS v4.0 — strong cryptography standards. Verify exact requirement." },
    ],
  },
  "FW-002": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-5", note: "NIST CSF PR.AC-5: Network integrity — management interface restriction." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 12 — network infrastructure management. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — network security controls. Verify exact control." },
    ],
  },
  "ACL-001": {
    mappings: [
      { framework: "NIST", mappingStatus: "MAPPED", mappingRef: "PR.AC-5", note: "NIST CSF PR.AC-5: Network integrity — deny-by-default ACL policy." },
      { framework: "CIS", mappingStatus: "REVIEW_REQUIRED", note: "CIS v8 Control 9 — network monitoring / control 12. Verify exact sub-control." },
      { framework: "ISO27001", mappingStatus: "REVIEW_REQUIRED", note: "ISO 27001:2022 Annex A — network security controls. Verify exact control." },
    ],
  },
};

/**
 * Get framework mappings for a control. Returns REVIEW_REQUIRED fallback
 * for controls not in the mapping table.
 */
export function controlFrameworkMappings(controlId: string): FrameworkControlMapping2[] {
  const def = CONTROL_MAPPINGS[controlId];
  if (def) return def.mappings;
  const control = getAssetControlById(controlId);
  if (!control) return [];
  return control.frameworks.map((f) => ({
    framework: f,
    mappingStatus: "REVIEW_REQUIRED" as MappingStatus,
    note: `No verified mapping available for ${controlId} → ${f}. Manual review required.`,
  }));
}

// ---------------------------------------------------------------------------
// Policy profiles
// ---------------------------------------------------------------------------

const SEVERITY_OVERRIDES_PRODUCTION: Partial<Record<string, Severity>> = {};

export const POLICY_PROFILES: PolicyProfile[] = [
  {
    profileId: "GLOBAL_BASELINE",
    name: "Global Enterprise Baseline",
    region: "GLOBAL",
    regionLabel: "Global",
    description: "Baseline security controls applied to all assets regardless of region. Production and production-similar environments receive stricter evaluation.",
    enabledFrameworks: ["NIST", "CIS", "ISO27001"],
    severityOverrides: SEVERITY_OVERRIDES_PRODUCTION,
    exceptions: [],
    version: "1.0",
    status: "ACTIVE",
  },
  {
    profileId: "INDIA_ENTERPRISE",
    name: "India Enterprise Policy",
    region: "IND",
    regionLabel: "India",
    description: "Enterprise policy for assets deployed in India. Includes data residency considerations and CERT-In incident reporting context.",
    enabledFrameworks: ["NIST", "CIS", "ISO27001", "PCI_DSS", "OWASP"],
    severityOverrides: {},
    exceptions: [],
    version: "1.0",
    status: "ACTIVE",
  },
  {
    profileId: "US_ENTERPRISE",
    name: "US Enterprise Policy",
    region: "USA",
    regionLabel: "United States",
    description: "Enterprise policy for US-deployed assets. Includes sector-specific awareness and SOC 2 readiness alignment.",
    enabledFrameworks: ["NIST", "CIS", "ISO27001", "PCI_DSS", "OWASP"],
    severityOverrides: {},
    exceptions: [],
    version: "1.0",
    status: "ACTIVE",
  },
  {
    profileId: "SINGAPORE_ENTERPRISE",
    name: "Singapore Enterprise Policy",
    region: "SGP",
    regionLabel: "Singapore",
    description: "Enterprise policy for Singapore-deployed assets. Includes MAS TRM and PDPA awareness context.",
    enabledFrameworks: ["NIST", "CIS", "ISO27001", "PCI_DSS", "OWASP"],
    severityOverrides: {},
    exceptions: [],
    version: "1.0",
    status: "ACTIVE",
  },
  {
    profileId: "EU_ENTERPRISE",
    name: "EU Enterprise Policy",
    region: "EU",
    regionLabel: "European Union",
    description: "Enterprise policy for EU-deployed assets. Includes GDPR data protection and NIS2 Directive awareness context.",
    enabledFrameworks: ["NIST", "CIS", "ISO27001", "PCI_DSS", "OWASP"],
    severityOverrides: {},
    exceptions: [],
    version: "1.0",
    status: "ACTIVE",
  },
  {
    profileId: "UK_ENTERPRISE",
    name: "UK Enterprise Policy",
    region: "UK",
    regionLabel: "United Kingdom",
    description: "Enterprise policy for UK-deployed assets. Includes UK GDPR and NIS Regulations awareness context.",
    enabledFrameworks: ["NIST", "CIS", "ISO27001", "PCI_DSS", "OWASP"],
    severityOverrides: {},
    exceptions: [],
    version: "1.0",
    status: "ACTIVE",
  },
];

/**
 * Default organization baseline configuration.
 */
export const DEFAULT_ORGANIZATION_BASELINE: OrganizationBaseline = {
  id: "org-baseline-default",
  name: "Global Enterprise Baseline",
  version: "1.0",
  minTls: "1.2",
  requireLogging: true,
  dbEncryption: true,
  privilegedAccessRestricted: true,
  enabledControls: getAssetControls().map((c) => c.id),
  enabledFrameworks: ["NIST", "CIS", "ISO27001"],
};

// ---------------------------------------------------------------------------
// Region detection
// ---------------------------------------------------------------------------

const REGION_MAP: Record<string, RegionKey> = {
  IND: "IND",
  "India": "IND",
  "Chennai": "IND",
  "Mumbai": "IND",
  USA: "USA",
  "United States": "USA",
  "New York": "USA",
  "Virginia": "USA",
  "Oregon": "USA",
  SGP: "SGP",
  "Singapore": "SGP",
  EU: "EU",
  "European Union": "EU",
  "Germany": "EU",
  "France": "EU",
  "Netherlands": "EU",
  "Ireland": "EU",
  UK: "UK",
  "United Kingdom": "UK",
  "GBR": "UK",
  "London": "UK",
  GLOBAL: "GLOBAL",
};

/**
 * Deterministically resolve an asset's geographic region to a RegionKey.
 */
export function regionKeyForAsset(asset: AssetRecord): RegionKey {
  const region = asset.location.region;
  const site = asset.location.site;

  if (REGION_MAP[region]) return REGION_MAP[region];
  if (REGION_MAP[site]) return REGION_MAP[site];

  const regionLabel = regionLabelOf(region);
  if (REGION_MAP[regionLabel]) return REGION_MAP[regionLabel];

  if (/eu|europe/i.test(region) || /eu|europe/i.test(site)) return "EU";
  if (/uk|gb|britain|london/i.test(region) || /uk|gb|britain|london/i.test(site)) return "UK";
  if (/us|usa|america/i.test(region) || /us|usa|america/i.test(site)) return "USA";
  if (/ind|india/i.test(region) || /ind|india/i.test(site)) return "IND";
  if (/sg|singapore/i.test(region) || /sg|singapore/i.test(site)) return "SGP";

  return "GLOBAL";
}

export function regionLabelFor(regionKey: RegionKey): string {
  const labels: Record<RegionKey, string> = {
    GLOBAL: "Global",
    IND: "India",
    USA: "United States",
    SGP: "Singapore",
    EU: "European Union",
    UK: "United Kingdom",
  };
  return labels[regionKey];
}

// ---------------------------------------------------------------------------
// Policy selection (automatic, deterministic)
// ---------------------------------------------------------------------------

/**
 * Automatically select the appropriate policy profile for an asset
 * based on its region, environment, asset type, and criticality.
 */
export function selectPolicyForAsset(
  asset: AssetRecord,
  org?: Partial<OrganizationBaseline>,
): PolicySelection {
  const regionKey = regionKeyForAsset(asset);
  const regionLbl = regionLabelFor(regionKey);
  const orgBaseline = { ...DEFAULT_ORGANIZATION_BASELINE, ...org };

  let profile = POLICY_PROFILES.find((p) => p.region === regionKey);
  if (!profile) profile = POLICY_PROFILES.find((p) => p.region === "GLOBAL")!;

  const frameworks = COMPLIANCE_FRAMEWORKS.filter((f) =>
    profile.enabledFrameworks.includes(f.id),
  );

  const applicable = getAssetControls().filter((c) => c.appliesTo.includes(asset.assetType));

  const explanation: string[] = [
    `Policy selected based on asset region (${regionLbl}), environment (${asset.environment}), asset type (${asset.assetType}), and criticality (${asset.criticality}).`,
    `Regional profile: ${profile.name} — ${profile.description}`,
    `Organization baseline: ${orgBaseline.name} v${orgBaseline.version}.`,
  ];

  if (asset.environment === "PRODUCTION" || asset.environment === "PROD_SIM") {
    explanation.push(
      "Production environment detected: all applicable controls are evaluated with standard severity. Non-production assets still receive control evaluation but with advisory context.",
    );
  }

  const isCritical = asset.criticality === "CRITICAL" || asset.criticality === "HIGH";
  if (isCritical) {
    explanation.push(
      `Asset criticality is ${asset.criticality}: all applicable controls are in scope. No controls are excluded for critical assets.`,
    );
  }

  return {
    assetId: asset.id,
    region: regionKey,
    regionLabel: regionLbl,
    environment: asset.environment,
    criticality: asset.criticality,
    assetType: asset.assetType,
    policyProfileId: profile.profileId,
    policyProfileName: profile.name,
    organizationPolicy: `${orgBaseline.name} v${orgBaseline.version}`,
    frameworks: frameworks.map((f) => ({
      id: f.id,
      name: f.name,
      version: f.version,
      status: f.status,
    })),
    applicableControls: applicable.map((c) => c.id),
    explanation,
    disclaimer:
      "This policy selection is deterministic and based on simulated asset attributes. Actual regulatory applicability depends on the organization's legal jurisdiction, industry, and contractual obligations. This platform does not render legal determinations.",
    selectedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Applicable controls
// ---------------------------------------------------------------------------

/**
 * Determine which of the 21 asset controls apply to a given asset,
 * along with exclusion reasons for the remainder.
 */
export function applicableControlsForAsset(
  asset: AssetRecord,
  org?: Partial<OrganizationBaseline>,
): ApplicableControlsResult {
  const regionKey = regionKeyForAsset(asset);
  const allControls = getAssetControls();
  const orgBaseline = { ...DEFAULT_ORGANIZATION_BASELINE, ...org };
  const enabledSet = new Set(orgBaseline.enabledControls);

  const applicable: ApplicableControl[] = [];
  const excluded: Array<{ controlId: string; controlName: string; reason: string }> = [];

  for (const control of allControls) {
    if (!enabledSet.has(control.id)) {
      excluded.push({
        controlId: control.id,
        controlName: control.name,
        reason: `Control ${control.id} is not enabled in the organization baseline.`,
      });
      continue;
    }

    if (!control.appliesTo.includes(asset.assetType)) {
      excluded.push({
        controlId: control.id,
        controlName: control.name,
        reason: `Control ${control.id} does not apply to asset type ${asset.assetType}. It targets: ${control.appliesTo.join(", ")}.`,
      });
      continue;
    }

    applicable.push({
      controlId: control.id,
      controlName: control.name,
      severity: control.severity,
      whyApplicable: `${control.name} applies to ${asset.assetType} assets in ${regionLabelFor(regionKey)}. Requirement: ${control.requirement}`,
      frameworkMembership: [...control.frameworks],
    });
  }

  return {
    assetId: asset.id,
    region: regionKey,
    environment: asset.environment,
    criticality: asset.criticality,
    assetType: asset.assetType,
    total: allControls.length,
    applicable,
    excluded,
    disclaimer:
      "Control applicability is determined by asset type, organization baseline, and policy profile. This platform does not render legal or certification scope determinations.",
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Exception status checking
// ---------------------------------------------------------------------------

/**
 * Determine the current exception status for a control on an asset.
 * Expired exceptions are automatically marked EXPIRED and stop suppressing.
 */
export function exceptionStatusFor(
  controlId: string,
  assetId: string,
  exceptions: GovernanceException[],
): GovernanceExceptionRef | undefined {
  const now = new Date().toISOString();
  const relevant = exceptions
    .filter((e) => e.controlId === controlId && e.assetId === assetId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (relevant.length === 0) return undefined;

  const latest = relevant[0];

  if (latest.status === "APPROVED" && latest.expiresAt < now) {
    return {
      id: latest.id,
      status: "EXPIRED",
      reason: latest.reason,
      expiresAt: latest.expiresAt,
    };
  }

  if (latest.status === "APPROVED") {
    return {
      id: latest.id,
      status: "APPROVED",
      reason: latest.reason,
      expiresAt: latest.expiresAt,
    };
  }

  if (latest.status === "REJECTED" || latest.status === "EXPIRED") {
    return {
      id: latest.id,
      status: latest.status,
      reason: latest.reason,
      expiresAt: latest.expiresAt,
    };
  }

  return {
    id: latest.id,
    status: "REQUESTED",
    reason: latest.reason,
    expiresAt: latest.expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Governance finding context
// ---------------------------------------------------------------------------

/**
 * Build governance context for a finding: shows the region, policy, frameworks,
 * why the control is applicable, and any active exception.
 */
export function governanceContextForFinding(
  asset: AssetRecord,
  controlId: string,
  exceptions: GovernanceException[],
): GovernanceFindingContext {
  const regionKey = regionKeyForAsset(asset);
  const regionLbl = regionLabelFor(regionKey);
  const control = getAssetControlById(controlId);
  const selection = selectPolicyForAsset(asset);
  const exception = exceptionStatusFor(controlId, asset.id, exceptions);

  return {
    region: regionKey,
    regionLabel: regionLbl,
    policyProfileId: selection.policyProfileId,
    policyProfileName: selection.policyProfileName,
    frameworks: control ? [...control.frameworks] : [],
    whyApplicable: control
      ? `${control.name} applies to ${asset.assetType} assets in ${regionLbl}. Requirement: ${control.requirement}`
      : `Control ${controlId} is part of the managed enterprise catalog.`,
    exception,
  };
}

// ---------------------------------------------------------------------------
// Governance decision trace
// ---------------------------------------------------------------------------

/**
 * Build a full governance decision trace for an asset, showing the complete
 * chain from region → policy → frameworks → controls → evidence → findings → exceptions.
 */
export function buildGovernanceTrace(
  asset: AssetRecord,
  evidence: Array<{ controlId: string; status: FindingStatus; observedValue: string; expectedValue: string }>,
  findings: AssetFinding[],
  exceptions: GovernanceException[],
  org?: Partial<OrganizationBaseline>,
): GovernanceDecisionTrace {
  const regionKey = regionKeyForAsset(asset);
  const regionLbl = regionLabelFor(regionKey);
  const selection = selectPolicyForAsset(asset, org);
  const applicable = applicableControlsForAsset(asset, org);
  const orgBaseline = { ...DEFAULT_ORGANIZATION_BASELINE, ...org };

  const frameworks = selection.frameworks.map((f) => {
    const def = COMPLIANCE_FRAMEWORKS.find((cf) => cf.id === f.id)!;
    return { ...f, disclaimer: def.disclaimer };
  });

  const assetExceptions = exceptions.filter((e) => e.assetId === asset.id);

  return {
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.assetType,
    region: regionKey,
    regionLabel: regionLbl,
    environment: asset.environment,
    criticality: asset.criticality,
    organizationPolicy: {
      id: orgBaseline.id,
      name: orgBaseline.name,
      version: orgBaseline.version,
    },
    regionalPolicy: {
      profileId: selection.policyProfileId,
      name: selection.policyProfileName,
      region: regionKey,
      regionLabel: regionLbl,
    },
    frameworks,
    applicableControls: applicable.applicable.map((c) => ({
      controlId: c.controlId,
      controlName: c.controlName,
      severity: c.severity,
      whyApplicable: c.whyApplicable,
    })),
    evidence: evidence.map((e) => ({
      controlId: e.controlId,
      status: e.status,
      observedValue: e.observedValue,
      expectedValue: e.expectedValue,
    })),
    findings: findings.map((f) => ({
      controlId: f.controlId,
      controlName: f.controlName,
      status: f.status,
      severity: f.severity,
      risk: f.risk,
    })),
    exceptions: assetExceptions,
    disclaimer:
      "This governance decision trace shows deterministic, simulated policy selection and control evaluation. It does not constitute legal, regulatory, or certification compliance advice.",
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Compliance summary extensions (byRegion + byFramework)
// ---------------------------------------------------------------------------

/**
 * Compute regional posture from a list of assets and per-control evaluation results.
 * `controlResults` should be keyed by assetId → array of {controlId, status}.
 */
export function computeRegionalPosture(
  assets: AssetRecord[],
  controlResults: Map<string, Array<{ controlId: string; status: FindingStatus }>>,
): RegionalPosture[] {
  const byRegion = new Map<RegionKey, { assets: number; passed: number; failed: number; warnings: number; findings: number }>();

  for (const asset of assets) {
    const rk = regionKeyForAsset(asset);
    if (!byRegion.has(rk)) {
      byRegion.set(rk, { assets: 0, passed: 0, failed: 0, warnings: 0, findings: 0 });
    }
    const bucket = byRegion.get(rk)!;
    bucket.assets += 1;

    const results = controlResults.get(asset.id);
    if (results) {
      for (const r of results) {
        if (r.status === "PASS" || r.status === "NOT_APPLICABLE") bucket.passed += 1;
        else if (r.status === "FAIL") bucket.failed += 1;
        else if (r.status === "WARNING") bucket.warnings += 1;
      }
    }
    if (asset.complianceStatus === "FAIL") bucket.findings += 1;
  }

  const output: RegionalPosture[] = [];
  for (const [region, data] of byRegion) {
    const total = data.passed + data.failed + data.warnings;
    output.push({
      region,
      regionLabel: regionLabelFor(region),
      assetCount: data.assets,
      score: total > 0 ? Math.round((data.passed / total) * 100) : 0,
      passed: data.passed,
      failed: data.failed,
      warnings: data.warnings,
      findings: data.findings,
    });
  }

  return output.sort((a, b) => a.region.localeCompare(b.region));
}

/**
 * Compute framework posture by re-evaluating all controls per framework
 * against the latest findings for each asset.
 */
export function computeFrameworkPosture(
  assets: AssetRecord[],
  latestFindingsForAsset: (assetId: string) => AssetFinding[],
): FrameworkPosture[] {
  const allControls = getAssetControls();
  const frameworks: AssetControlFramework[] = ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP"];

  return frameworks.map((fw) => {
    const inScope = allControls.filter((c) => c.frameworks.includes(fw));
    let passed = 0;
    let failed = 0;

    for (const asset of assets) {
      const findings = latestFindingsForAsset(asset.id);
      for (const finding of findings) {
        const control = getAssetControlById(finding.controlId);
        if (!control || !control.frameworks.includes(fw)) continue;
        if (finding.status === "PASS" || finding.status === "NOT_APPLICABLE") passed += 1;
        else failed += 1;
      }
    }

    const total = passed + failed;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;
    const status: FrameworkPosture["status"] =
      total === 0 ? "NOT_ASSESSED" : score >= 80 ? "COMPLIANT" : score >= 50 ? "PARTIAL" : "AT_RISK";

    const map: Record<AssetControlFramework, string> = {
      ISO27001: "ISO/IEC 27001",
      NIST: "NIST CSF",
      CIS: "CIS Controls",
      PCI_DSS: "PCI DSS",
      OWASP: "OWASP ASVS",
      PROTOTYPE: "NEXUS Prototype",
    };

    return {
      framework: fw,
      label: map[fw],
      totalControls: inScope.length,
      passed,
      failed,
      score,
      status,
    };
  });
}
