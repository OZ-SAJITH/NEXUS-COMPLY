import type {
  AssetType,
  ConnectorRecord,
  ConnectorStatus,
  ConnectorType,
  RemediationActionType,
} from "@nexus/shared-types";

// ---------------------------------------------------------------------------
// Universal connector architecture — the platform never talks to production
// systems directly. Every interaction is mediated through a connector adapter.
// The prototype connectors operate against the controlled SIMULATED environment
// but implement the exact interface an authorized production connector would.
// ---------------------------------------------------------------------------

export interface ConnectorCapabilities {
  connect(): Promise<{ ok: boolean; error?: string }>;
  testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
  collectEvidence(): Promise<string[]>;
  executeRemediation(action: RemediationActionType, parameters: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;
  verify(): Promise<{ ok: boolean }>;
  rollback(): Promise<{ ok: boolean }>;
}

// ---------------------------------------------------------------------------
// PHASE 2 — multi-vendor connector registry.
//
// Each adapter declares how it reaches the managed system (transport + wire
// protocol) and — importantly — what it can actually inspect. A connector must
// never claim capabilities it does not implement. The vendor id set covers the
// mandated PHASE 2 vendors plus the adapters the existing estate already
// carries (Arista, Juniper, Oracle, MongoDB, Kong, Kafka, Microsoft, Apache),
// so every seed has a real adapter configuration rather than a placeholder.
// ---------------------------------------------------------------------------

export type ConnectorTransportType = "SSH" | "HTTPS_API" | "SNMP" | "DATABASE" | "CLOUD_API" | "AGENT" | "SIMULATED";

export type ConnectorCapabilityId =
  | "CONFIGURATION"
  | "INTERFACES"
  | "ACL"
  | "FIREWALL_RULES"
  | "NAT"
  | "SNAT"
  | "DNAT"
  | "TLS"
  | "CERTIFICATES"
  | "ROUTING"
  | "PROTOCOLS"
  | "MANAGEMENT_ACCESS"
  | "LOGGING"
  | "ENCRYPTION"
  | "OPEN_PORTS"
  | "OS_INFO"
  | "SERVICES"
  | "USERS"
  | "PRIVILEGES"
  | "AUTHENTICATION"
  | "SECURITY_HEADERS"
  | "ENDPOINTS"
  | "KEY_SIZE"
  | "SIGNATURE_ALGORITHM"
  | "EXPIRATION"
  | "ACCESS_CONTROLS";

export type ConnectorVendorId =
  | "CISCO"
  | "FORTINET"
  | "PALO_ALTO"
  | "LINUX"
  | "WINDOWS_SERVER"
  | "NGINX"
  | "POSTGRESQL"
  | "RABBITMQ"
  | "API_GATEWAY"
  | "AWS"
  | "AZURE"
  | "GENERIC_NETWORK_DEVICE"
  | "ARISTA"
  | "JUNIPER"
  | "ORACLE"
  | "MONGODB"
  | "KONG"
  | "KAFKA"
  | "MICROSOFT"
  | "AMAZON"
  | "GENERIC";

export interface ConnectorProfile {
  vendorId: ConnectorVendorId;
  transportType: ConnectorTransportType;
  protocol: string;
  capabilities: ConnectorCapabilityId[];
}

export const CONNECTOR_PROFILES: Record<string, ConnectorProfile> = {
  "conn-net-01": { vendorId: "CISCO", transportType: "SNMP", protocol: "SNMP", capabilities: ["INTERFACES", "ROUTING", "ACL", "PROTOCOLS", "CONFIGURATION", "TLS", "CERTIFICATES"] },
  "conn-net-02": { vendorId: "PALO_ALTO", transportType: "HTTPS_API", protocol: "HTTPS", capabilities: ["FIREWALL_RULES", "ACL", "NAT", "SNAT", "DNAT", "TLS", "CERTIFICATES", "LOGGING", "CONFIGURATION"] },
  "conn-net-03": { vendorId: "FORTINET", transportType: "HTTPS_API", protocol: "HTTPS", capabilities: ["FIREWALL_RULES", "ACL", "NAT", "SNAT", "DNAT", "TLS", "CERTIFICATES", "LOGGING", "CONFIGURATION"] },
  "conn-net-04": { vendorId: "ARISTA", transportType: "SNMP", protocol: "SNMP", capabilities: ["INTERFACES", "ROUTING", "ACL", "CONFIGURATION"] },
  "conn-net-05": { vendorId: "JUNIPER", transportType: "SNMP", protocol: "SNMP", capabilities: ["INTERFACES", "ROUTING", "ACL", "NAT", "CONFIGURATION"] },
  "conn-srv-01": { vendorId: "LINUX", transportType: "SSH", protocol: "SSH", capabilities: ["OS_INFO", "SERVICES", "OPEN_PORTS", "AUTHENTICATION", "ENCRYPTION", "LOGGING", "CONFIGURATION"] },
  "conn-srv-02": { vendorId: "WINDOWS_SERVER", transportType: "AGENT", protocol: "WINRM", capabilities: ["OS_INFO", "SERVICES", "OPEN_PORTS", "AUTHENTICATION", "ENCRYPTION", "CONFIGURATION"] },
  "conn-db-01": { vendorId: "POSTGRESQL", transportType: "DATABASE", protocol: "postgresql", capabilities: ["USERS", "PRIVILEGES", "ENCRYPTION", "TLS", "AUTHENTICATION", "CONFIGURATION"] },
  "conn-db-02": { vendorId: "ORACLE", transportType: "DATABASE", protocol: "oracle", capabilities: ["USERS", "PRIVILEGES", "ENCRYPTION", "TLS", "AUTHENTICATION", "CONFIGURATION"] },
  "conn-db-03": { vendorId: "MONGODB", transportType: "DATABASE", protocol: "mongodb", capabilities: ["USERS", "PRIVILEGES", "ENCRYPTION", "TLS", "AUTHENTICATION", "CONFIGURATION"] },
  "conn-app-01": { vendorId: "KONG", transportType: "HTTPS_API", protocol: "HTTPS", capabilities: ["TLS", "CERTIFICATES", "AUTHENTICATION", "SECURITY_HEADERS", "ENDPOINTS", "LOGGING", "CONFIGURATION"] },
  "conn-app-02": { vendorId: "GENERIC", transportType: "HTTPS_API", protocol: "HTTPS", capabilities: ["TLS", "AUTHENTICATION", "SECURITY_HEADERS", "ENDPOINTS", "CONFIGURATION"] },
  "conn-mq-01": { vendorId: "RABBITMQ", transportType: "HTTPS_API", protocol: "AMQP", capabilities: ["AUTHENTICATION", "ENCRYPTION", "TLS", "OPEN_PORTS", "ACCESS_CONTROLS", "CONFIGURATION"] },
  "conn-mq-02": { vendorId: "KAFKA", transportType: "HTTPS_API", protocol: "Kafka", capabilities: ["AUTHENTICATION", "ENCRYPTION", "TLS", "OPEN_PORTS", "ACCESS_CONTROLS", "CONFIGURATION"] },
  "conn-cloud-01": { vendorId: "AWS", transportType: "CLOUD_API", protocol: "AWS API", capabilities: ["ENCRYPTION", "AUTHENTICATION", "ACCESS_CONTROLS", "CONFIGURATION", "LOGGING"] },
  "conn-cloud-02": { vendorId: "AZURE", transportType: "CLOUD_API", protocol: "Azure API", capabilities: ["ENCRYPTION", "AUTHENTICATION", "ACCESS_CONTROLS", "CONFIGURATION"] },
  "conn-app-03": { vendorId: "NGINX", transportType: "HTTPS_API", protocol: "HTTPS", capabilities: ["TLS", "CERTIFICATES", "AUTHENTICATION", "SECURITY_HEADERS", "ENDPOINTS", "CONFIGURATION"] },
};

export function connectorProfileFor(id: string): ConnectorProfile {
  return CONNECTOR_PROFILES[id] ?? { vendorId: "GENERIC", transportType: "SIMULATED", protocol: "HTTPS", capabilities: ["CONFIGURATION"] };
}

/** Deterministic simulated round-trip latency for an adapter. */
export function modelConnectorLatency(connector: Pick<ConnectorRecord, "type" | "protocol" | "version">): number {
  const protocolSeed = (connector.protocol ?? connector.type).length;
  const versionSeed = (connector.version ?? "1.0.0").length % 7;
  return 8 + protocolSeed * 2 + versionSeed;
}

const TYPE_ACTIONS: Record<ConnectorType, RemediationActionType[]> = {
  NETWORK: ["CONSOLIDATE_FIREWALL_RULE", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH"],
  SERVER: ["UPGRADE_SERVICE_VERSION", "RESTORE_BASELINE_HASH", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH", "ENABLE_INTEGRITY_VALIDATION"],
  DATABASE: ["ENABLE_DB_ENCRYPTION", "RESTRICT_DB_BIND", "ENFORCE_STRONG_AUTH", "ROTATE_AND_SCREEN_SECRETS"],
  APPLICATION: ["SET_TLS_MIN_VERSION", "REVOKE_AND_RENEW_CERTIFICATE", "DISABLE_INSECURE_PROTOCOL", "ENFORCE_STRONG_CIPHERS", "SECURE_API_CONFIG", "ENABLE_INTEGRITY_VALIDATION", "ENABLE_XML_SIGNATURE_VALIDATION", "ROTATE_AND_SCREEN_SECRETS", "RESTRICT_PRIVILEGED_ACCESS", "UPGRADE_SERVICE_VERSION", "RESTORE_BASELINE_HASH"],
  FIREWALL: ["CONSOLIDATE_FIREWALL_RULE", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH"],
  MESSAGE_QUEUE: ["SECURE_MESSAGE_QUEUE", "ENFORCE_STRONG_AUTH"],
  CLOUD: ["ENABLE_DB_ENCRYPTION", "ROTATE_AND_SCREEN_SECRETS", "ENABLE_INTEGRITY_VALIDATION", "RESTRICT_DB_BIND"],
};

// vendor → connector descriptor used by discovery
interface ConnectorSeed {
  id: string;
  type: ConnectorType;
  name: string;
  vendor: string;
  version: string;
  status: ConnectorStatus;
  supportedAssetTypes: AssetType[];
  connectError?: string;
}

export const CONNECTOR_SEEDS: ConnectorSeed[] = [
  { id: "conn-net-01", type: "NETWORK", name: "Cisco Network Adapter", vendor: "Cisco", version: "1.4.2", status: "ONLINE", supportedAssetTypes: ["ROUTER", "SWITCH", "NETWORK_DEVICE"] },
  { id: "conn-net-02", type: "NETWORK", name: "Palo Alto Firewall Adapter", vendor: "Palo Alto", version: "1.3.0", status: "NETWORK_BLOCKED", supportedAssetTypes: ["FIREWALL"], connectError: "Egress zone 10.10.1.0/24 not reachable from secure connector." },
  { id: "conn-net-03", type: "FIREWALL", name: "Fortinet FortiGate Adapter", vendor: "Fortinet", version: "2.0.1", status: "OFFLINE", supportedAssetTypes: ["FIREWALL"], connectError: "Connector process idle — no heartbeats received in 7200s." },
  { id: "conn-net-04", type: "NETWORK", name: "Arista Switch Adapter", vendor: "Arista", version: "1.1.0", status: "ONLINE", supportedAssetTypes: ["SWITCH"] },
  { id: "conn-net-05", type: "NETWORK", name: "Juniper Junos Adapter", vendor: "Juniper", version: "1.2.1", status: "ONLINE", supportedAssetTypes: ["ROUTER", "SWITCH"] },
  { id: "conn-srv-01", type: "SERVER", name: "SSH Server Adapter", vendor: "Linux", version: "3.0.2", status: "ONLINE", supportedAssetTypes: ["SERVER", "VIRTUAL_MACHINE"] },
  { id: "conn-srv-02", type: "SERVER", name: "Windows Server Adapter", vendor: "Microsoft", version: "1.7.4", status: "ONLINE", supportedAssetTypes: ["SERVER", "VIRTUAL_MACHINE"] },
  { id: "conn-db-01", type: "DATABASE", name: "PostgreSQL Adapter", vendor: "PostgreSQL", version: "2.1.0", status: "ONLINE", supportedAssetTypes: ["DATABASE"] },
  { id: "conn-db-02", type: "DATABASE", name: "Oracle Adapter", vendor: "Oracle", version: "1.9.4", status: "AUTHENTICATION_FAILED", supportedAssetTypes: ["DATABASE"], connectError: "Read-only probe credentials rejected by Vault policy vault/db/oracle/read." },
  { id: "conn-db-03", type: "DATABASE", name: "MongoDB Adapter", vendor: "MongoDB", version: "1.4.0", status: "ONLINE", supportedAssetTypes: ["DATABASE"] },
  { id: "conn-app-01", type: "APPLICATION", name: "API Gateway / TLS Adapter (Kong)", vendor: "Kong", version: "2.2.1", status: "ONLINE", supportedAssetTypes: ["API", "APPLICATION", "LOAD_BALANCER"] },
  { id: "conn-app-02", type: "APPLICATION", name: "REST API Adapter", vendor: "Generic", version: "1.0.3", status: "NETWORK_BLOCKED", supportedAssetTypes: ["API", "APPLICATION"], connectError: "TLS inspection is blocking outbound metric channel on api-partner." },
  { id: "conn-mq-01", type: "MESSAGE_QUEUE", name: "RabbitMQ Adapter", vendor: "RabbitMQ", version: "1.1.2", status: "ONLINE", supportedAssetTypes: ["MESSAGE_QUEUE"] },
  { id: "conn-mq-02", type: "MESSAGE_QUEUE", name: "Kafka Adapter", vendor: "Apache Kafka", version: "1.2.0", status: "ONLINE", supportedAssetTypes: ["MESSAGE_QUEUE"] },
  { id: "conn-cloud-01", type: "CLOUD", name: "AWS Cloud Adapter", vendor: "Amazon Web Services", version: "2.0.0", status: "ONLINE", supportedAssetTypes: ["CLOUD_RESOURCE", "DATABASE", "SERVER"] },
  { id: "conn-cloud-02", type: "CLOUD", name: "Azure Cloud Adapter", vendor: "Microsoft Azure", version: "1.4.3", status: "ONLINE", supportedAssetTypes: ["CLOUD_RESOURCE", "DATABASE", "SERVER"] },
  { id: "conn-app-03", type: "APPLICATION", name: "Nginx TLS Adapter", vendor: "Nginx", version: "1.6.0", status: "ONLINE", supportedAssetTypes: ["APPLICATION", "API", "PROXY"] },
];

export function seededConnectors(): ConnectorRecord[] {
  const now = new Date().toISOString();
  return CONNECTOR_SEEDS.map((s) => {
    const profile = connectorProfileFor(s.id);
    return {
      id: s.id,
      type: s.type,
      name: s.name,
      vendor: s.vendor,
      version: s.version,
      status: s.status,
      lastContactAt: s.status === "ONLINE" ? now : undefined,
      simulated: true,
      authorizedActions: TYPE_ACTIONS[s.type],
      supportedAssetTypes: s.supportedAssetTypes,
      connectError: s.connectError,
      transportType: profile.transportType,
      protocol: profile.protocol,
      capabilities: profile.capabilities,
      latencyMs: s.status === "ONLINE" ? modelConnectorLatency({ type: s.type, protocol: profile.protocol, version: s.version }) : undefined,
    };
  });
}

/** Deterministic connector health probe against the simulated environment. */
export function probeConnectorStatus(connector: ConnectorRecord, tick: number): ConnectorStatus {
  // Simulated 8-second heartbeats; enterprise connectors stay stable but a
  // deterministic pattern keeps the demo reproducible.
  const hour = Math.floor(tick / 3600);
  const minute = Math.floor((tick % 3600) / 60);
  const phase = (hour * 7 + minute) % 17;
  if (connector.status === "AUTHENTICATION_FAILED") {
    return phase >= 14 ? "ONLINE" : "AUTHENTICATION_FAILED";
  }
  if (connector.status === "NETWORK_BLOCKED") {
    return phase >= 15 ? "ONLINE" : "NETWORK_BLOCKED";
  }
  if (connector.status === "OFFLINE") {
    return phase >= 16 ? "ONLINE" : "OFFLINE";
  }
  return "ONLINE";
}

export function connectorForAsset(connectors: ConnectorRecord[], assetType: AssetType, vendor: string): ConnectorRecord | undefined {
  const preferred = connectors
    .filter((c) => c.supportedAssetTypes.includes(assetType) && c.status === "ONLINE")
    .sort((a, b) => scoreConnector(a, assetType, vendor) - scoreConnector(b, assetType, vendor));
  return preferred[0];
}

function scoreConnector(c: ConnectorRecord, assetType: AssetType, vendor: string): number {
  let score = 100;
  if (c.vendor.toLowerCase().includes(vendor.toLowerCase())) score -= 20;
  if (c.type !== "APPLICATION" && c.supportedAssetTypes.includes(assetType)) score -= 30;
  return score;
}