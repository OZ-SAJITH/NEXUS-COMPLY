import type {
  AssetComplianceControl,
  AssetControlFramework,
  AssetRecord,
  FindingStatus,
  Severity,
} from "@nexus/shared-types";

// ---------------------------------------------------------------------------
// Asset-aware compliance controls (deterministic).
//
// These are representative security-control definitions for a prototype. They
// intentionally use generic security-control language rather than quoting
// exact legal/regulatory text. Each control is evaluated against normalized
// evidence (observedState) and is scoped by asset type (appliesTo).
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
  if (parts) return Number(parts[1]) * 10000 + Number(parts[2] ?? 0) * 100 + Number(parts[3] ?? 0);
  const simple = version.match(/^(\d+)/);
  return simple ? Number(simple[1]) * 10000 : 0;
}

function tlsRank(version: string): number {
  const m = version.match(/^(\d+)\.(\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 10 + Number(m[2]);
}

export const ASSET_CONTROLS: AssetComplianceControl[] = [
  {
    id: "TLS-001",
    name: "Minimum TLS Version",
    description: "Communications must use TLS 1.2 or higher.",
    requirement: "Minimum supported TLS version >= 1.2.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
    severity: "CRITICAL",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY", "MESSAGE_QUEUE"],
    evidenceSource: "TLS handshake / service configuration evidence",
    evalKind: "min_version",
    evalField: "tlsMinVersion",
    expected: "TLS 1.2",
    failureMessage: "TLS 1.0 or TLS 1.1 is enabled on this asset.",
    remediation: "Disable TLS 1.0/1.1 and enforce a minimum TLS version of 1.2.",
    remediationActions: ["SET_TLS_MIN_VERSION"],
  },
  {
    id: "PKI-002",
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
    id: "PROTO-003",
    name: "Insecure Protocol Disabled",
    description: "Insecure protocols (telnet, FTP, unencrypted HTTP) must be disabled.",
    requirement: "No insecure protocol is enabled on the service.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
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
    id: "CRYPTO-004",
    name: "Strong Cryptographic Configuration",
    description: "Cryptographic configuration must not rely on weak ciphers.",
    requirement: "Cipher suite and key configuration are rated strong.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY", "MESSAGE_QUEUE"],
    evidenceSource: "Cipher suite / cryptographic policy evidence",
    evalKind: "exact",
    evalField: "cipherStrength",
    expected: "strong",
    failureMessage: "Weak cipher configuration is in use.",
    remediation: "Enforce strong cipher suites and disable legacy key exchange algorithms.",
    remediationActions: ["ENFORCE_STRONG_CIPHERS"],
  },
  {
    id: "DBENC-005",
    name: "Database Encryption at Rest",
    description: "Database storage must be encrypted at rest.",
    requirement: "Storage-level encryption is enabled.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["DATABASE"],
    evidenceSource: "Database security metadata evidence",
    evalKind: "enabled",
    evalField: "dbEncryption",
    expected: "true",
    failureMessage: "Database encryption at rest is disabled.",
    remediation: "Enable transparent data encryption / storage encryption for the database.",
    remediationActions: ["ENABLE_DB_ENCRYPTION"],
  },
  {
    id: "DBEX-006",
    name: "Database Exposure",
    description: "Databases must not be reachable from unrestricted networks.",
    requirement: "Database is bound to an internal address, not 0.0.0.0/internet.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "PROTOTYPE"],
    severity: "CRITICAL",
    appliesTo: ["DATABASE"],
    evidenceSource: "Port-binding / connection metadata evidence",
    evalKind: "port_exposed",
    evalField: "dbBindAddress",
    expected: "internal network address",
    failureMessage: "Database is bound to an unrestricted/exposed address.",
    remediation: "Rebind the database listener to an internal address behind the DB firewall zone.",
    remediationActions: ["RESTRICT_DB_BIND"],
  },
  {
    id: "FW-007",
    name: "Excessive Firewall Access",
    description: "Firewall policy must not contain excessive ANY/ANY rules.",
    requirement: "No broad allow rules (ANY→ANY); policy is deny-by-default.",
    frameworks: ["ISO27001", "NIST", "CIS", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["FIREWALL", "NETWORK_DEVICE", "PROXY"],
    evidenceSource: "Firewall policy/rule evidence",
    evalKind: "rule_scan",
    evalField: "firewallAnyRules",
    expected: "0 broad allow rules",
    failureMessage: "Firewall policy contains excessive broad allow rules.",
    remediation: "Consolidate and narrow overly-permissive firewall rules to least-privilege.",
    remediationActions: ["CONSOLIDATE_FIREWALL_RULE"],
  },
  {
    id: "AUTH-008",
    name: "Strong Authentication",
    description: "Administrative/privileged access must use strong authentication (e.g. MFA).",
    requirement: "Authentication strength is rated strong/MFA for administrative access.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["FIREWALL", "ROUTER", "SWITCH", "SERVER", "DATABASE", "API", "APPLICATION", "NETWORK_DEVICE", "PROXY", "MESSAGE_QUEUE"],
    evidenceSource: "Authentication configuration evidence",
    evalKind: "exact",
    evalField: "authStrength",
    expected: "strong|mfa",
    failureMessage: "Weak or no multi-factor authentication is enforced.",
    remediation: "Require strong (ideally MFA) authentication for all privileged access paths.",
    remediationActions: ["ENFORCE_STRONG_AUTH"],
  },
  {
    id: "INTEG-009",
    name: "Integrity Validation",
    description: "Systems must validate the integrity of deployed artifacts.",
    requirement: "Integrity validation (signatures/checksums) is enabled for deployable artifacts.",
    frameworks: ["ISO27001", "NIST", "CIS", "OWASP", "PROTOTYPE"],
    severity: "MEDIUM",
    appliesTo: ["APPLICATION", "API", "SERVER", "VIRTUAL_MACHINE", "MESSAGE_QUEUE"],
    evidenceSource: "Deployment/artifact metadata evidence",
    evalKind: "enabled",
    evalField: "integrityValidation",
    expected: "true",
    failureMessage: "Integrity validation is not enabled for deployed artifacts.",
    remediation: "Enable signature/checksum validation in the deployment pipeline.",
    remediationActions: ["ENABLE_INTEGRITY_VALIDATION"],
  },
  {
    id: "XMLSIG-010",
    name: "XML Signature Validation",
    description: "Services consuming XML must validate XML signatures.",
    requirement: "XML signature validation enabled on XML-consuming endpoints.",
    frameworks: ["OWASP", "PCI_DSS", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["API", "APPLICATION"],
    evidenceSource: "API/XML processor configuration evidence",
    evalKind: "enabled",
    evalField: "xmlSignatureValidation",
    expected: "true",
    failureMessage: "XML signatures are not validated on XML-consuming endpoints.",
    remediation: "Enable XML signature validation and reject unsigned/unverified XML.",
    remediationActions: ["ENABLE_XML_SIGNATURE_VALIDATION"],
  },
  {
    id: "API-011",
    name: "Secure API Configuration",
    description: "APIs must enforce authentication and rate limiting.",
    requirement: "API authentication and rate limiting are enforced.",
    frameworks: ["OWASP", "CIS", "PCI_DSS", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["API"],
    evidenceSource: "API gateway configuration evidence",
    evalKind: "enabled",
    evalField: "apiAuthEnabled",
    expected: "true",
    failureMessage: "API endpoints are exposed without authentication/rate limiting.",
    remediation: "Enforce authentication and rate limiting on all API endpoints.",
    remediationActions: ["SECURE_API_CONFIG"],
  },
  {
    id: "DATA-012",
    name: "Sensitive Data Exposure",
    description: "Secrets and sensitive data must not be stored in plaintext.",
    requirement: "No plaintext secrets/tokens stored in configuration or storage.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"],
    severity: "CRITICAL",
    appliesTo: ["APPLICATION", "API", "SERVER", "DATABASE", "CLOUD_RESOURCE", "MESSAGE_QUEUE", "VIRTUAL_MACHINE"],
    evidenceSource: "Secrets-analysis / data-classification evidence",
    evalKind: "disabled",
    evalField: "plaintextSecrets",
    expected: "false",
    failureMessage: "Plaintext secrets or sensitive data were detected.",
    remediation: "Rotate detected secrets and migrate to a managed vault.",
    remediationActions: ["ROTATE_AND_SCREEN_SECRETS"],
  },
  {
    id: "PRIV-013",
    name: "Privileged Access Restriction",
    description: "Privileged access must be scoped and least-privileged.",
    requirement: "No broad/any-source privileged access is configured.",
    frameworks: ["ISO27001", "NIST", "CIS", "PCI_DSS", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["FIREWALL", "ROUTER", "SWITCH", "SERVER", "DATABASE", "NETWORK_DEVICE", "PROXY", "APPLICATION"],
    evidenceSource: "Access-control configuration evidence",
    evalKind: "disabled",
    evalField: "privilegedBroadAccess",
    expected: "false",
    failureMessage: "Privileged access is granted too broadly.",
    remediation: "Restrict privileged access to named/least-privilege roles.",
    remediationActions: ["RESTRICT_PRIVILEGED_ACCESS"],
  },
  {
    id: "OUTDATE-014",
    name: "Outdated Service / Configuration",
    description: "Deployed services must not fall dangerously behind supported versions.",
    requirement: "Service version is supported and within the maintenance window.",
    frameworks: ["ISO27001", "NIST", "CIS", "PROTOTYPE"],
    severity: "MEDIUM",
    appliesTo: ["SERVER", "VIRTUAL_MACHINE", "APPLICATION", "API", "ROUTER", "SWITCH", "LOAD_BALANCER", "PROXY"],
    evidenceSource: "Package/version metadata evidence",
    evalKind: "range",
    evalField: "serviceVersion",
    expected: "supported version",
    failureMessage: "A deployed service is running an outdated/unsupported version.",
    remediation: "Upgrade the service to a current supported version.",
    remediationActions: ["UPGRADE_SERVICE_VERSION"],
  },
  {
    id: "CHECKSUM-015",
    name: "Checksum / Integrity Mismatch",
    description: "Configuration baselines must match the approved checksum.",
    requirement: "Observed configuration checksum matches the approved baseline.",
    frameworks: ["ISO27001", "NIST", "CIS", "PROTOTYPE"],
    severity: "HIGH",
    appliesTo: ["SERVER", "VIRTUAL_MACHINE", "APPLICATION", "API", "CLOUD_RESOURCE", "NETWORK_DEVICE"],
    evidenceSource: "Baseline/checksum comparison evidence",
    evalKind: "hash_match",
    evalField: "configChecksum",
    expected: "matches baseline",
    failureMessage: "Configuration differs from the approved baseline (checksum mismatch).",
    remediation: "Restore the approved baseline configuration and verify the checksum.",
    remediationActions: ["RESTORE_BASELINE_HASH"],
  },
  {
    id: "MQ-016",
    name: "Message Queue Authentication",
    description: "Message queues must require authentication.",
    requirement: "Authentication is enforced on the message broker.",
    frameworks: ["ISO27001", "NIST", "CIS", "PROTOTYPE"],
    severity: "CRITICAL",
    appliesTo: ["MESSAGE_QUEUE"],
    evidenceSource: "Broker security metadata evidence",
    evalKind: "enabled",
    evalField: "mqAuthRequired",
    expected: "true",
    failureMessage: "Message queue accepts unauthenticated connections.",
    remediation: "Enable broker authentication and revoke anonymous access.",
    remediationActions: ["SECURE_MESSAGE_QUEUE"],
  },
];

export function getAssetControls(): AssetComplianceControl[] {
  return ASSET_CONTROLS;
}

export function getAssetControlById(id: string): AssetComplianceControl | undefined {
  return ASSET_CONTROLS.find((c) => c.id === id);
}

/**
 * Deterministic evaluation of a control against a simulated asset state.
 * Returns PASS / FAIL / WARNING / NOT_APPLICABLE plus observed+expected values.
 */
export function evaluateAssetControl(control: AssetComplianceControl, asset: AssetRecord): EvalOutcome {
  if (!control.appliesTo.includes(asset.assetType)) {
    return { status: "NOT_APPLICABLE", observedValue: "asset type not in scope", expectedValue: control.requirement, reason: `Control ${control.id} does not apply to asset type ${asset.assetType}.` };
  }

  const field = control.evalField;
  const raw = stateValue(asset, field);

  switch (control.evalKind) {
    case "min_version": {
      const obs = String(raw ?? "unknown");
      const obsRank = tlsRank(obs);
      const expRank = tlsRank("1.2");
      if (obsRank < expRank) {
        return { status: "FAIL", observedValue: `TLS ${obs}`, expectedValue: "TLS 1.2 or higher", reason: `Observed minimum TLS ${obs} is lower than the required TLS 1.2.` };
      }
      if (obsRank === expRank) return { status: "PASS", observedValue: `TLS ${obs}`, expectedValue: "TLS 1.2 or higher", reason: `Observed minimum TLS ${obs} meets the requirement.` };
      return { status: "PASS", observedValue: `TLS ${obs}`, expectedValue: "TLS 1.2 or higher", reason: `Observed minimum TLS ${obs} exceeds the requirement.` };
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

// Re-exported for consumers that want the outcome type under a friendlier name.
export type Vulnerability = EvalOutcome;