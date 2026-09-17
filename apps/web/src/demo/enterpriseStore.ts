import type {
  AiProviderMode,
  ApplicableControlsResult,
  AssetConnectorProfile,
  AssetFinding,
  AssetRecord,
  AssetScanRecord,
  AuditEventRecord,
  ComplianceFramework2,
  ComplianceSummary,
  ConnectorRecord,
  ConnectorTestResult,
  EvidenceRecord,
  EvidenceWithVerification,
  FindingAnalysis,
  FindingLifecycle,
  GovernanceDecisionTrace,
  GovernanceException,
  GovernanceExceptionDecision,
  GovernanceExceptionRequest,
  OrganizationBaseline,
  PolicyProfile,
  PolicySelection,
  RemediationExecutionLogEntry,
  RemediationRecord,
  UserRole,
} from "@nexus/shared-types";
import {
  CRITICALITY_WEIGHT,
  REGIONS,
  TIERS,
  applyRemediationAction,
  assetRelationships,
  buildImpactGraph,
  buildProposal,
  canTransition,
  collectRawEvidence,
  connectorForAsset,
  connectorTypeForAsset,
  evaluateAssetControl,
  evaluateEvidenceForAsset,
  evidenceIntegrityHash,
  evidenceTypeForControlId,
  explainableRisk,
  exploitabilityWeightOf,
  exposureWeightOfAsset,
  findingsFromResults,
  getAssetControlById,
  getAssetControls,
  knownEstateRecords,
  modelConnectorLatency,
  normalizeEvidence,
  probeConnectorStatus,
  riskBandFromScore,
  runDiscovery,
  matureEstate,
  seededConnectors,
  topologyConnections,
  verifyEvidenceRecord,
  COMPLIANCE_FRAMEWORKS,
  POLICY_PROFILES,
  DEFAULT_ORGANIZATION_BASELINE,
  controlFrameworkMappings,
  selectPolicyForAsset,
  applicableControlsForAsset,
  buildGovernanceTrace,
  computeRegionalPosture,
  computeFrameworkPosture,
} from "@nexus/enterprise-catalog";

const STORAGE_KEY = "nexus-enterprise-v1";

export interface EnterpriseDemoError {
  status: number;
  message: string;
}

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status }) as EnterpriseDemoError;
}

interface Persisted {
  assets: AssetRecord[];
  connectors: ConnectorRecord[];
  evidence: EvidenceRecord[];
  assetScans: AssetScanRecord[];
  remediations: RemediationRecord[];
  analyses: FindingAnalysis[];
  events: AuditEventRecord[];
  governanceExceptions: GovernanceException[];
  organizationBaseline: OrganizationBaseline;
}

let uidCounter = 0;
let persisted: Persisted;

/**
 * Scan → normalized evidence cache so `evidenceForScan` returns exactly the
 * lists runScan produced (matching scan.evidenceIds). Async/await mirror of the
 * API path: connector collection → normalization → persistence.
 */
const evidenceByScan = new Map<string, EvidenceRecord[]>();

function init(): Persisted {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParse(raw) : undefined;
  persisted = parsed ?? seed();
  if (!persisted.governanceExceptions) persisted.governanceExceptions = [];
  if (!persisted.organizationBaseline) persisted.organizationBaseline = DEFAULT_ORGANIZATION_BASELINE;
  if (parsed) {
    const byId = new Map(persisted.connectors.map((c) => [c.id, c]));
    let added = false;
    for (const seed of seededConnectors()) {
      if (!byId.has(seed.id)) {
        byId.set(seed.id, seed);
        added = true;
      }
    }
    if (added) persisted.connectors = [...byId.values()];
  }
  const immature = persisted.assets.filter((a) => a.discoveryStatus === "DISCOVERED");
  if (immature.length > 0) {
    const byId = new Map(persisted.assets.map((a) => [a.id, a]));
    for (const a of matureEstate(immature)) byId.set(a.id, a);
    persisted.assets = [...byId.values()];
    persist();
  }
  return persisted;
}

function safeParse(raw: string): Persisted | undefined {
  try {
    const p = JSON.parse(raw) as Persisted;
    if (Array.isArray(p.assets) && Array.isArray(p.connectors)) return p;
    return undefined;
  } catch {
    return undefined;
  }
}

function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${uidCounter}_${Date.now().toString(36)}`;
}

const ACTOR = { id: "user.demo", name: "Demo Operator", role: "security_architect" as UserRole };

// ---------------------------------------------------------------------------
// Seed — mirror of backend seedEnterpriseIfEmpty: deterministic connectors +
// discovered assets. The hero scan + planned remediation pre-stage the closed
// loop so the demo opens with TLS-001 CRITICAL already actionable.
// ---------------------------------------------------------------------------

function seed(): Persisted {
  // Authored seed statuses are retained so the demo is reproducible at any time
  // of day; live connector probing happens only via the explicit
  // probeConnectors()/testConnector() flows (matches localStorage-persisted state).
  const connectors: ConnectorRecord[] = seededConnectors().map((c) => ({
    ...c,
    lastContactAt: c.status === "ONLINE" ? new Date().toISOString() : undefined,
  }));

  // Seeds the KNOWN (managed) estate only. The spec's 14-asset regional wave is
  // intentionally NOT pre-created: the first "Discover Assets" click genuinely
  // discovers it, and re-runs are idempotent.
  const discovered = matureEstate(knownEstateRecords(assetRelationships()));
  const state: Persisted = { assets: discovered, connectors, evidence: [], assetScans: [], remediations: [], analyses: [], events: [], governanceExceptions: [], organizationBaseline: DEFAULT_ORGANIZATION_BASELINE };
  const hero = state.assets.find((a) => a.id.startsWith("ast-api-gateway-01"));
  if (!hero) return state;

  const scan = runScan(state, hero.id, "scheduled");
  state.assetScans.push(scan);
  const evidence = evidenceForScan(state, scan);
  state.evidence.push(...evidence);
  for (const e of evidence) {
    logEvent(state, makeEvent("EVIDENCE_COLLECTED", "evidence", e.id, e.assetId, e.controlId, e.findingId, "system", { source: e.source, status: e.status, hash: e.integrityHash }));
  }
  logEvent(state, makeEvent("ASSET_SCANNED", "asset", scan.id, scan.assetId, undefined, undefined, "system", { findings: scan.findings.length, trigger: "scheduled" }));

  const heroFinding = scan.findings.find((f) => f.controlId === "TLS-001");
  if (heroFinding) {
    const proposal = buildProposal(heroFinding.controlId, hero.assetType, "Remediate TLS-001 on ast-api-gateway-01.");
    state.remediations.push({
      id: uid("rem"),
      findingId: heroFinding.id,
      assetId: hero.id,
      assetName: hero.name,
      controlId: heroFinding.controlId,
      controlName: heroFinding.controlName,
      title: `${proposal.displayName} — ${hero.name}`,
      reason: proposal.reason,
      riskScore: heroFinding.risk,
      riskBand: heroFinding.riskExplanation?.band ?? riskBandFromScore(heroFinding.risk),
      proposedAction: proposal,
      status: "PLANNED",
      environment: hero.environment,
      auditEventIds: [],
      createdAt: new Date().toISOString(),
    });
    logEvent(state, makeEvent("REMEDIATION_PLANNED", "remediation", state.remediations[0].id, hero.id, heroFinding.controlId, heroFinding.id, "system", { assetName: hero.name, actionType: proposal.actionType, impact: proposal.impact, rollbackAvailable: proposal.rollbackAvailable }));
  }
  return state;
}

persisted = init();

function makeEvent(
  eventType: AuditEventRecord["eventType"],
  entityType: AuditEventRecord["entityType"],
  entityId: string,
  auditId: string,
  controlId: string | undefined,
  findingId: string | undefined,
  source: AuditEventRecord["source"],
  detail: Record<string, unknown>,
  actor?: { id: string; name: string; role: UserRole },
): AuditEventRecord {
  const e: AuditEventRecord = {
    id: uid("evt"),
    eventType,
    entityType,
    entityId,
    auditId,
    controlId,
    findingId,
    source,
    at: new Date().toISOString(),
    detail,
  };
  if (actor) {
    e.actorId = actor.id;
    e.actorName = actor.name;
    e.actorRole = actor.role;
  }
  return e;
}

function logEvent(state: Persisted, e: AuditEventRecord): void {
  state.events.push(e);
  if (state.events.length > 300) state.events = state.events.slice(-200);
}

function mustAsset(state: Persisted, id: string): AssetRecord {
  const a = state.assets.find((x) => x.id === id);
  if (!a) fail(404, "Asset not found");
  return a;
}

function mustConnector(state: Persisted, id: string): ConnectorRecord {
  const c = state.connectors.find((x) => x.id === id);
  if (!c) fail(404, "Connector not found");
  return c;
}

function mustRemediation(state: Persisted, id: string): RemediationRecord {
  const r = state.remediations.find((x) => x.id === id);
  if (!r) fail(404, "Remediation not found");
  return r;
}

function latestScan(state: Persisted, assetId: string): AssetScanRecord | undefined {
  return state.assetScans.filter((s) => s.assetId === assetId).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
}

function findFinding(state: Persisted, findingId: string): { asset: AssetRecord; finding: AssetFinding } {
  for (const a of state.assets) {
    const f = latestScan(state, a.id)?.findings.find((x) => x.id === findingId);
    if (f) return { asset: a, finding: f };
  }
  fail(404, "Finding not found");
}

function applyFindingLifecycle(state: Persisted, findingId: string, lifecycle: FindingLifecycle): AssetFinding {
  for (const a of state.assets) {
    const scan = latestScan(state, a.id);
    const f = scan?.findings.find((x) => x.id === findingId);
    if (f) {
      f.lifecycle = lifecycle;
      return f;
    }
  }
  fail(404, "Finding not found");
}

// ---------------------------------------------------------------------------
// Evaluation helpers (mirror apps/api/src/services/enterprise)
// ---------------------------------------------------------------------------

function evaluateControl(controlId: string, asset: AssetRecord) {
  const control = getAssetControlById(controlId);
  if (!control) return undefined;
  return evaluateAssetControl(control, asset);
}

function riskFor(finding: AssetFinding, asset: AssetRecord): AssetFinding {
  const explained = explainableRisk(asset, finding.severity, {
    evidence: [String(evaluateControl(finding.controlId, asset)?.observedValue ?? ""), String(getAssetControlById(finding.controlId)?.description ?? "")],
  });
  return { ...finding, risk: finding.status === "FAIL" ? explained.score : Math.max(20, Math.round(explained.score / 2)), riskExplanation: explained };
}

function severityAsScore(severity: string): number {
  return severity === "CRITICAL" ? 100 : severity === "HIGH" ? 80 : severity === "MEDIUM" ? 60 : 30;
}

function controlExpected(controlId: string): string | undefined {
  const expected = getAssetControlById(controlId)?.expected;
  return expected === undefined ? undefined : String(expected);
}

/**
 * PHASE 2 pipeline — raw connector collection → normalization. `collectRawEvidence`
 * gathers the managed asset's control rows plus per-asset-class advisory rows
 * (ACL/NAT for firewalls, TLS/users for databases, OS/ports for servers, X.509
 * for certificates, MQ ACLs, API endpoints/headers); `normalizeEvidence` emits
 * SHA-256-hashed normalized records keyed by scan + control + asset.
 */
function collectAndNormalize(asset: AssetRecord, connector: ConnectorRecord, scanId: string): EvidenceRecord[] {
  const raw = collectRawEvidence(asset, connector);
  return normalizeEvidence(raw, asset, connector, scanId, new Date().toISOString(), uid);
}

function evidenceForScan(state: Persisted, scan: AssetScanRecord): EvidenceRecord[] {
  const cached = evidenceByScan.get(scan.id);
  if (cached) return cached;
  const asset = state.assets.find((a) => a.id === scan.assetId);
  const out: EvidenceRecord[] = [];
  if (!asset) return out;
  for (const f of scan.findings) {
    const timestamp = new Date().toISOString();
    const obs = evaluateControl(f.controlId, asset)?.observedValue ?? "-";
    out.push({
      id: uid("evidence"),
      evidenceId: `evidence-${scan.id}-${f.controlId}`,
      assetId: asset.id,
      controlId: f.controlId,
      findingId: f.id,
      scanId: scan.id,
      source: `simulated ${connectorTypeForAsset(asset.assetType)} collector`,
      observedValue: obs,
      expectedValue: controlExpected(f.controlId) ?? "-",
      evidenceType: evidenceTypeForControlId(f.controlId),
      timestamp,
      status: f.status,
      rawReference: `${asset.hostname}:simulated/${f.controlId}`,
      confidence: 0.99,
      integrityHash: evidenceIntegrityHash({ assetId: asset.id, controlId: f.controlId, observedValue: obs, timestamp }),
      collector: "nexus-sim-agent",
      simulated: true,
      detail: { findingSeverity: f.severity, integrity: "sha256" },
    });
  }
  return out;
}

function runScan(state: Persisted, assetId: string, trigger: "manual" | "auto_verify" | "scheduled" = "manual"): AssetScanRecord {
  const asset = mustAsset(state, assetId);
  const connector = connectorForAsset(state.connectors, asset.assetType, asset.vendor);

  const scanId = uid("scan");
  const startedAt = new Date().toISOString();

  if (!connector) {
    return {
      id: scanId,
      assetId: asset.id,
      assetName: asset.name,
      connectorType: connectorTypeForAsset(asset.assetType),
      environment: asset.environment,
      status: "ERROR",
      startedAt,
      completedAt: new Date().toISOString(),
      findings: [],
      evidenceIds: [],
      error: "No ONLINE connector is available for this asset — connect one before scanning.",
    };
  }

  const controls = getAssetControls();
  const ruleResults = evaluateEvidenceForAsset(asset);
  const ruleFindings = findingsFromResults(asset, ruleResults);

  const findings: AssetFinding[] = ruleFindings.map((rf) => {
    const control = getAssetControlById(rf.controlId);
    const finding: AssetFinding = {
      id: uid(`finding-${rf.controlId.toLowerCase()}`),
      auditId: asset.id,
      controlId: rf.controlId,
      controlName: rf.controlName,
      severity: rf.severity,
      status: rf.status,
      what: rf.what,
      why: rf.why,
      where: `${asset.hostname} (${asset.ipAddress}) — ${asset.siteLabel}`,
      risk: 0,
      impact: `Impact on ${asset.name} cascades to dependent services; see the asset impact graph.`,
      recommendedFix: rf.remediationGuidance ?? control?.remediation,
      evidence: [],
      references: { controlId: rf.controlId },
      assetId: asset.id,
      assetType: asset.assetType,
      evidenceIds: [],
      location: asset.location,
      lifecycle: rf.lifecycle,
      observedValue: rf.observedValue,
      expectedValue: rf.expectedValue,
      remediationGuidance: rf.remediationGuidance,
    };
    return riskFor(finding, asset);
  });

  const failing = findings.filter((f) => f.status === "FAIL");
  const warnings = findings.filter((f) => f.status === "WARNING");
  const passed = Math.max(0, ruleResults.filter((r) => r.evaluation.status === "PASS").length);
  const na = Math.max(0, controls.length - ruleResults.length);
  const overallScore = failing.length
    ? Math.min(100, Math.round(Math.max(...failing.map((f) => f.risk)) * 0.8 + (warnings.length ? 8 : 0)))
    : warnings.length
      ? Math.round(Math.max(...warnings.map((f) => f.risk)) * 0.6)
      : 0;
  const severityFactor = failing.length ? Math.round(failing.reduce((s, f) => s + severityAsScore(f.severity), 0) / failing.length) : 0;
  const exposure = exposureWeightOfAsset(asset, "HIGH");
  const exploitability = exploitabilityWeightOf(failing.map((f) => f.controlId));
  const criticality = Math.round((CRITICALITY_WEIGHT[asset.criticality] ?? 50) * 100);

  const evaluated = Math.max(1, passed + failing.length + warnings.length);
  const scan: AssetScanRecord = {
    id: scanId,
    assetId: asset.id,
    assetName: asset.name,
    connectorType: connector.type,
    environment: asset.environment,
    status: "COMPLETED",
    startedAt,
    completedAt: new Date().toISOString(),
    findings,
    risk: {
      id: scanId,
      auditId: asset.id,
      overallScore,
      severityFactor,
      exposureFactor: Math.min(100, Math.round(exposure * 100)),
      criticalityFactor: Math.min(100, criticality),
      controlImportanceFactor: failing.length ? 80 : 20,
      exploitabilityFactor: Math.min(100, Math.round(exploitability * 100)),
      explanation: `Simulated scan found ${failing.length} failing and ${warnings.length} warning control checks on ${asset.name}.`,
      findings: failing.map((f) => f.controlId),
    },
    compliance: {
      passed,
      failed: failing.length,
      warnings: warnings.length,
      na,
      score: Math.round((passed / evaluated) * 100),
    },
    evidenceIds: [],
    trigger,
  };
  // PHASE 2 normalized evidence for this scan: connector collection →
  // normalization (types, confidence, collector, SHA-256 canonical payload).
  const normalized = collectAndNormalize(asset, connector, scanId);
  evidenceByScan.set(scanId, normalized);
  for (const f of findings) {
    const ev = normalized.find((e) => e.controlId === f.controlId);
    if (ev) {
      f.evidenceIds = [ev.id];
      ev.findingId = f.id;
    }
  }
  scan.evidenceIds = normalized.map((e) => e.id);

  asset.lastScannedAt = scan.completedAt;
  asset.complianceStatus = failing.length === 0 ? (warnings.length ? "WARNING" : "PASS") : "FAIL";
  asset.complianceScore = scan.compliance?.score ?? 0;
  asset.riskScore = overallScore;
  asset.riskBand = riskBandFromScore(overallScore);
  asset.history.push({ at: scan.completedAt ?? new Date().toISOString(), action: `Scan ${scanId} via ${connector.name} — ${findings.length} findings`, actor: "system" });

  return scan;
}

// ---------------------------------------------------------------------------
// Store facade — matched by demoApi enterprise handlers
// ---------------------------------------------------------------------------

export const enterpriseDemo = {
  listAssets(): AssetRecord[] {
    return [...persisted.assets].sort((a, b) => a.name.localeCompare(b.name));
  },

  assetById(id: string): AssetRecord | undefined {
    return persisted.assets.find((x) => x.id === id || x.name === id);
  },

  discover(): { assets: AssetRecord[]; discovered: number; updated: number; runId: string } {
    const result = runDiscovery(persisted.assets);
    const immature = result.assets.filter((a) => a.discoveryStatus === "DISCOVERED");
    const byId = new Map(result.assets.map((a) => [a.id, a]));
    for (const a of matureEstate(immature)) byId.set(a.id, a);
    persisted.assets = [...byId.values()];
    for (const a of immature) {
      logEvent(persisted, makeEvent("ASSET_DISCOVERED", "asset", a.id, a.id, undefined, undefined, "system", { stage: a.discoveryStatus, source: "simulated network sweep" }));
    }
    if (result.updated > 0) {
      logEvent(persisted, makeEvent("ASSET_UPDATED", "asset", "discovery", "discovery", undefined, undefined, "system", { updated: result.updated }));
    }
    persist();
    return { assets: persisted.assets, discovered: result.discovered, updated: result.updated, runId: result.runId };
  },

  scan(assetId: string, trigger: "manual" | "auto_verify" | "scheduled" = "manual"): AssetScanRecord {
    const asset = mustAsset(persisted, assetId);
    const scan = runScan(persisted, assetId, trigger);
    persisted.assetScans.push(scan);
    const evidence = evidenceForScan(persisted, scan);
    persisted.evidence.push(...evidence);
    for (const e of evidence) {
      logEvent(persisted, makeEvent("EVIDENCE_COLLECTED", "evidence", e.id, e.assetId, e.controlId, e.findingId, "system", { source: e.source, status: e.status, hash: e.integrityHash }));
    }
    if (scan.status === "COMPLETED") {
      logEvent(persisted, makeEvent("ASSET_SCANNED", "asset", scan.id, scan.assetId, undefined, undefined, "system", { findings: scan.findings.length, riskScore: scan.risk?.overallScore, trigger: scan.trigger }));
      asset.complianceStatus = scan.findings.some((f) => f.status === "FAIL") ? "FAIL" : scan.findings.some((f) => f.status === "WARNING") ? "WARNING" : "PASS";
      asset.complianceScore = scan.compliance?.score ?? 100;
      asset.riskScore = scan.risk?.overallScore ?? 0;
      asset.riskBand = scan.risk ? riskBandFromScore(scan.risk.overallScore) : "LOW";
    }
    persist();
    return scan;
  },

  latestScan(assetId: string): AssetScanRecord | undefined {
    return latestScan(persisted, assetId);
  },

  assetFindings(assetId: string): AssetFinding[] {
    const asset = mustAsset(persisted, assetId);
    return (latestScan(persisted, assetId)?.findings ?? []).map((f) => ({ ...f, assetId: asset.id, assetType: asset.assetType, location: asset.location }));
  },

  setFindingLifecycle(assetId: string, findingId: string, lifecycle: "ACKNOWLEDGED" | "EXCEPTED" | "OPEN", reason?: string): AssetFinding {
    mustAsset(persisted, assetId);
    const finding = applyFindingLifecycle(persisted, findingId, lifecycle);
    logEvent(persisted, makeEvent("FINDING_LIFECYCLE_CHANGED", "finding", findingId, assetId, finding.controlId, findingId, "human", { lifecycle, reason: reason ?? null }, ACTOR));
    persist();
    return finding;
  },

  complianceSummary(): ComplianceSummary {
    const totals = { passed: 0, failed: 0, warnings: 0, na: 0 };
    const byCategoryMap = new Map<string, { passed: number; failed: number; warnings: number }>();
    const bySeverityMap = new Map<string, number>();
    const lifecycleMap = new Map<string, number>();
    const controlResults = new Map<string, Array<{ controlId: string; status: import("@nexus/shared-types").FindingStatus }>>();
    const latestFindings = new Map<string, AssetFinding[]>();
    let evaluated = 0;
    for (const asset of persisted.assets) {
      const results = evaluateEvidenceForAsset(asset);
      evaluated += results.length;
      const passed = results.filter((r) => r.evaluation.status === "PASS").length;
      const failed = results.filter((r) => r.evaluation.status === "FAIL").length;
      const warnings = results.filter((r) => r.evaluation.status === "WARNING").length;
      totals.passed += passed;
      totals.failed += failed;
      totals.warnings += warnings;
      const assetResults = controlResults.get(asset.id) ?? [];
      for (const r of results) {
        assetResults.push({ controlId: r.ruleId, status: r.evaluation.status });
        const c = byCategoryMap.get(r.category) ?? { passed: 0, failed: 0, warnings: 0 };
        if (r.evaluation.status === "PASS") c.passed += 1;
        else if (r.evaluation.status === "FAIL") c.failed += 1;
        else if (r.evaluation.status === "WARNING") c.warnings += 1;
        byCategoryMap.set(r.category, c);
      }
      controlResults.set(asset.id, assetResults);
      const scan = latestScan(persisted, asset.id);
      const assetFindings = scan?.findings ?? [];
      latestFindings.set(asset.id, assetFindings.map((f) => ({ ...f, assetId: asset.id, assetType: asset.assetType, location: asset.location })));
      for (const f of assetFindings) {
        if (f.status === "FAIL" || f.status === "WARNING") {
          bySeverityMap.set(f.severity, (bySeverityMap.get(f.severity) ?? 0) + 1);
        }
        const lc = f.lifecycle ?? "OPEN";
        lifecycleMap.set(lc, (lifecycleMap.get(lc) ?? 0) + 1);
      }
    }
    totals.na = Math.max(0, persisted.assets.length * getAssetControls().length - evaluated);
    const score = Math.round(evaluated ? (totals.passed / Math.max(1, totals.passed + totals.failed + totals.warnings)) * 100 : 0);
    return {
      total: totals.passed + totals.failed + totals.warnings + totals.na,
      passed: totals.passed,
      failed: totals.failed,
      warnings: totals.warnings,
      na: totals.na,
      score,
      byCategory: [...byCategoryMap.entries()].map(([category, v]) => ({ category, ...v })),
      bySeverity: [...bySeverityMap.entries()].map(([severity, count]) => ({ severity: severity as AssetFinding["severity"], count })),
      lifecycleBreakdown: [...lifecycleMap.entries()].map(([lifecycle, count]) => ({ lifecycle: lifecycle as FindingLifecycle, count })),
      byRegion: computeRegionalPosture(persisted.assets, controlResults),
      byFramework: computeFrameworkPosture(persisted.assets, (id) => latestFindings.get(id) ?? []),
      generatedAt: new Date().toISOString(),
    };
  },

  assetEvidence(assetId: string): EvidenceRecord[] {
    return persisted.evidence.filter((e) => e.assetId === assetId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  },

  assetScans(assetId: string): AssetScanRecord[] {
    return persisted.assetScans.filter((s) => s.assetId === assetId).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  },

  assetImpact(assetId: string) {
    const asset = mustAsset(persisted, assetId);
    return buildImpactGraph(asset, persisted.assets);
  },

  topology() {
    return {
      regions: REGIONS.map((r) => ({
        ...r,
        sites: (r.sites ?? []).map((s) => ({ ...s, assets: persisted.assets.filter((a) => a.location.site === s.id).length })),
      })),
      tiers: TIERS,
      connections: topologyConnections(),
      generatedAt: new Date().toISOString(),
    };
  },

  listConnectors(): ConnectorRecord[] {
    return [...persisted.connectors].sort((a, b) => a.name.localeCompare(b.name));
  },

  connectorById(id: string): ConnectorRecord | undefined {
    return persisted.connectors.find((c) => c.id === id || c.type === id);
  },

  probeConnectors(): ConnectorRecord[] {
    const tick = Math.floor(Date.now() / 1000);
    for (const c of persisted.connectors) {
      const status = probeConnectorStatus(c, tick);
      if (status !== c.status) {
        const prior = c.status;
        c.status = status;
        c.lastContactAt = status === "ONLINE" ? new Date().toISOString() : undefined;
        if (status !== "ONLINE") c.connectError = status === "AUTHENTICATION_FAILED" ? "Credential rotation pending on the simulated target." : "Network path to simulated target is blocked.";
        logEvent(persisted, makeEvent("CONNECTOR_STATUS_CHANGED", "connector", c.id, c.id, undefined, undefined, "system", { from: prior, to: status, probe: tick }));
      }
    }
    persist();
    return persisted.connectors;
  },

  testConnector(id: string): ConnectorRecord {
    const c = mustConnector(persisted, id);
    if (c.status !== "ONLINE") {
      const prior = c.status;
      c.status = "ONLINE";
      c.lastContactAt = new Date().toISOString();
      c.connectError = undefined;
      logEvent(persisted, makeEvent("CONNECTOR_STATUS_CHANGED", "connector", c.id, c.id, undefined, undefined, "human", { from: prior, to: "ONLINE", action: "test_connection" }, ACTOR));
    }
    persist();
    return c;
  },

  controls(): Array<ReturnType<typeof getAssetControls>[number]> {
    return getAssetControls();
  },

  frameworks(): ComplianceFramework2[] {
    return COMPLIANCE_FRAMEWORKS;
  },

  evidenceById(id: string): EvidenceRecord | undefined {
    return persisted.evidence.find((e) => e.id === id || e.evidenceId === id);
  },

  assetConnectorProfile(assetId: string): AssetConnectorProfile {
    const asset = mustAsset(persisted, assetId);
    const connector = connectorForAsset(persisted.connectors, asset.assetType, asset.vendor);
    if (!connector) return { assetId: asset.id, assetName: asset.name, online: false, latencyMs: 0, fromCapabilities: [] };
    return {
      assetId: asset.id,
      assetName: asset.name,
      online: connector.status === "ONLINE",
      connector,
      latencyMs: connector.latencyMs ?? modelConnectorLatency(connector),
      fromCapabilities: connector.capabilities ?? [],
    };
  },

  testAssetConnector(assetId: string): ConnectorTestResult {
    const asset = mustAsset(persisted, assetId);
    const connector = connectorForAsset(persisted.connectors, asset.assetType, asset.vendor);
    const at = new Date().toISOString();
    if (!connector) {
      return { ok: false, connectorId: "", connector: "None", vendor: "", status: "OFFLINE", latencyMs: 0, connectorVersion: "", capabilities: [], at };
    }
    if (connector.status !== "ONLINE") this.testConnector(connector.id);
    const online = connector.status === "ONLINE";
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
  },

  assetEvidenceDetail(assetId: string, evidenceId: string): EvidenceWithVerification {
    mustAsset(persisted, assetId);
    const record = persisted.evidence.find((e) => e.id === evidenceId || e.evidenceId === evidenceId);
    if (!record || record.assetId !== assetId) fail(404, "Evidence not found");
    return { ...record, verification: verifyEvidenceRecord(record) };
  },

  analyze(findingId: string): FindingAnalysis {
    const { asset, finding } = findFinding(persisted, findingId);
    const evidence = persisted.evidence.filter((e) => e.findingId === findingId);
    const analysis = buildAnalysis(finding, asset, evidence);
    persisted.analyses = persisted.analyses.filter((x) => x.findingId !== findingId);
    persisted.analyses.push(analysis);
    logEvent(persisted, makeEvent("FINDING_ANALYZED", "finding", findingId, asset.id, finding.controlId, findingId, "ai", { provider: analysis.provider, model: analysis.model ?? "nexus-evidence-grounded-v1", riskScore: analysis.riskScore }));
    persist();
    return analysis;
  },

  remediations(): RemediationRecord[] {
    return [...persisted.remediations].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  remediationById(id: string): RemediationRecord | undefined {
    return persisted.remediations.find((r) => r.id === id);
  },

  createRemediation(findingId: string, reason?: string): RemediationRecord {
    const { asset, finding } = findFinding(persisted, findingId);
    const proposal = buildProposal(finding.controlId, asset.assetType, reason ?? `Remediate ${finding.controlId} on ${asset.name}.`);
    const record: RemediationRecord = {
      id: uid("rem"),
      findingId,
      assetId: asset.id,
      assetName: asset.name,
      controlId: finding.controlId,
      controlName: finding.controlName,
      title: `${proposal.displayName} — ${asset.name}`,
      reason: proposal.reason,
      riskScore: finding.risk,
      riskBand: finding.riskExplanation?.band ?? riskBandFromScore(finding.risk),
      proposedAction: proposal,
      status: "PLANNED",
      environment: asset.environment,
      auditEventIds: [],
      createdAt: new Date().toISOString(),
    };
    persisted.remediations.push(record);
    applyFindingLifecycle(persisted, findingId, "REMEDIATION_PLANNED");
    logEvent(persisted, makeEvent("REMEDIATION_PLANNED", "remediation", record.id, asset.id, finding.controlId, findingId, "system", { assetName: asset.name, actionType: proposal.actionType, impact: proposal.impact, rollbackAvailable: proposal.rollbackAvailable }));
    persist();
    return record;
  },

  validateRemediation(id: string): RemediationRecord {
    const rem = mustRemediation(persisted, id);
    if (!canTransition(rem.status, "VALIDATED")) fail(409, `Cannot validate remediation in status ${rem.status}.`);
    const asset = mustAsset(persisted, rem.assetId);
    const applied = applyRemediationAction(asset, rem.proposedAction.actionType, rem.proposedAction.parameters);
    const candidate: AssetRecord = { ...asset, observedState: applied.state };
    const outcome = evaluateControl(rem.controlId, candidate);
    const pass = !outcome || outcome.status === "PASS" || outcome.status === "NOT_APPLICABLE";
    rem.validation = {
      status: pass ? "PASS" : "FAIL",
      beforeState: { ...asset.observedState },
      proposedState: { ...applied.state },
      expectedResult: rem.proposedAction.expectedResult,
      simulatedOutput: `${rem.proposedAction.actionType}: ${applied.message}`,
      message: pass
        ? "Validation passed — the proposed action resolves the evaluated control in the simulated environment."
        : "Validation failed — the proposed action does not normalize the evaluated control in the simulated environment.",
      at: new Date().toISOString(),
    };
    rem.status = pass ? "VALIDATED" : "VALIDATION_FAILED";
    rem.title = `${rem.proposedAction.displayName} — ${rem.assetName}`;
    rem.updatedAt = new Date().toISOString();
    logEvent(persisted, makeEvent(pass ? "REMEDIATION_VALIDATED" : "REMEDIATION_PLANNED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "human", { validation: rem.validation.status, simulatedOutput: rem.validation.simulatedOutput, expectedResult: rem.validation.expectedResult }, ACTOR));
    persist();
    return rem;
  },

  requestApproval(id: string): RemediationRecord {
    const rem = mustRemediation(persisted, id);
    if (!canTransition(rem.status, "PENDING_APPROVAL")) fail(409, `Cannot request approval in status ${rem.status}.`);
    rem.status = "PENDING_APPROVAL";
    rem.updatedAt = new Date().toISOString();
    logEvent(persisted, makeEvent("REMEDIATION_PLANNED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "human", { action: "submitted_for_approval", riskScore: rem.riskScore, riskBand: rem.riskBand }, ACTOR));
    persist();
    return rem;
  },

  approve(id: string, comment?: string): RemediationRecord {
    const rem = mustRemediation(persisted, id);
    if (!canTransition(rem.status, "APPROVED")) fail(409, `Cannot approve remediation in status ${rem.status}.`);
    rem.approval = { status: "APPROVED", approverName: ACTOR.name, approverRole: ACTOR.role, comment, at: new Date().toISOString() };
    rem.status = "APPROVED";
    rem.updatedAt = new Date().toISOString();
    logEvent(persisted, makeEvent("REMEDIATION_APPROVED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "human", { actionType: rem.proposedAction.actionType, comment: comment ?? null }, ACTOR));
    persist();
    return rem;
  },

  reject(id: string, reason?: string): RemediationRecord {
    const rem = mustRemediation(persisted, id);
    if (!canTransition(rem.status, "REJECTED")) fail(409, `Cannot reject remediation in status ${rem.status}.`);
    rem.approval = { status: "REJECTED", approverName: ACTOR.name, approverRole: ACTOR.role, comment: reason, at: new Date().toISOString() };
    rem.status = "REJECTED";
    rem.updatedAt = new Date().toISOString();
    logEvent(persisted, makeEvent("REMEDIATION_REJECTED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "human", { reason: reason ?? "Rejected by reviewer." }, ACTOR));
    persist();
    return rem;
  },

  execute(id: string): RemediationRecord {
    const rem = mustRemediation(persisted, id);
    if (!canTransition(rem.status, "EXECUTING")) fail(409, `Cannot execute remediation in status ${rem.status}.`);
    const asset = mustAsset(persisted, rem.assetId);
    const connector = persisted.connectors.find((c) => c.status === "ONLINE" && c.supportedAssetTypes.includes(asset.assetType));
    const logs: RemediationExecutionLogEntry[] = [{ at: new Date().toISOString(), level: "INFO", message: `Orchestrator: executing ${rem.proposedAction.actionType} on ${rem.assetName}` }];
    rem.status = "EXECUTING";
    rem.execution = { status: "EXECUTING", startedAt: new Date().toISOString(), logs: [...logs], action: rem.proposedAction.actionType, appliedTo: `${asset.hostname} (${asset.ipAddress})` };
    if (!connector) {
      logs.push({ at: new Date().toISOString(), level: "ERROR", message: "No ONLINE connector is available to execute the remediation." });
      rem.status = "FAILED";
      rem.execution.status = "FAILED";
      rem.execution.logs = logs;
      rem.updatedAt = new Date().toISOString();
      logEvent(persisted, makeEvent("REMEDIATION_EXECUTED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "system", { status: "FAILED", error: "No ONLINE connector available." }));
      persist();
      return rem;
    }
    const applied = applyRemediationAction(asset, rem.proposedAction.actionType, rem.proposedAction.parameters);
    logs.push({ at: new Date().toISOString(), level: "INFO", message: `Simulated action applied: ${applied.message}` });
    logs.push({ at: new Date().toISOString(), level: "INFO", message: "Snapshot of prior observed state retained for rollback." });
    const snapshot = { ...asset.observedState };
    asset.observedState = applied.state;
    asset.stateHistory.push({ at: new Date().toISOString(), label: `Remediated: ${rem.proposedAction.actionType}`, state: { ...applied.state } });
    asset.history.push({ at: new Date().toISOString(), action: `Executed remediation ${rem.proposedAction.actionType} via ${connector.name}`, actor: ACTOR.name });
    const completedAt = new Date().toISOString();
    rem.status = "COMPLETED";
    rem.rollback = { available: true, triggered: false, status: "NOT_NEEDED", reason: "Snapshot retained; rollback available if verification fails.", restoredState: snapshot };
    rem.execution.status = "COMPLETED";
    rem.execution.completedAt = completedAt;
    rem.execution.logs = logs;
    rem.execution.message = `${rem.proposedAction.actionType}: ${applied.message}`;
    rem.updatedAt = completedAt;
    applyFindingLifecycle(persisted, rem.findingId, "REMEDIATED");
    logEvent(persisted, makeEvent("REMEDIATION_EXECUTED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "human", { actionType: rem.proposedAction.actionType, connector: connector.name, status: "COMPLETED" }, ACTOR));
    persist();
    return rem;
  },

  verify(id: string): RemediationRecord {
    const rem = mustRemediation(persisted, id);
    if (rem.status !== "COMPLETED") fail(409, `Cannot verify remediation in status ${rem.status}.`);
    const asset = mustAsset(persisted, rem.assetId);
    rem.status = "VERIFYING";
    rem.verification = {
      status: "FAIL",
      environment: asset.environment,
      before: { findingStatus: "FAIL", riskScore: rem.riskScore, riskBand: rem.riskBand, compliance: `Failed ${rem.controlId} (evidence-grounded risk ${rem.riskScore}/100)` },
      after: { findingStatus: "FAIL", riskScore: rem.riskScore, riskBand: rem.riskBand, compliance: "Awaiting automated re-verification scan." },
      evidenceBeforeIds: [],
      evidenceAfterIds: [],
      triggeredBy: "auto_verify_scan",
      at: new Date().toISOString(),
    };
    rem.updatedAt = new Date().toISOString();

    const scan = runScan(persisted, asset.id, "auto_verify");
    persisted.assetScans.push(scan);
    const evidence = evidenceForScan(persisted, scan);
    persisted.evidence.push(...evidence);
    for (const e of evidence) logEvent(persisted, makeEvent("EVIDENCE_COLLECTED", "evidence", e.id, e.assetId, e.controlId, e.findingId, "system", { source: e.source, status: e.status, hash: e.integrityHash }));
    if (scan.status === "COMPLETED") logEvent(persisted, makeEvent("ASSET_SCANNED", "asset", scan.id, scan.assetId, undefined, undefined, "system", { findings: scan.findings.length, trigger: "auto_verify" }));

    const scanFailed = scan.status === "ERROR";
    const afterFinding = scan.findings.find((f) => f.controlId === rem.controlId);
    const afterStatus = scanFailed ? "FAIL" : !afterFinding ? "PASS" : afterFinding.status;
    const evidenceAfter = scan.evidenceIds;
    const afterRisk = afterFinding?.riskExplanation;

    if (afterStatus === "PASS") {
      rem.verification.status = "PASS";
      rem.verification.after = { findingStatus: "PASS", riskScore: afterRisk?.score ?? 0, riskBand: afterRisk?.band ?? "LOW", compliance: `Control ${rem.controlId} re-evaluated PASS after remediation.` };
      rem.verification.evidenceAfterIds = evidenceAfter;
      rem.status = "VERIFIED";
      applyFindingLifecycle(persisted, rem.findingId, "VERIFIED");
      logEvent(persisted, makeEvent("REMEDIATION_VERIFICATION_PASSED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "system", { actionType: rem.proposedAction.actionType, scanId: scan.id, evidenceAfter: evidenceAfter.length, afterStatus }));
    } else {
      rem.verification.status = "FAIL";
      rem.verification.after = { findingStatus: afterStatus, riskScore: afterRisk?.score ?? rem.riskScore, riskBand: afterRisk?.band ?? rem.riskBand, compliance: `Control ${rem.controlId} still reports ${afterStatus} after remediation.` };
      rem.verification.evidenceAfterIds = evidenceAfter;
      rem.status = "FAILED";
      applyFindingLifecycle(persisted, rem.findingId, "OPEN");
      logEvent(persisted, makeEvent("REMEDIATION_VERIFICATION_FAILED", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "system", { actionType: rem.proposedAction.actionType, scanId: scan.id, afterStatus, error: scan.error ?? null }));
    }
    rem.updatedAt = new Date().toISOString();
    persist();
    return rem;
  },

  rollback(id: string, reason?: string): RemediationRecord {
    const rem = mustRemediation(persisted, id);
    if (rem.status !== "FAILED" && rem.status !== "VERIFYING") fail(409, `Only a failed or verifying remediation can be rolled back (current ${rem.status}).`);
    const asset = mustAsset(persisted, rem.assetId);
    const snapshotEntry = [...asset.stateHistory].reverse().find((h) => h.label.startsWith("Remediated:")) ?? asset.stateHistory[0];
    const restoredState = snapshotEntry?.state ?? asset.observedState;
    asset.observedState = restoredState;
    asset.stateHistory.push({ at: new Date().toISOString(), label: `Rolled back ${rem.proposedAction.actionType}`, state: { ...restoredState } });
    asset.history.push({ at: new Date().toISOString(), action: `Rolled back remediation ${rem.proposedAction.actionType}`, actor: ACTOR.name });
    rem.status = "ROLLED_BACK";
    rem.rollback = { available: true, triggered: true, status: "ROLLED_BACK", reason: reason ?? "Verification failed; restoring prior observed state.", restoredState, at: new Date().toISOString() };
    rem.updatedAt = new Date().toISOString();
    applyFindingLifecycle(persisted, rem.findingId, "OPEN");
    logEvent(persisted, makeEvent("REMEDIATION_ROLLED_BACK", "remediation", rem.id, rem.assetId, rem.controlId, rem.findingId, "system", { actionType: rem.proposedAction.actionType, reason: reason ?? "verification failed" }));
    persist();
    return rem;
  },

  auditEvents(): AuditEventRecord[] {
    return [...persisted.events].sort((a, b) => (a.at < b.at ? 1 : -1));
  },

  // ---- Governance: frameworks, policies, applicable controls, traces, exceptions ----

  frameworkById(id: string): ComplianceFramework2 {
    const fw = COMPLIANCE_FRAMEWORKS.find((f) => f.id === id);
    if (!fw) fail(404, "Framework not found");
    return fw;
  },

  listPolicies(): PolicyProfile[] {
    return POLICY_PROFILES;
  },

  policyById(id: string): PolicyProfile {
    const p = POLICY_PROFILES.find((pp) => pp.profileId === id);
    if (!p) fail(404, "Policy profile not found");
    return p;
  },

  selectPolicy(assetId: string): PolicySelection {
    const asset = mustAsset(persisted, assetId);
    return selectPolicyForAsset(asset, persisted.organizationBaseline);
  },

  assetApplicableControls(assetId: string): ApplicableControlsResult {
    const asset = mustAsset(persisted, assetId);
    return applicableControlsForAsset(asset, persisted.organizationBaseline);
  },

  assetGovernance(assetId: string): GovernanceDecisionTrace {
    const asset = mustAsset(persisted, assetId);
    const evidence = persisted.evidence.filter((e) => e.assetId === assetId);
    const results = evaluateEvidenceForAsset(asset, evidence);
    const findings: AssetFinding[] = results.map((r) => ({
      id: uid("af"),
      auditId: asset.id,
      controlId: r.ruleId,
      controlName: r.name,
      severity: r.severity,
      status: r.evaluation.status,
      what: r.evaluation.reason,
      why: r.evaluation.reason,
      where: `${asset.hostname} (${asset.ipAddress})`,
      risk: r.evaluation.status === "FAIL" ? 70 : 20,
      impact: "",
      recommendedFix: r.remediation,
      evidence: [],
      references: { controlId: r.ruleId },
      assetId: asset.id,
      evidenceIds: r.evidenceId ? [r.evidenceId] : [],
      assetType: asset.assetType,
      location: asset.location,
    }));
    return buildGovernanceTrace(
      asset,
      results.map((r) => ({
        controlId: r.ruleId,
        status: r.evaluation.status,
        observedValue: r.evaluation.observedValue,
        expectedValue: r.evaluation.expectedValue,
      })),
      findings,
      persisted.governanceExceptions,
      persisted.organizationBaseline,
    );
  },

  assetFrameworks(assetId: string) {
    const asset = mustAsset(persisted, assetId);
    const governance = this.assetGovernance(assetId);
    return {
      assetId: asset.id,
      region: governance.region,
      regionLabel: governance.regionLabel,
      frameworks: governance.frameworks.map((f) => ({
        id: f.id,
        name: f.name,
        version: f.version,
        status: f.status,
        disclaimer: f.disclaimer,
        mappings: governance.applicableControls
          .filter((c) => {
            const mappings = controlFrameworkMappings(c.controlId);
            return mappings.some((m) => m.framework === f.id);
          })
          .map((c) => {
            const mappings = controlFrameworkMappings(c.controlId);
            const mapping = mappings.find((m) => m.framework === f.id);
            return { controlId: c.controlId, controlName: c.controlName, ...mapping };
          }),
      })),
      generatedAt: new Date().toISOString(),
    };
  },

  listExceptions(assetId?: string): GovernanceException[] {
    const all = persisted.governanceExceptions;
    const filtered = assetId ? all.filter((e) => e.assetId === assetId) : all;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  requestException(body: GovernanceExceptionRequest): GovernanceException {
    const asset = mustAsset(persisted, body.assetId);
    const control = getAssetControls().find((c) => c.id === body.controlId);
    if (!control) fail(404, "Control not found");

    const now = new Date().toISOString();
    const expiresInDays = body.expiresInDays ?? 90;
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

    const exception: GovernanceException = {
      id: uid("gov-exc"),
      controlId: body.controlId,
      controlName: control.name,
      assetId: body.assetId,
      assetName: asset.name,
      reason: body.reason,
      requestedBy: body.requestedBy,
      status: "REQUESTED",
      createdAt: now,
      expiresAt,
    };

    persisted.governanceExceptions.push(exception);
    logEvent(persisted, makeEvent("GOVERNANCE_EXCEPTION_REQUESTED", "governance", exception.id, body.assetId, body.controlId, undefined, "human", { assetId: body.assetId, controlId: body.controlId, reason: body.reason, requestedBy: body.requestedBy }));
    persist();
    return exception;
  },

  decideException(decision: GovernanceExceptionDecision): GovernanceException {
    const exception = persisted.governanceExceptions.find((e) => e.id === decision.exceptionId);
    if (!exception) fail(404, "Exception not found");

    exception.status = decision.decision;
    exception.approvedBy = decision.decidedBy;
    if (decision.decision === "REJECTED") {
      exception.rejectionReason = decision.reason;
    } else if (decision.decision === "APPROVED" && decision.expiresInDays) {
      exception.expiresAt = new Date(Date.now() + decision.expiresInDays * 86400000).toISOString();
    }

    logEvent(persisted, makeEvent("GOVERNANCE_EXCEPTION_DECIDED", "governance", exception.id, exception.assetId, exception.controlId, undefined, "human", { decision: decision.decision, decidedBy: decision.decidedBy, reason: decision.reason }));
    persist();
    return exception;
  },

  approvedActionsForType(assetType: string): string[] {
    const map: Record<string, string[]> = {
      APPLICATION: ["SET_TLS_MIN_VERSION", "REVOKE_AND_RENEW_CERTIFICATE", "DISABLE_INSECURE_PROTOCOL", "ENFORCE_STRONG_CIPHERS", "SECURE_API_CONFIG", "ENABLE_INTEGRITY_VALIDATION", "ENABLE_XML_SIGNATURE_VALIDATION", "ROTATE_AND_SCREEN_SECRETS", "RESTRICT_PRIVILEGED_ACCESS", "UPGRADE_SERVICE_VERSION", "RESTORE_BASELINE_HASH"],
      DATABASE: ["ENABLE_DB_ENCRYPTION", "RESTRICT_DB_BIND", "ENFORCE_STRONG_AUTH", "ROTATE_AND_SCREEN_SECRETS"],
      MESSAGE_QUEUE: ["SECURE_MESSAGE_QUEUE", "ENFORCE_STRONG_AUTH"],
      FIREWALL: ["CONSOLIDATE_FIREWALL_RULE", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH"],
      NETWORK: ["CONSOLIDATE_FIREWALL_RULE", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH"],
      SERVER: ["UPGRADE_SERVICE_VERSION", "RESTORE_BASELINE_HASH", "RESTRICT_PRIVILEGED_ACCESS", "ENFORCE_STRONG_AUTH", "ENABLE_INTEGRITY_VALIDATION"],
      CLOUD: ["ENABLE_DB_ENCRYPTION", "ROTATE_AND_SCREEN_SECRETS", "ENABLE_INTEGRITY_VALIDATION", "RESTRICT_DB_BIND"],
    };
    return map[assetType] ?? [];
  },

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    persisted = seed();
  },
};

export function buildAnalysis(finding: AssetFinding, asset: AssetRecord, evidence: EvidenceRecord[]): FindingAnalysis {
  const control = getAssetControlById(finding.controlId);
  const risk = finding.riskExplanation;
  const currentRisk = risk?.score ?? finding.risk;
  const band = risk?.band ?? riskBandFromScore(currentRisk);
  const topEvidence = evidence.slice(0, 3);
  const evidenceNotes = topEvidence.length
    ? `Ground truth from ${topEvidence.length} evidence record(s): ${topEvidence.map((e) => `${e.controlId} observed=${e.observedValue} (expected ${e.expectedValue}, source ${e.source})`).join("; ")}.`
    : "No machine evidence was collected for this finding — treat as unverified until a scan provides evidence.";
  return {
    findingId: finding.id,
    findingTitle: finding.what,
    controlId: finding.controlId,
    severity: finding.severity,
    riskScore: currentRisk,
    riskBand: band,
    assetName: asset.name,
    assetType: asset.assetType,
    environment: asset.environment,
    provider: "mock" as AiProviderMode,
    model: "nexus-evidence-grounded-v1",
    analysis: {
      explanation: `Control ${finding.controlId} (${control?.name ?? finding.controlName}) reports ${finding.status.toLowerCase()} on ${asset.name}: ${finding.why}`,
      whyItMatters: `${control?.name ?? finding.controlName} protects the confidentiality/integrity of ${
        asset.tags?.includes("pci") ? "cardholder data" : asset.tags?.includes("pii") ? "personal data" : "sensitive traffic"
      }. ${finding.severity} severity makes this a ${band} concern.`,
      potentialImpact:
        currentRisk >= 80
          ? "Exploitation could expose sensitive data or allow unauthorized control of the asset, cascading to dependent services and business data."
          : currentRisk >= 60
            ? "Exploitation poses a material risk to the affected asset and its dependent services."
            : "Exploitation risk is bounded; residual exposure remains and warrants scheduled remediation.",
      rootCauseHypothesis: rootCause(finding, asset),
      recommendedRemediation: control?.remediation ?? finding.recommendedFix,
      validationSteps: [
        "Re-run asset scan and confirm the control now evaluates PASS.",
        "Confirm normalized evidence shows the expected value in the controlled environment.",
        "Inspect the new verification record before closing the remediation.",
      ],
      rollbackConsiderations: "The remediation snapshots the prior observed state; if verification fails, the action can be rolled back to restore the previous configuration.",
      executiveSummary: `${asset.name} (#${asset.assetType}) failed control ${finding.controlId} with ${finding.status.toLowerCase()} status. Evidence-grounded risk is ${currentRisk}/100 (${band}). Remediation is proposed, validated and executed only after human approval.`,
    },
    evidenceSummary: { evidenceAvailable: evidence.length > 0, count: evidence.length, notes: evidenceNotes },
    generatedAt: new Date().toISOString(),
  };
}

function rootCause(finding: AssetFinding, asset: AssetRecord): string {
  const v = asset.observedState as Record<string, unknown>;
  if (v.tlsMinVersion && finding.controlId === "TLS-001") return `Observed minimum TLS ${String(v.tlsMinVersion)} is below the required TLS 1.2 — legacy cipher policy inherited from an older hardening baseline.`;
  if (v.dbBindAddress === "0.0.0.0") return "Database listener bound to 0.0.0.0 — outside the data zone binding policy.";
  if (v.plaintextSecrets === true) return "Secrets stored in plaintext configuration/environment — no vault integration for this deployment.";
  if (v.mqAuthRequired === false) return "Broker allows anonymous connections — authentication not enabled on the vhost.";
  if (typeof v.firewallAnyRules === "number" && v.firewallAnyRules > 5) return "Firewall policy contains excessive broad allow rules replacing least-privilege entries.";
  if (v.configChecksum && v.configChecksum !== v.expectedChecksum) return "Deployed configuration checksum differs from the approved baseline — drift detected.";
  return `Configuration evidence for ${finding.controlId} on ${asset.name} is inconsistent with the required baseline — manual review of observed state advised.`;
}