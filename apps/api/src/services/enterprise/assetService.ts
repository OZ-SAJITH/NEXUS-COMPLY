import type {
  AssetConnectorProfile,
  AssetControlCatalogue,
  AssetControlFramework,
  AssetFinding,
  AssetImpactGraph,
  AssetRecord,
  AssetScanRecord,
  ConnectorTestResult,
  EvidenceRecord,
  EvidenceWithVerification,
  FindingStatus,
} from "@nexus/shared-types";
import {
  assetRelationships,
  buildImpactGraph,
  collectRawEvidence,
  evaluateAssetControl,
  explainableRisk,
  getAssetControlById,
  getAssetControls,
  knownEstateRecords,
  matureEstate,
  modelConnectorLatency,
  normalizeEvidence,
  REGIONS,
  riskBandFromScore,
  runDiscovery,
  TIERS,
  topologyConnections,
  verifyEvidenceRecord,
} from "@nexus/enterprise-catalog";
import type { EvalOutcome } from "@nexus/enterprise-catalog";
import { ApiError } from "../reviewService";
import { JsonRepository } from "../../storage/jsonRepo";
import { uniqueId } from "../../utils/helpers";
import type { ConnectorManager } from "./connectorManager";
import { logEnterpriseEvent, simulatedDelay } from "./events";

// ---------------------------------------------------------------------------
// Asset service — simulated enterprise discovery, scanning, evidence and
// impact. Runs against the controlled SIMULATED catalog: honesty is preserved
// by labelling every artefact as simulated and never claiming production
// execution.
// ---------------------------------------------------------------------------

const PROTOCOL_HINT: Record<string, string | undefined> = {
  "TLS-001": "https",
  "PKI-002": "https",
  "PROTO-003": "http",
  "CRYPTO-004": "https",
  "DBENC-005": "postgres",
  "DBEX-006": "postgres",
  "MQ-016": "amqp",
};

export function reevaluateControl(controlId: string, asset: AssetRecord): EvalOutcome | undefined {
  const control = getAssetControlById(controlId);
  if (!control) return undefined;
  return evaluateAssetControl(control, asset);
}

export interface Instantiation {
  manager: ConnectorManager;
  repo: JsonRepository;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export async function ensureAssets(ctx: Instantiation): Promise<AssetRecord[]> {
  const existing = await ctx.repo.allAssets();
  if (existing.length > 0) return existing;
  await ctx.repo.saveAssets(knownEstateRecords(assetRelationships()));
  return ctx.repo.allAssets();
}

export async function discoverAssets(ctx: Instantiation): Promise<{
  result: ReturnType<typeof runDiscovery>;
  assets: AssetRecord[];
}> {
  await ctx.manager.ensureSeeded();
  const current = await ensureAssets(ctx);
  const result = runDiscovery(current);
  const immature = result.assets.filter((a) => a.discoveryStatus === "DISCOVERED");
  let assets = result.assets;
  if (immature.length > 0) {
    const byId = new Map(result.assets.map((a) => [a.id, a]));
    for (const a of matureEstate(immature)) byId.set(a.id, a);
    assets = [...byId.values()];
  }
  await ctx.repo.saveAssets(assets);
  for (const note of result.notes) {
    const name = note.split(" ")[1] ?? "";
    const discovered = note.startsWith("Discovered");
    await logEnterpriseEvent({
      eventType: discovered ? "ASSET_DISCOVERED" : "ASSET_UPDATED",
      entityType: "asset",
      entityId: result.assets.find((a) => a.name === name)?.id ?? "",
      source: "system",
      detail: { message: note, runId: result.runId },
    });
  }
  return { result, assets };
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

/**
 * Scans one asset and returns a full scan record with normalized evidence,
 * asset-aware control evaluations, findings and explainable risk.
 */
export async function scanAsset(ctx: Instantiation, assetId: string, opts: { trigger?: "manual" | "auto_verify" | "scheduled" } = {}): Promise<AssetScanRecord> {
  const trigger = opts.trigger ?? "manual";
  const asset = await ctx.repo.getAsset(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");
  const startedAt = new Date().toISOString();

  const connector = await ctx.manager.bestConnectorFor(asset.assetType, asset.vendor);
  if (!connector) {
    const failedScan: AssetScanRecord = {
      id: uniqueId("scan"),
      assetId,
      assetName: asset.name,
      connectorType: asset.connectorType,
      environment: asset.environment,
      status: "ERROR",
      startedAt,
      findings: [],
      risk: null,
      compliance: null,
      evidenceIds: [],
      trigger,
      error: "No ONLINE connector is available to scan this asset. Resolve connector connectivity and retry the scan.",
    };
    await ctx.repo.saveAssetScan(failedScan);
    return failedScan;
  }

  await simulatedDelay(280);

  const scanId = uniqueId("scan");
  const now = new Date().toISOString();
  const controls = getAssetControls();

  // PHASE 2 pipeline: connector collection → normalization → compliance eval.
  // The connector adapter emits RAW evidence for the managed asset; the
  // normalizer re-types, re-scopes and SHA-256-hashes it. The compliance
  // engine consumes only normalized evidence.
  const raw = collectRawEvidence(asset, connector);
  const evidenceList = normalizeEvidence(raw, asset, connector, scanId, now, (prefix) => uniqueId(prefix));

  const findings: AssetFinding[] = [];
  const counts = { passed: 0, failed: 0, warnings: 0, na: 0 };

  for (const control of controls) {
    const evidence = evidenceList.find((e) => e.controlId === control.id);
    if (!evidence) {
      counts.na += 1;
      continue;
    }
    if (evidence.status === "PASS") {
      counts.passed += 1;
      continue;
    }
    if (evidence.status === "WARNING") {
      counts.warnings += 1;
      const evalOutcome = evaluateAssetControl(control, asset);
      findings.push(buildFinding(asset, control.id, evalOutcome, evidence));
      continue;
    }
    counts.failed += 1;
    const evalOutcome = evaluateAssetControl(control, asset);
    findings.push(buildFinding(asset, control.id, evalOutcome, evidence));
  }

  for (const f of findings) {
    const ev = evidenceList.find((e) => e.controlId === f.controlId);
    if (ev) {
      f.evidenceIds = [ev.id];
      ev.findingId = f.id;
    }
  }

  const passed = counts.passed;
  const failed = counts.failed;
  const warnings = counts.warnings;
  const na = counts.na;
  const evaluated = passed + failed + warnings;
  const score = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 100;
  const riskScore = findings.length ? Math.max(...findings.map((f) => f.risk)) : 0;
  const riskBand = riskBandFromScore(riskScore);

  const scan: AssetScanRecord = {
    id: scanId,
    assetId,
    assetName: asset.name,
    connectorType: connector.type,
    environment: asset.environment,
    status: "COMPLETED",
    startedAt,
    completedAt: now,
    findings,
    risk: {
      id: uniqueId("risk"),
      auditId: asset.id,
      overallScore: riskScore,
      severityFactor: 0,
      exposureFactor: 0,
      criticalityFactor: 0,
      controlImportanceFactor: 0,
      exploitabilityFactor: 0,
      explanation: riskBand === "CRITICAL" ? "CRITICAL asset exposure detected — immediate remediation recommended." : `${riskBand} residual risk.`,
      findings: findings.slice(0, 6).map((f) => `${f.controlId}: ${f.what}`),
    },
    compliance: { passed, failed, warnings, na, score },
    evidenceIds: evidenceList.map((e) => e.id),
    trigger,
  };

  await ctx.repo.saveEvidenceBatch(evidenceList);
  await ctx.repo.saveAssetScan(scan);

  asset.lastScannedAt = now;
  asset.complianceStatus = failed > 0 ? "FAIL" : warnings > 0 ? "WARNING" : "PASS";
  asset.complianceScore = score;
  asset.riskScore = riskScore;
  asset.riskBand = riskBand;
  asset.status = "SCANNABLE";
  asset.discoveryStatus = "SCANNABLE";
  asset.history.push({
    at: now,
    action: `Scan ${scanId} via ${connector.name} — ${failed} failed, ${warnings} warnings`,
    actor: connector.name,
  });
  await ctx.repo.saveAsset(asset);

  await logEnterpriseEvent({
    eventType: "ASSET_SCANNED",
    entityType: "asset",
    entityId: asset.id,
    auditId: asset.id,
    controlId: undefined,
    source: trigger === "auto_verify" ? "system" : "human",
    detail: { scanId, connector: connector.name, findings: findings.length, failed, warnings, score },
  });
  for (const f of findings) {
    await logEnterpriseEvent({
      eventType: "EVIDENCE_COLLECTED",
      entityType: "evidence",
      entityId: f.evidenceIds[0] ?? "",
      findingId: f.id,
      auditId: asset.id,
      controlId: f.controlId,
      source: "system",
      detail: { scanId, controlId: f.controlId, status: f.status, riskScore: f.risk },
    });
  }

  return scan;
}

function buildFinding(asset: AssetRecord, controlId: string, evalOutcome: EvalOutcome, evidence: EvidenceRecord): AssetFinding {
  const control = getAssetControlById(controlId)!;
  const riskExplanation = explainableRisk(asset, control.severity, {
    evidence: [String(evalOutcome.observedValue), control.description],
    protocol: PROTOCOL_HINT[controlId],
  });
  return {
    id: uniqueId("af"),
    auditId: asset.id,
    controlId: control.id,
    controlName: control.name,
    severity: control.severity,
    status: evalOutcome.status as FindingStatus,
    what: control.name,
    why: evalOutcome.reason || control.failureMessage,
    where: `${asset.hostname} (${asset.ipAddress}) — ${asset.siteLabel}`,
    risk: evalOutcome.status === "FAIL" ? riskExplanation.score : Math.max(20, Math.round(riskExplanation.score / 2)),
    impact: `Impact on ${asset.name} cascades to dependent services; see the asset impact graph.`,
    recommendedFix: control.remediation,
    evidence: [
      {
        file: evidence.rawReference,
        lineStart: 0,
        lineEnd: 0,
        snippet: `observed=${evidence.observedValue} expected=${evidence.expectedValue}`,
        reason: evidence.rawReference,
      },
    ],
    references: { controlId: control.id },
    assetId: asset.id,
    evidenceIds: [evidence.id],
    assetType: asset.assetType,
    location: asset.location,
    riskExplanation,
  };
}

// ---------------------------------------------------------------------------
// Detail helpers
// ---------------------------------------------------------------------------

export async function assetEvidence(ctx: Instantiation, assetId: string): Promise<EvidenceRecord[]> {
  const asset = await ctx.repo.getAsset(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");
  return ctx.repo.evidenceForAsset(assetId);
}

export async function assetScans(ctx: Instantiation, assetId: string): Promise<AssetScanRecord[]> {
  await requireAsset(ctx, assetId);
  return ctx.repo.scansForAsset(assetId);
}

// ---------------------------------------------------------------------------
// PHASE 2 — connector profile + connection test + evidence integrity
// ---------------------------------------------------------------------------

/**
 * Connector profile for one managed asset: the best-fit adapter (by vendor +
 * asset type), its transport/wire protocol, declared capabilities and last
 * measured latency. `online` reflects the connector's live status — a scan is
 * only possible while the connector is ONLINE.
 */
export async function assetConnectorProfile(ctx: Instantiation, assetId: string): Promise<AssetConnectorProfile> {
  const asset = await requireAsset(ctx, assetId);
  const connector = await ctx.manager.bestConnectorFor(asset.assetType, asset.vendor);
  if (!connector) {
    return { assetId: asset.id, assetName: asset.name, online: false, latencyMs: 0, fromCapabilities: [] };
  }
  return {
    assetId: asset.id,
    assetName: asset.name,
    online: connector.status === "ONLINE",
    connector,
    latencyMs: connector.latencyMs ?? modelConnectorLatency(connector),
    fromCapabilities: connector.capabilities ?? [],
  };
}

/**
 * Test connection to the asset's managing connector: pushes the adapter
 * through its own connection routine. In the controlled simulation a
 * successful test transitions the connector to ONLINE so scans become possible.
 */
export async function testAssetConnector(ctx: Instantiation, assetId: string): Promise<ConnectorTestResult> {
  const asset = await requireAsset(ctx, assetId);
  const connector = await ctx.manager.bestConnectorFor(asset.assetType, asset.vendor);
  const at = new Date().toISOString();
  if (!connector) {
    return {
      ok: false,
      connectorId: "",
      connector: "None",
      vendor: "",
      status: "OFFLINE",
      latencyMs: 0,
      connectorVersion: "",
      capabilities: [],
      at,
    };
  }
  const online = connector.status === "ONLINE" || (await ctx.manager.testConnection(connector.id)).status === "ONLINE";
  return {
    ok: online,
    connectorId: connector.id,
    connector: connector.name,
    vendor: connector.vendor,
    protocol: connector.protocol,
    transportType: connector.transportType,
    status: connector.status === "ONLINE" ? "ONLINE" : "OFFLINE",
    latencyMs: online ? connector.latencyMs ?? modelConnectorLatency(connector) : 0,
    connectorVersion: connector.version,
    capabilities: connector.capabilities ?? [],
    at,
  };
}

/**
 * Evidence detail with a re-computed SHA-256 integrity verification. The
 * canonical payload embedded at collection time is re-hashed and compared — the
 * verified flag is derived, never stored.
 */
export async function evidenceDetail(ctx: Instantiation, assetId: string, evidenceId: string): Promise<EvidenceWithVerification> {
  await requireAsset(ctx, assetId);
  const record = await ctx.repo.getEvidence(evidenceId);
  if (!record || record.assetId !== assetId) throw new ApiError(404, "Evidence not found");
  return { ...record, verification: verifyEvidenceRecord(record) };
}

export async function assetFindings(ctx: Instantiation, assetId: string): Promise<AssetFinding[]> {
  const asset = await requireAsset(ctx, assetId);
  const scans = (await ctx.repo.scansForAsset(assetId))
    .filter((s): s is AssetScanRecord & { completedAt: string } => s.status === "COMPLETED" && s.findings.length > 0 && typeof s.completedAt === "string")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  if (scans.length === 0) return [];
  const latest = scans[0];
  return latest.findings.map((f) => ({ ...f, assetId: asset.id, assetType: asset.assetType, location: asset.location }));
}

export async function assetImpact(ctx: Instantiation, assetId: string): Promise<AssetImpactGraph> {
  const asset = await requireAsset(ctx, assetId);
  return buildImpactGraph(asset, await ctx.repo.allAssets());
}

async function requireAsset(ctx: Instantiation, assetId: string): Promise<AssetRecord> {
  const asset = await ctx.repo.getAsset(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");
  return asset;
}

export async function findAssetFinding(ctx: Instantiation, findingId: string): Promise<{ finding: AssetFinding; asset: AssetRecord; scan: AssetScanRecord }> {
  const scans = await ctx.repo.allAssetScans();
  for (const scan of scans) {
    const f = scan.findings.find((x) => x.id === findingId);
    if (f) {
      const asset = await ctx.repo.getAsset(scan.assetId);
      if (!asset) throw new ApiError(404, "Asset not found");
      return { finding: f, asset, scan };
    }
  }
  throw new ApiError(404, "Finding not found");
}

export async function assetControlCatalogue(ctx: Instantiation): Promise<AssetControlCatalogue> {
  await ensureAssets(ctx);
  const controls = getAssetControls();
  const frameworkIds: AssetControlFramework[] = ["ISO27001", "NIST", "CIS", "PCI_DSS", "OWASP", "PROTOTYPE"];
  const frameworks: Array<{ framework: AssetControlFramework; label: string; totalControls: number; passed: number; failed: number; score: number; status: "COMPLIANT" | "PARTIAL" | "AT_RISK" | "NOT_ASSESSED" }> = frameworkIds.map((framework) => {
    const inScope = controls.filter((c) => c.frameworks.includes(framework));
    return {
      framework,
      label: frameworkLabel(framework),
      totalControls: inScope.length,
      passed: 0,
      failed: 0,
      score: 0,
      status: "NOT_ASSESSED",
    };
  });

  const assets = await ctx.repo.allAssets();
  for (const asset of assets) {
    const scans = await ctx.repo.scansForAsset(asset.id);
    const latest = scans[0];
    if (!latest) continue;
    for (const f of latest.findings) {
      const control = getAssetControlById(f.controlId);
      if (!control) continue;
      for (const framework of control.frameworks) {
        const entry = frameworks.find((x) => x.framework === framework);
        if (!entry) continue;
        if (f.status === "PASS" || f.status === "NOT_APPLICABLE") entry.passed += 1;
        else entry.failed += 1;
      }
    }
  }
  for (const entry of frameworks) {
    if (entry.passed + entry.failed === 0) {
      entry.status = "NOT_ASSESSED";
      entry.score = 0;
    } else {
      entry.score = Math.round((entry.passed / (entry.passed + entry.failed)) * 100);
      entry.status = entry.score >= 80 ? "COMPLIANT" : entry.score >= 50 ? "PARTIAL" : "AT_RISK";
    }
  }

  return {
    controls,
    frameworks,
    disclaimer: "Simulated evaluation against the controlled enterprise catalog. Results are deterministic and evidence-grounded.",
    generatedAt: new Date().toISOString(),
  };
}

function frameworkLabel(framework: AssetControlFramework): string {
  const map: Record<AssetControlFramework, string> = {
    ISO27001: "ISO/IEC 27001",
    NIST: "NIST CSF",
    CIS: "CIS Controls",
    PCI_DSS: "PCI DSS",
    OWASP: "OWASP ASVS",
    PROTOTYPE: "Prototype Controls",
  };
  return map[framework];
}

export function unknownAssetWarning(): string {
  return "Asset discovery and scanning operate against the SIMULATED enterprise catalog — no production system is contacted.";
}

// Re-exports used by the enterprise router / dashboard.
export { REGIONS as ENTERPRISE_REGIONS, TIERS as ENTERPRISE_TIERS, topologyConnections as enterpriseTopologyConnections };