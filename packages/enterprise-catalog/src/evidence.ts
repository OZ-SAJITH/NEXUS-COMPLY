import type {
  AssetRecord,
  AssetRelationship,
  ConnectorRecord,
  EvidenceRecord,
  EvidenceType,
  FindingStatus,
} from "@nexus/shared-types";
import { canonicalEvidencePayload, sha256Hex } from "./integrity";
import { evidenceIntegrityHash } from "./remediation";
import { evaluateAssetControl, getAssetControlById, getAssetControls } from "./controls";

// ---------------------------------------------------------------------------
// PHASE 2 — evidence collection + normalization.
//
// Raw connector output → normalized evidence. The connector adapter layer
// reports RAW observations (remember: the simulated connectors never touch a
// real system — every artefact is produced against the controlled catalog).
// `normalizeEvidence` maps those raw rows into the persisted normalized model:
// control-scoped, typed, confidence-scored, SHA-256-hashed. THE COMPLIANCE
// ENGINE CONSUMES ONLY NORMALIZED EVIDENCE — this module is the seam between
// the connector layer and the existing evaluation/risk pipeline.
// ---------------------------------------------------------------------------

export interface EvidenceNetworkMeta {
  source: string;
  destination: string;
  protocol: string;
  sourcePort?: number;
  destinationPort?: number;
  translation?: "SNAT" | "DNAT" | "none";
  proxy?: string;
}

export interface NormalizedEvidenceInput {
  controlId: string;
  evidenceType: EvidenceType;
  observedValue: string;
  expectedValue: string;
  status: FindingStatus;
  source: string;
  confidence: number;
  rawReference: string;
  network?: EvidenceNetworkMeta;
  detail?: Record<string, unknown>;
}

/** Deterministic canonical evidence-type mapping for the 21-control catalogue. */
export function evidenceTypeForControlId(controlId: string): EvidenceType {
  if (controlId.startsWith("TLS")) return "TLS";
  if (controlId.startsWith("CERT")) return "CERTIFICATE";
  if (controlId.startsWith("ACL")) return "ACL";
  if (controlId.startsWith("NET")) return "NETWORK";
  if (controlId.startsWith("CRYPTO")) return "CRYPTOGRAPHY";
  if (controlId === "DB-001") return "CRYPTOGRAPHY";
  if (controlId.startsWith("DB")) return "NETWORK";
  if (controlId.startsWith("FW")) return "FIREWALL";
  if (controlId.startsWith("AUTH") || controlId.startsWith("ACCESS")) return "AUTHENTICATION";
  if (controlId.startsWith("INTEGRITY") || controlId.startsWith("CONFIG")) return "INTEGRITY";
  if (controlId.startsWith("XMLSIG")) return "API_RESPONSE";
  if (controlId.startsWith("API")) return "API_RESPONSE";
  if (controlId.startsWith("DATA")) return "CONFIGURATION";
  if (controlId.startsWith("OUTDATE")) return "PACKAGE_METADATA";
  if (controlId.startsWith("MQ")) return "CONFIGURATION";
  return "CONFIGURATION";
}

/**
 * Network-tier aware source/destination representation (SNAT / DNAT / proxy
 * capable). Reads the managed asset's existing relationship graph so the model
 * stays honest: a connector only "sees" approved paths, and translation via a
 * proxy is only claimed when the estate actually contains one.
 */
export function networkMetadataFor(asset: AssetRecord, destinationPort = 443): EvidenceNetworkMeta {
  const zoneAware = (zone: string): string => {
    switch (zone) {
      case "DMZ": return "10.10.0.0/24";
      case "CORE": return "10.0.0.0/8";
      case "DATA": return "10.20.30.0/24";
      case "APP": return "10.20.0.0/16";
      case "MGMT": return "10.99.0.0/24";
      case "CLOUD": return "52.94.0.0/16";
      default: return "10.0.0.0/8";
    }
  };
  const outbound = (asset.relationships ?? []).find((r): r is AssetRelationship => r.fromAssetId === asset.id);
  const egressProxied = asset.relationships?.some((r) => r.toAssetId === "ast-proxy-egress-01" || r.relation === "fronts");
  const translation: EvidenceNetworkMeta["translation"] = asset.assetType === "FIREWALL" || asset.assetType === "PROXY" || asset.assetType === "LOAD_BALANCER" ? "DNAT" : "none";
  return {
    source: asset.ipAddress,
    destination: outbound?.destination ?? zoneAware(asset.location.networkZone),
    protocol: "TCP",
    destinationPort: outbound?.port ?? destinationPort,
    translation,
    proxy: egressProxied ? "PROXY-EGRESS-01" : undefined,
  };
}

function evalRow(asset: AssetRecord, controlId: string, network?: EvidenceNetworkMeta): NormalizedEvidenceInput | undefined {
  const control = getAssetControlById(controlId);
  if (!control) return undefined;
  const outcome = evaluateAssetControl(control, asset);
  if (outcome.status === "NOT_APPLICABLE") return undefined;
  return {
    controlId,
    evidenceType: evidenceTypeForControlId(controlId),
    observedValue: String(outcome.observedValue ?? "unknown"),
    expectedValue: String(outcome.expectedValue ?? control.requirement),
    status: outcome.status,
    source: control.evidenceSource,
    confidence: 0.98,
    rawReference: `${asset.hostname}:${control.evalField}`,
    network,
    detail: { controlId, observedState: { ...asset.observedState } },
  };
}

// --- advisory evidence: one row per connector capability exercised on the
// managed asset class. These prove that different asset types yield different
// evidence (firewall → ACL/NAT/logging, database → TLS/users, certificate →
// expiry/issuer/key size, server → OS/services, API → endpoints/headers, MQ →
// access/exposure). Deterministic — derived from observedState + relationships.

function advisoryRows(asset: AssetRecord, network: EvidenceNetworkMeta): NormalizedEvidenceInput[] {
  const rows: NormalizedEvidenceInput[] = [];
  const base = {
    source: network.source,
    destination: network.destination,
    protocol: network.protocol,
    destinationPort: network.destinationPort,
    translation: network.translation,
    proxy: network.proxy,
  };
  const s = (asset.observedState as Record<string, unknown>);
  const host = asset.hostname;

  switch (asset.assetType) {
    case "FIREWALL":
    case "NETWORK_DEVICE":
    case "PROXY": {
      const anyRules = Number(s.firewallAnyRules ?? 0);
      rows.push({
        controlId: "ACLOBS-001",
        evidenceType: "ACL",
        observedValue: anyRules > 0 ? `permit tcp any any eq 443 // ${anyRules} broad allow rules` : "deny ip any any (deny-by-default)",
        expectedValue: "deny-by-default; only least-privilege permits",
        status: anyRules === 0 ? "PASS" : "WARNING",
        source: "Firewall policy / rule dump evidence",
        confidence: 0.98,
        rawReference: `${host}:acl/base-rule`,
        network: { ...base, destinationPort: 443 },
        detail: { controlId: "ACLOBS-001", anyRules, capability: "ACL" },
      });
      rows.push({
        controlId: "NAT-001",
        evidenceType: "FIREWALL",
        observedValue: `translate src ${asset.ipAddress} → internal pool; dest {${network.destination}} tcp/443`,
        expectedValue: "NAT reachable only from approved source zones",
        status: "PASS",
        source: "Firewall NAT / SNAT-DNAT configuration evidence",
        confidence: 0.99,
        rawReference: `${host}:nat/policy`,
        network: { ...base, destinationPort: 443 },
        detail: { controlId: "NAT-001", snat: asset.ipAddress, dnat: network.destination, capability: "NAT" },
      });
      rows.push({
        controlId: "FWLOG-001",
        evidenceType: "LOG",
        observedValue: "auditLog=on (allow/deny session logging, log-forward to SIEM)",
        expectedValue: "firewall logging enabled and forwarded",
        status: "PASS",
        source: "Firewall logging configuration evidence",
        confidence: 0.97,
        rawReference: `${host}:logging/audit`,
        detail: { controlId: "FWLOG-001", capability: "LOGGING" },
      });
      break;
    }
    case "DATABASE": {
      const ssl = s.sslEnabled;
      rows.push({
        controlId: "DBTLS-001",
        evidenceType: "TLS",
        observedValue: ssl === false ? "ssl=disabled" : "ssl=enabled (TLS 1.2+)",
        expectedValue: "transport encryption (TLS) required",
        status: ssl === false ? "FAIL" : "PASS",
        source: "Database TLS / client-encryption metadata evidence",
        confidence: 0.97,
        rawReference: `${host}:pg_hba/ssl`,
        detail: { controlId: "DBTLS-001", sslEnabled: ssl, capability: "TLS" },
      });
      rows.push({
        controlId: "DBUSR-001",
        evidenceType: "AUTHENTICATION",
        observedValue: String(s.privilegedBroadAccess) === "true" ? "privilegedUsers=[superuser, webadmin] grant ALL PRIVILEGES ON *.*" : "privilegedUsers=scoped least-privilege roles",
        expectedValue: "no broad ALL PRIVILEGES grants",
        status: String(s.privilegedBroadAccess) === "true" ? "WARNING" : "PASS",
        source: "Database user / privilege audit evidence",
        confidence: 0.96,
        rawReference: `${host}:sql/role-member`,
        detail: { controlId: "DBUSR-001", capability: "PRIVILEGES" },
      });
      break;
    }
    case "SERVER":
    case "VIRTUAL_MACHINE": {
      const latest = String(s.latestStableVersion ?? "");
      const current = String(s.serviceVersion ?? "");
      const upToDate = !latest || latest === "" || !current || current >= latest;
      rows.push({
        controlId: "OS-001",
        evidenceType: "SYSTEM",
        observedValue: `${asset.vendor} ${asset.technology} — patch level ${current}${upToDate ? " (up to date)" : ` (latest ${latest})`}`,
        expectedValue: "OS in supported, patched maintenance window",
        status: upToDate ? "PASS" : "WARNING",
        source: "OS / patch-level system evidence",
        confidence: 0.97,
        rawReference: `${host}:os/uname-patch`,
        detail: { controlId: "OS-001", serviceVersion: current, capability: "OS_INFO" },
      });
      rows.push({
        controlId: "PORTS-001",
        evidenceType: "CONFIGURATION",
        observedValue: "open=[ssh/22, https/443]",
        expectedValue: "only required services exposed",
        status: "PASS",
        source: "Service / open-port inventory evidence",
        confidence: 0.95,
        rawReference: `${host}:ports/ss-tcp`,
        detail: { controlId: "PORTS-001", openPorts: [22, 443], capability: "OPEN_PORTS" },
      });
      break;
    }
    case "CERTIFICATE": {
      const days = Number(s.certDaysToExpiry ?? 0);
      const issuer = String(s.certIssuer ?? asset.vendor);
      rows.push({
        controlId: "CERTOBS-001",
        evidenceType: "CERTIFICATE",
        observedValue: `subject=${asset.hostname} issuer=${issuer} key=${asset.technology === "TLS RSA 2048" ? "2048-bit RSA" : "ECDSA P-256"} sig=sha256WithRSAEncryption expires=${String(s.certExpiry ?? "unknown")} (${days}d)`,
        expectedValue: "issuer valid, key >= 2048-bit, expiry > 30 days",
        status: days <= 30 ? "WARNING" : "PASS",
        source: "Certificate metadata (X.509) evidence",
        confidence: 0.99,
        rawReference: `${host}:x509/pem`,
        detail: { controlId: "CERTOBS-001", issuer, daysToExpiry: days, keySize: asset.technology.includes("2048") ? 2048 : 256, signatureAlgorithm: "sha256WithRSAEncryption", capability: "CERTIFICATES" },
      });
      rows.push({
        controlId: "TLSCOMP-001",
        evidenceType: "TLS",
        observedValue: asset.technology.includes("RSA 2048") ? "tlsCompatibility=EECDH+AESGCM on TLS 1.2/1.3" : "tlsCompatibility=EECDH+AESGCM on TLS 1.3",
        expectedValue: "TLS 1.2+ compatible cipher stack",
        status: "PASS",
        source: "TLS compatibility scan evidence",
        confidence: 0.96,
        rawReference: `${host}:tls/scan-result`,
        detail: { controlId: "TLSCOMP-001", capability: "TLS" },
      });
      break;
    }
    case "MESSAGE_QUEUE": {
      const auth = s.mqAuthRequired === true || s.mqAuthRequired === "true";
      const tls = s.mqTlsEnabled === true || s.mqTlsEnabled === "true";
      rows.push({
        controlId: "MQACL-001",
        evidenceType: "CONFIGURATION",
        observedValue: `anonymous=${auth ? "denied" : "permitted"} tls=${tls ? "mandatory" : "disabled"}`,
        expectedValue: "anonymous access denied; TLS mandatory",
        status: auth && tls ? "PASS" : "WARNING",
        source: "Broker security metadata evidence",
        confidence: 0.97,
        rawReference: `${host}:broker/policy`,
        detail: { controlId: "MQACL-001", mqAuthRequired: auth, mqTlsEnabled: tls, capability: "ACCESS_CONTROLS" },
      });
      break;
    }
    case "API":
    case "APPLICATION":
    case "LOAD_BALANCER": {
      const auth = s.apiAuthEnabled === true || s.apiAuthEnabled === "true";
      rows.push({
        controlId: "EP-001",
        evidenceType: "API_RESPONSE",
        observedValue: `endpoints=[/health, /v1/orders] auth=${auth ? "enforced" : "open"} rateLimit=${s.apiRateLimit ?? "n/a"}`,
        expectedValue: "endpoints authenticated and rate-limited",
        status: auth ? "PASS" : "WARNING",
        source: "API gateway endpoint inventory evidence",
        confidence: 0.97,
        rawReference: `${host}:api/routes`,
        detail: { controlId: "EP-001", apiAuthEnabled: auth, capability: "ENDPOINTS" },
      });
      rows.push({
        controlId: "HDR-001",
        evidenceType: "HTTP_HEADER",
        observedValue: "headers=[HSTS, X-Content-Type-Options, CSP]",
        expectedValue: "security headers present on responses",
        status: "PASS",
        source: "HTTP response header scan evidence",
        confidence: 0.95,
        rawReference: `${host}:http/headers`,
        detail: { controlId: "HDR-001", capability: "SECURITY_HEADERS" },
      });
      break;
    }
    default:
      break;
  }

  rows.push({
    controlId: "COLINT-001",
    evidenceType: "INTEGRITY",
    observedValue: "collector=trusted; canonical payloads sha256-verified",
    expectedValue: "evidence integrity hash valid at collection time",
    status: "PASS",
    source: "Collection integrity chain evidence",
    confidence: 0.99,
    rawReference: `${host}:integrity/collector`,
    detail: { controlId: "COLINT-001", integrity: "sha256", capability: "INTEGRITY" },
  });

  return rows;
}

/**
 * RAW evidence emitted by the simulated connector for one managed asset.
 * Control rows are evaluated against the observed state so that normalized
 * evidence is the single source the compliance engine reads; advisory rows
 * exercise the connector's declared capabilities for the asset class.
 */
export function collectRawEvidence(asset: AssetRecord, _connector: ConnectorRecord): NormalizedEvidenceInput[] {
  const network = networkMetadataFor(asset);
  const rows: NormalizedEvidenceInput[] = [];
  for (const control of getAssetControls()) {
    const row = evalRow(asset, control.id, network);
    if (row) rows.push(row);
  }
  rows.push(...advisoryRows(asset, network));
  return rows;
}

/**
 * NORMALIZATION: raw connector output → persisted normalized evidence. Every
 * row is re-typed, re-scoped to the asset + control, given a collector and a
 * real SHA-256 over its canonical payload, and enriched with the network-tier
 * metadata (source/destination/protocol/port/translation/proxy) the model
 * represents.
 */
/**
 * Legacy guard: re-derives the SHA-256 integrity for stored evidence records
 * whose hash predates the normalization engine (e.g. older catalog rows with
 * truncated hashes). Deterministic and idempotent — scan-produced records
 * already hash their own canonical payload and are returned untouched.
 */
export function upgradeStoredEvidenceIntegrity(records: EvidenceRecord[]) {
  let upgraded = 0;
  const result = records.map((record) => {
    const canonical = canonicalEvidencePayload({ assetId: record.assetId, controlId: record.controlId, observedValue: record.observedValue, timestamp: record.timestamp });
    const hash = sha256Hex(canonical);
    if (record.integrityHash === hash && record.detail?.canonical === canonical) return record;
    upgraded += 1;
    return {
      ...record,
      integrityHash: hash,
      detail: { ...(record.detail ?? {}), integrity: "sha256", canonical },
    };
  });
  return { records: result, upgraded };
}

export function normalizeEvidence(
  raw: NormalizedEvidenceInput[],
  asset: AssetRecord,
  connector: ConnectorRecord,
  scanId: string,
  timestamp: string,
  makeId: (prefix: string) => string,
): EvidenceRecord[] {
  return raw.map((row, index) => {
    const id = makeId("evidence");
    return {
      id,
      evidenceId: `evidence-${scanId}-${row.controlId}`,
      assetId: asset.id,
      controlId: row.controlId,
      scanId,
      source: row.source,
      observedValue: row.observedValue,
      expectedValue: row.expectedValue,
      evidenceType: row.evidenceType,
      timestamp,
      status: row.status,
      rawReference: row.rawReference,
      confidence: row.confidence,
      integrityHash: evidenceIntegrityHash({ assetId: asset.id, controlId: row.controlId, observedValue: row.observedValue, timestamp }),
      collector: connector.name,
      simulated: true,
      detail: {
        ...(row.detail ?? {}),
        collector: connector.id,
        connectorVersion: connector.version,
        transport: connector.transportType ?? "SIMULATED",
        protocol: connector.protocol,
        network: row.network,
        evidenceType: row.evidenceType,
        integrity: "sha256",
        canonical: canonicalEvidencePayload({ assetId: asset.id, controlId: row.controlId, observedValue: row.observedValue, timestamp }),
        index,
      },
    };
  });
}