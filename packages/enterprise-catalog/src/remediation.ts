import type {
  AssetRecord,
  AssetType,
  EvidenceRecord,
  EvidenceVerification,
  RemediationActionProposal,
  RemediationActionType,
  RemediationStatus,
} from "@nexus/shared-types";
import { canonicalEvidencePayload, sha256Hex } from "./integrity";

// ---------------------------------------------------------------------------
// Remediation action catalogue.
//
// Structured, parameterised remediation actions — the execution layer applies
// ONLY these controlled actions against the SIMULATED enterprise environment.
// A production connector would map each action to its own SDK/API call; the
// orchestration contract (validate → approve → execute → verify → rollback)
// stays identical.
// ---------------------------------------------------------------------------

export interface RemediationActionDef {
  actionType: RemediationActionType;
  displayName: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  rollbackAvailable: boolean;
  appliesTo: AssetType[];
  describe(params: Record<string, unknown>): string;
  proposal: Record<string, unknown>;
}

export const REMEDIATION_ACTIONS: Record<RemediationActionType, RemediationActionDef> = {
  SET_TLS_MIN_VERSION: {
    actionType: "SET_TLS_MIN_VERSION",
    displayName: "Disable TLS 1.0/1.1 and enforce TLS 1.2+",
    impact: "LOW",
    rollbackAvailable: true,
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY", "MESSAGE_QUEUE"],
    proposal: { version: "1.2" },
    describe: (p) => `Set minimum TLS version to ${String(p.version ?? "1.2")}; disable TLS 1.0/1.1 cipher suites.`,
  },
  REVOKE_AND_RENEW_CERTIFICATE: {
    actionType: "REVOKE_AND_RENEW_CERTIFICATE",
    displayName: "Renew and re-issue certificate",
    impact: "MEDIUM",
    rollbackAvailable: true,
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "CERTIFICATE", "PROXY"],
    proposal: {},
    describe: () => "Stage certificate renewal, roll out the new leaf, and rotate trust chain references.",
  },
  DISABLE_INSECURE_PROTOCOL: {
    actionType: "DISABLE_INSECURE_PROTOCOL",
    displayName: "Disable insecure protocols",
    impact: "MEDIUM",
    rollbackAvailable: true,
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "NETWORK_DEVICE", "ROUTER", "SWITCH"],
    proposal: {},
    describe: () => "Disable telnet / FTP / plaintext HTTP listeners and enforce encrypted protocols.",
  },
  ENFORCE_STRONG_CIPHERS: {
    actionType: "ENFORCE_STRONG_CIPHERS",
    displayName: "Enforce strong cipher suites",
    impact: "LOW",
    rollbackAvailable: true,
    appliesTo: ["API", "APPLICATION", "LOAD_BALANCER", "SERVER", "PROXY", "MESSAGE_QUEUE"],
    proposal: { profile: "strong" },
    describe: () => "Apply strong cipher configuration and remove legacy key exchange / weak ciphers.",
  },
  ENABLE_DB_ENCRYPTION: {
    actionType: "ENABLE_DB_ENCRYPTION",
    displayName: "Enable database encryption at rest",
    impact: "HIGH",
    rollbackAvailable: true,
    appliesTo: ["DATABASE", "CLOUD_RESOURCE"],
    proposal: { mode: "transparent_data_encryption" },
    describe: () => "Enable transparent data encryption; re-key schedule 90 days.",
  },
  RESTRICT_DB_BIND: {
    actionType: "RESTRICT_DB_BIND",
    displayName: "Restrict database listener binding",
    impact: "MEDIUM",
    rollbackAvailable: true,
    appliesTo: ["DATABASE"],
    proposal: { bindAddress: "internal" },
    describe: (p) => `Rebind database listener away from 0.0.0.0 to the internal zone address (${String(p.bindAddress ?? "internal")}).`,
  },
  CONSOLIDATE_FIREWALL_RULE: {
    actionType: "CONSOLIDATE_FIREWALL_RULE",
    displayName: "Consolidate excessive firewall access",
    impact: "MEDIUM",
    rollbackAvailable: true,
    appliesTo: ["FIREWALL", "NETWORK_DEVICE", "PROXY"],
    proposal: {},
    describe: () => "Decompose broad ANY/ANY allow rules into least-privilege rules (source/dest/port enumerated).",
  },
  ENFORCE_STRONG_AUTH: {
    actionType: "ENFORCE_STRONG_AUTH",
    displayName: "Enforce strong / MFA authentication",
    impact: "LOW",
    rollbackAvailable: true,
    appliesTo: ["FIREWALL", "ROUTER", "SWITCH", "SERVER", "DATABASE", "API", "APPLICATION", "NETWORK_DEVICE", "PROXY", "MESSAGE_QUEUE"],
    proposal: { mfa: true },
    describe: () => "Require MFA for administrative and privileged access paths.",
  },
  ENABLE_INTEGRITY_VALIDATION: {
    actionType: "ENABLE_INTEGRITY_VALIDATION",
    displayName: "Enable integrity validation",
    impact: "LOW",
    rollbackAvailable: true,
    appliesTo: ["APPLICATION", "API", "SERVER", "VIRTUAL_MACHINE", "MESSAGE_QUEUE", "CLOUD_RESOURCE"],
    proposal: {},
    describe: () => "Enable signature/checksum validation on all deployed artifacts.",
  },
  ENABLE_XML_SIGNATURE_VALIDATION: {
    actionType: "ENABLE_XML_SIGNATURE_VALIDATION",
    displayName: "Enable XML signature validation",
    impact: "LOW",
    rollbackAvailable: true,
    appliesTo: ["API", "APPLICATION"],
    proposal: {},
    describe: () => "Enable XML signature validation on XML-consuming endpoints; reject unsigned XML.",
  },
  SECURE_API_CONFIG: {
    actionType: "SECURE_API_CONFIG",
    displayName: "Enforce API authentication and rate limits",
    impact: "LOW",
    rollbackAvailable: true,
    appliesTo: ["API"],
    proposal: { auth: "oauth2", rateLimit: "1000/min" },
    describe: () => "Enforce OAuth2 authentication and rate limiting on all API endpoints.",
  },
  ROTATE_AND_SCREEN_SECRETS: {
    actionType: "ROTATE_AND_SCREEN_SECRETS",
    displayName: "Rotate and screen plaintext secrets",
    impact: "HIGH",
    rollbackAvailable: true,
    appliesTo: ["APPLICATION", "API", "SERVER", "DATABASE", "CLOUD_RESOURCE", "MESSAGE_QUEUE", "VIRTUAL_MACHINE"],
    proposal: {},
    describe: () => "Rotate detected secrets immediately and migrate storage to a managed vault; re-scan for plaintext.",
  },
  RESTRICT_PRIVILEGED_ACCESS: {
    actionType: "RESTRICT_PRIVILEGED_ACCESS",
    displayName: "Restrict privileged access",
    impact: "LOW",
    rollbackAvailable: true,
    appliesTo: ["FIREWALL", "ROUTER", "SWITCH", "SERVER", "DATABASE", "NETWORK_DEVICE", "PROXY", "APPLICATION"],
    proposal: {},
    describe: () => "Scope privileged access to named least-privilege roles; remove broad access grants.",
  },
  UPGRADE_SERVICE_VERSION: {
    actionType: "UPGRADE_SERVICE_VERSION",
    displayName: "Upgrade service version",
    impact: "HIGH",
    rollbackAvailable: true,
    appliesTo: ["SERVER", "VIRTUAL_MACHINE", "APPLICATION", "API", "ROUTER", "SWITCH", "LOAD_BALANCER", "PROXY"],
    proposal: { target: "latest" },
    describe: (p) => `Upgrade service to a supported version (target ${String(p.target ?? "latest stable")}).`,
  },
  RESTORE_BASELINE_HASH: {
    actionType: "RESTORE_BASELINE_HASH",
    displayName: "Restore approved baseline configuration",
    impact: "MEDIUM",
    rollbackAvailable: true,
    appliesTo: ["SERVER", "VIRTUAL_MACHINE", "APPLICATION", "API", "CLOUD_RESOURCE", "NETWORK_DEVICE"],
    proposal: {},
    describe: () => "Restore approved baseline configuration and confirm checksum match.",
  },
  SECURE_MESSAGE_QUEUE: {
    actionType: "SECURE_MESSAGE_QUEUE",
    displayName: "Enable message queue authentication",
    impact: "MEDIUM",
    rollbackAvailable: true,
    appliesTo: ["MESSAGE_QUEUE"],
    proposal: {},
    describe: () => "Enable broker authentication, SSL, and revoke anonymous access.",
  },
};

export function actionDefFor(actionType: RemediationActionType): RemediationActionDef {
  return REMEDIATION_ACTIONS[actionType];
}

export function isActionAllowedForAsset(actionType: RemediationActionType, assetType: AssetType): boolean {
  return REMEDIATION_ACTIONS[actionType].appliesTo.includes(assetType);
}

export function defaultActionForControl(controlId: string): RemediationActionType | undefined {
  const map: Record<string, RemediationActionType> = {
    "TLS-001": "SET_TLS_MIN_VERSION",
    "CERT-001": "REVOKE_AND_RENEW_CERTIFICATE",
    "CERT-002": "REVOKE_AND_RENEW_CERTIFICATE",
    "NET-001": "DISABLE_INSECURE_PROTOCOL",
    "TLS-002": "DISABLE_INSECURE_PROTOCOL",
    "CRYPTO-001": "ENFORCE_STRONG_CIPHERS",
    "DB-001": "ENABLE_DB_ENCRYPTION",
    "DB-002": "RESTRICT_DB_BIND",
    "FW-001": "CONSOLIDATE_FIREWALL_RULE",
    "FW-002": "CONSOLIDATE_FIREWALL_RULE",
    "ACL-001": "CONSOLIDATE_FIREWALL_RULE",
    "AUTH-001": "ENFORCE_STRONG_AUTH",
    "INTEGRITY-001": "ENABLE_INTEGRITY_VALIDATION",
    "XMLSIG-010": "ENABLE_XML_SIGNATURE_VALIDATION",
    "API-001": "SECURE_API_CONFIG",
    "API-002": "SECURE_API_CONFIG",
    "DATA-012": "ROTATE_AND_SCREEN_SECRETS",
    "ACCESS-001": "RESTRICT_PRIVILEGED_ACCESS",
    "OUTDATE-014": "UPGRADE_SERVICE_VERSION",
    "CONFIG-001": "RESTORE_BASELINE_HASH",
    "MQ-016": "SECURE_MESSAGE_QUEUE",
  };
  return map[controlId];
}

export function buildProposal(controlId: string, assetType: AssetType, reason: string): RemediationActionProposal {
  const actionType = defaultActionForControl(controlId) ?? "SECURE_API_CONFIG";
  const def = REMEDIATION_ACTIONS[actionType];
  const allowed = def.appliesTo.includes(assetType);
  const effective = allowed ? actionType : ("SECURE_API_CONFIG" as RemediationActionType);
  const eff = REMEDIATION_ACTIONS[effective];
  return {
    actionType: effective,
    displayName: eff.displayName,
    parameters: { ...eff.proposal },
    reason: reason || "Remediation generated from the compliance finding.",
    expectedResult: eff.describe(eff.proposal),
    impact: eff.impact,
    rollbackAvailable: eff.rollbackAvailable,
  };
}

// ---- state transition helpers (drives orchestrator status machine) ----

export const REMEDIATION_STATUS_FLOW: Record<RemediationStatus, RemediationStatus[]> = {
  PLANNED: ["VALIDATED", "VALIDATION_FAILED", "PENDING_APPROVAL"],
  VALIDATED: ["PENDING_APPROVAL"],
  VALIDATION_FAILED: ["VALIDATED", "PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["EXECUTING", "REJECTED"],
  REJECTED: [],
  EXECUTING: ["COMPLETED", "FAILED", "VERIFYING"],
  COMPLETED: ["VERIFYING"],
  FAILED: ["VERIFYING", "ROLLING_BACK"],
  VERIFYING: ["VERIFIED", "ROLLING_BACK", "FAILED"],
  VERIFIED: [],
  ROLLING_BACK: ["ROLLED_BACK", "FAILED"],
  ROLLED_BACK: [],
};

export function canTransition(from: RemediationStatus, to: RemediationStatus): boolean {
  const next = REMEDIATION_STATUS_FLOW[from] ?? [];
  if (next.includes(to)) return true;
  // Execution implies verification afterwards; VERIFIED is the terminal "done".
  if (from === "EXECUTING" && to === "VERIFYING") return true;
  return false;
}

export interface ApplyResult {
  state: Record<string, unknown>;
  message: string;
}

export function applyRemediationAction(asset: AssetRecord, action: RemediationActionType, parameters: Record<string, unknown>): ApplyResult {
  const next: Record<string, unknown> = { ...(asset.observedState ?? {}) };
  const p = parameters ?? {};
  switch (action) {
    case "SET_TLS_MIN_VERSION": {
      next.tlsMinVersion = String(p.version ?? "1.2");
      return { state: next, message: `TLS minimum version set to ${next.tlsMinVersion}.` };
    }
    case "REVOKE_AND_RENEW_CERTIFICATE": {
      const future = new Date(Date.now() + 330 * 24 * 3600 * 1000).toISOString();
      next.certExpiry = future;
      next.certDaysToExpiry = 330;
      return { state: next, message: "Certificate renewed; new expiry scheduled 330 days out." };
    }
    case "DISABLE_INSECURE_PROTOCOL": {
      next.insecureProtocols = [];
      next.legacyProtocols = [];
      return { state: next, message: "Insecure and legacy protocols disabled." };
    }
    case "ENFORCE_STRONG_CIPHERS": {
      next.cipherStrength = "strong";
      return { state: next, message: "Strong cipher profile enforced." };
    }
    case "ENABLE_DB_ENCRYPTION": {
      next.dbEncryption = true;
      return { state: next, message: "Database encryption at rest enabled (TDE)." };
    }
    case "RESTRICT_DB_BIND": {
      next.dbBindAddress = asset.ipAddress || "internal";
      return { state: next, message: `Database listener rebound to internal address ${next.dbBindAddress}.` };
    }
    case "CONSOLIDATE_FIREWALL_RULE": {
      next.firewallAnyRules = 0;
      next.mgmtAccessibleFrom = "internal";
      next.aclDefaultPolicy = "deny-by-default";
      return { state: next, message: "Excessive firewall rules consolidated; mgmt exposure closed; ACL default deny enforced." };
    }
    case "ENFORCE_STRONG_AUTH": {
      next.authStrength = "mfa";
      next.privilegedBroadAccess = false;
      return { state: next, message: "MFA enforced for privileged access; broad grants removed." };
    }
    case "ENABLE_INTEGRITY_VALIDATION": {
      next.integrityValidation = true;
      return { state: next, message: "Integrity validation enabled for deployed artifacts." };
    }
    case "ENABLE_XML_SIGNATURE_VALIDATION": {
      next.xmlSignatureValidation = true;
      return { state: next, message: "XML signature validation enabled." };
    }
    case "SECURE_API_CONFIG": {
      next.apiAuthEnabled = true;
      next.apiRateLimit = true;
      return { state: next, message: "API authentication and rate limiting enforced." };
    }
    case "ROTATE_AND_SCREEN_SECRETS": {
      next.plaintextSecrets = false;
      return { state: next, message: "Secrets rotated and plaintext exposure cleared." };
    }
    case "RESTRICT_PRIVILEGED_ACCESS": {
      next.privilegedBroadAccess = false;
      return { state: next, message: "Privileged access restricted to least-privilege." };
    }
    case "UPGRADE_SERVICE_VERSION": {
      const latest = (asset.observedState ?? {})["latestStableVersion"] ?? p.target ?? "current";
      next.serviceVersion = String(latest);
      return { state: next, message: `Service upgraded to supported version ${next.serviceVersion}.` };
    }
    case "RESTORE_BASELINE_HASH": {
      const expected = (asset.observedState ?? {})["expectedChecksum"];
      next.configChecksum = String(expected ?? "baseline");
      return { state: next, message: "Approved baseline configuration restored (checksum matched)." };
    }
    case "SECURE_MESSAGE_QUEUE": {
      next.mqAuthRequired = true;
      return { state: next, message: "Broker authentication enabled; anonymous access revoked." };
    }
    default:
      return { state: next, message: `Action ${action} applied to simulated state.` };
  }
}

/**
 * SHA-256 hash of the canonical evidence payload. The hash is actually
 * computed (FIPS 180-4) and reproduced from the persisted record alone, so the
 * UI can verify integrity by re-hashing rather than trusting a stored flag.
 */
export function evidenceIntegrityHash(input: { assetId: string; controlId: string; observedValue: string; timestamp: string }): string {
  return sha256Hex(canonicalEvidencePayload(input));
}

/**
 * Re-computes the SHA-256 over a persisted evidence record and reports whether
 * the stored hash is genuine. `verified` is never fabricated — it is the
 * outcome of re-hashing the canonical payload reconstructed from the record.
 */
export function verifyEvidenceRecord(record: Pick<EvidenceRecord, "assetId" | "controlId" | "observedValue" | "timestamp" | "integrityHash">): EvidenceVerification {
  const canonical = canonicalEvidencePayload({ assetId: record.assetId, controlId: record.controlId, observedValue: record.observedValue, timestamp: record.timestamp });
  return {
    hash: record.integrityHash,
    verified: record.integrityHash === sha256Hex(canonical),
    canonical,
    verifiedAt: new Date().toISOString(),
  };
}