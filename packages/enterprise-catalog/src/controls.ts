import type {
  AssetComplianceControl,
  AssetControlFramework,
  AssetRecord,
  FindingStatus,
  Severity,
} from "@nexus/shared-types";
import { ruleForControl, evaluateRule, type RuleEvaluation } from "./rules";

// ---------------------------------------------------------------------------
// Asset-aware compliance controls (deterministic).
//
// PHASE 3 — Canonical 21-control catalog. Every control delegates its core
// evaluation to the matching ComplianceRule in rules.ts; the legacy switch
// below is retained only as a fallback path and for historical evalKind
// metadata the catalogue may still reference.
// ---------------------------------------------------------------------------

export interface EvalOutcome {
  status: FindingStatus;
  observedValue: string;
  expectedValue: string;
  reason: string;
}

function stateValue(asset: AssetRecord, key: string): unknown {
  return (asset.observedState as Record<string, unknown>)[key];
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function versionToRank(version: string): number {
  const parts = version.match(/(\d+)[^0-9]*(\d+)[^0-9]*(\d+)/);
  if (parts) return Number(parts[1]) * 10000 + Number(parts[2]) * 100 + Number(parts[3]);
  const simple = version.match(/^(\d+)/);
  return simple ? Number(simple[1]) * 10000 : 0;
}

function tlsRank(version: string): number {
  const m = version.match(/^(\d+)\.(\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 10 + Number(m[2]);
}

// ---------------------------------------------------------------------------
// 21-control catalog
// ---------------------------------------------------------------------------

export const ASSET_CONTROLS: AssetComplianceControl[] = [
  {
    id: "TLS-001",
    name: "Minimum TLS Version",
    description: "Communications must use TLS 1.2 or higher.",
    requirement: "Minimum supported TLS version >= 1.2.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
    severity: "CRITICAL",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY", "DATABASE", "MESSAGE_QUEUE"],
    evidenceSource: "TLS handshake / service configuration evidence",
    evalKind: "min_version",
    evalField: "tlsMinVersion",
    expected: "TLS 1.2",
    failureMessage: "TLS 1.0 or TLS 1.1 is enabled on this asset.",
    remediation: "Disable TLS 1.0/1.1 and enforce a minimum TLS version of 1.2.",
    remediationActions: ["SET_TLS_MIN_VERSION"],
  },
  {
    id: "CERT-001",
    name: "Certificate Validity",
    description: "Public/private certificates must be valid and non-expiring.",
    requirement: "Installed certificate is not expired and renews before the 30-day warning window.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "CERTIFICATE", "PROXY"],
    evidenceSource: "Certificate metadata evidence",
    evalKind: "unexpired",
    evalField: "certDaysToExpiry",
    expected: "> 30 days to expiry",
    failureMessage: "Certificate is expired or expires within the 30-day warning window.",
    remediation: "Renew and re-issue the certificate, then stage a rollout before expiry.",
    remediationActions: ["REVOKE_AND_RENEW_CERTIFICATE"],
  },
  {
    id: "NET-001",
    name: "Insecure Protocol Disabled",
    description: "Insecure protocols (telnet, FTP, unencrypted HTTP) must be disabled.",
    requirement: "No insecure protocol is enabled on the service.",
    frameworks: ["ISO27001", "NIST", "CIS", "OWASP"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "NETWORK_DEVICE", "ROUTER", "SWITCH"],
    evidenceSource: "Service/configuration evidence",
    evalKind: "disabled",
    evalField: "insecureProtocols",
    expected: "none",
    failureMessage: "At least one insecure protocol is enabled.",
    remediation: "Disable telnet/FTP/plaintext HTTP and re-route traffic over encrypted protocols.",
    remediationActions: ["DISABLE_INSECURE_PROTOCOL"],
  },
  {
    id: "CRYPTO-001",
    name: "Cryptographic Configuration",
    description: "Cryptographic configuration must not rely on weak ciphers.",
    requirement: "Cipher suite and key configuration are rated strong.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY"],
    evidenceSource: "TLS / crypto posture evidence",
    evalKind: "exact",
    evalField: "cipherStrength",
    expected: "strong",
    failureMessage: "Weak cipher configuration is in use.",
    remediation: "Enforce modern cipher suites and disable weak algorithms.",
    remediationActions: ["ENFORCE_STRONG_CIPHERS"],
  },
  {
    id: "DB-001",
    name: "Database Encryption at Rest",
    description: "Database storage must be encrypted at rest.",
    requirement: "Storage-level encryption is enabled.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
    severity: "HIGH",
    appliesTo: ["DATABASE"],
    evidenceSource: "Database configuration evidence",
    evalKind: "enabled",
    evalField: "dbEncryption",
    expected: "enabled",
    failureMessage: "Database encryption at rest is disabled.",
    remediation: "Enable database encryption at rest.",
    remediationActions: ["ENABLE_DB_ENCRYPTION"],
  },
  {
    id: "DB-002",
    name: "Database Listener Exposure",
    description: "Databases must not be reachable from unrestricted networks.",
    requirement: "Database is bound to an internal address, not 0.0.0.0/internet.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
    severity: "CRITICAL",
    appliesTo: ["DATABASE"],
    evidenceSource: "Network binding evidence",
    evalKind: "port_exposed",
    evalField: "dbBindAddress",
    expected: "internal network address",
    failureMessage: "Database is bound to an unrestricted/exposed address.",
    remediation: "Restrict the database listener to an internal network address only.",
    remediationActions: ["RESTRICT_DB_BIND"],
  },
  {
    id: "FW-001",
    name: "Firewall Broad Allow Rules",
    description: "Firewall policy must not contain excessive ANY/ANY rules.",
    requirement: "No broad allow rules (ANY->ANY); policy is deny-by-default.",
    frameworks: ["ISO27001", "NIST", "CIS"],
    severity: "HIGH",
    appliesTo: ["FIREWALL", "NETWORK_DEVICE"],
    evidenceSource: "Firewall rule evidence",
    evalKind: "rule_scan",
    evalField: "firewallAnyRules",
    expected: "0 broad allow rules",
    failureMessage: "Firewall policy contains excessive broad allow rules.",
    remediation: "Audit and consolidate broad allow rules into scoped exceptions.",
    remediationActions: ["CONSOLIDATE_FIREWALL_RULE"],
  },
  {
    id: "AUTH-001",
    name: "Authentication Strength",
    description: "Administrative/privileged access must use strong authentication (e.g. MFA).",
    requirement: "Authentication strength is rated strong/MFA for administrative access.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "DATABASE", "MESSAGE_QUEUE"],
    evidenceSource: "Authentication configuration evidence",
    evalKind: "exact",
    evalField: "authStrength",
    expected: "strong|mfa",
    failureMessage: "Weak or no multi-factor authentication is enforced.",
    remediation: "Enforce strong authentication or multi-factor authentication.",
    remediationActions: ["ENFORCE_STRONG_AUTH"],
  },
  {
    id: "INTEGRITY-001",
    name: "Integrity Validation",
    description: "Systems must validate the integrity of deployed artifacts.",
    requirement: "Integrity validation (signatures/checksums) is enabled for deployable artifacts.",
    frameworks: ["ISO27001", "NIST"],
    severity: "MEDIUM",
    appliesTo: ["API", "APPLICATION", "SERVER"],
    evidenceSource: "Deployment/artifact metadata evidence",
    evalKind: "enabled",
    evalField: "integrityValidation",
    expected: "enabled",
    failureMessage: "Integrity validation is not enabled for deployed artifacts.",
    remediation: "Enable integrity validation for deployed artifacts.",
    remediationActions: ["ENABLE_INTEGRITY_VALIDATION"],
  },
  {
    id: "XMLSIG-010",
    name: "XML Signature Validation",
    description: "Services consuming XML must validate XML signatures.",
    requirement: "XML signature validation enabled on XML-consuming endpoints.",
    frameworks: ["OWASP", "NIST"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "SERVER"],
    evidenceSource: "XML processing evidence",
    evalKind: "enabled",
    evalField: "xmlSignatureValidation",
    expected: "enabled",
    failureMessage: "XML signatures are not validated on XML-consuming endpoints.",
    remediation: "Enable XML signature validation on all XML-consuming endpoints.",
    remediationActions: ["ENABLE_XML_SIGNATURE_VALIDATION"],
  },
  {
    id: "API-001",
    name: "API Authentication Enforcement",
    description: "APIs must enforce authentication on all endpoints.",
    requirement: "API authentication is enforced.",
    frameworks: ["OWASP", "NIST", "PCI_DSS"],
    severity: "HIGH",
    appliesTo: ["API"],
    evidenceSource: "API configuration evidence",
    evalKind: "enabled",
    evalField: "apiAuthEnabled",
    expected: "enabled",
    failureMessage: "API endpoints are exposed without authentication.",
    remediation: "Enforce authentication on all API endpoints.",
    remediationActions: ["SECURE_API_CONFIG"],
  },
  {
    id: "API-002",
    name: "API Rate Limiting",
    description: "APIs must enforce rate limiting to protect against abuse.",
    requirement: "API rate limiting is enforced.",
    frameworks: ["OWASP"],
    severity: "MEDIUM",
    appliesTo: ["API"],
    evidenceSource: "API configuration evidence",
    evalKind: "enabled",
    evalField: "apiRateLimit",
    expected: "enabled",
    failureMessage: "API rate limiting is not enforced.",
    remediation: "Enable API rate limiting to protect against abuse and denial-of-service.",
    remediationActions: ["SECURE_API_CONFIG"],
  },
  {
    id: "DATA-012",
    name: "Plaintext Secrets Detection",
    description: "Secrets and sensitive data must not be stored in plaintext.",
    requirement: "No plaintext secrets/tokens stored in configuration or storage.",
    frameworks: ["ISO27001", "NIST", "CIS", "OWASP"],
    severity: "CRITICAL",
    appliesTo: ["API", "APPLICATION", "SERVER"],
    evidenceSource: "Configuration / secret scanning evidence",
    evalKind: "disabled",
    evalField: "plaintextSecrets",
    expected: "false",
    failureMessage: "Plaintext secrets or sensitive data were detected.",
    remediation: "Rotate and screen exposed secrets; move all secrets to a vault.",
    remediationActions: ["ROTATE_AND_SCREEN_SECRETS"],
  },
  {
    id: "ACCESS-001",
    name: "Privileged Access Scope",
    description: "Privileged access must be scoped and least-privileged.",
    requirement: "No broad/any-source privileged access is configured.",
    frameworks: ["ISO27001", "NIST", "CIS"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "SERVER", "DATABASE"],
    evidenceSource: "Access control evidence",
    evalKind: "disabled",
    evalField: "privilegedBroadAccess",
    expected: "false",
    failureMessage: "Privileged access is granted too broadly.",
    remediation: "Restrict privileged access to least-privilege roles only.",
    remediationActions: ["RESTRICT_PRIVILEGED_ACCESS"],
  },
  {
    id: "OUTDATE-014",
    name: "Software Currency",
    description: "Deployed services must not fall dangerously behind supported versions.",
    requirement: "Service version is supported and within the maintenance window.",
    frameworks: ["NIST", "CIS"],
    severity: "MEDIUM",
    appliesTo: ["API", "APPLICATION", "SERVER", "LOAD_BALANCER", "ROUTER", "SWITCH", "NETWORK_DEVICE", "MESSAGE_QUEUE"],
    evidenceSource: "Service version evidence",
    evalKind: "range",
    evalField: "serviceVersion",
    expected: "supported version",
    failureMessage: "A deployed service is running an outdated/unsupported version.",
    remediation: "Upgrade the service to the current stable version.",
    remediationActions: ["UPGRADE_SERVICE_VERSION"],
  },
  {
    id: "CONFIG-001",
    name: "Configuration Integrity Check",
    description: "Configuration baselines must match the approved checksum.",
    requirement: "Observed configuration checksum matches the approved baseline.",
    frameworks: ["ISO27001", "NIST", "CIS"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "SERVER", "LOAD_BALANCER"],
    evidenceSource: "Baseline checksum evidence",
    evalKind: "hash_match",
    evalField: "configChecksum",
    expected: "matches baseline",
    failureMessage: "Configuration differs from the approved baseline (checksum mismatch).",
    remediation: "Restore the approved configuration baseline.",
    remediationActions: ["RESTORE_BASELINE_HASH"],
  },
  {
    id: "MQ-016",
    name: "Message Queue Broker Authentication",
    description: "Message queues must require authentication.",
    requirement: "Authentication is enforced on the message broker.",
    frameworks: ["ISO27001", "NIST", "CIS"],
    severity: "CRITICAL",
    appliesTo: ["MESSAGE_QUEUE"],
    evidenceSource: "Broker configuration evidence",
    evalKind: "enabled",
    evalField: "mqAuthRequired",
    expected: "enabled",
    failureMessage: "Message queue accepts unauthenticated connections.",
    remediation: "Enforce broker authentication and block unauthenticated connections.",
    remediationActions: ["SECURE_MESSAGE_QUEUE"],
  },
  {
    id: "TLS-002",
    name: "Legacy Protocol Usage",
    description: "Legacy TLS/SSL protocols (SSLv3, TLS 1.0, TLS 1.1) must be disabled.",
    requirement: "No TLS 1.0/1.1/SSLv3 legacy protocol is enabled.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
    severity: "MEDIUM",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY"],
    evidenceSource: "Protocol enumeration evidence",
    evalKind: "legacy_protocols",
    evalField: "legacyProtocols",
    expected: "none",
    failureMessage: "Legacy TLS/SSL protocols are still enabled.",
    remediation: "Remove legacy TLS/SSL protocol support (SSLv3, TLS 1.0, TLS 1.1).",
    remediationActions: ["DISABLE_INSECURE_PROTOCOL"],
  },
  {
    id: "CERT-002",
    name: "Certificate Key Strength",
    description: "Certificate keys must meet minimum strength requirements.",
    requirement: ">= 2048-bit RSA / P-256 ECDSA key strength.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS"],
    severity: "MEDIUM",
    appliesTo: ["CERTIFICATE"],
    evidenceSource: "Certificate metadata evidence",
    evalKind: "cert_crypto",
    evalField: "certKeySize",
    expected: ">= 2048-bit RSA / P-256 ECDSA",
    failureMessage: "Certificate key strength is below the required minimum.",
    remediation: "Replace the certificate with a key of >= 2048-bit RSA or P-256 ECDSA strength.",
    remediationActions: ["REVOKE_AND_RENEW_CERTIFICATE"],
  },
  {
    id: "FW-002",
    name: "Management Interface Exposure",
    description: "Management interfaces must be restricted to the management zone.",
    requirement: "Management interface is accessible only from the management zone.",
    frameworks: ["ISO27001", "NIST", "CIS"],
    severity: "HIGH",
    appliesTo: ["FIREWALL", "NETWORK_DEVICE", "ROUTER", "SWITCH"],
    evidenceSource: "Management access evidence",
    evalKind: "mgmt_access",
    evalField: "mgmtAccessibleFrom",
    expected: "management zone only",
    failureMessage: "Management interface is reachable from outside the management zone.",
    remediation: "Restrict the management interface to the dedicated management zone.",
    remediationActions: ["CONSOLIDATE_FIREWALL_RULE"],
  },
  {
    id: "ACL-001",
    name: "Network ACL Default Policy",
    description: "Network ACLs must use a deny-by-default policy.",
    requirement: "Default ACL policy is deny-by-default.",
    frameworks: ["ISO27001", "NIST", "CIS"],
    severity: "HIGH",
    appliesTo: ["FIREWALL", "NETWORK_DEVICE", "PROXY"],
    evidenceSource: "ACL policy evidence",
    evalKind: "acl",
    evalField: "aclDefaultPolicy",
    expected: "deny-by-default",
    failureMessage: "Network ACL default policy is permissive (not deny-by-default).",
    remediation: "Set the default ACL policy to deny-by-default and explicitly permit required traffic.",
    remediationActions: ["CONSOLIDATE_FIREWALL_RULE"],
  },
];

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function getAssetControls(): AssetComplianceControl[] {
  return ASSET_CONTROLS;
}

export function getAssetControlById(id: string): AssetComplianceControl | undefined {
  return ASSET_CONTROLS.find((c) => c.id === id);
}

/**
 * Deterministic evaluation of a control against a simulated asset state.
 * PHASE 3: Delegates to the rule engine first; falls back to the legacy
 * switch for any control not yet migrated.
 */
export function evaluateAssetControl(control: AssetComplianceControl, asset: AssetRecord): EvalOutcome {
  if (!control.appliesTo.includes(asset.assetType)) {
    return {
      status: "NOT_APPLICABLE",
      observedValue: "asset type not in scope",
      expectedValue: control.requirement,
      reason: `Control ${control.id} does not apply to asset type ${asset.assetType}.`,
    };
  }

  // --- Rule engine path (deterministic, evidence-grounded) ---
  const rule = ruleForControl(control.id);
  if (rule) {
    const evaluation: RuleEvaluation | undefined = evaluateRule(rule, asset);
    if (evaluation) {
      return {
        status: evaluation.status,
        observedValue: evaluation.observedValue,
        expectedValue: evaluation.expectedValue,
        reason: evaluation.reason,
      };
    }
  }

  // --- Legacy fallback (should be unreachable for the 21-rule catalog) ---
  const field = control.evalField;
  const raw = stateValue(asset, field);

  switch (control.evalKind) {
    case "min_version": {
      const obs = String(raw ?? "unknown");
      const obsRank = tlsRank(obs);
      const expRank = tlsRank("1.2");
      if (obsRank < expRank) return { status: "FAIL", observedValue: `TLS ${obs}`, expectedValue: "TLS 1.2 or higher", reason: `Observed minimum TLS ${obs} is lower than the required TLS 1.2.` };
      return { status: "PASS", observedValue: `TLS ${obs}`, expectedValue: "TLS 1.2 or higher", reason: `Observed minimum TLS ${obs} meets the requirement.` };
    }
    case "unexpired": {
      const days = asNumber(raw);
      if (days === null) return { status: "WARNING", observedValue: "unknown", expectedValue: "> 30 days to expiry", reason: "Certificate expiry information was not present in the collected evidence." };
      if (days < 0) return { status: "FAIL", observedValue: `expired ${Math.abs(days)} days ago`, expectedValue: "> 30 days to expiry", reason: `Certificate expired ${Math.abs(days)} days ago.` };
      if (days <= 30) return { status: "WARNING", observedValue: `expires in ${days} days`, expectedValue: "> 30 days to expiry", reason: `Certificate expires within the 30-day renewal window (${days} days).` };
      return { status: "PASS", observedValue: `expires in ${days} days`, expectedValue: "> 30 days to expiry", reason: `Certificate valid, renewal window safe (${days} days).` };
    }
    case "disabled": {
      if (Array.isArray(raw)) {
        if (raw.length === 0) return { status: "PASS", observedValue: "none enabled", expectedValue: "none", reason: "No insecure entries detected." };
        return { status: "FAIL", observedValue: raw.join(", "), expectedValue: "none", reason: `Insecure entries detected: ${raw.join(", ")}.` };
      }
      const enabled = raw === true || raw === "true";
      const label = String(raw ?? "false");
      return enabled
        ? { status: "FAIL", observedValue: label, expectedValue: String(control.expected ?? "false"), reason: `Expected ${control.expected ?? "false"} but observed ${label}.` }
        : { status: "PASS", observedValue: label, expectedValue: String(control.expected ?? "false"), reason: `Observed ${label}; requirement met.` };
    }
    case "enabled": {
      const enabled = raw === true || raw === "true";
      const label = String(raw ?? "false");
      return enabled
        ? { status: "PASS", observedValue: label, expectedValue: "true", reason: `${field} is enabled.` }
        : { status: "FAIL", observedValue: label, expectedValue: "true", reason: `${field} is disabled.` };
    }
    case "exact": {
      const exp = String(control.expected ?? "");
      const label = String(raw ?? "unknown");
      const expectedSet = exp.split("|");
      if (expectedSet.includes(label)) return { status: "PASS", observedValue: label, expectedValue: exp, reason: `Observed ${label} meets the requirement.` };
      return { status: "FAIL", observedValue: label, expectedValue: exp, reason: `Observed ${label} does not satisfy ${exp}.` };
    }
    case "port_exposed": {
      const bind = String(raw ?? "unknown");
      const exposed = /0\.0\.0\.0|::|\*|any/i.test(bind);
      if (exposed) return { status: "FAIL", observedValue: `bound to ${bind}`, expectedValue: "internal address", reason: `Database is bound to ${bind} — reachable beyond the data zone.` };
      return { status: "PASS", observedValue: `bound to ${bind}`, expectedValue: "internal address", reason: "Database listener is bound to an internal address." };
    }
    case "rule_scan": {
      const n = asNumber(raw) ?? 0;
      if (n === 0) return { status: "PASS", observedValue: "0 broad allow rules", expectedValue: "0 broad allow rules", reason: "Firewall policy is deny-by-default." };
      if (n <= 5) return { status: "WARNING", observedValue: `${n} broad allow rules`, expectedValue: "0 broad allow rules", reason: `${n} broad allow rules present — review for consolidation.` };
      return { status: "FAIL", observedValue: `${n} broad allow rules`, expectedValue: "0 broad allow rules", reason: `Excessive broad allow rules (${n}) present in the policy.` };
    }
    case "hash_match": {
      const obs = String(raw ?? "missing");
      const expected = String(stateValue(asset, "expectedChecksum") ?? "missing");
      if (expected === "missing" || obs === "missing") return { status: "WARNING", observedValue: obs, expectedValue: expected, reason: "Checksum comparison could not be completed (missing expected/observed)." };
      if (obs === expected) return { status: "PASS", observedValue: obs, expectedValue: expected, reason: "Configuration checksum matches the approved baseline." };
      return { status: "FAIL", observedValue: obs, expectedValue: expected, reason: `Checksum mismatch — observed ${obs} differs from baseline ${expected}.` };
    }
    case "range": {
      const obs = String(raw ?? "unknown");
      const latest = String(stateValue(asset, "latestStableVersion") ?? "");
      if (!latest) return { status: "WARNING", observedValue: obs, expectedValue: "supported version", reason: "Version support status unknown for this asset." };
      const gap = versionToRank(latest) - versionToRank(obs);
      if (gap <= 0) return { status: "PASS", observedValue: obs, expectedValue: `>= ${latest}`, reason: `Version ${obs} is current (latest ${latest}).` };
      if (gap <= 200) return { status: "WARNING", observedValue: obs, expectedValue: `>= ${latest}`, reason: `Version ${obs} is one patch level behind latest ${latest}.` };
      return { status: "FAIL", observedValue: obs, expectedValue: `>= ${latest}`, reason: `Version ${obs} is significantly behind supported version ${latest}.` };
    }
    default:
      return { status: "NOT_APPLICABLE", observedValue: String(raw ?? "unknown"), expectedValue: control.requirement, reason: `Unsupported evaluation kind ${control.evalKind}.` };
  }
}

export function severityAsScore(severity: Severity): number {
  switch (severity) {
    case "CRITICAL": return 90;
    case "HIGH": return 70;
    case "MEDIUM": return 50;
    case "LOW": return 30;
    default: return 15;
  }
}

export const ASSET_CONTROL_FRAMEWORK_LABELS: Record<AssetControlFramework, string> = {
  ISO27001: "ISO/IEC 27001",
  NIST: "NIST CSF / NIST SP 800-53",
  CIS: "CIS Controls",
  PCI_DSS: "PCI DSS",
  OWASP: "OWASP ASVS",
  PROTOTYPE: "NEXUS Prototype",
};

export function assetControlPriority(status: FindingStatus): string {
  switch (status) {
    case "FAIL": return "action required";
    case "WARNING": return "review recommended";
    default: return "monitored";
  }
}

export type Vulnerability = EvalOutcome;
