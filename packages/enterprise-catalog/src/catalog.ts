import type {
  AssetCriticality,
  AssetRecord,
  AssetRelationship,
  AssetType,
  ConnectionStatus,
  ConnectorStatus,
  NetworkTier,
  TopologyConnection,
} from "@nexus/shared-types";
import { connectorTypeForAsset } from "./enterprise";

// ---------------------------------------------------------------------------
// Deterministic simulated enterprise inventory.
//
// These assets are controlled, simulated records. It is a CONTROLLED EXECUTION
// environment: no real infrastructure is touched. The connectors read and
// mutate `observedState` only within this simulation model.
// ---------------------------------------------------------------------------

export interface SimulatedAssetSeed {
  id: string;
  name: string;
  assetType: AssetType;
  vendor: string;
  technology: string;
  environment: "PROD_SIM" | "STAGING" | "DEVELOPMENT";
  region: string;
  site: string;
  networkZone: string;
  tier: NetworkTier;
  hostname: string;
  ipAddress: string;
  criticality: AssetCriticality;
  observedState: Record<string, unknown>;
  tags?: string[];
}

export const INVENTORY: SimulatedAssetSeed[] = [
  {
    id: "ast-api-gateway-01", name: "API-GATEWAY-01", assetType: "API", vendor: "Kong", technology: "Kong Gateway 3.4",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "APP", tier: "TIER_2",
    hostname: "api-gw-01.chennai.nexuscorp.in", ipAddress: "10.20.10.5", criticality: "CRITICAL",
    observedState: {
      tlsMinVersion: "1.0", cipherStrength: "weak", insecureProtocols: ["http"], certDaysToExpiry: -9, certExpiry: "2026-09-03T00:00:00.000Z",
      apiAuthEnabled: true, apiRateLimit: true, xmlSignatureValidation: false, integrityValidation: true, plaintextSecrets: false, configChecksum: "f3a9c11d", serviceVersion: "3.4.0-ee",
    },
    tags: ["internet-facing", "payment-border"],
  },
  {
    id: "ast-api-gateway-02", name: "API-GATEWAY-02", assetType: "API", vendor: "Kong", technology: "Kong Gateway 3.6",
    environment: "PROD_SIM", region: "USA", site: "site-virginia", networkZone: "APP", tier: "TIER_2",
    hostname: "api-gw-02.virginia.nexuscorp.net", ipAddress: "10.30.12.8", criticality: "HIGH",
    observedState: {
      tlsMinVersion: "1.3", cipherStrength: "strong", insecureProtocols: [], certDaysToExpiry: 210, certExpiry: "2027-04-10T00:00:00.000Z",
      apiAuthEnabled: true, apiRateLimit: true, xmlSignatureValidation: true, integrityValidation: true, plaintextSecrets: false, configChecksum: "91b2e007", serviceVersion: "3.6.0",
    },
  },
  {
    id: "ast-db-customer-core", name: "DB-CUSTOMER-CORE", assetType: "DATABASE", vendor: "PostgreSQL", technology: "PostgreSQL 14",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "DATA", tier: "TIER_2",
    hostname: "db-core-01.chennai.nexuscorp.in", ipAddress: "10.20.30.12", criticality: "CRITICAL",
    observedState: {
      dbEncryption: false, dbBindAddress: "0.0.0.0", dbPort: 5432, authStrength: "weak", plaintextSecrets: true,
      serviceVersion: "14.2", latestStableVersion: "14.15", sslEnabled: true, configChecksum: "7d10eaf2",
    },
    tags: ["pii", "customer-data"],
  },
  {
    id: "ast-db-payments", name: "DB-PAYMENTS", assetType: "DATABASE", vendor: "Oracle", technology: "Oracle Database 19c",
    environment: "PROD_SIM", region: "USA", site: "site-virginia", networkZone: "DATA", tier: "TIER_2",
    hostname: "db-pay-01.virginia.nexuscorp.net", ipAddress: "10.30.40.15", criticality: "CRITICAL",
    observedState: { dbEncryption: true, dbBindAddress: "10.30.40.15", dbPort: 1521, authStrength: "mfa", plaintextSecrets: false, serviceVersion: "19.25" },
    tags: ["pci", "card-data"],
  },
  {
    id: "ast-db-analytics", name: "DB-ANALYTICS", assetType: "DATABASE", vendor: "MongoDB", technology: "MongoDB 6.0",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "DATA", tier: "TIER_2",
    hostname: "db-an-01.singapore.nexuscorp.sg", ipAddress: "10.40.30.7", criticality: "HIGH",
    observedState: { dbEncryption: true, dbBindAddress: "0.0.0.0", dbPort: 27017, authStrength: "strong", plaintextSecrets: false, serviceVersion: "6.0.0" },
  },
  {
    id: "ast-mq-orders", name: "MQ-ORDERS", assetType: "MESSAGE_QUEUE", vendor: "RabbitMQ", technology: "RabbitMQ 3.11",
    environment: "PROD_SIM", region: "IND", site: "site-mumbai", networkZone: "CORE", tier: "TIER_2",
    hostname: "mq-orders-01.mumbai.nexuscorp.in", ipAddress: "10.21.5.11", criticality: "HIGH",
    observedState: { mqAuthRequired: false, mqTlsEnabled: true, serviceVersion: "3.11.13" },
  },
  {
    id: "ast-mq-events", name: "MQ-EVENTS", assetType: "MESSAGE_QUEUE", vendor: "Apache Kafka", technology: "Kafka 3.6",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "CORE", tier: "TIER_2",
    hostname: "mq-ev-01.singapore.nexuscorp.sg", ipAddress: "10.40.10.9", criticality: "HIGH",
    observedState: { mqAuthRequired: true, mqTlsEnabled: true, serviceVersion: "3.6.0" },
  },
  {
    id: "ast-web-payments", name: "WEB-PAYMENTS", assetType: "APPLICATION", vendor: "Spring Boot", technology: "Java / Spring Boot 2.7",
    environment: "PROD_SIM", region: "IND", site: "site-mumbai", networkZone: "APP", tier: "TIER_2",
    hostname: "app-pay-01.mumbai.nexuscorp.in", ipAddress: "10.21.20.6", criticality: "CRITICAL",
    observedState: {
      tlsMinVersion: "1.2", insecureProtocols: [], certDaysToExpiry: 120, integrityValidation: false, xmlSignatureValidation: false,
      serviceVersion: "2.11.0", latestStableVersion: "2.14.0", configChecksum: "a01c77d9", plaintextSecrets: true, apiAuthEnabled: true,
    },
    tags: ["pii", "web"],
  },
  {
    id: "ast-api-health", name: "API-HEALTH", assetType: "API", vendor: "Node.js", technology: "Express API",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "APP", tier: "TIER_2",
    hostname: "api-hl-01.singapore.nexuscorp.sg", ipAddress: "10.40.20.4", criticality: "MEDIUM",
    observedState: { tlsMinVersion: "1.2", insecureProtocols: [], certDaysToExpiry: 320, apiAuthEnabled: true, apiRateLimit: true, xmlSignatureValidation: true, serviceVersion: "14.20.0" },
  },
  {
    id: "ast-fw-dmz-01", name: "FW-DMZ-01", assetType: "FIREWALL", vendor: "Palo Alto", technology: "PAN-OS 11.1",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "DMZ", tier: "TIER_1",
    hostname: "fw-dmz-01.chennai.nexuscorp.in", ipAddress: "10.10.1.2", criticality: "CRITICAL",
    observedState: { firewallAnyRules: 12, privilegedBroadAccess: true, authStrength: "weak", serviceVersion: "11.1.0", latestStableVersion: "11.1.3" },
  },
  {
    id: "ast-fw-core-01", name: "FW-CORE-01", assetType: "FIREWALL", vendor: "Fortinet", technology: "FortiGate 7.4",
    environment: "PROD_SIM", region: "USA", site: "site-virginia", networkZone: "CORE", tier: "TIER_1",
    hostname: "fw-core-01.virginia.nexuscorp.net", ipAddress: "10.30.1.2", criticality: "CRITICAL",
    observedState: { firewallAnyRules: 3, privilegedBroadAccess: false, authStrength: "strong", serviceVersion: "7.4.1" },
  },
  {
    id: "ast-rtr-edge-01", name: "RTR-EDGE-01", assetType: "ROUTER", vendor: "Cisco", technology: "Cisco ISR 4451",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "CORE", tier: "TIER_1",
    hostname: "rtr-edge-01.chennai.nexuscorp.in", ipAddress: "10.10.0.2", criticality: "HIGH",
    observedState: { authStrength: "weak", serviceVersion: "15.2(4)M", latestStableVersion: "16.12.10", privilegeLevel: "unprivileged-any" },
  },
  {
    id: "ast-sw-dist-01", name: "SW-DIST-01", assetType: "SWITCH", vendor: "Arista", technology: "Arista EOS 4.30",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "CORE", tier: "TIER_1",
    hostname: "sw-dist-01.singapore.nexuscorp.sg", ipAddress: "10.40.1.3", criticality: "MEDIUM",
    observedState: { authStrength: "strong", serviceVersion: "4.30.0" },
  },
  {
    id: "ast-lb-api-01", name: "LB-API-01", assetType: "LOAD_BALANCER", vendor: "F5", technology: "F5 BIG-IP 16.1",
    environment: "PROD_SIM", region: "USA", site: "site-oregon", networkZone: "APP", tier: "TIER_2",
    hostname: "lb-api-01.oregon.nexuscorp.net", ipAddress: "10.31.12.3", criticality: "HIGH",
    observedState: { tlsMinVersion: "1.2", cipherStrength: "weak", certDaysToExpiry: 290, serviceVersion: "16.1.0", latestStableVersion: "17.1.2" },
  },
  {
    id: "ast-cert-api-gateway", name: "CERT-API-GATEWAY", assetType: "CERTIFICATE", vendor: "DigiCert", technology: "TLS RSA 2048",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "APP", tier: "TIER_2",
    hostname: "cert.api-gw-01.chennai.nexuscorp.in", ipAddress: "203.0.113.4", criticality: "CRITICAL",
    observedState: { certDaysToExpiry: 12, certExpiry: "2026-09-24T00:00:00.000Z", certIssuer: "DigiCert SHA2 EV" },
  },
  {
    id: "ast-cert-mobile", name: "CERT-MOBILE", assetType: "CERTIFICATE", vendor: "Let's Encrypt", technology: "TLS ECDSA P-256",
    environment: "PROD_SIM", region: "USA", site: "site-virginia", networkZone: "APP", tier: "TIER_2",
    hostname: "cert.mobile.nexuscorp.net", ipAddress: "203.0.113.12", criticality: "MEDIUM",
    observedState: { certDaysToExpiry: 85, certExpiry: "2026-12-06T00:00:00.000Z", certIssuer: "Let's Encrypt R10" },
  },
  {
    id: "ast-srv-cmdb", name: "SRV-CMDB", assetType: "SERVER", vendor: "Red Hat", technology: "RHEL 8.8",
    environment: "PROD_SIM", region: "IND", site: "site-mumbai", networkZone: "MGMT", tier: "TIER_3",
    hostname: "srv-cmdb-01.mumbai.nexuscorp.in", ipAddress: "10.21.100.5", criticality: "MEDIUM",
    observedState: { integrityValidation: false, configChecksum: "abc12340", expectedChecksum: "def45611", serviceVersion: "8.8", latestStableVersion: "8.10", privilegedBroadAccess: true },
  },
  {
    id: "ast-vm-logstash", name: "VM-LOGSTASH", assetType: "VIRTUAL_MACHINE", vendor: "Ubuntu", technology: "Ubuntu 20.04 LTS",
    environment: "PROD_SIM", region: "USA", site: "site-virginia", networkZone: "APP", tier: "TIER_2",
    hostname: "vm-logs-01.virginia.nexuscorp.net", ipAddress: "10.30.22.9", criticality: "LOW",
    observedState: { serviceVersion: "20.04", latestStableVersion: "24.04", integrityValidation: true, configChecksum: "c0ffee01", expectedChecksum: "c0ffee01" },
  },
  {
    id: "ast-cloud-s3-customer", name: "CLOUD-S3-CUSTOMER", assetType: "CLOUD_RESOURCE", vendor: "Amazon Web Services", technology: "Amazon S3",
    environment: "PROD_SIM", region: "USA", site: "site-oregon", networkZone: "CLOUD", tier: "TIER_2",
    hostname: "s3://nexus-customer-data-eu", ipAddress: "52.94.140.20", criticality: "CRITICAL",
    observedState: { storageEncryption: false, plaintextSecrets: false, bucketPolicyPublic: false, configChecksum: "1b2c3d4e", expectedChecksum: "9f8e7d6c" },
    tags: ["pii"],
  },
  {
    id: "ast-proxy-egress-01", name: "PROXY-EGRESS-01", assetType: "PROXY", vendor: "Squid", technology: "Squid 5.7",
    environment: "PROD_SIM", region: "IND", site: "site-mumbai", networkZone: "DMZ", tier: "TIER_1",
    hostname: "proxy-eg-01.mumbai.nexuscorp.in", ipAddress: "10.21.1.4", criticality: "MEDIUM",
    observedState: { privilegedBroadAccess: true, authStrength: "weak", serviceVersion: "5.7", latestStableVersion: "6.12" },
  },
  {
    id: "ast-api-partner", name: "API-PARTNER", assetType: "API", vendor: "Kong", technology: "Kong Gateway 3.5",
    environment: "STAGING", region: "USA", site: "site-virginia", networkZone: "APP", tier: "TIER_2",
    hostname: "api-pt-01.virginia.nexuscorp.net", ipAddress: "10.30.14.11", criticality: "HIGH",
    observedState: { tlsMinVersion: "1.2", cipherStrength: "strong", insecureProtocols: [], certDaysToExpiry: 130, apiAuthEnabled: false, apiRateLimit: false, xmlSignatureValidation: false, plaintextSecrets: true },
  },
  {
    id: "ast-server-website", name: "SERVER-WEBSITE", assetType: "SERVER", vendor: "Nginx", technology: "Nginx 1.24 / Ubuntu 22.04",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "APP", tier: "TIER_2",
    hostname: "srv-web-01.singapore.nexuscorp.sg", ipAddress: "10.40.20.12", criticality: "HIGH",
    observedState: { tlsMinVersion: "1.1", insecureProtocols: ["http"], cipherStrength: "weak", configChecksum: "11aa22bb", expectedChecksum: "33cc44dd", integrityValidation: true, serviceVersion: "1.24.0", latestStableVersion: "1.27.4" },
  },
  // India / Chennai — representative perimeter, application and data assets
  {
    id: "ast-fw-chn-01", name: "FW-CHN-01", assetType: "FIREWALL", vendor: "Cisco", technology: "Cisco ASA 9.16",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "DMZ", tier: "TIER_1",
    hostname: "fw-chn-01.chennai.nexuscorp.in", ipAddress: "10.10.1.10", criticality: "CRITICAL",
    observedState: { firewallAnyRules: 9, privilegedBroadAccess: true, authStrength: "weak", serviceVersion: "9.16", latestStableVersion: "9.20" },
    tags: ["perimeter", "internet-facing"],
  },
  {
    id: "ast-rtr-chn-01", name: "RTR-CHN-01", assetType: "ROUTER", vendor: "Cisco", technology: "Cisco IOS-XE 17.9",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "CORE", tier: "TIER_1",
    hostname: "rtr-chn-01.chennai.nexuscorp.in", ipAddress: "10.10.0.10", criticality: "CRITICAL",
    observedState: { authStrength: "weak", serviceVersion: "17.9.1", latestStableVersion: "17.12.2", privilegeLevel: "unprivileged-any" },
  },
  {
    id: "ast-sw-chn-01", name: "SW-CHN-01", assetType: "SWITCH", vendor: "Cisco", technology: "Cisco Catalyst 9300 / IOS-XE 17.9",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "CORE", tier: "TIER_1",
    hostname: "sw-chn-01.chennai.nexuscorp.in", ipAddress: "10.10.0.20", criticality: "HIGH",
    observedState: { authStrength: "weak", serviceVersion: "17.9.4", latestStableVersion: "17.12.2", privilegeLevel: "unprivileged-any" },
    tags: ["core-network"],
  },
  {
    id: "ast-app-chn-01", name: "APP-CHN-01", assetType: "APPLICATION", vendor: "Nginx", technology: "Nginx 1.22 / Ubuntu 20.04",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "APP", tier: "TIER_2",
    hostname: "app-chn-01.chennai.nexuscorp.in", ipAddress: "10.20.10.20", criticality: "HIGH",
    observedState: { tlsMinVersion: "1.0", insecureProtocols: ["http"], cipherStrength: "weak", certDaysToExpiry: 18, serviceVersion: "1.22.1", latestStableVersion: "1.27.4" },
    tags: ["pii", "web"],
  },
  {
    id: "ast-api-chn-01", name: "API-CHN-01", assetType: "API", vendor: "Kong", technology: "Kong Gateway 3.4",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "APP", tier: "TIER_2",
    hostname: "api-chn-01.chennai.nexuscorp.in", ipAddress: "10.20.10.25", criticality: "CRITICAL",
    observedState: { tlsMinVersion: "1.2", cipherStrength: "strong", insecureProtocols: [], certDaysToExpiry: 130, apiAuthEnabled: true, apiRateLimit: false, xmlSignatureValidation: false, plaintextSecrets: false, configChecksum: "1a2b3c4d", serviceVersion: "3.4.0" },
    tags: ["internet-facing"],
  },
  {
    id: "ast-db-chn-01", name: "DB-CHN-01", assetType: "DATABASE", vendor: "PostgreSQL", technology: "PostgreSQL 14",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "DATA", tier: "TIER_1",
    hostname: "db-chn-01.chennai.nexuscorp.in", ipAddress: "10.20.30.20", criticality: "CRITICAL",
    observedState: { dbEncryption: false, dbBindAddress: "0.0.0.0", dbPort: 5432, authStrength: "weak", plaintextSecrets: true, sslEnabled: true, serviceVersion: "14.8", latestStableVersion: "14.15" },
    tags: ["pii", "customer-data"],
  },
  {
    id: "ast-mq-chn-01", name: "MQ-CHN-01", assetType: "MESSAGE_QUEUE", vendor: "RabbitMQ", technology: "RabbitMQ 3.12",
    environment: "PROD_SIM", region: "IND", site: "site-chennai", networkZone: "CORE", tier: "TIER_2",
    hostname: "mq-chn-01.chennai.nexuscorp.in", ipAddress: "10.21.5.20", criticality: "HIGH",
    observedState: { mqAuthRequired: false, mqTlsEnabled: true, serviceVersion: "3.12.10" },
  },
  // USA / New York — representative edge and data assets
  {
    id: "ast-fw-ny-01", name: "FW-NY-01", assetType: "FIREWALL", vendor: "Fortinet", technology: "FortiGate 7.2",
    environment: "PROD_SIM", region: "USA", site: "site-newyork", networkZone: "DMZ", tier: "TIER_1",
    hostname: "fw-ny-01.newyork.nexuscorp.net", ipAddress: "10.32.1.10", criticality: "CRITICAL",
    observedState: { firewallAnyRules: 4, privilegedBroadAccess: false, authStrength: "strong", serviceVersion: "7.2.7", latestStableVersion: "7.2.9" },
    tags: ["perimeter", "internet-facing"],
  },
  {
    id: "ast-app-ny-01", name: "APP-NY-01", assetType: "SERVER", vendor: "Linux", technology: "Ubuntu 22.04 LTS",
    environment: "PROD_SIM", region: "USA", site: "site-newyork", networkZone: "APP", tier: "TIER_1",
    hostname: "app-ny-01.newyork.nexuscorp.net", ipAddress: "10.32.20.10", criticality: "MEDIUM",
    observedState: { integrityValidation: false, configChecksum: "aa0000ff", expectedChecksum: "bb1111ee", serviceVersion: "22.04", latestStableVersion: "24.04" },
  },
  {
    id: "ast-db-ny-01", name: "DB-NY-01", assetType: "DATABASE", vendor: "PostgreSQL", technology: "PostgreSQL 15",
    environment: "PROD_SIM", region: "USA", site: "site-newyork", networkZone: "DATA", tier: "TIER_1",
    hostname: "db-ny-01.newyork.nexuscorp.net", ipAddress: "10.32.30.10", criticality: "HIGH",
    observedState: { dbEncryption: true, dbBindAddress: "10.32.30.10", dbPort: 5432, authStrength: "strong", plaintextSecrets: false, sslEnabled: true, serviceVersion: "15.3", latestStableVersion: "15.7" },
    tags: ["pii"],
  },
  // Singapore — representative API gateway
  {
    id: "ast-api-sg-01", name: "API-SG-01", assetType: "API", vendor: "Kong", technology: "Kong Gateway 3.4",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "APP", tier: "TIER_1",
    hostname: "api-sg-01.singapore.nexuscorp.sg", ipAddress: "10.40.20.25", criticality: "HIGH",
    observedState: { tlsMinVersion: "1.1", cipherStrength: "weak", insecureProtocols: ["http"], certDaysToExpiry: 25, apiAuthEnabled: true, apiRateLimit: true, xmlSignatureValidation: false, plaintextSecrets: false, serviceVersion: "3.4.0" },
    tags: ["internet-facing"],
  },
  {
    id: "ast-fw-sg-01", name: "FW-SG-01", assetType: "FIREWALL", vendor: "Palo Alto", technology: "PAN-OS 11.1",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "DMZ", tier: "TIER_1",
    hostname: "fw-sg-01.singapore.nexuscorp.sg", ipAddress: "10.40.1.10", criticality: "CRITICAL",
    observedState: { firewallAnyRules: 7, privilegedBroadAccess: true, authStrength: "strong", serviceVersion: "11.1.0", latestStableVersion: "11.1.3" },
    tags: ["perimeter", "internet-facing"],
  },
  {
    id: "ast-db-sg-01", name: "DB-SG-01", assetType: "DATABASE", vendor: "PostgreSQL", technology: "PostgreSQL 15",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "DATA", tier: "TIER_1",
    hostname: "db-sg-01.singapore.nexuscorp.sg", ipAddress: "10.40.30.20", criticality: "CRITICAL",
    observedState: { dbEncryption: true, dbBindAddress: "0.0.0.0", dbPort: 5432, authStrength: "strong", plaintextSecrets: true, sslEnabled: true, serviceVersion: "15.3", latestStableVersion: "15.7" },
    tags: ["pii"],
  },
  {
    id: "ast-cert-sg-01", name: "CERT-SG-01", assetType: "CERTIFICATE", vendor: "DigiCert", technology: "TLS RSA 2048",
    environment: "PROD_SIM", region: "SGP", site: "site-singapore", networkZone: "APP", tier: "TIER_2",
    hostname: "cert.api-sg-01.singapore.nexuscorp.sg", ipAddress: "203.0.113.20", criticality: "HIGH",
    observedState: { certDaysToExpiry: 40, certExpiry: "2026-10-23T00:00:00.000Z", certIssuer: "DigiCert SHA2 EV" },
    tags: ["internet-facing"],
  },
];

// ---------------------------------------------------------------------------
// Discovery wave vs known estate.
//
// A fresh install opens with the KNOWN_ESTATE (the footprint already being
// managed). The first "Discover Assets" run creates exactly the DISCOVERY_WAVE
// — 14 assets across Chennai, New York and Singapore — and subsequent runs are
// idempotent (0 new). This keeps the front-of-loop honest: discovery actually
// discovers, instead of reporting "0 new" because the seed pre-created the
// whole estate. The hero (API-GATEWAY-01) stays in the known estate so the
// scan → remediate → verify closed loop is live on first paint.
// ---------------------------------------------------------------------------

export const DISCOVERY_WAVE_IDS: ReadonlySet<string> = new Set([
  "ast-fw-chn-01", "ast-rtr-chn-01", "ast-sw-chn-01",
  "ast-app-chn-01", "ast-api-chn-01", "ast-db-chn-01", "ast-mq-chn-01",
  "ast-fw-ny-01", "ast-app-ny-01", "ast-db-ny-01",
  "ast-fw-sg-01", "ast-api-sg-01", "ast-db-sg-01", "ast-cert-sg-01",
]);

export const KNOWN_ESTATE: SimulatedAssetSeed[] = INVENTORY.filter((s) => !DISCOVERY_WAVE_IDS.has(s.id));
export const DISCOVERY_WAVE: SimulatedAssetSeed[] = INVENTORY.filter((s) => DISCOVERY_WAVE_IDS.has(s.id));

export function knownEstateRecords(relationships: AssetRelationship[]): AssetRecord[] {
  return KNOWN_ESTATE.map((s) => toAssetRecord(s, relationships));
}

// ---------------------------------------------------------------------------
// Relationships (simulated asset graph)
// ---------------------------------------------------------------------------

interface RelationshipSeed {
  from: string;
  to: string;
  relation: AssetRelationship["relation"];
  source?: string;
  destination?: string;
  protocol?: string;
  port?: number;
  networkZone?: string;
  status: ConnectionStatus;
  encrypted?: boolean;
}

const RELATIONSHIPS: RelationshipSeed[] = [
  { from: "ast-fw-dmz-01", to: "ast-api-gateway-01", relation: "fronts", source: "0.0.0.0/0", destination: "10.20.10.5", protocol: "HTTPS", port: 443, networkZone: "DMZ→APP", status: "ALLOWED", encrypted: true },
  { from: "ast-rtr-edge-01", to: "ast-fw-dmz-01", relation: "connectsTo", source: "Internet", destination: "10.10.1.2", protocol: "BGP", port: 179, networkZone: "CORE", status: "ALLOWED", encrypted: false },
  { from: "ast-api-gateway-01", to: "ast-web-payments", relation: "serves", source: "10.20.10.5", destination: "10.21.20.6", protocol: "HTTP", port: 8080, networkZone: "APP", status: "ALLOWED", encrypted: true },
  { from: "ast-api-gateway-01", to: "ast-mq-orders", relation: "dependsOn", source: "10.20.10.5", destination: "10.21.5.11", protocol: "AMQP", port: 5671, networkZone: "APP→CORE", status: "ALLOWED", encrypted: true },
  { from: "ast-api-gateway-01", to: "ast-db-customer-core", relation: "dependsOn", source: "10.20.10.5", destination: "10.20.30.12", protocol: "PostgreSQL", port: 5432, networkZone: "APP→DATA", status: "MONITORED", encrypted: true },
  { from: "ast-web-payments", to: "ast-db-customer-core", relation: "dependsOn", source: "10.21.20.6", destination: "10.20.30.12", protocol: "PostgreSQL", port: 5432, networkZone: "APP→DATA", status: "ALLOWED", encrypted: true },
  { from: "ast-cert-api-gateway", to: "ast-api-gateway-01", relation: "fronts", source: "Internet", destination: "10.20.10.5", protocol: "TLS 1.3", port: 443, networkZone: "DMZ", status: "MONITORED", encrypted: true },
  { from: "ast-fw-core-01", to: "ast-api-gateway-02", relation: "fronts", source: "10.30.0.0/16", destination: "10.30.12.8", protocol: "HTTPS", port: 443, networkZone: "CORE→APP", status: "ALLOWED", encrypted: true },
  { from: "ast-lb-api-01", to: "ast-api-gateway-02", relation: "fronts", source: "0.0.0.0/0", destination: "10.30.12.8", protocol: "HTTPS", port: 443, networkZone: "DMZ→APP", status: "ALLOWED", encrypted: true },
  { from: "ast-api-gateway-02", to: "ast-db-payments", relation: "dependsOn", source: "10.30.12.8", destination: "10.30.40.15", protocol: "Oracle TNS", port: 1521, networkZone: "APP→DATA", status: "ALLOWED", encrypted: true },
  { from: "ast-vm-logstash", to: "ast-db-analytics", relation: "connectsTo", source: "10.30.22.9", destination: "10.40.30.7", protocol: "MongoDB Wire", port: 27017, networkZone: "APP→DATA", status: "BLOCKED", encrypted: false },
  { from: "ast-db-analytics", to: "ast-cloud-s3-customer", relation: "dependsOn", source: "10.40.30.7", destination: "s3://nexus-customer-data-eu", protocol: "HTTPS", port: 443, networkZone: "DATA→CLOUD", status: "ALLOWED", encrypted: true },
  { from: "ast-web-payments", to: "ast-mq-orders", relation: "dependsOn", source: "10.21.20.6", destination: "10.21.5.11", protocol: "AMQP", port: 5671, networkZone: "APP→CORE", status: "ALLOWED", encrypted: true },
  { from: "ast-api-health", to: "ast-mq-events", relation: "dependsOn", source: "10.40.20.4", destination: "10.40.10.9", protocol: "Kafka", port: 9093, networkZone: "APP→CORE", status: "MONITORED", encrypted: true },
  { from: "ast-srv-cmdb", to: "ast-server-website", relation: "connectsTo", source: "10.21.100.5", destination: "10.40.20.12", protocol: "HTTPS", port: 8443, networkZone: "MGMT→APP", status: "MONITORED", encrypted: true },
  { from: "ast-proxy-egress-01", to: "ast-api-gateway-01", relation: "fronts", source: "Internet", destination: "10.20.10.5", protocol: "HTTPS", port: 443, networkZone: "DMZ", status: "ALLOWED", encrypted: true },
  { from: "ast-rtr-chn-01", to: "ast-fw-chn-01", relation: "connectsTo", source: "Internet", destination: "10.10.1.10", protocol: "BGP", port: 179, networkZone: "CORE", status: "ALLOWED", encrypted: false },
  { from: "ast-fw-chn-01", to: "ast-api-chn-01", relation: "fronts", source: "0.0.0.0/0", destination: "10.20.10.25", protocol: "HTTPS", port: 443, networkZone: "DMZ→APP", status: "ALLOWED", encrypted: true },
  { from: "ast-api-chn-01", to: "ast-app-chn-01", relation: "serves", source: "10.20.10.25", destination: "10.20.10.20", protocol: "HTTP", port: 8080, networkZone: "APP", status: "ALLOWED", encrypted: true },
  { from: "ast-api-chn-01", to: "ast-db-chn-01", relation: "dependsOn", source: "10.20.10.25", destination: "10.20.30.20", protocol: "PostgreSQL", port: 5432, networkZone: "APP→DATA", status: "MONITORED", encrypted: true },
  { from: "ast-api-chn-01", to: "ast-mq-chn-01", relation: "dependsOn", source: "10.20.10.25", destination: "10.21.5.20", protocol: "AMQP", port: 5671, networkZone: "APP→CORE", status: "ALLOWED", encrypted: true },
  { from: "ast-fw-ny-01", to: "ast-app-ny-01", relation: "fronts", source: "0.0.0.0/0", destination: "10.32.20.10", protocol: "HTTPS", port: 443, networkZone: "DMZ→APP", status: "ALLOWED", encrypted: true },
  { from: "ast-app-ny-01", to: "ast-db-ny-01", relation: "dependsOn", source: "10.32.20.10", destination: "10.32.30.10", protocol: "PostgreSQL", port: 5432, networkZone: "APP→DATA", status: "ALLOWED", encrypted: true },
  { from: "ast-api-sg-01", to: "ast-db-analytics", relation: "dependsOn", source: "10.40.20.25", destination: "10.40.30.7", protocol: "MongoDB Wire", port: 27017, networkZone: "APP→DATA", status: "MONITORED", encrypted: true },
  { from: "ast-sw-chn-01", to: "ast-rtr-chn-01", relation: "connectsTo", source: "10.10.0.20", destination: "10.10.0.10", protocol: "TCP", port: 22, networkZone: "CORE", status: "ALLOWED", encrypted: false },
  { from: "ast-app-chn-01", to: "ast-db-chn-01", relation: "dependsOn", source: "10.20.10.20", destination: "10.20.30.20", protocol: "PostgreSQL", port: 5432, networkZone: "APP→DATA", status: "ALLOWED", encrypted: true },
  { from: "ast-fw-sg-01", to: "ast-api-sg-01", relation: "fronts", source: "0.0.0.0/0", destination: "10.40.20.25", protocol: "HTTPS", port: 443, networkZone: "DMZ→APP", status: "ALLOWED", encrypted: true },
  { from: "ast-api-sg-01", to: "ast-db-sg-01", relation: "dependsOn", source: "10.40.20.25", destination: "10.40.30.20", protocol: "PostgreSQL", port: 5432, networkZone: "APP→DATA", status: "MONITORED", encrypted: true },
  { from: "ast-cert-sg-01", to: "ast-api-sg-01", relation: "fronts", source: "Internet", destination: "10.40.20.25", protocol: "TLS 1.3", port: 443, networkZone: "DMZ", status: "MONITORED", encrypted: true },
];

export function assetRelationships(): AssetRelationship[] {
  return RELATIONSHIPS.map((r, i) => ({
    id: `rel-${i + 1}`,
    fromAssetId: r.from,
    toAssetId: r.to,
    relation: r.relation,
    source: r.source,
    destination: r.destination,
    protocol: r.protocol,
    port: r.port,
    networkZone: r.networkZone,
    status: r.status,
    encrypted: r.encrypted,
  }));
}

export function topologyConnections(): TopologyConnection[] {
  return assetRelationships().map((r, i) => ({
    id: `conn-${i + 1}`,
    source: r.source ?? r.fromAssetId,
    destination: r.destination ?? r.toAssetId,
    protocol: r.protocol ?? "TCP",
    port: r.port ?? 443,
    networkZone: r.networkZone ?? "UNKNOWN",
    tier: tierOfAsset(r.fromAssetId),
    status: r.status,
    connectorStatus: connectorStatusFor(r.fromAssetId),
    purpose: relationPurpose(r.relation),
  }));
}

function tierOfAsset(assetId: string): NetworkTier {
  const asset = INVENTORY.find((a) => a.id === assetId);
  return asset?.tier ?? "TIER_2";
}

function connectorStatusFor(assetId: string): ConnectorStatus {
  const asset = INVENTORY.find((a) => a.id === assetId);
  if (!asset) return "ONLINE";
  if (asset.id === "ast-fw-core-01") return "OFFLINE";
  if (asset.id === "ast-db-payments") return "AUTHENTICATION_FAILED";
  if (asset.id === "ast-fw-dmz-01" || asset.id === "ast-api-partner") return "NETWORK_BLOCKED";
  return "ONLINE";
}

function relationPurpose(relation: AssetRelationship["relation"]): string {
  switch (relation) {
    case "serves": return "Service boundary";
    case "dependsOn": return "Data dependency";
    case "hosts": return "Hosting";
    case "fronts": return "Edge exposure";
    case "connectsTo": return "East-west connectivity";
  }
}

export function toAssetRecord(seed: SimulatedAssetSeed, relationships: AssetRelationship[]): AssetRecord {
  const now = new Date().toISOString();
  return {
    id: seed.id,
    name: seed.name,
    assetType: seed.assetType,
    vendor: seed.vendor,
    technology: seed.technology,
    environment: seed.environment,
    location: {
      region: seed.region,
      site: seed.site,
      networkZone: seed.networkZone,
      tier: seed.tier,
    },
    siteLabel: seed.site,
    regionLabel: seed.region,
    hostname: seed.hostname,
    ipAddress: seed.ipAddress,
    status: "DISCOVERED",
    discoveryStatus: "DISCOVERED",
    criticality: seed.criticality,
    connectorType: connectorTypeForAsset(seed.assetType),
    lastDiscoveredAt: now,
    observedState: { ...seed.observedState },
    stateHistory: [{ at: now, label: "Baseline / discovered state", state: { ...seed.observedState } }],
    relationships: relationships.filter((r) => r.fromAssetId === seed.id || r.toAssetId === seed.id),
    history: [{ at: now, action: "Discovered in simulation environment", actor: "Discovery Engine" }],
    tags: seed.tags,
  };
}