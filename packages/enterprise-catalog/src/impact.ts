import type {
  AssetExposurePath,
  AssetImpactGraph,
  AssetRecord,
  AssetType,
  ExposurePathHop,
  FindingBlastRadius,
  FindingRiskContext,
  ImpactEdge,
  ImpactNode,
  RiskExplanation,
  Severity,
} from "@nexus/shared-types";
import { CRITICALITY_WEIGHT } from "./enterprise";
import { explainableRisk, EXPOSURE_LABEL, networkExposureOfAsset } from "./risk";

// ---------------------------------------------------------------------------
// Impact graph — how a finding on one asset can cascade to services,
// applications, databases and business data (based on simulated relationships).
//
// PHASE 5 additions (all deterministic, none hard-coded):
//  - bounded traversal (visited set + max depth + node cap → no infinite loops)
//  - blast radius: downstream assets potentially affected by a finding
//  - deterministic 0–100 potential-impact score
//  - "potential exposure path" from the internet/edge boundary inward
//  - finding risk context (score + contributors + impact) used by the API/UI
//
// Terminology is precautionary: these are dependency/exposure analyses
// ("potential impact", "blast radius", "exposure path") — never confirmed
// compromise.
// ---------------------------------------------------------------------------

const BIZ_BY_TAG: Record<string, { label: string; detail: string }> = {
  pii: { label: "Customer PII", detail: "Regulatory personal data" },
  pci: { label: "Cardholder Data", detail: "PCI DSS in-scope data" },
  "internet-facing": { label: "Internet Revenue Path", detail: "Customer-facing service" },
  "payment-border": { label: "Payment Border", detail: "Payment processing path" },
  "customer-data": { label: "Customer Master Data", detail: "CRM/customer records" },
};

const MAX_GRAPH_NODES = 120;
const DEFAULT_BLAST_DEPTH = 4;
const DEFAULT_PATH_DEPTH = 4;

const SERVICE_LABEL: Record<AssetType, string> = {
  API: "API",
  APPLICATION: "Application",
  DATABASE: "Database",
  MESSAGE_QUEUE: "Message queue",
  FIREWALL: "Firewall",
  ROUTER: "Router",
  SERVER: "Server",
  CERTIFICATE: "Certificate",
  LOAD_BALANCER: "Load balancer",
  NETWORK_DEVICE: "Network device",
  SWITCH: "Switch",
  PROXY: "Proxy",
  VIRTUAL_MACHINE: "Virtual machine",
  CLOUD_RESOURCE: "Cloud resource",
  OTHER: "Other",
};

function serviceLabel(assetType: AssetType): string {
  return SERVICE_LABEL[assetType] ?? assetType;
}

function dataLabelFor(asset: AssetRecord): string | null {
  for (const tag of asset.tags ?? []) {
    if (BIZ_BY_TAG[tag]) return tag;
  }
  return null;
}

function kindOf(asset: AssetRecord): ImpactNode["kind"] {
  if (asset.assetType === "DATABASE") return "database";
  if (asset.assetType === "API" || asset.assetType === "APPLICATION") return "application";
  return "service";
}

function nodeFor(asset: AssetRecord, reachedFrom?: string): ImpactNode {
  return {
    id: asset.id,
    label: asset.name,
    kind: kindOf(asset),
    detail: `${asset.assetType} · ${asset.vendor}`,
    criticality: asset.criticality,
    reachedFrom,
    assetType: asset.assetType,
    region: asset.location.region,
    tier: asset.location.tier,
    environment: asset.environment,
    riskScore: asset.riskScore,
    riskBand: asset.riskBand,
    complianceStatus: asset.complianceStatus,
  };
}

/**
 * Bounded impact cascade. Traversal is BFS/DFS with a visited set (cycle-safe),
 * a max depth and a hard node cap so the calculation can never loop forever.
 */
export function buildImpactGraph(asset: AssetRecord, allAssets: AssetRecord[], opts: { maxDepth?: number } = {}): AssetImpactGraph {
  const now = new Date().toISOString();
  const nodes: ImpactNode[] = [];
  const edges: ImpactEdge[] = [];
  const byId = new Map(allAssets.map((a) => [a.id, a]));
  const visited = new Set<string>();
  const maxDepth = opts.maxDepth ?? Infinity;

  nodes.push(nodeFor(asset));

  const visit = (current: AssetRecord, _reachedFrom: string, depth: number) => {
    if (depth > maxDepth || nodes.length >= MAX_GRAPH_NODES) return;
    if (visited.has(current.id)) return;
    visited.add(current.id);

    for (const rel of current.relationships) {
      if (rel.fromAssetId !== current.id) continue;
      const target = byId.get(rel.toAssetId);
      if (!target || visited.has(target.id)) continue;
      nodes.push(nodeFor(target, current.id));
      edges.push({ from: current.id, to: target.id, relation: rel.relation });
      visit(target, current.id, depth + 1);
    }
  };

  visit(asset, asset.id, 0);

  const dataTag = dataLabelFor(asset) ?? dataLabelOfDependents(asset, byId);
  if (dataTag) {
    const biz = BIZ_BY_TAG[dataTag];
    const bizId = `biz-${dataTag}`;
    nodes.push({ id: bizId, label: biz.label, kind: "business", detail: biz.detail });
    const lastNode = nodes[nodes.length - 2];
    edges.push({ from: lastNode.id, to: bizId, relation: "exposes" });
  } else {
    nodes.push({ id: "biz-general", label: "Business Service Continuity", kind: "business", detail: "General business operations" });
    const last = nodes[nodes.length - 2];
    edges.push({ from: last.id, to: "biz-general", relation: "supports" });
  }

  const summary = [
    `Finding on ${asset.name} propagates to ${nodes.length - 1} related assets and business impact.`,
    asset.criticality === "CRITICAL"
      ? `${asset.name} is CRITICAL — impact on dependent services is considered high priority.`
      : `${asset.name} is ${asset.criticality.toLowerCase()} criticality.`,
    graphBlastSummary(asset),
  ];

  return { rootAssetId: asset.id, rootLabel: asset.name, nodes, edges, summary, generatedAt: now };
}

function dataLabelOfDependents(root: AssetRecord, byId: Map<string, AssetRecord>): string | null {
  for (const rel of root.relationships) {
    const target = byId.get(rel.toAssetId);
    if (target) {
      const tag = dataLabelFor(target);
      if (tag) return tag;
    }
  }
  return null;
}

function graphBlastSummary(asset: AssetRecord): string {
  const dependentCount = asset.relationships.filter((r) => r.fromAssetId === asset.id).length;
  return dependentCount > 0
    ? `${dependentCount} direct dependent relation(s) observed in the simulated asset graph.`
    : "No direct dependent relations recorded in this environment.";
}

// ---------------------------------------------------------------------------
// Blast radius — bounded downstream traversal.
// ---------------------------------------------------------------------------

function collectDownstream(root: AssetRecord, allAssets: AssetRecord[], maxDepth: number): AssetRecord[] {
  const byId = new Map(allAssets.map((a) => [a.id, a]));
  const seen = new Set<string>([root.id]);
  const out: AssetRecord[] = [];
  let frontier: AssetRecord[] = [];
  for (const rel of root.relationships) {
    if (rel.fromAssetId !== root.id) continue;
    const target = byId.get(rel.toAssetId);
    if (target && !seen.has(target.id)) {
      seen.add(target.id);
      frontier.push(target);
    }
  }
  let depth = 1;
  while (frontier.length > 0 && depth <= maxDepth && out.length < MAX_GRAPH_NODES) {
    const next: AssetRecord[] = [];
    for (const node of frontier) {
      if (out.length >= MAX_GRAPH_NODES) break;
      out.push(node);
      for (const rel of node.relationships) {
        if (rel.fromAssetId !== node.id) continue;
        const target = byId.get(rel.toAssetId);
        if (target && !seen.has(target.id)) {
          seen.add(target.id);
          next.push(target);
        }
      }
    }
    frontier = next;
    depth += 1;
  }
  return out;
}

export function findingBlastRadius(root: AssetRecord, allAssets: AssetRecord[], opts: { maxDepth?: number } = {}): FindingBlastRadius {
  const maxDepth = opts.maxDepth ?? DEFAULT_BLAST_DEPTH;
  const downstream = collectDownstream(root, allAssets, maxDepth);
  const regionSet = new Set([root.location.region]);
  const services = new Set<string>();
  let criticalCount = 0;
  for (const a of downstream) {
    regionSet.add(a.location.region);
    services.add(serviceLabel(a.assetType));
    if (a.criticality === "CRITICAL" || a.criticality === "HIGH") criticalCount += 1;
  }
  const regionsAffected = [...regionSet].sort();
  return {
    affectedAssetIds: downstream.map((a) => a.id),
    affectedAssetCount: downstream.length,
    criticalAssetsAffected: criticalCount,
    affectedServices: [...services].sort(),
    servicesAffected: services.size,
    regionsAffected,
    crossRegion: regionsAffected.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Deterministic potential-impact score (0–100).
//
//   downstream breadth   up to 25   1 asset=8, 2=16, 3+=25  → min(25, count*8)
//   critical downstream  up to 20   min(20, criticalOrHigh*10)
//   root criticality     up to 15   CRITICAL=15 HIGH=12 MEDIUM=8 LOW=5
//   production           up to 15   PROD_SIM=15 else 0
//   cross-region         up to 10   2+ distinct regions=10 else 0
//   service diversity    up to 15   min(15, distinctServiceLabels*5)
//
// A vulnerability on an isolated development server therefore scores low; a
// finding on a production API in front of a critical database scores high.
// ---------------------------------------------------------------------------

export function impactScoreFor(asset: AssetRecord, allAssets: AssetRecord[], blast: FindingBlastRadius | undefined = undefined): number {
  const radius = blast ?? findingBlastRadius(asset, allAssets);
  const breadth = Math.min(25, radius.affectedAssetCount * 8);
  const critical = Math.min(20, radius.criticalAssetsAffected * 10);
  const rootCrit = ({ CRITICAL: 15, HIGH: 12, MEDIUM: 8, LOW: 5 } as Record<string, number>)[asset.criticality] ?? 5;
  const production = asset.environment === "PROD_SIM" ? 15 : 0;
  const crossRegion = radius.crossRegion ? 10 : 0;
  const diversity = Math.min(15, radius.servicesAffected * 5);
  return Math.max(0, Math.min(100, breadth + critical + rootCrit + production + crossRegion + diversity));
}

// ---------------------------------------------------------------------------
// Potential exposure path — from the internet/edge boundary inward.
// ---------------------------------------------------------------------------

const EDGE_PRIORITY: Record<AssetType, number> = {
  FIREWALL: 0,
  ROUTER: 1,
  PROXY: 1,
  NETWORK_DEVICE: 2,
  SWITCH: 2,
  LOAD_BALANCER: 3,
  CERTIFICATE: 4,
  SERVER: 5,
  VIRTUAL_MACHINE: 5,
  MESSAGE_QUEUE: 6,
  APPLICATION: 7,
  API: 8,
  CLOUD_RESOURCE: 8,
  DATABASE: 9,
  OTHER: 9,
};

function hopFor(asset: AssetRecord, kind: "edge" | "asset", rel?: { relation?: string; protocol?: string; port?: number }): ExposurePathHop {
  return {
    id: asset.id,
    name: asset.name,
    kind,
    assetType: asset.assetType,
    criticality: asset.criticality,
    exposure: networkExposureOfAsset(asset),
    relation: rel?.relation,
    protocol: rel?.protocol,
    port: rel?.port,
  };
}

function reachesInternet(rel: { source?: string }): boolean {
  return rel.source === "Internet" || rel.source === "0.0.0.0/0";
}

export function exposurePathForAsset(root: AssetRecord, allAssets: AssetRecord[], opts: { maxDepth?: number } = {}): AssetExposurePath {
  const maxDepth = opts.maxDepth ?? DEFAULT_PATH_DEPTH;
  const chain: ExposurePathHop[] = [];
  const seen = new Set<string>([root.id]);
  let reachedInternet = false;
  let current = root;

  for (let i = 0; i < maxDepth; i++) {
    const preds = allAssets
      .filter((a) => !seen.has(a.id) && a.relationships.some((r) => r.fromAssetId === a.id && r.toAssetId === current.id))
      .sort((a, b) => (EDGE_PRIORITY[a.assetType] ?? 9) - (EDGE_PRIORITY[b.assetType] ?? 9) || a.id.localeCompare(b.id));
    if (preds.length === 0) break;
    const edge = preds[0];
    const rel = edge.relationships.find((r) => r.fromAssetId === edge.id && r.toAssetId === current.id)!;
    seen.add(edge.id);
    chain.unshift(hopFor(edge, "edge", rel));
    if (reachesInternet(rel)) {
      reachedInternet = true;
      break;
    }
    current = edge;
  }

  if (reachedInternet || networkExposureOfAsset(root) === "INTERNET_FACING" || root.relationships.some((r) => r.fromAssetId === root.id && reachesInternet(r))) {
    chain.unshift({ id: "internet", name: "Internet", kind: "internet" });
  }

  chain.push(hopFor(root, "asset"));

  const downstream = collectDownstream(root, allAssets, 3)
    .filter((a) => a.criticality === "CRITICAL" || a.criticality === "HIGH")
    .sort((a, b) => (CRITICALITY_WEIGHT[b.criticality] ?? 0) - (CRITICALITY_WEIGHT[a.criticality] ?? 0) || a.id.localeCompare(b.id));
  for (const d of downstream.slice(0, 2)) {
    if (chain.length >= 8) break;
    const rel = root.relationships.find((r) => r.fromAssetId === root.id && r.toAssetId === d.id);
    chain.push(hopFor(d, "asset", rel));
  }

  return {
    rootAssetId: root.id,
    rootName: root.name,
    path: chain,
    depth: chain.length,
    potential: true,
    label: "Potential exposure path",
    disclaimer: "Dependency/exposure analysis from the simulated asset graph — a potential path, not evidence of compromise.",
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Finding risk context — why THIS risk score? Contributors come from the real
// explainable risk model plus the blast-radius analysis above.
// ---------------------------------------------------------------------------

export interface FindingRiskInput {
  findingId: string;
  severity: Severity;
  asset: AssetRecord;
  allAssets: AssetRecord[];
  riskExplanation?: RiskExplanation;
  evidenceConfidence?: number;
}

export function buildFindingRiskContext(input: FindingRiskInput): FindingRiskContext {
  const { findingId, severity, asset, allAssets } = input;
  const explanation = input.riskExplanation ?? explainableRisk(asset, severity, {});
  const exposure = networkExposureOfAsset(asset);
  const blast = findingBlastRadius(asset, allAssets);
  const impactScore = impactScoreFor(asset, allAssets, blast);
  const confidence = input.evidenceConfidence ?? 0.99;

  const contributionOf = (factor: string) => explanation?.factors.find((f) => f.factor === factor)?.contribution ?? 0;
  const severityContribution = contributionOf("severity");
  const exposureContribution = contributionOf("exposure");
  const criticalityContribution = contributionOf("criticality");
  const importanceContribution = contributionOf("importance");
  const exploitabilityContribution = contributionOf("exploitability");

  const dependencyImpact = `${blast.affectedAssetCount} downstream asset(s), ${blast.criticalAssetsAffected} critical/high, ${blast.servicesAffected} service type(s), ${blast.regionsAffected.length} region(s)`;
  const composition = `severity +${severityContribution}, exposure +${exposureContribution}, asset criticality +${criticalityContribution}, business importance +${importanceContribution}, exploitability +${exploitabilityContribution}`;
  const regionsText = blast.regionsAffected.length > 0 ? blast.regionsAffected.join(" · ") : asset.location.region;

  return {
    findingId,
    assetId: asset.id,
    assetName: asset.name,
    riskScore: explanation.score,
    riskLevel: explanation.band,
    severity,
    assetType: asset.assetType,
    assetCriticality: asset.criticality,
    exposure,
    impactScore,
    blastRadius: blast,
    evidenceConfidence: confidence,
    contributors: {
      assetCriticality: asset.criticality,
      exposure,
      severityContribution,
      exposureContribution,
      criticalityContribution,
      importanceContribution,
      exploitabilityContribution,
      complianceImpact: riskLevelLabel(explanation.band),
      evidenceConfidence: confidence,
      dependencyImpact,
    },
    explanation: `Why ${explanation.score}/100 (${explanation.band})? ${asset.name} (${asset.assetType}) is ${asset.criticality} criticality with ${EXPOSURE_LABEL[exposure].toLowerCase()} exposure. Contributors: ${composition}. Potential impact ${impactScore}/100 — ${blast.affectedAssetCount} downstream asset(s) in ${regionsText} (${blast.criticalAssetsAffected} critical/high, ${blast.servicesAffected} service type(s)). Evidence confidence ${confidence}.`,
  };
}

function riskLevelLabel(band: string): string {
  return band === "CRITICAL" ? "CRITICAL exposure — immediate triage" : band === "HIGH" ? "HIGH priority — remediation this cycle" : band === "MEDIUM" ? "MEDIUM — scheduled remediation" : "LOW — monitor";
}