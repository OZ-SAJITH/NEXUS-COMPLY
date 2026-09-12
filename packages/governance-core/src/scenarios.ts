import type { ConfigSetting, DemoSintPilotScenario } from "@nexus/shared-types";

const authWeak = [
  { key: "auth.mfa.privileged", label: "MFA for privileged access", value: "disabled", category: "Identity" },
  { key: "auth.local.enabled", label: "Local account login", value: "enabled", category: "Identity" },
  { key: "auth.radius.legacy", label: "Legacy RADIUS fallback", value: "enabled", category: "Identity" },
] as ConfigSetting[];

const authStrong = [
  { key: "auth.mfa.privileged", label: "MFA for privileged access", value: "enabled", category: "Identity" },
  { key: "auth.local.enabled", label: "Local account login", value: "disabled", category: "Identity" },
  { key: "auth.radius.legacy", label: "Legacy RADIUS fallback", value: "disabled", category: "Identity" },
] as ConfigSetting[];

const cryptoWeak = [
  { key: "enc.algorithm", label: "Data-at-rest encryption", value: "AES-128", category: "Crypto" },
  { key: "enc.key.rotation", label: "Key rotation period", value: "365d", category: "Crypto" },
  { key: "enc.kms.access", label: "KMS access model", value: "shared", category: "Crypto" },
] as ConfigSetting[];

const cryptoStrong = [
  { key: "enc.algorithm", label: "Data-at-rest encryption", value: "AES-256", category: "Crypto" },
  { key: "enc.key.rotation", label: "Key rotation period", value: "90d", category: "Crypto" },
  { key: "enc.kms.access", label: "KMS access model", value: "isolated", category: "Crypto" },
] as ConfigSetting[];

const scadaWeak = [
  { key: "ot.auth.legacy", label: "Legacy OT authentication", value: "enabled", category: "OT Security" },
  { key: "ot.patch.cycle", label: "OT patch cycle", value: "365d", category: "OT Security" },
  { key: "ot.segmentation", label: "OT/IT segmentation", value: "partial", category: "OT Security" },
] as ConfigSetting[];

const scadaHard = [
  { key: "ot.auth.legacy", label: "Legacy OT authentication", value: "disabled", category: "OT Security" },
  { key: "ot.patch.cycle", label: "OT patch cycle", value: "90d", category: "OT Security" },
  { key: "ot.segmentation", label: "OT/IT segmentation", value: "full", category: "OT Security" },
] as ConfigSetting[];

const identityCloudCfg = [
  { key: "idp.federation.oidc", label: "OIDC federation", value: "partial", category: "Identity" },
  { key: "idp.sso.scope", label: "SSO scope", value: "apps", category: "Identity" },
  { key: "idp.mfa.enrolled", label: "MFA enrollment enforcement", value: "optional", category: "Identity" },
] as ConfigSetting[];

const identityCloudCfgAfter = [
  { key: "idp.federation.oidc", label: "OIDC federation", value: "full", category: "Identity" },
  { key: "idp.sso.scope", label: "SSO scope", value: "services+apps", category: "Identity" },
  { key: "idp.mfa.enrolled", label: "MFA enrollment enforcement", value: "mandatory", category: "Identity" },
] as ConfigSetting[];

const govHard = [
  { key: "secure.boot", label: "Secure boot", value: "disabled", category: "System Hardening" },
  { key: "kernel.audit", label: "Kernel auditd", value: "disabled", category: "System Hardening" },
  { key: "disk.luks", label: "Full-disk encryption", value: "disabled", category: "System Hardening" },
  { key: "admin.exposure", label: "Admin interface exposure", value: "open", category: "Access" },
] as ConfigSetting[];

const govHardAfter = [
  { key: "secure.boot", label: "Secure boot", value: "enabled", category: "System Hardening" },
  { key: "kernel.audit", label: "Kernel auditd", value: "enabled", category: "System Hardening" },
  { key: "disk.luks", label: "Full-disk encryption", value: "enabled", category: "System Hardening" },
  { key: "admin.exposure", label: "Admin interface exposure", value: "restricted", category: "Access" },
] as ConfigSetting[];

export const DEMO_SCENARIOS: DemoSintPilotScenario[] = [
  {
    id: "scenario-health",
    name: "Healthcare · Encryption Policy Update",
    industry: "Healthcare",
    icon: "heart",
    description: "Altus Lifesciences plans to strengthen data-at-rest encryption. NEXUS detects a dependency conflict with the archive layer and requires human approval.",
    orgProfile: {
      id: "org-alt-lifesciences",
      name: "Altus Lifesciences",
      regions: ["US", "DE"],
      industries: ["healthcare"],
      size: "MID",
      criticality: "HIGH",
      dataTypes: ["HEALTH", "PERSONAL", "CUSTOMER", "INTERNAL"],
      cloud: "HYBRID",
      cloudProviders: ["AWS"],
      customerRegions: ["US", "EU"],
      businessSectors: ["HEALTH"],
      dataResidency: ["US", "EU"],
      description: "Healthcare organization processing protected health information across US and EU regions.",
    },
    change: {
      title: "Encryption policy update for PHI storage",
      description: "Upgrade data-at-rest encryption to AES-256 and tighten KMS access. Legacy archival subsystem cannot read the new cipher.",
      configBefore: cryptoWeak,
      configAfter: cryptoStrong,
      targetSystems: ["files", "cloud-aws", "db-postgres"],
      expectedStory: ["Region update", "GDPR + HIPAA-range mapping", "Dependency conflict detected", "Human approval required"],
      flagsException: true,
      exceptionType: "CONFLICTING_CONTROLS",
      fourEyes: false,
      expectedResult: "Dependency conflict detected — approval required.",
    },
  },
  {
    id: "scenario-telecom",
    name: "Telecommunications · Network Authentication Policy",
    industry: "Telecommunications",
    icon: "signal",
    description: "Novi Networks proposes enforcing MFA on the network authentication plane. NEXUS detects a large blast radius and requires simulation first.",
    orgProfile: {
      id: "org-novi-networks",
      name: "Novi Networks",
      regions: ["IN", "DE"],
      industries: ["telecommunications"],
      size: "ENTERPRISE",
      criticality: "CRITICAL",
      dataTypes: ["PERSONAL", "TELEMETRY", "INTERNAL"],
      cloud: "HYBRID",
      cloudProviders: ["Azure"],
      customerRegions: ["IN", "EU"],
      businessSectors: ["TELECOM"],
      dataResidency: ["IN", "EU"],
      description: "Telecommunications provider operating core network functions across India and the EU.",
    },
    change: {
      title: "Enforce MFA across network authentication plane",
      description: "MFA enforcement affects identity service, API gateway, legacy clients and remote access — 12 dependent services. Simulation required before approval.",
      configBefore: authWeak,
      configAfter: authStrong,
      targetSystems: ["identity", "admin", "api-gw", "mobile", "idp-legacy"],
      expectedStory: ["Large blast radius", "Simulation runs", "12 dependent services affected", "Approval required"],
      flagsException: false,
      fourEyes: false,
      expectedResult: "Large blast radius detected — simulation required.",
    },
  },
  {
    id: "scenario-manufacturing",
    name: "Manufacturing · Industrial System Hardening",
    industry: "Manufacturing",
    icon: "factory",
    description: "FerroWorks wants to harden an industrial control system. The OT stack does not support the new authentication mode — the Exception Guardian triggers.",
    orgProfile: {
      id: "org-ferro-industrial",
      name: "FerroWorks Manufacturing",
      regions: ["IN"],
      industries: ["manufacturing"],
      size: "MID",
      criticality: "MEDIUM",
      dataTypes: ["INTERNAL", "TELEMETRY"],
      cloud: "EDGE",
      cloudProviders: ["Azure"],
      customerRegions: ["IN", "US"],
      businessSectors: ["MANUFACTURING"],
      dataResidency: ["IN"],
      description: "Manufacturing organization operating industrial control systems with a legacy OT estate.",
    },
    change: {
      title: "Harden industrial control system security configuration",
      description: "Legacy OT controller cannot support the proposed SCADA authentication baseline. A legacy compatibility exception is raised.",
      configBefore: scadaWeak,
      configAfter: scadaHard,
      targetSystems: ["srv-legacy", "db-legacy", "identity"],
      expectedStory: ["Legacy compatibility exception", "Exception Guardian triggered", "Automatic remediation blocked", "Human decision required"],
      flagsException: true,
      exceptionType: "LEGACY_SYSTEM",
      fourEyes: false,
      expectedResult: "Legacy compatibility exception triggered.",
    },
  },
  {
    id: "scenario-cloud",
    name: "Cloud/SaaS · Identity Provider Policy",
    industry: "Cloud / SaaS",
    icon: "cloud",
    description: "Skyward Cloud proposes tightening the identity provider policy for all tenants. Multiple dependent services are affected — the Production Safety Gate triggers.",
    orgProfile: {
      id: "org-skyward-cloud",
      name: "Skyward Cloud",
      regions: ["US", "DE", "SG"],
      industries: ["cloud-provider", "software-saas"],
      size: "ENTERPRISE",
      criticality: "HIGH",
      dataTypes: ["PERSONAL", "CUSTOMER", "SOURCECODE", "INTERNAL"],
      cloud: "CLOUD",
      cloudProviders: ["AWS", "GCP"],
      customerRegions: ["US", "EU", "APAC"],
      businessSectors: ["CLOUD", "PUBLIC_SECTOR"],
      dataResidency: ["US", "EU"],
      description: "Cloud/SaaS provider delivering multi-tenant identity and platform services globally.",
    },
    change: {
      title: "Tighten identity provider policy (OIDC + MFA)",
      description: "Making OIDC federation full and MFA enrollment mandatory impacts identity service, API gateway and tenant integrations. FedRAMP and NIS2 controls are affected.",
      configBefore: identityCloudCfg,
      configAfter: identityCloudCfgAfter,
      targetSystems: ["identity", "api-gw", "admin", "idp-cloud"],
      expectedStory: ["Multiple dependent services", "Production Safety Gate", "Approval required"],
      flagsException: false,
      fourEyes: false,
      expectedResult: "Production Safety Gate triggered.",
    },
  },
  {
    id: "scenario-government",
    name: "Government · Critical Infrastructure Hardening",
    industry: "Government / Critical Infrastructure",
    icon: "landmark",
    description: "Federal Grid Authority plans security hardening across mission systems. Criticality is HIGH — four-eyes approval is required.",
    orgProfile: {
      id: "org-federal-grid",
      name: "Federal Grid Authority",
      regions: ["IN", "US"],
      industries: ["government", "critical-infrastructure"],
      size: "GOVERNMENT",
      criticality: "CRITICAL",
      dataTypes: ["CLASSIFIED", "INTERNAL", "TELEMETRY"],
      cloud: "ON_PREM",
      cloudProviders: [],
      customerRegions: ["IN", "US"],
      businessSectors: ["GOVERNMENT", "CRITICAL_INFRA"],
      dataResidency: ["IN", "US"],
      description: "Government critical-infrastructure operator requiring highest-assurance security hardening.",
    },
    change: {
      title: "Mission system security hardening",
      description: "Harden secure boot, kernel auditing, full-disk encryption and admin exposure on mission systems. Requires two independent approvals.",
      configBefore: govHard,
      configAfter: govHardAfter,
      targetSystems: ["admin", "identity", "pa-payment", "db-postgres"],
      expectedStory: ["Criticality HIGH", "Four-eyes approval", "Two authorised reviewers", "Deployment gated"],
      flagsException: false,
      fourEyes: true,
      expectedResult: "Four-eyes approval required.",
    },
  },
];

export function demoSintenarioById(id: string): DemoSintPilotScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}