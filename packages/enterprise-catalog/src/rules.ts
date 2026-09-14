import type {
  AssetRecord,
  AssetType,
  AssetControlFramework,
  EvidenceRecord,
  FindingStatus,
  FindingLifecycle,
  Severity,
  RemediationActionType,
} from "@nexus/shared-types";

// ---------------------------------------------------------------------------
// Rule engine types
// ---------------------------------------------------------------------------

export type RuleCategory =
  | "TRANSPORT_SECURITY"
  | "IDENTITY_AND_ACCESS"
  | "DATA_PROTECTION"
  | "NETWORK_SECURITY"
  | "INTEGRITY"
  | "OPERATIONS"
  | "APPLICATION_SECURITY";

export interface RuleFacts {
  observedState: Record<string, unknown>;
  detail: Record<string, unknown>;
  hasEvidence: boolean;
}

export interface RuleEvaluation {
  status: FindingStatus;
  severity: Severity;
  observedValue: string;
  expectedValue: string;
  reason: string;
}

export interface ComplianceRule {
  id: string;
  name: string;
  category: RuleCategory;
  severity: Severity;
  appliesTo: AssetType[];
  frameworks: AssetControlFramework[];
  evidenceSource: string;
  expected?: unknown;
  remediation: string;
  remediationActions: RemediationActionType[];
  evaluate(asset: AssetRecord, facts: RuleFacts): RuleEvaluation;
}

export interface ControlResult {
  ruleId: string;
  name: string;
  category: RuleCategory;
  severity: Severity;
  evaluation: RuleEvaluation;
  remediation: string;
  remediationActions: RemediationActionType[];
  evidenceId?: string;
}

export interface RuleFinding {
  controlId: string;
  controlName: string;
  severity: Severity;
  status: FindingStatus;
  what: string;
  why: string;
  observedValue: string;
  expectedValue: string;
  remediationGuidance: string;
  lifecycle: FindingLifecycle;
  evidenceId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tlsRank(version: string): number {
  const m = version.match(/^(\d+)\.(\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 10 + Number(m[2]);
}

function versionToRank(version: string): number {
  const parts = version.match(/(\d+)[^0-9]*(\d+)[^0-9]*(\d+)/);
  if (parts) return Number(parts[1]) * 10000 + Number(parts[2]) * 100 + Number(parts[3]);
  const simple = version.match(/^(\d+)/);
  return simple ? Number(simple[1]) * 10000 : 0;
}

function boolOf(v: unknown): boolean {
  return v === true || v === "true";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pass(observed: string, reason: string): RuleEvaluation {
  return { status: "PASS", severity: "HIGH", observedValue: observed, expectedValue: "", reason };
}

function fail(severity: Severity, observed: string, expected: string, reason: string): RuleEvaluation {
  return { status: "FAIL", severity, observedValue: observed, expectedValue: expected, reason };
}

function warn(severity: Severity, observed: string, expected: string, reason: string): RuleEvaluation {
  return { status: "WARNING", severity, observedValue: observed, expectedValue: expected, reason };
}

// ---------------------------------------------------------------------------
// 21-rule registry
// ---------------------------------------------------------------------------

const TLS_001: ComplianceRule = {
  id: "TLS-001",
  name: "Minimum TLS Version",
  category: "TRANSPORT_SECURITY",
  severity: "CRITICAL",
  appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY", "DATABASE", "MESSAGE_QUEUE"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
  evidenceSource: "TLS handshake / service configuration evidence",
  expected: "TLS 1.2",
  remediation: "Disable TLS 1.0/1.1 and enforce a minimum TLS version of 1.2.",
  remediationActions: ["SET_TLS_MIN_VERSION"],
  evaluate(_asset, facts) {
    const s = facts.observedState;
    if (_asset.assetType === "DATABASE") {
      const on = boolOf(s.sslEnabled);
      const obs = on ? "ssl=enabled (TLS 1.2+)" : "ssl=disabled";
      return on
        ? pass(obs, "Database transport encryption is enabled (TLS 1.2+).")
        : fail("CRITICAL", obs, "transport encryption enabled", "Database transport encryption is disabled — plaintext client connections are accepted.");
    }
    if (_asset.assetType === "MESSAGE_QUEUE") {
      const on = boolOf(s.mqTlsEnabled);
      const obs = on ? "tls=enabled (TLS 1.2+)" : "tls=disabled";
      return on
        ? pass(obs, "Message queue transport encryption is enabled.")
        : fail("CRITICAL", obs, "transport encryption enabled", "Message queue transport encryption is disabled — broker accepts plaintext connections.");
    }
    const obs = String(s.tlsMinVersion ?? "unknown");
    const rank = tlsRank(obs);
    if (obs === "unknown") return warn("MEDIUM", obs, "TLS 1.2 or higher", "TLS version was not reported in the collected evidence.");
    if (rank < 12) return fail("CRITICAL", `TLS ${obs}`, "TLS 1.2 or higher", `Observed minimum TLS ${obs} is lower than the required TLS 1.2.`);
    return pass(`TLS ${obs}`, `Observed minimum TLS ${obs} meets or exceeds TLS 1.2.`);
  },
};

const CERT_001: ComplianceRule = {
  id: "CERT-001",
  name: "Certificate Validity",
  category: "IDENTITY_AND_ACCESS",
  severity: "HIGH",
  appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "CERTIFICATE", "PROXY"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
  evidenceSource: "Certificate metadata evidence",
  expected: "> 30 days to expiry",
  remediation: "Renew and re-issue the certificate, then stage a rollout before expiry.",
  remediationActions: ["REVOKE_AND_RENEW_CERTIFICATE"],
  evaluate(_asset, facts) {
    const days = asNumber(facts.observedState.certDaysToExpiry);
    if (days === null) return warn("MEDIUM", "unknown", "> 30 days to expiry", "Certificate expiry information was not present in the collected evidence.");
    if (days < 0) return fail("CRITICAL", `expired ${Math.abs(days)} days ago`, "> 30 days to expiry", `Certificate expired ${Math.abs(days)} days ago.`);
    if (days <= 30) return warn("MEDIUM", `expires in ${days} days`, "> 30 days to expiry", `Certificate expires within the 30-day renewal window (${days} days).`);
    return pass(`expires in ${days} days`, `Certificate valid, renewal window safe (${days} days).`);
  },
};

const NET_001: ComplianceRule = {
  id: "NET-001",
  name: "Insecure Protocol Disabled",
  category: "NETWORK_SECURITY",
  severity: "HIGH",
  appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "NETWORK_DEVICE", "ROUTER", "SWITCH"],
  frameworks: ["ISO27001", "NIST", "CIS", "OWASP"],
  evidenceSource: "Service/configuration evidence",
  expected: "none",
  remediation: "Disable telnet/FTP/plaintext HTTP and re-route traffic over encrypted protocols.",
  remediationActions: ["DISABLE_INSECURE_PROTOCOL"],
  evaluate(_asset, facts) {
    const s = facts.observedState;
    const raw = s.insecureProtocols;
    if (Array.isArray(raw)) {
      if (raw.length === 0) return pass("none enabled", "No insecure entries detected.");
      return fail("HIGH", raw.join(", "), "none", `Insecure entries detected: ${raw.join(", ")}.`);
    }
    const enabled = boolOf(raw);
    const label = String(raw ?? "false");
    return enabled
      ? fail("HIGH", label, "none", `Insecure protocol is enabled (${label}).`)
      : pass(label, `Observed ${label}; requirement met.`);
  },
};

const CRYPTO_001: ComplianceRule = {
  id: "CRYPTO-001",
  name: "Cryptographic Configuration",
  category: "TRANSPORT_SECURITY",
  severity: "HIGH",
  appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
  evidenceSource: "TLS / crypto posture evidence",
  expected: "strong",
  remediation: "Enforce modern cipher suites and disable weak algorithms.",
  remediationActions: ["ENFORCE_STRONG_CIPHERS"],
  evaluate(_asset, facts) {
    const obs = String(facts.observedState.cipherStrength ?? "unknown");
    if (obs === "strong") return pass("strong", "Observed cipher posture is strong.");
    return fail("HIGH", obs, "strong", `Weak cipher configuration is in use (${obs}).`);
  },
};

const DB_001: ComplianceRule = {
  id: "DB-001",
  name: "Database Encryption at Rest",
  category: "DATA_PROTECTION",
  severity: "HIGH",
  appliesTo: ["DATABASE"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
  evidenceSource: "Database configuration evidence",
  expected: "enabled",
  remediation: "Enable database encryption at rest.",
  remediationActions: ["ENABLE_DB_ENCRYPTION"],
  evaluate(_asset, facts) {
    const on = boolOf(facts.observedState.dbEncryption);
    const obs = String(facts.observedState.dbEncryption ?? "false");
    return on
      ? pass(obs, "Database encryption at rest is enabled.")
      : fail("HIGH", obs, "enabled", "Database encryption at rest is disabled.");
  },
};

const DB_002: ComplianceRule = {
  id: "DB-002",
  name: "Database Listener Exposure",
  category: "NETWORK_SECURITY",
  severity: "CRITICAL",
  appliesTo: ["DATABASE"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
  evidenceSource: "Network binding evidence",
  expected: "internal network address",
  remediation: "Restrict the database listener to an internal network address only.",
  remediationActions: ["RESTRICT_DB_BIND"],
  evaluate(_asset, facts) {
    const bind = String(facts.observedState.dbBindAddress ?? "unknown");
    const exposed = /0\.0\.0\.0|::|\*|any/i.test(bind);
    return exposed
      ? fail("CRITICAL", `bound to ${bind}`, "internal network address", `Database is bound to ${bind} — reachable beyond the data zone.`)
      : pass(`bound to ${bind}`, "Database listener is bound to an internal address.");
  },
};

const FW_001: ComplianceRule = {
  id: "FW-001",
  name: "Firewall Broad Allow Rules",
  category: "NETWORK_SECURITY",
  severity: "HIGH",
  appliesTo: ["FIREWALL", "NETWORK_DEVICE"],
  frameworks: ["ISO27001", "NIST", "CIS"],
  evidenceSource: "Firewall rule evidence",
  expected: "0 broad allow rules",
  remediation: "Audit and consolidate broad allow rules into scoped exceptions.",
  remediationActions: ["CONSOLIDATE_FIREWALL_RULE"],
  evaluate(asset, facts) {
    const n = asNumber(facts.observedState.firewallAnyRules) ?? 0;
    const internetFacing = (asset.tags ?? []).includes("internet-facing") || asset.location.networkZone === "DMZ";
    if (n === 0) return pass("0 broad allow rules", "Firewall policy is deny-by-default.");
    if (n <= 5) return warn("MEDIUM", `${n} broad allow rules`, "0 broad allow rules", `${n} broad allow rules present — review for consolidation.`);
    return fail(
      internetFacing ? "CRITICAL" : "HIGH",
      `${n} broad allow rules`,
      "0 broad allow rules",
      `Excessive broad allow rules (${n}) present in the policy${internetFacing ? " on an internet-facing edge" : ""}.`,
    );
  },
};

const AUTH_001: ComplianceRule = {
  id: "AUTH-001",
  name: "Authentication Strength",
  category: "IDENTITY_AND_ACCESS",
  severity: "HIGH",
  appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "DATABASE", "MESSAGE_QUEUE"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP"],
  evidenceSource: "Authentication configuration evidence",
  expected: "strong|mfa",
  remediation: "Enforce strong authentication or multi-factor authentication.",
  remediationActions: ["ENFORCE_STRONG_AUTH"],
  evaluate(_asset, facts) {
    const lab = String(facts.observedState.authStrength ?? "unknown");
    if (lab === "strong" || lab === "mfa") return pass(lab, `Observed authentication strength ${lab} meets the requirement.`);
    return fail("HIGH", lab, "strong|mfa", `Authentication strength ${lab} does not meet the strong/MFA requirement.`);
  },
};

const INTEGRITY_001: ComplianceRule = {
  id: "INTEGRITY-001",
  name: "Integrity Validation",
  category: "INTEGRITY",
  severity: "MEDIUM",
  appliesTo: ["API", "APPLICATION", "SERVER"],
  frameworks: ["ISO27001", "NIST"],
  evidenceSource: "Integrity validation evidence",
  expected: "enabled",
  remediation: "Enable integrity validation for deployed artifacts.",
  remediationActions: ["ENABLE_INTEGRITY_VALIDATION"],
  evaluate(_asset, facts) {
    const on = boolOf(facts.observedState.integrityValidation);
    return on
      ? pass("enabled", "Integrity validation is enabled for deployed artifacts.")
      : fail("MEDIUM", "disabled", "enabled", "Integrity validation is not enabled for deployed artifacts.");
  },
};

const XMLSIG_010: ComplianceRule = {
  id: "XMLSIG-010",
  name: "XML Signature Validation",
  category: "APPLICATION_SECURITY",
  severity: "HIGH",
  appliesTo: ["API", "APPLICATION", "SERVER"],
  frameworks: ["OWASP", "NIST"],
  evidenceSource: "XML processing evidence",
  expected: "enabled",
  remediation: "Enable XML signature validation on all XML-consuming endpoints.",
  remediationActions: ["ENABLE_XML_SIGNATURE_VALIDATION"],
  evaluate(_asset, facts) {
    const on = boolOf(facts.observedState.xmlSignatureValidation);
    return on
      ? pass("enabled", "XML signature validation is enabled.")
      : fail("HIGH", "disabled", "enabled", "XML signatures are not validated on XML-consuming endpoints.");
  },
};

const API_001: ComplianceRule = {
  id: "API-001",
  name: "API Authentication Enforcement",
  category: "APPLICATION_SECURITY",
  severity: "HIGH",
  appliesTo: ["API"],
  frameworks: ["OWASP", "NIST", "PCI_DSS"],
  evidenceSource: "API configuration evidence",
  expected: "enabled",
  remediation: "Enforce authentication on all API endpoints.",
  remediationActions: ["SECURE_API_CONFIG"],
  evaluate(_asset, facts) {
    const on = boolOf(facts.observedState.apiAuthEnabled);
    return on
      ? pass("enabled", "API authentication is enforced.")
      : fail("HIGH", "disabled", "enabled", "API endpoints are exposed without authentication.");
  },
};

const API_002: ComplianceRule = {
  id: "API-002",
  name: "API Rate Limiting",
  category: "APPLICATION_SECURITY",
  severity: "MEDIUM",
  appliesTo: ["API"],
  frameworks: ["OWASP"],
  evidenceSource: "API configuration evidence",
  expected: "enabled",
  remediation: "Enable API rate limiting to protect against abuse and denial-of-service.",
  remediationActions: ["SECURE_API_CONFIG"],
  evaluate(_asset, facts) {
    const on = boolOf(facts.observedState.apiRateLimit);
    return on
      ? pass("enabled", "API rate limiting is enforced.")
      : fail("MEDIUM", "disabled", "enabled", "API rate limiting is not enforced.");
  },
};

const DATA_012: ComplianceRule = {
  id: "DATA-012",
  name: "Plaintext Secrets Detection",
  category: "DATA_PROTECTION",
  severity: "CRITICAL",
  appliesTo: ["API", "APPLICATION", "SERVER"],
  frameworks: ["ISO27001", "NIST", "CIS", "OWASP"],
  evidenceSource: "Configuration / secret scanning evidence",
  expected: "false",
  remediation: "Rotate and screen exposed secrets; move all secrets to a vault.",
  remediationActions: ["ROTATE_AND_SCREEN_SECRETS"],
  evaluate(_asset, facts) {
    const raw = facts.observedState.plaintextSecrets;
    const on = boolOf(raw);
    const obs = String(raw ?? "true");
    return on
      ? fail("CRITICAL", obs, "false", "Plaintext secrets or sensitive data were detected.")
      : pass("none", "No plaintext secrets detected.");
  },
};

const ACCESS_001: ComplianceRule = {
  id: "ACCESS-001",
  name: "Privileged Access Scope",
  category: "IDENTITY_AND_ACCESS",
  severity: "HIGH",
  appliesTo: ["API", "APPLICATION", "SERVER", "DATABASE"],
  frameworks: ["ISO27001", "NIST", "CIS"],
  evidenceSource: "Access control evidence",
  expected: "false",
  remediation: "Restrict privileged access to least-privilege roles only.",
  remediationActions: ["RESTRICT_PRIVILEGED_ACCESS"],
  evaluate(_asset, facts) {
    const raw = facts.observedState.privilegedBroadAccess;
    const on = boolOf(raw);
    const obs = String(raw ?? "true");
    return on
      ? fail("HIGH", obs, "false", "Privileged access is granted too broadly.")
      : pass("least-privilege", "Privileged access is scoped to least-privilege roles.");
  },
};

const OUTDATE_014: ComplianceRule = {
  id: "OUTDATE-014",
  name: "Software Currency",
  category: "OPERATIONS",
  severity: "MEDIUM",
  appliesTo: ["API", "APPLICATION", "SERVER", "LOAD_BALANCER", "ROUTER", "SWITCH", "NETWORK_DEVICE", "MESSAGE_QUEUE"],
  frameworks: ["NIST", "CIS"],
  evidenceSource: "Service version evidence",
  expected: "supported version",
  remediation: "Upgrade the service to the current stable version.",
  remediationActions: ["UPGRADE_SERVICE_VERSION"],
  evaluate(_asset, facts) {
    const s = facts.observedState;
    const obs = String(s.serviceVersion ?? "unknown");
    const latest = String(s.latestStableVersion ?? "");
    if (!latest) return warn("MEDIUM", obs, "supported version", "Version support status unknown for this asset.");
    const gap = versionToRank(latest) - versionToRank(obs);
    if (gap <= 0) return pass(obs, `Version ${obs} is current (latest ${latest}).`);
    if (gap <= 200) return warn("MEDIUM", obs, `>= ${latest}`, `Version ${obs} is one patch level behind latest ${latest}.`);
    return fail("MEDIUM", obs, `>= ${latest}`, `Version ${obs} is significantly behind supported version ${latest}.`);
  },
};

const CONFIG_001: ComplianceRule = {
  id: "CONFIG-001",
  name: "Configuration Integrity Check",
  category: "INTEGRITY",
  severity: "HIGH",
  appliesTo: ["API", "APPLICATION", "SERVER", "LOAD_BALANCER"],
  frameworks: ["ISO27001", "NIST", "CIS"],
  evidenceSource: "Baseline checksum evidence",
  expected: "matches baseline",
  remediation: "Restore the approved configuration baseline.",
  remediationActions: ["RESTORE_BASELINE_HASH"],
  evaluate(_asset, facts) {
    const s = facts.observedState;
    const obs = String(s.configChecksum ?? "missing");
    const expected = String(s.expectedChecksum ?? "missing");
    if (expected === "missing" || obs === "missing") return warn("MEDIUM", obs, expected, "Checksum comparison could not be completed (missing expected/observed).");
    if (obs === expected) return pass(obs, "Configuration checksum matches the approved baseline.");
    return fail("HIGH", obs, expected, `Checksum mismatch — observed ${obs} differs from baseline ${expected}.`);
  },
};

const MQ_016: ComplianceRule = {
  id: "MQ-016",
  name: "Message Queue Broker Authentication",
  category: "APPLICATION_SECURITY",
  severity: "CRITICAL",
  appliesTo: ["MESSAGE_QUEUE"],
  frameworks: ["ISO27001", "NIST", "CIS"],
  evidenceSource: "Broker configuration evidence",
  expected: "enabled",
  remediation: "Enforce broker authentication and block unauthenticated connections.",
  remediationActions: ["SECURE_MESSAGE_QUEUE"],
  evaluate(_asset, facts) {
    const on = boolOf(facts.observedState.mqAuthRequired);
    return on
      ? pass("enabled", "Broker authentication is enforced.")
      : fail("CRITICAL", "disabled", "enabled", "Message queue accepts unauthenticated connections.");
  },
};

const TLS_002: ComplianceRule = {
  id: "TLS-002",
  name: "Legacy Protocol Usage",
  category: "TRANSPORT_SECURITY",
  severity: "MEDIUM",
  appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
  evidenceSource: "Protocol enumeration evidence",
  expected: "none",
  remediation: "Remove legacy TLS/SSL protocol support (SSLv3, TLS 1.0, TLS 1.1).",
  remediationActions: ["DISABLE_INSECURE_PROTOCOL"],
  evaluate(_asset, facts) {
    const s = facts.observedState;
    const explicit: string[] = Array.isArray(s.legacyProtocols) ? (s.legacyProtocols as string[]).map(String) : [];
    const insecure: string[] = Array.isArray(s.insecureProtocols) ? (s.insecureProtocols as string[]).map(String) : [];
    const legacyRe = /sslv3|tlsv1(\.0)?(\b|$)|tlsv1\.1/i;
    const legacy = Array.from(new Set([...explicit, ...insecure.filter((p) => legacyRe.test(p))]));
    if (legacy.length === 0) return pass("TLSv1.x/SSLv3 deprecated", "No TLS 1.0/1.1/SSLv3 legacy protocol is enabled.");
    return fail("MEDIUM", legacy.join(", "), "none", `Legacy protocol(s) enabled: ${legacy.join(", ")} — deprecated TLS/SSL still accepted.`);
  },
};

const CERT_002: ComplianceRule = {
  id: "CERT-002",
  name: "Certificate Key Strength",
  category: "TRANSPORT_SECURITY",
  severity: "MEDIUM",
  appliesTo: ["CERTIFICATE"],
  frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
  evidenceSource: "Certificate metadata evidence",
  expected: ">= 2048-bit RSA / P-256 ECDSA",
  remediation: "Replace the certificate with a key of >= 2048-bit RSA or P-256 ECDSA strength.",
  remediationActions: ["REVOKE_AND_RENEW_CERTIFICATE"],
  evaluate(asset, facts) {
    const s = facts.observedState;
    const explicit = asNumber(s.certKeySize);
    if (explicit !== null) {
      const min = explicit === 256 ? 256 : 2048;
      if (explicit < min) return fail("HIGH", `${explicit}-bit key`, ">= 2048-bit RSA / P-256 ECDSA", `Certificate key strength (${explicit}-bit) is below the required minimum.`);
      return pass(`${explicit}-bit key`, `Certificate key strength (${explicit}-bit) meets the requirement.`);
    }
    const tech = String(s.certKeyAlgorithm ?? asset.technology ?? "");
    const m2048 = tech.match(/RSA\s+2048/);
    if (m2048) return pass("RSA 2048-bit key", "Certificate key strength (2048-bit RSA) meets the requirement.");
    const m1024 = tech.match(/RSA\s+1024/);
    if (m1024) return fail("HIGH", "RSA 1024-bit key", ">= 2048-bit RSA / P-256 ECDSA", "Certificate key strength (1024-bit RSA) is below the required minimum.");
    const ecdsa = tech.match(/ECDSA\s+P-(\d+)/);
    if (ecdsa) {
      const bits = Number(ecdsa[1]);
      return bits >= 256
        ? pass(`ECDSA P-${bits}-bit key`, `Certificate key strength (ECDSA P-${bits}) meets the requirement.`)
        : fail("HIGH", `ECDSA P-${bits}-bit key`, ">= 2048-bit RSA / P-256 ECDSA", `Certificate key strength (ECDSA P-${bits}) is below the required minimum.`);
    }
    const anyRsa = tech.match(/RSA\s+(\d+)/);
    if (anyRsa) {
      const bits = Number(anyRsa[1]);
      return bits >= 2048
        ? pass(`${bits}-bit RSA key`, `Certificate key strength (${bits}-bit RSA) meets the requirement.`)
        : fail("HIGH", `${bits}-bit RSA key`, ">= 2048-bit RSA / P-256 ECDSA", `Certificate key strength (${bits}-bit RSA) is below the required minimum.`);
    }
    return warn("MEDIUM", "unknown", ">= 2048-bit RSA / P-256 ECDSA", "Certificate key size is not reported in the evidence.");
  },
};

const FW_002: ComplianceRule = {
  id: "FW-002",
  name: "Management Interface Exposure",
  category: "NETWORK_SECURITY",
  severity: "HIGH",
  appliesTo: ["FIREWALL", "NETWORK_DEVICE", "ROUTER", "SWITCH"],
  frameworks: ["ISO27001", "NIST", "CIS"],
  evidenceSource: "Management access evidence",
  expected: "management zone only",
  remediation: "Restrict the management interface to the dedicated management zone.",
  remediationActions: ["CONSOLIDATE_FIREWALL_RULE"],
  evaluate(_asset, facts) {
    const mgmt = String(facts.observedState.mgmtAccessibleFrom ?? "").toLowerCase();
    if (!mgmt || mgmt === "undefined" || mgmt === "unknown") {
      return pass("internal", "Management interface exposure not reported — no external reachability claim in evidence.");
    }
    if (["0.0.0.0", "any", "*", "internet", "untrusted", "untrusted-any"].includes(mgmt)) {
      return fail("HIGH", `accessible from ${mgmt}`, "management zone only", `Management interface is reachable from ${mgmt} — outside the mgmt zone.`);
    }
    return pass(`accessible from ${mgmt}`, "Management interface is restricted to the management zone.");
  },
};

const ACL_001: ComplianceRule = {
  id: "ACL-001",
  name: "Network ACL Default Policy",
  category: "NETWORK_SECURITY",
  severity: "HIGH",
  appliesTo: ["FIREWALL", "NETWORK_DEVICE", "PROXY"],
  frameworks: ["ISO27001", "NIST", "CIS"],
  evidenceSource: "ACL policy evidence",
  expected: "deny-by-default",
  remediation: "Set the default ACL policy to deny-by-default and explicitly permit required traffic.",
  remediationActions: ["CONSOLIDATE_FIREWALL_RULE"],
  evaluate(_asset, facts) {
    const mode = String(facts.observedState.aclDefaultPolicy ?? facts.observedState.networkAclMode ?? "").toLowerCase();
    if (!mode || mode === "undefined" || mode === "unknown") {
      return warn("MEDIUM", "indeterminate", "deny-by-default", "ACL default policy is not reported — deny-by-default not established in evidence.");
    }
    if (mode.includes("deny") && !mode.includes("allow")) {
      return pass("deny-by-default", "Network ACL policy is deny-by-default.");
    }
    if (mode.includes("allow") || mode === "permissive") {
      return fail("HIGH", mode, "deny-by-default", `Network ACL default policy is ${mode} — permissive by default.`);
    }
    return warn("MEDIUM", mode, "deny-by-default", `ACL default policy is ${mode} — deny-by-default not confirmed.`);
  },
};

// ---------------------------------------------------------------------------
// Registry + public API
// ---------------------------------------------------------------------------

export const RULES: ComplianceRule[] = [
  TLS_001,
  CERT_001,
  NET_001,
  CRYPTO_001,
  DB_001,
  DB_002,
  FW_001,
  AUTH_001,
  INTEGRITY_001,
  XMLSIG_010,
  API_001,
  API_002,
  DATA_012,
  ACCESS_001,
  OUTDATE_014,
  CONFIG_001,
  MQ_016,
  TLS_002,
  CERT_002,
  FW_002,
  ACL_001,
];

export function ruleForControl(controlId: string): ComplianceRule | undefined {
  return RULES.find((r) => r.id === controlId);
}

export function evaluateRule(rule: ComplianceRule, asset: AssetRecord): RuleEvaluation | undefined {
  if (!rule.appliesTo.includes(asset.assetType)) return undefined;
  return rule.evaluate(asset, { observedState: asset.observedState, detail: {}, hasEvidence: false });
}

/**
 * Evaluate all applicable rules for an asset, optionally using evidence-sourced
 * observed state when available. When `evidenceRows` is provided the evidence
 * detail snapshot is preferred over the asset's current observedState, ensuring
 * determinism is rooted in collected evidence.
 */
export function evaluateEvidenceForAsset(asset: AssetRecord, evidenceRows?: EvidenceRecord[]): ControlResult[] {
  const byControl = new Map<string, EvidenceRecord>();
  for (const row of evidenceRows ?? []) byControl.set(row.controlId, row);
  const results: ControlResult[] = [];
  for (const rule of RULES) {
    if (!rule.appliesTo.includes(asset.assetType)) continue;
    const row = byControl.get(rule.id);
    const facts: RuleFacts = {
      observedState: row && isRecord(row.detail?.observedState) ? (row.detail.observedState as Record<string, unknown>) : { ...asset.observedState },
      detail: row?.detail ?? {},
      hasEvidence: !!row,
    };
    const evaluation = rule.evaluate(asset, facts);
    results.push({
      ruleId: rule.id,
      name: rule.name,
      category: rule.category,
      severity: evaluation.severity,
      evaluation,
      remediation: rule.remediation,
      remediationActions: rule.remediationActions,
      evidenceId: row?.id,
    });
  }
  return results;
}

/**
 * From control results, extract the FAIL/WARNING findings with structured
 * evidence-grounded rationale.
 */
export function findingsFromResults(_asset: AssetRecord, results: ControlResult[]): RuleFinding[] {
  return results
    .filter((r) => r.evaluation.status === "FAIL" || r.evaluation.status === "WARNING")
    .map((r) => ({
      controlId: r.ruleId,
      controlName: r.name,
      severity: r.severity,
      status: r.evaluation.status,
      what: r.name,
      why: r.evaluation.reason,
      observedValue: r.evaluation.observedValue,
      expectedValue: r.evaluation.expectedValue,
      remediationGuidance: r.remediation,
      lifecycle: "OPEN" as FindingLifecycle,
      evidenceId: r.evidenceId,
    }));
}
