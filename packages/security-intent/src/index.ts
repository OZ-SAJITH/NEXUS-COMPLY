import type { SecurityIntentType, SecurityIntent } from "@nexus/shared-types";

export const INTENT_TYPE_LABELS: Record<SecurityIntentType, string> = {
  RESTRICT_ADMIN_ACCESS: "Restricted Administrative Access",
  DISABLE_INSECURE_PROTOCOL: "Disable Insecure Protocol",
  REQUIRE_LOGGING: "Require Logging",
  RESTRICT_SOURCE_NETWORK: "Restrict Source Network",
  DENY_UNAUTHORIZED_TRAFFIC: "Deny Unauthorized Traffic",
  REQUIRE_STRONG_AUTHENTICATION: "Require Strong Authentication",
  SECURE_MANAGEMENT_INTERFACE: "Secure Management Interface",
  DEFAULT_DENY: "Default Deny",
  NETWORK_SEGMENTATION: "Network Segmentation",
};

export const PROTOCOL_RISK: Record<string, number> = {
  telnet: 1.0,
  http: 0.9,
  snmp: 0.85,
  ftp: 0.8,
  tftp: 0.8,
  ssh: 0.2,
  https: 0.1,
};

export const INSECURE_PROTOCOLS = ["telnet", "http", "snmp", "ftp", "tftp"];

export function intentLabel(type: SecurityIntentType): string {
  return INTENT_TYPE_LABELS[type] ?? type;
}

export function isSourceRestricted(intent: SecurityIntent): boolean {
  if (!intent.source) return false;
  if (intent.source.type === "NETWORK") {
    const v = intent.source.value.toLowerCase();
    if (v.includes("any") || v.includes("0.0.0.0/0") || v.includes("::/0")) return false;
    return true;
  }
  if (intent.source.type === "ANY") return false;
  return true;
}

export function isLoggingEnabled(intent: SecurityIntent): boolean {
  return intent.loggingRequired === true;
}

export function protocolIsInsecure(intent: SecurityIntent): boolean {
  if (!intent.protocol) return false;
  return INSECURE_PROTOCOLS.includes(intent.protocol.toLowerCase());
}

export function isEnabled(intent: SecurityIntent): boolean {
  return intent.enabled === true;
}
